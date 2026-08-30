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
  type EffectiveEntity,
  type MergeInputEntity,
  type MergeConflict,
} from "../domain/overlay";
import type {
  PolicyConflictRepository,
  PolicySnapshotRepository,
} from "./ports";
import { DrizzlePolicyConflictRepository } from "../infrastructure/drizzle/policy-conflict-snapshot.repository";
import { DrizzlePolicySnapshotRepository } from "../infrastructure/drizzle/policy-conflict-snapshot.repository";

export const NATIONAL_CODE = "CN";

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

    const toInput = (
      jurisdictionCode: string,
      businessKey: string,
      version: number,
      payload: unknown,
      packId: string,
    ): MergeInputEntity => ({
      businessKey,
      jurisdictionCode,
      version,
      payload,
      packId,
      role: jurisdictionCode === NATIONAL_CODE ? "baseline" : "add",
      effectiveFrom: asOfDate,
      effectiveTo: null,
    });

    const inputs: MergeInputEntity[] = [];
    for (const r of ruleRows) {
      inputs.push(
        toInput(
          r.jurisdictionCode as string,
          r.businessKey ?? r.ruleId,
          r.version,
          r,
          "rules",
        ),
      );
    }
    for (const p of paramRows) {
      inputs.push(
        toInput(
          p.jurisdictionCode as string,
          p.businessKey ?? p.paramId,
          p.version,
          p,
          p.policyPackId,
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

    /** ListImpactedOverlays（POL-FR-011）：上级基线变化列出受影响 overlay 与快照。 */
    async listImpactedOverlays(baseBusinessKey: string) {
      const overlayRows = await db
        .select()
        .from(rules)
        .where(
          and(
            eq(rules.businessKey, baseBusinessKey),
            sql`${rules.jurisdictionCode} is not null`,
          ),
        );
      const impactedOverlays = overlayRows.filter(
        (r) => (r.jurisdictionCode ?? "") !== NATIONAL_CODE,
      );
      const impactedSnapshots =
        await snapshotRepo.listSnapshotsContainingKey(baseBusinessKey);
      return {
        businessKey: baseBusinessKey,
        impactedOverlays: impactedOverlays.map((r) => ({
          jurisdictionCode: r.jurisdictionCode,
          ruleId: r.ruleId,
          version: r.version,
          status: r.status,
        })),
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
