/**
 * 任务3（JRP-FR-014/028、JRP-NFR-006）：历史 plan 真实重放用例。
 *
 * - owner 只能重放自己的 plan（归属校验，09-02）；
 * - 重放按 plan 保存的 snapshotId + snapshotContentHash + asOfDate 恢复执行
 *   （JRP-FR-014：不随当前活动快照调度变化）；
 * - 重放时重算快照成员规范化 hash，与 plan 保存的 hash 及当前快照 contentHash
 *   对照，返回漂移结论（JRP-FR-028）；
 * - 快照被删除/不可读时 fail-closed（409/404），不猜测替代快照。
 */
import {
  decideOwnership,
  resolveOwnerKey,
  type OwnerIdentity,
} from "@/server/modules/identity/domain/owner";
import { orchestrateSnapshot } from "@/lib/engine/orchestrator";
import { canonicalMemberHash } from "@/server/modules/publishing/application/release-gates";
import { extractNeedsAgent } from "@/lib/engine/calc-extractors";
import type { PlanningReadRepository } from "../application/ports";
import type { SnapshotWithMembers } from "./jurisdiction-compute.use-case";

export interface ReplayPlanDeps {
  getPlan: (planId: string) => Promise<PlanningReadRepository["getPlan"] extends (...args: never[]) => Promise<infer R> ? R : never>;
  getSnapshot: (snapshotId: string) => Promise<SnapshotWithMembers | null>;
}

export interface ReplayPlanResult {
  planId: string;
  snapshotId: string;
  snapshotContentHash: string;
  asOfDate: string;
  jurisdictionCode: string | null;
  /** 漂移结论：plan 保存 hash vs 当前快照 hash。 */
  drift: {
    savedHash: string;
    currentHash: string;
    drifted: boolean;
  };
  plan: Record<string, unknown>;
  calc: Record<string, unknown>;
  needsAgent: boolean;
  questions: unknown[];
  warnings: string[];
  caveats: unknown[];
  meta: Record<string, unknown>;
}

export class ReplayNotFoundError extends Error {
  constructor() {
    super("REPLAY_NOT_FOUND");
    this.name = "ReplayNotFoundError";
  }
}

export class ReplayForbiddenError extends Error {
  constructor() {
    super("REPLAY_FORBIDDEN");
    this.name = "ReplayForbiddenError";
  }
}

export class ReplaySnapshotUnavailableError extends Error {
  constructor() {
    super("REPLAY_SNAPSHOT_UNAVAILABLE");
    this.name = "ReplaySnapshotUnavailableError";
  }
}

/**
 * 按保存的快照 ID/hash/日期重放历史 plan（JRP-FR-014/028）。
 * 返回原快照元数据与漂移结论；结果与保存时的执行逐字节一致（JRP-NFR-002）。
 */
export async function replayPlan(
  deps: ReplayPlanDeps,
  planId: string,
  identity: OwnerIdentity,
): Promise<ReplayPlanResult> {
  const plan = await deps.getPlan(planId);
  if (!plan) throw new ReplayNotFoundError();
  const decision = decideOwnership(plan, resolveOwnerKey(identity));
  if (decision.decision !== "granted") throw new ReplayForbiddenError();

  if (!plan.snapshotId) {
    // 历史 plan 无快照引用（任务3之前的数据）：无法真实重放，fail-closed。
    throw new ReplaySnapshotUnavailableError();
  }
  const asOfDate = plan.asOfDate
    ? String(plan.asOfDate).slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const savedHash = plan.snapshotContentHash ?? "";

  const snapshot = await deps.getSnapshot(plan.snapshotId);
  if (!snapshot) throw new ReplaySnapshotUnavailableError();

  // JRP-FR-026：重放前重算成员规范化 hash，与 plan 保存 hash/快照 hash 对照。
  const recomputed = canonicalMemberHash(snapshot.members);
  const currentHash = snapshot.snapshot.contentHash;
  const drifted = savedHash !== "" && recomputed !== savedHash;

  // 快照成员 → 引擎输入（与 compute 同一语义）。
  const ruleRows: Array<Record<string, unknown>> = [];
  const paramRows: Array<Record<string, unknown>> = [];
  let ruleSet: { ruleSetId: string; rules: string[]; version: number } | null =
    null;
  for (const m of snapshot.members) {
    if (m.entityType === "rule") ruleRows.push(m.payload);
    else if (m.entityType === "param") paramRows.push(m.payload);
    else if (m.entityType === "rule_set") {
      const rs = m.payload as Record<string, unknown>;
      ruleSet = {
        ruleSetId: String(rs.ruleSetId ?? rs.rule_set_id ?? "snapshot"),
        rules: Array.isArray(rs.rules) ? (rs.rules as string[]) : [],
        version: typeof rs.version === "number" ? rs.version : 1,
      };
    }
  }

  const result = orchestrateSnapshot({
    user: (plan.userInput ?? {}) as Record<string, unknown>,
    asOfDate,
    ruleSet,
    rules: ruleRows as never,
    params: paramRows as never,
  });

  const calc = (result.calc ?? {}) as Record<string, unknown>;
  return {
    planId: plan.id,
    snapshotId: plan.snapshotId,
    snapshotContentHash: currentHash,
    asOfDate,
    jurisdictionCode: plan.jurisdictionCode,
    drift: {
      savedHash,
      currentHash,
      drifted,
    },
    plan: (result.plan ?? {}) as Record<string, unknown>,
    calc,
    needsAgent: extractNeedsAgent(calc),
    questions: Array.isArray(calc.agent_questions)
      ? (calc.agent_questions as unknown[])
      : [],
    warnings: Array.isArray(calc.warnings) ? (calc.warnings as string[]) : [],
    caveats: Array.isArray(calc.caveats) ? (calc.caveats as unknown[]) : [],
    meta: {
      jurisdiction_code: plan.jurisdictionCode,
      snapshot_id: plan.snapshotId,
      as_of_date: asOfDate,
      rules_executed: result.meta.rules_executed,
    },
  };
}