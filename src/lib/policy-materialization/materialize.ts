/**
 * NRP-FR-017/FR-019/FR-022、NRP-NFR-010/012 受控物化执行器：
 * - apply必须同时携带授权参数、预期manifest哈希与目标指纹，缺一即拒绝（NRP-AC-011）；
 * - 四地区在单个数据库事务中写入draft实体与批次审计，任一校验失败全部回滚（NFR-010）；
 * - 同manifest重复执行返回no-op（NRP-AC-014）；
 * - 写入后核对固定计数与旧行规范化哈希（NRP-AC-015/NFR-012）。
 * 本模块不读取dotenv/.env（目标解析见target.ts）。
 */
import { and, eq, inArray, sql as dsql } from "drizzle-orm";
import { db, withTransaction, type DbClient } from "@/lib/db";
import {
  params,
  policyImportBatchMembers,
  policyImportBatches,
  policyPackVersions,
  ruleSets,
  rules,
} from "@/lib/db/schema";
import {
  EXPECTED_TOTAL_COUNTS,
  computeTargetFingerprint,
  loadExistingState,
  resolveTarget,
  type ExistingState,
  type SqlLike,
} from "./target";

/** 把Drizzle客户端/事务适配为loadExistingState所需的原始SQL接口（查询全部为静态SQL）。 */
function drizzleSqlLike(client: DbClient): SqlLike {
  return {
    async query(text: string): Promise<{ rows: Record<string, unknown>[] }> {
      const result = (await client.execute(dsql.raw(text))) as unknown as {
        rows?: Record<string, unknown>[];
      };
      return { rows: result.rows ?? [] };
    },
  };
}
import {
  manifestHash as computeManifestHash,
  type PolicyMaterializationManifest,
} from "./manifest";
import { buildPlan, type MaterializationPlan, type PlannedEntity } from "./plan";

export type ApplyRejectReason =
  | "UNAUTHORIZED"
  | "MANIFEST_MISMATCH"
  | "FINGERPRINT_MISMATCH"
  | "WORKTREE_DIRTY"
  | "TARGET_UNAVAILABLE"
  | "ALREADY_APPLIED_INCONSISTENT";

export class ApplyGuardError extends Error {
  constructor(
    public readonly reason: ApplyRejectReason,
    message: string,
  ) {
    super(message);
  }
}

export interface AuditReport {
  target: { host: string; port: string; database: string };
  manifestHash: string;
  sourceCommit: string;
  targetFingerprint: string;
  worktreeClean: boolean;
  existingCounts: Record<string, number>;
  expectedPostCounts: Record<string, number>;
  existingBatches: Array<{
    jurisdictionCode: string;
    manifestHash: string;
    status: string;
  }>;
  plan: {
    counts: { rules: number; params: number; ruleSets: number; packs: number };
    regions: Array<{
      jurisdictionCode: string;
      readiness: string;
      blockingReasons: string[];
      counts: { rules: number; params: number; ruleSets: number; packs: number };
      versions: Array<{ businessKey: string; entityType: string; version: number }>;
    }>;
  };
  idempotentNoOp: boolean;
}

export interface ApplyOptions {
  /** 授权参数（NRP-AC-011）：必须显式为true（CLI --i-am-authorized）。 */
  authorized: boolean;
  /** 预期manifest哈希（调用方从audit输出取得）。 */
  expectedManifestHash: string;
  /** 预期目标指纹（调用方从audit输出取得）。 */
  expectedTargetFingerprint: string;
  manifest: PolicyMaterializationManifest;
  /** 工作树dsl/regions无未提交改动（由CLI git status检查注入）。 */
  worktreeClean: boolean;
  actor: string;
}

export interface ApplyResult {
  noop: boolean;
  batches: Array<{
    id: number;
    jurisdictionCode: string;
    readiness: string;
    entityCounts: Record<string, number>;
  }>;
  counts: Record<string, number>;
  publishedRowsHashBefore: string;
  publishedRowsHashAfter: string;
}

/** 已应用批次查询（幂等判定）。 */
async function loadExistingBatches(
  manifestHash: string,
  tx?: DbClient,
): Promise<AuditReport["existingBatches"]> {
  const rows = await (tx ?? db)
    .select({
      jurisdictionCode: policyImportBatches.jurisdictionCode,
      manifestHash: policyImportBatches.manifestHash,
      status: policyImportBatches.status,
    })
    .from(policyImportBatches);
  return rows;
}

