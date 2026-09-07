/**
 * 政策快照与冲突服务（POL-FR-008～011，步骤03.4/03.5/03.6）。
 *
 * CreatePolicySnapshot（PRD §8）：
 * 1. 解析地区继承链（jurisdiction 用例）；
 * 2. 收集链上有效的规则/参数/规则集（national=baseline，其余=overlay add）；
 * 3. 合并器产出有效候选 + provenance；发现冲突 → 记录 PolicyConflict 并拒绝快照；
 * 4. 事务内原子写入快照与成员（含 canonical SHA-256 内容哈希）；不可变性由 DB 触发器强制。
 */
import { createHash } from "node:crypto";
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db, withTransaction } from "@/lib/db";
import { params, ruleSets, rules } from "@/lib/db/schema";
import {
  mergePolicyContext,
  NATIONAL_JURISDICTION,
  type EffectiveEntity,
  type MergeInputEntity,
  type MergeConflict,
  type OverlayOperation,
} from "../domain/overlay";
import type {
  PolicyConflictRepository,
  PolicySnapshotRepository,
} from "./ports";
import { DrizzlePolicyConflictRepository } from "../infrastructure/drizzle/policy-conflict-snapshot.repository";
import { DrizzlePolicySnapshotRepository } from "../infrastructure/drizzle/policy-conflict-snapshot.repository";

export const NATIONAL_CODE = NATIONAL_JURISDICTION;

export class SnapshotBlockedError extends Error {
  constructor(public readonly conflicts: MergeConflict[]) {
    super(`快照生成被 ${conflicts.length} 项政策冲突阻止`);
  }
}

export interface PolicySnapshotServiceDeps {
  conflictRepo?: PolicyConflictRepository;
  snapshotRepo?: PolicySnapshotRepository;
  /** 链解析（jurisdiction 模块）。 */
  resolveChain: (code: string) => Promise<
    Array<{ code: string; name: string; path: string }>
  >;
}

export interface CreatedSnapshot {
  snapshotId: string;
  jurisdictionCode: string;
  asOfDate: string;
  resolvedPath: string;
  contentHash: string;
  ruleCount: number;
  paramCount: number;
  ruleSetCount: number;
}

