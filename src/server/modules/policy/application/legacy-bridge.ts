/**
 * 步骤03.7 旧入口兼容桥（POL-FR-012 / POL-AC-006）：
 * legacy ruleSetId/policyPackId 通过兼容映射解析到新快照；快照成员可完整重放
 * 黄金案例（规则按规则集声明顺序、参数扁平化）。
 */
import { dbRuleToDefinition, runTestSuite, type TestCase } from "@/lib/engine/test-runner";
import type { RuleDefinition } from "@/types/engine";
import { createHash } from "node:crypto";
import type { PolicySnapshotServiceDeps } from "./snapshot-service";
import { DrizzlePolicySnapshotRepository } from "../infrastructure/drizzle/policy-conflict-snapshot.repository";

export interface SnapshotReplayResult {
  total: number;
  passed: number;
  passRate: number;
  contentHash: string;
}

export function createLegacyBridge(deps: Pick<PolicySnapshotServiceDeps, "resolveChain">) {
  void deps;
  const snapshotRepo = new DrizzlePolicySnapshotRepository();

  return {
    /** legacy id → 当前有效快照（截至目标日期的最新发布快照）。 */
    async resolveLegacyContext(input: {
      jurisdictionCode?: string;
      asOfDate: string;
    }) {
      return snapshotRepo.findLatest(
        input.jurisdictionCode ?? "310000",
        input.asOfDate,
      );
    },

    /**
     * 用快照成员重放测试用例：规则（按规则集顺序）+ 扁平化参数。
     * 与 legacy runDbTestSuite 的结果必须一致（POL-AC-006 对账口径）。
     */
    async replayFromSnapshot(input: {
      snapshotId: string;
      cases: TestCase[];
    }): Promise<SnapshotReplayResult> {
      const got = await snapshotRepo.getSnapshot(input.snapshotId);
      if (!got) throw new Error(`snapshot not found: ${input.snapshotId}`);

      const rulePayloads: Array<Record<string, unknown>> = [];
      let ruleOrder: string[] | null = null;
      const flatParams: Record<string, unknown> = {};

      for (const member of got.members) {
        if (member.entityType === "rule_set") {
          const payload = member.payload as { rules?: string[] };
          ruleOrder = (payload.rules as string[]) ?? [];
        }
      }
      for (const member of got.members) {
        if (member.entityType === "rule") {
          rulePayloads.push(member.payload as Record<string, unknown>);
        } else if (member.entityType === "param") {
          const p = member.payload as {
            paramId?: string;
            type?: string;
            value?: unknown;
            rows?: unknown;
          };
          const key = p.paramId ?? member.businessKey;
          if (!key) continue;
          if (p.type === "table" || p.type === "timeline") {
            flatParams[key] = p.rows ?? [];
          } else {
            flatParams[key] = p.value;
          }
        }
      }

      let ruleDefs: RuleDefinition[] = rulePayloads.map((r) =>
        dbRuleToDefinition(r),
      );
      if (ruleOrder && ruleOrder.length > 0) {
        const pos = new Map(ruleOrder.map((id, i) => [id, i] as const));
        ruleDefs = [...ruleDefs].sort(
          (a, b) =>
            (pos.get(a.rule_id) ?? Number.MAX_SAFE_INTEGER) -
            (pos.get(b.rule_id) ?? Number.MAX_SAFE_INTEGER),
        );
      }

      const suite = runTestSuite(input.cases, ruleDefs, flatParams, got.snapshot.asOfDate);
      return {
        total: suite.total,
        passed: suite.passed,
        passRate: suite.pass_rate,
        contentHash: got.snapshot.contentHash,
      };
    },

    /** 快照内容哈希（对账用）。 */
    hashMembers(members: Array<Record<string, unknown>>): string {
      return createHash("sha256").update(JSON.stringify(members)).digest("hex");
    },
  };
}