/** audit（默认只读模式，NRP-FR-017）：零写入。
 * targetOptions仅测试注入演练库名；生产CLI使用默认严格目标。 */
export async function auditMaterialization(
  manifest: PolicyMaterializationManifest,
  worktreeClean: boolean,
  targetOptions: { allowedDatabases?: string[] } = {},
): Promise<AuditReport> {
  const target = resolveTarget(process.env, targetOptions);
  const state = await loadExistingState(drizzleSqlLike(db));
  const hash = computeManifestHash(manifest);
  const plan = buildPlan(manifest, state, []);
  const expectedPostCounts: Record<string, number> = {
    rules: state.counts.rules + plan.counts.rules,
    params: state.counts.params + plan.counts.params,
    rule_sets: state.counts.rule_sets + plan.counts.ruleSets,
    policy_pack_versions: state.counts.policy_pack_versions + plan.counts.packs,
    tests: state.counts.tests,
    cases: state.counts.cases,
    showcase_cases: state.counts.showcase_cases,
    policy_snapshots: state.counts.policy_snapshots,
  };
  const existingBatches = await loadExistingBatches(hash);
  const idempotentNoOp = existingBatches.some(
    (b) => b.manifestHash === hash && b.status === "applied",
  );
  return {
    target,
    manifestHash: hash,
    sourceCommit: manifest.sourceCommit,
    targetFingerprint: computeTargetFingerprint(target, state),
    worktreeClean,
    existingCounts: state.counts,
    expectedPostCounts,
    existingBatches,
    plan: {
      counts: plan.counts,
      regions: plan.regions.map((r) => ({
        jurisdictionCode: r.jurisdictionCode,
        readiness: r.readiness,
        blockingReasons: r.blockingReasons,
        counts: r.counts,
        versions: r.entities.map((e) => ({
          businessKey: e.businessKey,
          entityType: e.entityType,
          version: e.version,
        })),
      })),
    },
    idempotentNoOp,
  };
}

function assertGuard(
  opts: ApplyOptions,
  manifest: PolicyMaterializationManifest,
  fingerprint: string,
): void {
  if (opts.authorized !== true) {
    throw new ApplyGuardError(
      "UNAUTHORIZED",
      "[apply] 缺少授权参数（--i-am-authorized），拒绝执行（NRP-AC-011）",
    );
  }
  const actualHash = computeManifestHash(manifest);
  if (!opts.expectedManifestHash || opts.expectedManifestHash !== actualHash) {
    throw new ApplyGuardError(
      "MANIFEST_MISMATCH",
      `[apply] manifest哈希不符：预期=${opts.expectedManifestHash || "(缺失)"} 实际=${actualHash}`,
    );
  }
  if (
    !opts.expectedTargetFingerprint ||
    opts.expectedTargetFingerprint !== fingerprint
  ) {
    throw new ApplyGuardError(
      "FINGERPRINT_MISMATCH",
      "[apply] 目标指纹不符：请先运行audit并核对目标状态（NRP-AC-011）",
    );
  }
  if (!opts.worktreeClean) {
    throw new ApplyGuardError(
      "WORKTREE_DIRTY",
      "[apply] dsl/regions工作树存在未提交改动，来源不确定，拒绝执行（PRD §6.3）",
    );
  }
}

/** 旧行保护哈希的对照查询（事务内复用）。 */
async function hashPublishedRows(tx: DbClient): Promise<string> {
  const state = await loadExistingState(drizzleSqlLike(tx));
  return state.publishedRowsHash;
}

