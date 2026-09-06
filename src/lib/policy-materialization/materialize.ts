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
  canonicalJson,
  EXPECTED_TOTAL_COUNTS,
  computeTargetFingerprint,
  loadExistingState,
  resolveTarget,
  sha256,
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
  entityContentHash,
  manifestHash as computeManifestHash,
  type PolicyMaterializationManifest,
} from "./manifest";
import {
  buildPackSnapshotPayload,
  buildPlan,
  type MaterializationPlan,
  type PlannedEntity,
} from "./plan";

export type ApplyRejectReason =
  | "UNAUTHORIZED"
  | "MANIFEST_MISMATCH"
  | "FINGERPRINT_MISMATCH"
  | "WORKTREE_DIRTY"
  | "TARGET_UNAVAILABLE"
  | "ALREADY_APPLIED_INCONSISTENT"
  | "REPAIR_TARGET_CHANGED";

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
  packSnapshotDrift: Array<{
    jurisdictionCode: string;
    packId: string;
    version: number;
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
  targetOptions: {
    allowedDatabases?: string[];
    allowedPorts?: string[];
  } = {},
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

  // 审查缺陷4：audit报告包快照漂移（已物化draft包与已提交DSL完整快照的差异，
  // 按当前draft版本定位，不受idempotentNoOp门控）。rowId供runbook核对目标行。
  const packSnapshotDrift: Array<{
    jurisdictionCode: string;
    packId: string;
    version: number;
    rowId: number;
  }> = [];
  for (const region of manifest.regions) {
    const packId =
      opts_manifestPackId(manifest, region.jurisdictionCode) ?? region.jurisdictionCode;
    const currentVersion = state.packVersions.get(
      `${region.jurisdictionCode}|${packId}`,
    );
    if (currentVersion === undefined) continue;
    const rows = await db
      .select()
      .from(policyPackVersions)
      .where(
        and(
          eq(policyPackVersions.jurisdictionCode, region.jurisdictionCode),
          eq(policyPackVersions.policyPackId, packId),
          eq(policyPackVersions.version, currentVersion),
        ),
      );
    if (rows.length === 0) continue;
    if (
      canonicalJson(rows[0].paramSnapshot) !==
      canonicalJson(buildPackSnapshotPayload(region))
    ) {
      packSnapshotDrift.push({
        jurisdictionCode: region.jurisdictionCode,
        packId,
        version: currentVersion,
        rowId: rows[0].id,
      });
    }
  }

  return {
    target,
    manifestHash: hash,
    sourceCommit: manifest.sourceCommit,
    targetFingerprint: computeTargetFingerprint(target, state),
    worktreeClean,
    existingCounts: state.counts,
    expectedPostCounts,
    existingBatches,
    packSnapshotDrift,
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

function opts_manifestPackId(
  manifest: PolicyMaterializationManifest,
  jurisdictionCode: string,
): string | null {
  return (
    manifest.regions.find((r) => r.jurisdictionCode === jurisdictionCode)
      ?.packId ?? null
  );
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
  targetOptions: {
    allowedDatabases?: string[];
    allowedPorts?: string[];
  } = {},
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
  const hashBefore = state.publishedRowsHash;

  // 审查缺陷11：并发apply——(jurisdiction, manifest_hash)唯一约束保证只有一个
  // 事务成功；另一个事务在批次插入时触发唯一冲突，整体回滚并返回确定性no-op。
  try {
    return await applyInTransaction(opts, plan, hash, fingerprint, hashBefore);
  } catch (err) {
    const pgCode = (err as { cause?: { code?: string } }).cause?.code;
    const isBatchConflict =
      pgCode === "23505" &&
      String((err as Error).message).includes("policy_import_batches");
    if (isBatchConflict) {
      // 并发另一事务已应用同manifest：当前事务回滚后返回no-op。
      return {
        noop: true,
        batches: [],
        counts: (await loadExistingState(drizzleSqlLike(db))).counts,
        publishedRowsHashBefore: hashBefore,
        publishedRowsHashAfter: hashBefore,
      };
    }
    throw err;
  }
}

/** 单事务四地区写入与内核验（由applyMaterialization调用）。 */
async function applyInTransaction(
  opts: ApplyOptions,
  plan: MaterializationPlan,
  hash: string,
  fingerprint: string,
  hashBefore: string,
): Promise<ApplyResult> {
  const packIdByJurisdiction = new Map<string, string>(
    opts.manifest.regions.map((r) => [r.jurisdictionCode, r.packId] as const),
  );
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

/** blocked地区判定（发布流水线阻断用，NRP-FR-022）。
 * WI-20260906-01：`repaired`批次同样表达地区readiness，阻断判定必须纳入，
 * 否则repair后（最新批次为repaired）粤川阻断语义可能丢失。 */
export async function isJurisdictionBlocked(
  jurisdictionCode: string,
): Promise<boolean> {
  const rows = await db
    .select({ readiness: policyImportBatches.readiness })
    .from(policyImportBatches)
    .where(
      and(
        eq(policyImportBatches.jurisdictionCode, jurisdictionCode),
        inArray(policyImportBatches.status, ["applied", "verified", "repaired"]),
      ),
    );
  return rows.some((r) => r.readiness === "blocked");
}

/** WI-20260906-01：policy_pack_versions参数快照受控修复（draft行，单事务，幂等）。
 * 快照必须携带全部参数实际内容（rows/key_fields/value_fields/type等）。
 * 目标绑定：目标指纹（见target.ts）已包含全部draft包行ID/版本/状态/快照哈希/
 * 成员哈希——audit后的任何draft变化都会使指纹失配而拒绝。
 * 事务内对全部绑定目标FOR UPDATE并重校验，与audit不一致时零写入退出；
 * 原物化批次/成员不可变；每个目标追加确定性`repaired`批次与一条新成员；
 * 并发由0014唯一约束裁决，冲突后复核目标快照已完全一致则no-op。
 * 未获用户明确授权不得对持久库执行（CLI repair同样要求授权+哈希+指纹）。 */
export interface PackRepairResult {
  noop: boolean;
  repaired: Array<{
    jurisdictionCode: string;
    packId: string;
    version: number;
    oldContentHash: string;
    newContentHash: string;
  }>;
  audits: Array<{
    batchId: number;
    jurisdictionCode: string;
  }>;
}

/** 单个修复目标（事务内重校验与结果回执使用）。 */
export interface RepairTargetInfo {
  jurisdictionCode: string;
  packId: string;
  version: number;
  rowId: number;
  oldSnapshotHash: string;
  oldContentHash: string;
  newContentHash: string;
  expectedSnapshot: unknown;
}

/** repair批次manifest哈希（WI-20260906-01实现要求4，确定性）：由基础manifest
 * 哈希、地区、pack ID、版本、旧/新内容哈希生成——并发或重复repair产生相同
 * 身份，由0014 (jurisdiction_code, manifest_hash)唯一约束裁决。 */
export function computeRepairBatchHash(
  baseManifestHash: string,
  target: {
    jurisdictionCode: string;
    packId: string;
    version: number;
    oldContentHash: string;
    newContentHash: string;
  },
): string {
  return sha256(
    canonicalJson({
      kind: "policy_pack_version_repair",
      baseManifestHash,
      jurisdictionCode: target.jurisdictionCode,
      packId: target.packId,
      version: target.version,
      oldContentHash: target.oldContentHash,
      newContentHash: target.newContentHash,
    }),
  );
}

export interface RepairHooks {
  /** 测试注入：第index个目标包在事务内更新后调用；抛错则整个事务回滚。 */
  afterPackUpdate?: (index: number, target: RepairTargetInfo) => void;
}

export async function repairPackSnapshots(
  manifest: PolicyMaterializationManifest,
  guard: {
    authorized: boolean;
    expectedManifestHash: string;
    expectedTargetFingerprint: string;
    actor: string;
  },
  targetOptions: {
    allowedDatabases?: string[];
    allowedPorts?: string[];
  } = {},
  hooks: RepairHooks = {},
): Promise<PackRepairResult> {
  const target = resolveTarget(process.env, targetOptions);
  const currentState = await loadExistingState(drizzleSqlLike(db));
  if (guard.authorized !== true) {
    throw new ApplyGuardError(
      "UNAUTHORIZED",
      "[repair] 缺少授权参数（--i-am-authorized），拒绝执行",
    );
  }
  const recomputedHash = computeManifestHash(manifest);
  if (guard.expectedManifestHash !== recomputedHash) {
    throw new ApplyGuardError(
      "MANIFEST_MISMATCH",
      "[repair] manifest哈希不符，拒绝执行",
    );
  }
  const currentFingerprint = computeTargetFingerprint(target, currentState);
  if (guard.expectedTargetFingerprint !== currentFingerprint) {
    throw new ApplyGuardError(
      "FINGERPRINT_MISMATCH",
      "[repair] 目标指纹不符：draft包状态或内容在audit后已变化，请重新audit（WI-20260906-01）",
    );
  }

  const hash = computeManifestHash(manifest);
  const pending: RepairTargetInfo[] = [];
  const bindingsByRow = new Map(
    currentState.packTargets.map((t) => [t.rowId, t] as const),
  );

  // 目标识别（audit口径）：按state.packVersions的当前版本找到已物化draft包行
  // （buildPlan解析出的版本是"下一个版本"，不能用于定位既有行）。
  for (const region of manifest.regions) {
    const packId = region.packId;
    const currentVersion = currentState.packVersions.get(
      `${region.jurisdictionCode}|${packId}`,
    );
    if (currentVersion === undefined) continue; // 该地区尚未物化政策包
    const rows = await db
      .select()
      .from(policyPackVersions)
      .where(
        and(
          eq(policyPackVersions.jurisdictionCode, region.jurisdictionCode),
          eq(policyPackVersions.policyPackId, packId),
          eq(policyPackVersions.version, currentVersion),
          eq(policyPackVersions.status, "draft"),
        ),
      );
    if (rows.length === 0) continue;
    const expected = buildPackSnapshotPayload(region);
    const stored = rows[0].paramSnapshot;
    if (canonicalJson(stored) === canonicalJson(expected)) continue;
    const binding = bindingsByRow.get(rows[0].id);
    pending.push({
      jurisdictionCode: region.jurisdictionCode,
      packId,
      version: currentVersion,
      rowId: rows[0].id,
      oldSnapshotHash:
        binding?.snapshotHash ?? sha256(canonicalJson(stored)),
      oldContentHash: entityContentHash(
        "policy_pack_version",
        region.jurisdictionCode,
        packId,
        currentVersion,
        stored,
      ),
      newContentHash: entityContentHash(
        "policy_pack_version",
        region.jurisdictionCode,
        packId,
        currentVersion,
        expected,
      ),
      expectedSnapshot: expected,
    });
  }

  if (pending.length === 0) {
    return { noop: true, repaired: [], audits: [] };
  }

  const preCounts = currentState.counts;
  const prePublishedHash = currentState.publishedRowsHash;
  const regionByJurisdiction = new Map<string, (typeof manifest.regions)[number]>(
    manifest.regions.map((r) => [r.jurisdictionCode as string, r] as const),
  );

  try {
    return await withTransaction(async (tx) => {
      // 1) 事务内锁定全部绑定目标行并重校验（audit后的任何draft变化→零写入退出）。
      for (const b of currentState.packTargets) {
        const locked = await tx
          .select()
          .from(policyPackVersions)
          .where(eq(policyPackVersions.id, b.rowId))
          .for("update");
        if (
          locked.length !== 1 ||
          locked[0].jurisdictionCode !== b.jurisdictionCode ||
          locked[0].policyPackId !== b.packId ||
          locked[0].version !== b.version ||
          locked[0].status !== b.status ||
          sha256(canonicalJson(locked[0].paramSnapshot)) !== b.snapshotHash
        ) {
          throw new ApplyGuardError(
            "REPAIR_TARGET_CHANGED",
            `[repair] 目标在audit后发生变化（pack行${b.rowId} ${b.jurisdictionCode}/${b.packId}），零写入退出`,
          );
        }
        if (b.memberRowId !== null) {
          const member = await tx
            .select()
            .from(policyImportBatchMembers)
            .where(eq(policyImportBatchMembers.id, b.memberRowId));
          if (member.length !== 1 || member[0].contentHash !== b.memberHash) {
            throw new ApplyGuardError(
              "REPAIR_TARGET_CHANGED",
              `[repair] 目标批次成员在audit后发生变化（成员行${b.memberRowId}），零写入退出`,
            );
          }
        }
      }

      // 2) 逐目标更新快照（断言恰好影响一行）并追加确定性repaired批次+新成员；
      //    原物化批次与成员保持不可变。
      const audits: PackRepairResult["audits"] = [];
      const repaired: PackRepairResult["repaired"] = [];
      for (const [index, item] of pending.entries()) {
        const updated = await tx
          .update(policyPackVersions)
          .set({
            paramSnapshot: item.expectedSnapshot as Record<string, unknown>,
          })
          .where(eq(policyPackVersions.id, item.rowId))
          .returning({ id: policyPackVersions.id });
        if (updated.length !== 1) {
          throw new Error(
            `[repair] 目标行${item.rowId}更新影响了${updated.length}行（预期1行）——全部回滚`,
          );
        }
        hooks.afterPackUpdate?.(index, item);

        const region = regionByJurisdiction.get(item.jurisdictionCode)!;
        const [batch] = await tx
          .insert(policyImportBatches)
          .values({
            jurisdictionCode: item.jurisdictionCode,
            manifestHash: computeRepairBatchHash(hash, item),
            sourceCommit: manifest.sourceCommit,
            targetFingerprint: currentFingerprint,
            status: "repaired",
            readiness: region.readiness,
            blockingReasons: region.blockingReasons,
            entityCounts: { packs_repaired: 1 },
            actor: guard.actor,
          })
          .returning({ id: policyImportBatches.id });
        await tx.insert(policyImportBatchMembers).values({
          batchId: batch.id,
          entityType: "policy_pack_version",
          entityRowId: item.rowId,
          businessKey: item.packId,
          version: item.version,
          contentHash: item.newContentHash,
        });
        audits.push({
          batchId: batch.id,
          jurisdictionCode: item.jurisdictionCode,
        });
        repaired.push({
          jurisdictionCode: item.jurisdictionCode,
          packId: item.packId,
          version: item.version,
          oldContentHash: item.oldContentHash,
          newContentHash: item.newContentHash,
        });
      }

      // 3) 事务内核验：快照一致、业务计数不变、published行哈希不变——任一失败全部回滚。
      for (const item of pending) {
        const row = await tx
          .select()
          .from(policyPackVersions)
          .where(eq(policyPackVersions.id, item.rowId));
        if (
          row.length !== 1 ||
          canonicalJson(row[0].paramSnapshot) !==
            canonicalJson(item.expectedSnapshot)
        ) {
          throw new Error(
            `[repair] 事务内核验失败：pack行${item.rowId}快照与预期不一致——全部回滚`,
          );
        }
      }
      const post = await loadExistingState(drizzleSqlLike(tx));
      for (const [table, n] of Object.entries(preCounts)) {
        if (post.counts[table] !== n) {
          throw new Error(
            `[repair] 事务内核验失败：${table}计数${post.counts[table]}≠操作前${n}——全部回滚`,
          );
        }
      }
      if (post.publishedRowsHash !== prePublishedHash) {
        throw new Error(
          "[repair] 事务内核验失败：published行哈希发生变化——全部回滚",
        );
      }

      return { noop: false, repaired, audits };
    });
  } catch (err) {
    // 并发裁决（PRD §6.4/§11）：0014唯一约束冲突或目标已被并发repair修改时，
    // 复核最终快照；全部目标与已提交DSL完全一致则返回no-op，否则原样报错。
    const pgCode = (err as { cause?: { code?: string } }).cause?.code;
    const isUniqueConflict = pgCode === "23505";
    const isTargetChanged =
      err instanceof ApplyGuardError && err.reason === "REPAIR_TARGET_CHANGED";
    if ((isUniqueConflict || isTargetChanged) && (await repairTargetsFullyConsistent(manifest))) {
      return { noop: true, repaired: [], audits: [] };
    }
    throw err;
  }
}

/** 复核：全部已物化draft包快照与已提交DSL完全一致（零漂移）。 */
async function repairTargetsFullyConsistent(
  manifest: PolicyMaterializationManifest,
): Promise<boolean> {
  const state = await loadExistingState(drizzleSqlLike(db));
  for (const region of manifest.regions) {
    const currentVersion = state.packVersions.get(
      `${region.jurisdictionCode}|${region.packId}`,
    );
    if (currentVersion === undefined) continue;
    const rows = await db
      .select()
      .from(policyPackVersions)
      .where(
        and(
          eq(policyPackVersions.jurisdictionCode, region.jurisdictionCode),
          eq(policyPackVersions.policyPackId, region.packId),
          eq(policyPackVersions.version, currentVersion),
          eq(policyPackVersions.status, "draft"),
        ),
      );
    if (rows.length !== 1) return false;
    if (
      canonicalJson(rows[0].paramSnapshot) !==
      canonicalJson(buildPackSnapshotPayload(region))
    ) {
      return false;
    }
  }
  return true;
}