function canonical(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

export function createPolicySnapshotService(deps: PolicySnapshotServiceDeps) {
  const conflictRepo = deps.conflictRepo ?? new DrizzlePolicyConflictRepository();
  const snapshotRepo = deps.snapshotRepo ?? new DrizzlePolicySnapshotRepository();

  /** 收集继承链上指定日期有效的实体并映射为合并输入。 */
  async function collectEntities(
    chain: Array<{ code: string }>,
    asOfDate: string,
  ): Promise<MergeInputEntity[]> {
    const codes = chain.map((c) => c.code);
    const entityFilter = (table: typeof rules | typeof params) =>
      and(
        inArray(table.jurisdictionCode, codes),
        eq(table.status, "published"),
        lte(table.effectiveFrom, asOfDate),
        or(
          isNull(table.effectiveTo),
          lte(sql`${asOfDate}`, sql`${table.effectiveTo}`),
        ),
      );

    const ruleRows = await db.select().from(rules).where(entityFilter(rules));
    const paramRows = await db.select().from(params).where(entityFilter(params));
    const ruleSetRows = await db
      .select()
      .from(ruleSets)
      .where(
        and(
          inArray(ruleSets.jurisdictionCode, codes),
          eq(ruleSets.status, "published"),
          lte(ruleSets.effectiveFrom, asOfDate),
        ),
      );

    // 任务2批准（重分类继承语义）：链上国家baseline已定义业务键后，地方层
    // 同名的历史add（如旧上海运行基线在重分类前把国家规则复制为本地add）
    // 不再参与候选快照合并——否则duplicate-add阻止快照。历史行保留（可回退），
    // 仅跳过收集；地方replace/restrict/exempt不受影响（显式overlay语义）。
    const nationalBaselineKeys = new Set<string>();
    for (const r of ruleRows) {
      if (r.jurisdictionCode === "CN" && r.operation === "baseline") {
        nationalBaselineKeys.add(r.ruleId ?? "");
      }
    }
    for (const p of paramRows) {
      if (p.jurisdictionCode === "CN" && p.operation === "baseline") {
        nationalBaselineKeys.add(p.paramId ?? "");
      }
    }
    const isSupersededLegacyAdd = (
      jurisdictionCode: string | null,
      businessKey: string,
      operation: string | null,
    ): boolean =>
      jurisdictionCode !== null &&
      jurisdictionCode !== "CN" &&
      operation === "add" &&
      nationalBaselineKeys.has(businessKey);

    const effectiveRuleRows = ruleRows.filter(
      (r) => !isSupersededLegacyAdd(r.jurisdictionCode, r.ruleId ?? "", r.operation),
    );
    const effectiveParamRows = paramRows.filter(
      (p) => !isSupersededLegacyAdd(p.jurisdictionCode, p.paramId ?? "", p.operation),
    );

    const toInput = (
      jurisdictionCode: string,
      businessKey: string,
      version: number,
      payload: unknown,
      packId: string,
      operation: string | null,
      targetBusinessKey: string | null,
    ): MergeInputEntity => ({
      businessKey,
      jurisdictionCode,
      version,
      payload,
      packId,
      // NRP-FR-007：操作来自持久化字段，不得按地区代码推断。
      operation: (operation ?? "add") as OverlayOperation,
      targetBusinessKey: targetBusinessKey ?? null,
      effectiveFrom: asOfDate,
      effectiveTo: null,
    });

    const inputs: MergeInputEntity[] = [];
    for (const r of effectiveRuleRows) {
      inputs.push(
        toInput(
          r.jurisdictionCode as string,
          r.businessKey ?? r.ruleId,
          r.version,
          r,
          "rules",
          r.operation,
          r.targetBusinessKey,
        ),
      );
    }
    for (const p of effectiveParamRows) {
      inputs.push(
        toInput(
          p.jurisdictionCode as string,
          p.businessKey ?? p.paramId,
          p.version,
          p,
          p.policyPackId,
          p.operation,
          p.targetBusinessKey,
        ),
      );
    }
    for (const rs of ruleSetRows) {
      inputs.push(
        toInput(
          rs.jurisdictionCode as string,
          rs.ruleSetId,
          rs.version,
          rs,
          "rule_sets",
          rs.operation,
          rs.targetBusinessKey,
        ),
      );
    }
    return inputs;
  }

  return {
    /** ResolvePolicyContext：返回合并结果（含逐实体 provenance）或冲突。 */
    async resolvePolicyContext(jurisdictionCode: string, asOfDate: string) {
      const chain = await deps.resolveChain(jurisdictionCode);
      const entities = await collectEntities(chain, asOfDate);
      const merged = mergePolicyContext(entities, chain.map((c) => c.code), asOfDate);
      return { chain, merged };
    },

    /** CreatePolicySnapshot：冲突阻止；否则事务原子写入。 */
    async createPolicySnapshot(input: {
      jurisdictionCode: string;
      asOfDate: string;
      actor: string;
    }): Promise<CreatedSnapshot> {
      const { chain, merged } = await this.resolvePolicyContext(
        input.jurisdictionCode,
        input.asOfDate,
      );

      if (merged.conflicts.length > 0) {
        // POL-FR-008：显式冲突任务，不用优先级猜测。
        await conflictRepo.insertConflicts(
          merged.conflicts.map((c) => ({
            jurisdictionCode: input.jurisdictionCode,
            businessKey: c.businessKey,
            kind: c.kind,
            memberVersions: c.members as unknown as Record<string, unknown>[],
            status: "open" as const,
          })),
        );
        throw new SnapshotBlockedError(merged.conflicts);
      }

      const resolvedPath =
        chain.map((c) => c.code).join("/") ?? input.jurisdictionCode;
      const activeRules = merged.entities.filter(
        (e) => !e.exempted && e.businessKey.startsWith("R-"),
      );
      const activeParams = merged.entities.filter(
        (e) => !e.exempted && !e.businessKey.startsWith("R-") && !e.businessKey.startsWith("RS-"),
      );
      const activeRuleSets = merged.entities.filter((e) =>
        e.businessKey.startsWith("RS-"),
      );

      const members = [
        ...activeRules.map((e) => toMember("rule", e)),
        ...activeParams.map((e) => toMember("param", e)),
        ...activeRuleSets.map((e) => toMember("rule_set", e)),
      ];
      const contentHash = createHash("sha256")
        .update(canonical(members))
        .digest("hex");

      const created = await withTransaction(async (tx) => {
        return snapshotRepo.insertSnapshot(
          {
            jurisdictionCode: input.jurisdictionCode,
            asOfDate: input.asOfDate,
            resolvedPath: `/${resolvedPath.split("/").filter(Boolean).join("/")}/`,
            contentHash,
            createdBy: input.actor,
          },
          members,
          tx,
        );
      });

      return {
        snapshotId: created.id,
        jurisdictionCode: input.jurisdictionCode,
        asOfDate: input.asOfDate,
        resolvedPath: created.resolvedPath,
        contentHash,
        ruleCount: activeRules.length,
        paramCount: activeParams.length,
        ruleSetCount: activeRuleSets.length,
      };
    },

    /** GetSnapshot：完整成员与 provenance。 */
    async getSnapshot(id: string) {
      return snapshotRepo.getSnapshot(id);
    },

    /** ListPolicyConflicts / ResolvePolicyConflict。 */
    async listConflicts(filters?: { status?: string; jurisdictionCode?: string }) {
      return conflictRepo.listConflicts(filters);
    },
    async resolveConflict(
      id: number,
      decision: { resolvedBy: string; resolution: unknown; dismiss?: boolean },
    ) {
      return conflictRepo.resolveConflict(id, {
        status: decision.dismiss ? "dismissed" : "resolved",
        resolvedBy: decision.resolvedBy,
        resolution: decision.resolution,
      });
    },

    /** ListImpactedOverlays（POL-FR-011）：上级基线变化列出受影响 overlay 与快照。
     * 覆盖规则与参数两类实体上指向该键的显式overlay（NRP-FR-007：操作与目标键持久化）。 */
    async listImpactedOverlays(baseBusinessKey: string) {
      const ruleOverlayRows = await db
        .select()
        .from(rules)
        .where(
          and(
            eq(rules.businessKey, baseBusinessKey),
            sql`${rules.jurisdictionCode} is not null`,
          ),
        );
      const paramOverlayRows = await db
        .select()
        .from(params)
        .where(
          and(
            eq(params.businessKey, baseBusinessKey),
            sql`${params.jurisdictionCode} is not null`,
          ),
        );
      const impactedOverlays = [
        ...ruleOverlayRows
          .filter((r) => (r.jurisdictionCode ?? "") !== NATIONAL_CODE)
          .map((r) => ({
          entityType: "rule" as const,
          jurisdictionCode: r.jurisdictionCode,
          entityId: r.ruleId,
          operation: r.operation,
          targetBusinessKey: r.targetBusinessKey,
          version: r.version,
          status: r.status,
        })),
        ...paramOverlayRows
          .filter((r) => (r.jurisdictionCode ?? "") !== NATIONAL_CODE)
          .map((r) => ({
            entityType: "param" as const,
            jurisdictionCode: r.jurisdictionCode,
            entityId: r.paramId,
            operation: r.operation,
            targetBusinessKey: r.targetBusinessKey,
            version: r.version,
            status: r.status,
          })),
      ];
      const impactedSnapshots =
        await snapshotRepo.listSnapshotsContainingKey(baseBusinessKey);
      return {
        businessKey: baseBusinessKey,
        impactedOverlays,
        impactedSnapshots: impactedSnapshots.map((s) => ({
          id: s.id,
          jurisdictionCode: s.jurisdictionCode,
          asOfDate: s.asOfDate,
          contentHash: s.contentHash,
        })),
      };
    },
  };

  function toMember(
    entityType: "rule" | "param" | "rule_set",
    e: EffectiveEntity,
  ) {
    return {
      entityType,
      businessKey: e.businessKey,
      payload: e.payload as Record<string, unknown>,
      provenance: e.provenance as unknown as Record<string, unknown>[],
    };
  }
}