/** 实体插入（全部draft，只INSERT不UPDATE——NRP-FR-018）。 */
async function insertEntity(
  tx: DbClient,
  e: PlannedEntity,
  regionPackId: string,
): Promise<number> {
  if (e.entityType === "rule") {
    const p = e.payload as {
      name?: string;
      module?: string;
      priority?: number;
      effective_from?: string;
      effective_to?: string | null;
      supersedes?: unknown;
      inputs?: unknown;
      parameter_refs?: unknown;
      decision_table?: unknown;
      outputs?: unknown;
      examples?: unknown;
      evidence?: unknown;
      notes?: string;
      dsl_version?: string;
    };
    const [row] = await tx
      .insert(rules)
      .values({
        ruleId: e.businessKey,
        jurisdictionCode: e.jurisdictionCode,
        businessKey: e.businessKey,
        name: (p.name as string) ?? e.businessKey,
        module: (p.module as string) ?? "",
        dslVersion: (p.dsl_version as string) ?? "SOCILA-DSL-1.0",
        priority: (p.priority as number) ?? 0,
        status: "draft",
        effectiveFrom: (p.effective_from as string) ?? "2024-01-01",
        effectiveTo: (p.effective_to as string | null) ?? null,
        supersedes: (p.supersedes as string[]) ?? [],
        inputs: (p.inputs as unknown[]) ?? [],
        parameterRefs: (p.parameter_refs as unknown[]) ?? [],
        decisionTable: (p.decision_table as Record<string, unknown>) ?? {},
        outputs: (p.outputs as unknown[]) ?? [],
        examples: (p.examples as unknown[]) ?? [],
        evidence: (p.evidence as unknown[]) ?? [],
        notes: (p.notes as string) ?? null,
        version: e.version,
        operation: e.operation,
        targetBusinessKey: e.targetBusinessKey,
      })
      .returning({ id: rules.id });
    return row.id;
  }
  if (e.entityType === "param") {
    const p = e.payload as {
      type?: string;
      value?: unknown;
      unit?: string | null;
      effective_from?: string;
      effective_to?: string | null;
      source?: string | null;
      key_fields?: unknown;
      value_fields?: unknown;
      rows?: unknown;
      note?: string | null;
      evidence?: unknown;
    };
    const [row] = await tx
      .insert(params)
      .values({
        policyPackId: regionPackId,
        jurisdictionCode: e.jurisdictionCode,
        businessKey: e.businessKey,
        paramId: e.businessKey,
        type: (p.type as string) ?? "number",
        value: (p.value as unknown) ?? null,
        unit: (p.unit as string | null) ?? null,
        effectiveFrom: (p.effective_from as string) ?? "2024-01-01",
        effectiveTo: (p.effective_to as string | null) ?? null,
        source: (p.source as string | null) ?? null,
        keyFields: (p.key_fields as unknown) ?? null,
        valueFields: (p.value_fields as unknown) ?? null,
        rows: (p.rows as unknown) ?? null,
        note: (p.note as string | null) ?? null,
        version: e.version,
        status: "draft",
        operation: e.operation,
        targetBusinessKey: e.targetBusinessKey,
        evidence: (p.evidence as unknown) ?? null,
      })
      .returning({ id: params.id });
    return row.id;
  }
  if (e.entityType === "rule_set") {
    const p = e.payload as {
      description?: string;
      effective_from?: string;
      rules?: string[];
      conflict_resolution?: unknown;
    };
    const [row] = await tx
      .insert(ruleSets)
      .values({
        ruleSetId: e.businessKey,
        jurisdictionCode: e.jurisdictionCode,
        description: (p.description as string) ?? null,
        status: "draft",
        effectiveFrom: (p.effective_from as string) ?? "2024-01-01",
        rules: (p.rules as string[]) ?? [],
        conflictResolution: (p.conflict_resolution as unknown) ?? null,
        version: e.version,
        operation: e.operation,
        targetBusinessKey: e.targetBusinessKey,
      })
      .returning({ id: ruleSets.id });
    return row.id;
  }
  // policy_pack_version
  const [row] = await tx
    .insert(policyPackVersions)
    .values({
      policyPackId: e.businessKey,
      jurisdictionCode: e.jurisdictionCode,
      packKind: e.jurisdictionCode === "CN" ? "baseline" : "overlay",
      version: e.version,
      paramSnapshot: e.payload as Record<string, unknown>,
      status: "draft",
      effectiveFrom: "2024-01-01",
    })
    .returning({ id: policyPackVersions.id });
  return row.id;
}

/** apply（NRP-AC-011/013/014/015）：守卫→单事务写入→事务内核验。 */
export async function applyMaterialization(
  opts: ApplyOptions,
  targetOptions: { allowedDatabases?: string[] } = {},
): Promise<ApplyResult> {
  const target = resolveTarget(process.env, targetOptions);
  const state: ExistingState = await loadExistingState(drizzleSqlLike(db));
  const fingerprint = computeTargetFingerprint(target, state);
  assertGuard(opts, opts.manifest, fingerprint);

  const hash = computeManifestHash(opts.manifest);
  const existingBatches = await loadExistingBatches(hash);
  const appliedSameManifest = existingBatches.filter(
    (b) => b.manifestHash === hash && b.status === "applied",
  );
  if (appliedSameManifest.length > 0) {
    if (appliedSameManifest.length === 4) {
      // NRP-AC-014：同manifest已全部应用 → 幂等no-op。
      return {
        noop: true,
        batches: [],
        counts: state.counts,
        publishedRowsHashBefore: state.publishedRowsHash,
        publishedRowsHashAfter: state.publishedRowsHash,
      };
    }
    throw new ApplyGuardError(
      "ALREADY_APPLIED_INCONSISTENT",
      `[apply] 同manifest仅部分地区存在applied批次（${appliedSameManifest.length}/4），状态不一致，拒绝执行`,
    );
  }

  const plan: MaterializationPlan = buildPlan(opts.manifest, state, existingBatches);
  const packIdByJurisdiction = new Map<string, string>(
    opts.manifest.regions.map((r) => [r.jurisdictionCode, r.packId] as const),
  );
  const hashBefore = state.publishedRowsHash;

  const result = await withTransaction(async (tx) => {
    const batches: ApplyResult["batches"] = [];

    for (const region of plan.regions) {
      const [batch] = await tx
        .insert(policyImportBatches)
        .values({
          jurisdictionCode: region.jurisdictionCode,
          manifestHash: hash,
          sourceCommit: opts.manifest.sourceCommit,
          targetFingerprint: fingerprint,
          status: "applied",
          readiness: region.readiness,
          blockingReasons: region.blockingReasons,
          entityCounts: region.counts as unknown as Record<string, unknown>,
          actor: opts.actor,
        })
        .returning({ id: policyImportBatches.id });

      for (const entity of region.entities) {
        const rowId = await insertEntity(
          tx,
          entity,
          packIdByJurisdiction.get(region.jurisdictionCode) ?? entity.businessKey,
        );
        await tx.insert(policyImportBatchMembers).values({
          batchId: batch.id,
          entityType: entity.entityType,
          entityRowId: rowId,
          businessKey: entity.businessKey,
          version: entity.version,
          contentHash: entity.contentHash,
        });
      }

      batches.push({
        id: batch.id,
        jurisdictionCode: region.jurisdictionCode,
        readiness: region.readiness,
        entityCounts: region.counts,
      });
    }

    // 事务内核验1：固定计数（NRP-AC-015）。
    const post = await loadExistingState(drizzleSqlLike(tx));
    for (const [table, expected] of Object.entries(EXPECTED_TOTAL_COUNTS)) {
      if (post.counts[table] !== expected) {
        throw new Error(
          `[apply] 事务内核验失败：${table}=${post.counts[table]}，预期=${expected}——全部回滚`,
        );
      }
    }
    // 事务内核验2：旧行哈希不变（NFR-012）。
    const hashAfter = await hashPublishedRows(tx);
    if (hashAfter !== hashBefore) {
      throw new Error(
        "[apply] 事务内核验失败：既有published行内容哈希发生变化——全部回滚",
      );
    }

    return { batches, postCounts: post.counts, hashAfter };
  });

  return {
    noop: false,
    batches: result.batches,
    counts: result.postCounts,
    publishedRowsHashBefore: hashBefore,
    publishedRowsHashAfter: result.hashAfter,
  };
}

/** 批次就绪状态读取（管理端覆盖状态/发布阻断用，NRP-FR-022）。 */
export async function loadRegionReadiness(): Promise<
  Array<{
    jurisdictionCode: string;
    readiness: string;
    blockingReasons: string[];
    entityCounts: Record<string, number>;
    manifestHash: string;
    status: string;
  }>
> {
  const rows = await db
    .select()
    .from(policyImportBatches)
    .orderBy(policyImportBatches.id);
  const byJurisdiction = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    byJurisdiction.set(row.jurisdictionCode, row);
  }
  return [...byJurisdiction.values()].map((row) => ({
    jurisdictionCode: row.jurisdictionCode,
    readiness: row.readiness,
    blockingReasons: (row.blockingReasons as string[]) ?? [],
    entityCounts: (row.entityCounts as Record<string, number>) ?? {},
    manifestHash: row.manifestHash,
    status: row.status,
  }));
}

/** blocked地区判定（发布流水线阻断用，NRP-FR-022）。 */
export async function isJurisdictionBlocked(
  jurisdictionCode: string,
): Promise<boolean> {
  const rows = await db
    .select({ readiness: policyImportBatches.readiness })
    .from(policyImportBatches)
    .where(
      and(
        eq(policyImportBatches.jurisdictionCode, jurisdictionCode),
        inArray(policyImportBatches.status, ["applied", "verified"]),
      ),
    );
  return rows.some((r) => r.readiness === "blocked");
}
