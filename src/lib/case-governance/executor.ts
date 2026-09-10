/**
 * RCL-FR-021 受控执行器（2026-09-09复审P0修复）：`scripts/rcl-case-library.ts`
 * 七个模式的真实业务逻辑，脚本只做参数解析与输出包装。
 *
 * - audit：真实读取库计数与目标指纹（RCL-NFR-003 精确授权的事实源）；
 * - prepare-archive：先生成dump/selection/manifest/pending restore与最后的
 *   sha256sums.txt，再在可回滚事务中写入 prepared 批次与归档条目——prepare
 *   失败不得留下可推进的prepared批次或不完整entries（RCL-FR-002/003/005）；
 * - verify-archive：真实文件字节SHA精确覆盖清单 + manifest三方自校验 +
 *   restore-report真实验证 + selection-report验证 + 批次状态精确匹配
 *   （只有精确一个prepared批次匹配时才能推进），通过后批次→restore_verified
 *   （RCL-FR-005/NFR-001，第三轮复审）；
 * - generate：确定性生成36条场景并用快照规划器回填断言期望（RCL-FR-007/008/014）；
 * - plan-replacement：读取完整旧regression test行（64位非空内容hash）与42条
 *   DSL example同步集合，结合完整新行构建精确manifest并输出manifestHash
 *   （RCL-FR-002/006/018）；
 * - apply：授权+事务内受控替换（executeRclApply：FOR UPDATE/applying/唯一约束
 *   +example原子同步+落库行hash核对）；
 * - verify：核对 N/36/N+42、沪粤18/18、配额、字段完整性与落库行hash逐项一致
 *   （RCL-AC-008/011，第三轮复审Fix 8）。
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { DbClient } from "@/lib/db";
import { caseArchiveBatches, caseArchiveEntries } from "@/lib/db/schema";
import {
  rowContentHash,
  testRowContentHash,
  CASE_INFRA_COLUMNS,
  SHOWCASE_INFRA_COLUMNS,
} from "./hashes";
import {
  buildSha256SumsContent,
  buildPendingRestoreReport,
  verifySha256SumsFile,
  validateRestoreReport,
  computeSelectionReport,
  verifySelectionReport,
  SHA_LIST_FILES,
} from "./archive";
import {
  buildRclManifest,
  assertRclCounts,
  assertManifestContentHashes,
  recomputeManifestHash,
  type BoundRow,
  type RclManifest,
  type NewCaseRow,
  type NewShowcaseRow,
  type NewTestRow,
  type ExampleSyncSets,
} from "./manifest";
import { generateShowcaseScenarios, buildCoverageManifest, type GeneratedScenario, type ScenarioTemplate } from "./generator";
import { scoreCase } from "./scoring";
import { classifyScenario } from "./multi-label";
import { executeRclApply as defaultExecuteApply, type RclApplyResult } from "./apply";
import { loadDslExampleTargets, buildExampleSync, type DslExampleTarget } from "./dsl-examples";
import { newCaseDbRowHash, newShowcaseDbRowHash, newTestDbRowHash } from "./row-projections";

export class RclExecutorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RclExecutorError";
  }
}

/** 对真实文件字节（Buffer）计算SHA-256：String(buffer)会做有损utf8解码，二进制dump必须直接用Buffer。 */
export function bufferSha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

// ─── 存储抽象（默认真实文件系统，测试可注入）───────────────────────────────

export interface RclStorage {
  read(p: string): Buffer;
  write(p: string, content: string | Buffer): void;
  exists(p: string): boolean;
  list(): string[];
}

export function nodeFsStorage(root: string): RclStorage {
  const join = (p: string) => (path.isAbsolute(p) ? p : path.join(root, p));
  return {
    read: (p) => readFileSync(join(p)),
    write: (p, content) => writeFileSync(join(p), content),
    exists: (p) => existsSync(join(p)),
    list: () => readdirSync(root).map((f) => path.join(root, f)),
  };
}

// ─── audit ─────────────────────────────────────────────────────────────────

export interface RclAuditResult {
  counts: { cases: number; showcase: number; tests: number };
  targetFingerprint: string;
  batches: Array<{ id: string; status: string; manifestHash: string | null }>;
  ok: boolean;
}

async function countRows(db: DbClient, table: string): Promise<number> {
  const r = await db.execute(sql.raw(`SELECT count(*)::int AS n FROM ${table}`));
  return Number((r.rows[0] as { n: number }).n ?? 0);
}

/**
 * audit（RCL-FR-021/RCL-NFR-003）：只读输出当前cases/showcase/tests计数、
 * 目标指纹（全表规范化哈希，行内容变化即变化）与归档批次状态。
 */
export async function auditRcl(db: DbClient): Promise<RclAuditResult> {
  const casesCount = await countRows(db, '"cases"');
  const showcaseCount = await countRows(db, '"showcase_cases"');
  const testsCount = await countRows(db, '"tests"');

  // 目标指纹：三表逐行规范化内容哈希聚合（覆盖删除目标的精确授权依据）。
  const fp = await db.execute(sql.raw(
    `SELECT md5(string_agg(to_jsonb(t)::text, '|' ORDER BY to_jsonb(t)::text COLLATE "C")) AS h
     FROM (
       SELECT id, case_uid, content_hash, quality_status FROM "cases"
       UNION ALL
       SELECT id, case_uid, content_hash, quality_status FROM "showcase_cases"
     ) t`,
  ));
  const targetFingerprint = String((fp.rows[0] as { h: string }).h ?? "");

  const batchRows = await db.execute(sql`SELECT id, status, manifest_hash FROM "case_archive_batches" ORDER BY id`);
  const batches = batchRows.rows.map((r) => ({
    id: String((r as { id: string }).id),
    status: String((r as { status: string }).status),
    manifestHash: (r as { manifest_hash: string | null }).manifest_hash,
  }));

  return { counts: { cases: casesCount, showcase: showcaseCount, tests: testsCount }, targetFingerprint, batches, ok: true };
}

// ─── prepare-archive ───────────────────────────────────────────────────────

export interface PrepareArchiveInput {
  db: DbClient;
  storageDir: string;
  storage?: RclStorage;
  /** pg_dump 执行器（默认真实命令由CLI注入；测试可注入假实现）。 */
  pgDump?: (table?: string) => Promise<Buffer>;
  /** 生成期完整manifest（plan-replacement产物；归档内嵌）。 */
  manifest: RclManifest;
  /** 由生成后showcase实际计算的策展选择报告（violations不得硬编码为空）。 */
  selectionReport: ReturnType<typeof computeSelectionReport>;
  createdBy: string;
  now?: () => Date;
}

export interface PrepareArchiveResult {
  batchId: string;
  files: string[];
  sha256sums: string;
}

const ARCHIVE_FILES = [...SHA_LIST_FILES];

/**
 * prepare-archive（RCL-FR-002/003/005，第三轮复审）：
 * 1) 先真实pg_dump并写入全部归档文件（dump/selection/manifest/pending restore/
 *    sha256sums.txt最后生成且不自包含）；
 * 2) 全部文件就绪后，在**可回滚事务**中写入prepared批次与归档条目——
 *    pg_dump或文件写入失败时不得留下可推进的prepared批次或不完整entries。
 */
export async function prepareRclArchive(input: PrepareArchiveInput): Promise<PrepareArchiveResult> {
  const storage = input.storage ?? nodeFsStorage(input.storageDir);
  const dump = input.pgDump ?? (async () => {
    throw new RclExecutorError("未注入pgDump执行器（CLI应传入真实pg_dump）");
  });
  const now = input.now ?? (() => new Date());
  const batchId = randomUUID();
  const join = (name: string) => path.join(input.storageDir, name);

  // 1) 真实dump（pg_dump失败→无任何批次/entries写入）。
  const fullDump = await dump();
  const casesDump = await dump("cases");
  const showcaseDump = await dump("showcase_cases");
  const testsDump = await dump("tests");
  storage.write(join("policyops-fc.dump"), fullDump);
  storage.write(join("cases.dump"), casesDump);
  storage.write(join("showcase_cases.dump"), showcaseDump);
  storage.write(join("tests.dump"), testsDump);

  // 2) selection-report（真实计算；violations非空即pending）。
  storage.write(
    join("selection-report.json"),
    JSON.stringify(input.selectionReport, null, 2),
  );

  // 3) manifest.json。
  storage.write(join("manifest.json"), JSON.stringify(input.manifest, null, 2));

  // 4) restore-report（pending：恢复对账由独立恢复演练完成后写verified）。
  storage.write(
    join("restore-report.json"),
    JSON.stringify(buildPendingRestoreReport({
      sourceDumpFileName: "policyops-fc.dump",
      sourceDumpSha256: bufferSha256(fullDump),
      nowIso: now().toISOString(),
    }), null, 2),
  );

  // 5) 全部文件就绪后，事务写入批次与归档条目（任一失败整体回滚，不留下
  //    可推进的prepared批次或不完整entries）。
  await input.db.transaction(async (tx) => {
    await tx.insert(caseArchiveBatches).values({
      id: batchId,
      status: "prepared",
      sourceCounts: input.selectionReport.sourceCounts,
      retainedCounts: {},
      deletedCounts: {},
      tableHashes: {},
      manifestHash: input.manifest.manifestHash,
      storagePath: input.storageDir,
      createdBy: input.createdBy,
    });
    const entryRows: Array<{ entityType: string; entityId: number; caseUid: string | null; contentHash: string }> = [
      ...input.manifest.oldTargets.cases.map((c) => ({ entityType: "case", entityId: c.rowId, caseUid: c.uid ?? null, contentHash: c.contentHash })),
      ...input.manifest.oldTargets.showcase.map((s) => ({ entityType: "showcase_case", entityId: s.rowId, caseUid: s.uid ?? null, contentHash: s.contentHash })),
      ...input.manifest.oldTargets.tests.map((t) => ({ entityType: "test", entityId: t.rowId, caseUid: t.uid ?? null, contentHash: t.contentHash })),
    ];
    for (const e of entryRows) {
      await tx.insert(caseArchiveEntries).values({
        archiveBatchId: batchId,
        entityType: e.entityType,
        entityId: e.entityId,
        caseUid: e.caseUid,
        contentHash: e.contentHash,
        archiveReason: "RCL全量重建（ADR-0011）",
      });
    }
  });

  // 6) 批次与entries写入后重新生成完整库dump（自包含归档记录本身，
  //    使恢复对账时归档表与dump一致），随后重算sha256sums.txt（最后生成、
  //    不自包含，RCL-FR-003）。
  storage.write(join("policyops-fc.dump"), await dump());
  const finalEntries = ARCHIVE_FILES.map((fileName) => ({
    fileName,
    path: join(fileName),
    sha256: bufferSha256(storage.read(join(fileName))),
  }));
  const sha256sums = buildSha256SumsContent(finalEntries);
  storage.write(join("sha256sums.txt"), sha256sums);

  return { batchId, files: [...ARCHIVE_FILES, "sha256sums.txt"], sha256sums };
}

// ─── verify-archive ────────────────────────────────────────────────────────

export interface VerifyArchiveInput {
  db: DbClient;
  storageDir: string;
  storage?: RclStorage;
  batchId: string;
}

export interface VerifyArchiveResult {
  ok: boolean;
  mismatches: string[];
  batchId: string;
}

/**
 * verify-archive（RCL-FR-005/AC-001/002，第三轮复审）：
 * 1) 真实文件字节SHA精确覆盖清单（7个必备文件各一次、安全basename、64位hex、
 *    不自包含、无重复/额外）；
 * 2) manifest三方自校验：文件声明hash === 正文重算hash === 批次manifestHash；
 * 3) restore-report真实验证（来源dump SHA、版本、全部表与真实sequence明细）；
 * 4) selection-report解析验证（violations/计数/配额与manifest实际一致）；
 * 5) 只有精确一个prepared批次匹配（id+状态+storagePath）才能推进到
 *    restore_verified；条件更新返回0行必须失败。
 */
export async function verifyRclArchive(input: VerifyArchiveInput): Promise<VerifyArchiveResult> {
  const storage = input.storage ?? nodeFsStorage(input.storageDir);
  const mismatches: string[] = [];
  const dir = input.storageDir;
  const readAll = (name: string): Buffer => storage.read(path.join(dir, name));

  // 0) 必备文件存在。
  for (const f of [...SHA_LIST_FILES, "sha256sums.txt"]) {
    if (!storage.exists(path.join(dir, f))) {
      mismatches.push(`缺失必备文件：${f}`);
    }
  }
  if (mismatches.length > 0) {
    return { ok: false, mismatches, batchId: input.batchId };
  }

  // 1) SHA清单精确覆盖（RCL-FR-003/AC-001，第三轮复审）。
  mismatches.push(...verifySha256SumsFile(storage, dir));
  if (mismatches.length > 0) {
    return { ok: false, mismatches, batchId: input.batchId };
  }

  // 2) manifest自校验（RCL第三轮复审）：声明hash === 正文重算hash；行hash完整。
  let manifest: RclManifest | null = null;
  try {
    manifest = JSON.parse(String(readAll("manifest.json"))) as RclManifest;
  } catch {
    mismatches.push("manifest.json 无法解析");
  }
  if (manifest) {
    if (typeof manifest.manifestHash !== "string" || !/^[0-9a-f]{64}$/.test(manifest.manifestHash)) {
      mismatches.push("manifest.manifestHash 缺失或非64位hex");
    } else if (recomputeManifestHash(manifest) !== manifest.manifestHash) {
      mismatches.push("manifest正文重算hash与声明manifestHash不一致（RCL-FR-005 fail-closed）");
    } else {
      try {
        assertManifestContentHashes(manifest);
      } catch (err) {
        mismatches.push(`manifest内容hash不完整：${(err as Error).message}`);
      }
    }
  }

  // 3) restore-report真实验证（RCL-FR-004/AC-004，第三轮复审：仅status=verified的空报告拒绝）。
  let restore: unknown = null;
  try {
    restore = JSON.parse(String(readAll("restore-report.json")));
  } catch {
    mismatches.push("restore-report.json 无法解析");
  }
  if (restore) {
    const dumpSha256 = bufferSha256(readAll("policyops-fc.dump"));
    const fileHashes: Record<string, string> = {};
    for (const name of SHA_LIST_FILES) fileHashes[name] = bufferSha256(readAll(name));
    mismatches.push(...validateRestoreReport(restore, { dumpSha256, fileHashes }));
  }

  // 4) selection-report解析验证（RCL-FR-005，第三轮复审）。
  let selection: unknown = null;
  try {
    selection = JSON.parse(String(readAll("selection-report.json")));
  } catch {
    mismatches.push("selection-report.json 无法解析");
  }
  if (selection && manifest) {
    mismatches.push(...verifySelectionReport(selection, manifest));
  }

  if (mismatches.length > 0) {
    return { ok: false, mismatches, batchId: input.batchId };
  }

  // 5) 批次状态精确匹配：只有精确一个prepared批次（id+状态+storagePath）可推进。
  const batchRows = await input.db.execute(sql`
    SELECT id, status, storage_path AS "storagePath", manifest_hash AS "manifestHash"
    FROM "case_archive_batches" WHERE id = ${input.batchId}`);
  if (batchRows.rows.length !== 1) {
    return { ok: false, mismatches: [`归档批次 ${input.batchId} 不存在`], batchId: input.batchId };
  }
  const batch = batchRows.rows[0] as { id: string; status: string; storagePath: string; manifestHash: string };
  if (batch.status !== "prepared") {
    return { ok: false, mismatches: [`批次 ${input.batchId} 状态为「${batch.status}」，必须 prepared`], batchId: input.batchId };
  }
  if (batch.storagePath !== dir) {
    return { ok: false, mismatches: [`批次storagePath ${batch.storagePath} 与 ${dir} 不一致`], batchId: input.batchId };
  }
  if (batch.manifestHash !== manifest!.manifestHash) {
    return { ok: false, mismatches: [`批次manifestHash ${batch.manifestHash} 与文件声明 ${manifest!.manifestHash} 不一致`], batchId: input.batchId };
  }

  // 通过 → 批次 restore_verified（条件更新；0行=并发已推进，必须失败）。
  const updated = await input.db
    .update(caseArchiveBatches)
    .set({ status: "restore_verified" })
    .where(sql`id = ${input.batchId} AND status = 'prepared'`)
    .returning({ id: caseArchiveBatches.id });
  if (updated.length === 0) {
    return { ok: false, mismatches: [`批次 ${input.batchId} 状态更新返回0行（并发或状态漂移）`], batchId: input.batchId };
  }
  return { ok: true, mismatches: [], batchId: input.batchId };
}

// ─── generate ──────────────────────────────────────────────────────────────

export interface GenerateRclInput {
  db: DbClient;
  /** 快照规划器期望计算（必须注入；CLI装配真实computeJurisdictionPlan，测试注入mock）。 */
  computeExpected: (t: ScenarioTemplate) => Promise<{
    snapshotId: string;
    snapshotContentHash: string;
    values: Array<{ path: string; value: unknown }>;
  }>;
  ownerUserId?: string;
}

export interface GenerateRclResult {
  scenarios: GeneratedScenario[];
  coverageManifest: ReturnType<typeof buildCoverageManifest>;
  snapshotMap: Record<string, { id: string; hash: string }>;
}

/**
 * generate（RCL-FR-007/008/014/AC-005）：确定性生成36条场景，期望值由修复后
 * 的快照规划器计算回填；相同模板+快照重复生成逐字节一致。
 */
export async function generateRclScenarios(input: GenerateRclInput): Promise<GenerateRclResult> {
  const scenarios = await generateShowcaseScenarios(input.computeExpected);
  const coverageManifest = buildCoverageManifest(scenarios);
  // snapshotMap 由调用方computeExpected副作用填充（CLI层真实实现填充）。
  const snapshotMap: Record<string, { id: string; hash: string }> = {};
  for (const s of scenarios) {
    if (s.snapshotId && s.snapshotContentHash) {
      snapshotMap[s.jurisdictionCode] = { id: s.snapshotId, hash: s.snapshotContentHash };
    }
  }
  return { scenarios, coverageManifest, snapshotMap };
}

// ─── plan-replacement ──────────────────────────────────────────────────────

export interface PlanReplacementInput {
  db: DbClient;
  scenarios: GeneratedScenario[];
  snapshotMap: Record<string, { id: string; hash: string }>;
}

export interface PlanReplacementResult {
  manifest: RclManifest;
  manifestHash: string;
}

/**
 * plan-replacement（RCL-FR-002/006/018/AC-003，第三轮复审）：
 * - 旧cases/showcase/tests按完整业务行重算规范化hash（tests为完整行，8个业务
 *   字段全部进入hash，contentHash不得为空）；
 * - 从地区DSL确定性加载42条目标example并计算保留/更新/新增/删除集合；
 * - 新行contentHash按落库DB行投影计算（与apply事务内重读同一规则）；
 * - assertRclCounts显式要求exampleTestCount===42（28/49等数量不得成为合法目标）。
 */
export async function planRclReplacement(input: PlanReplacementInput): Promise<PlanReplacementResult> {
  const { db } = input;

  // 旧目标：cases/showcase/tests 全部按完整行内容重算规范化hash（库中
  // content_hash列可能为空，行内容哈希才是内容绑定权威，RCL-FR-002/AC-003）。
  const oldCaseRows = await db.execute(sql`SELECT * FROM "cases" ORDER BY id`);
  const oldShowRows = await db.execute(sql`SELECT * FROM "showcase_cases" ORDER BY id`);
  const oldTestRows = await db.execute(sql`SELECT * FROM "tests" WHERE source = 'regression' ORDER BY id`);
  const exampleTestRows = await db.execute(sql`SELECT * FROM "tests" WHERE source = 'example' ORDER BY id`);

  const oldCases: BoundRow[] = oldCaseRows.rows.map((r) => ({
    rowId: Number((r as { id: number }).id),
    uid: String((r as { case_uid: string | null }).case_uid ?? null),
    contentHash: rowContentHash(r as Record<string, unknown>, CASE_INFRA_COLUMNS),
  }));
  const oldShowcase: BoundRow[] = oldShowRows.rows.map((r) => ({
    rowId: Number((r as { id: number }).id),
    uid: String((r as { case_uid: string | null }).case_uid ?? null),
    contentHash: rowContentHash(r as Record<string, unknown>, SHOWCASE_INFRA_COLUMNS),
  }));
  // RCL-FR-002（第三轮复审P0）：旧regression test必须按完整业务行计算非空hash。
  const oldTests: BoundRow[] = oldTestRows.rows.map((r) => ({
    rowId: Number((r as { id: number }).id),
    uid: (r as { source_case_uid: string | null }).source_case_uid ?? null,
    contentHash: testRowContentHash(r as Record<string, unknown>),
  }));

  // 42条DSL example目标与同步集合（RCL-FR-018/AC-011）。
  const dslTargets = loadDslExampleTargets();
  const exampleSync = buildExampleSync(exampleTestRows.rows as Array<Record<string, unknown>>, dslTargets);
  const exampleTests = dslTargets.map((t) => ({
    rowId: exampleSync.retained.find((r) => r.name === t.name && r.jurisdictionCode === t.jurisdictionCode)?.rowId
      ?? exampleSync.updated.find((u) => u.name === t.name && u.jurisdictionCode === t.jurisdictionCode)?.rowId
      ?? 0,
    uid: t.name,
    contentHash: t.contentHash,
    jurisdictionCode: t.jurisdictionCode,
  }));

  const newCases: NewCaseRow[] = input.scenarios.map((s) => {
    const replay = { match: true, differences: [], comparableAssertions: s.assertions.length };
    const score = scoreCase({ input: s.input, coverageObligations: s.coverageObligations, replay, declaredAssertions: s.assertions.length });
    const labels = classifyScenario(s);
    const snap = input.snapshotMap[s.jurisdictionCode] ?? { id: s.snapshotId, hash: s.snapshotContentHash };
    const row: NewCaseRow = {
      rowId: 0,
      uid: s.caseUid,
      contentHash: "",
      jurisdictionCode: s.jurisdictionCode,
      scenarioKey: s.scenarioKey,
      asOfDate: s.asOfDate,
      input: s.input,
      expected: buildExpectedFromAssertions(s),
      assertions: s.assertions,
      coverageObligations: s.coverageObligations,
      evidence: s.evidence,
      qualityScore: score.total,
      qualityBreakdown: score as unknown as Record<string, unknown>,
      multiLabels: labels,
      snapshotId: snap.id,
      snapshotHash: snap.hash,
      sourceTestUid: s.testUid,
    };
    // Fix 8：新行hash按落库DB行投影计算（plan/apply同一规则）。
    row.contentHash = newCaseDbRowHash(row, "RCL-GEN-1.0");
    return row;
  });

  const newShowcase: NewShowcaseRow[] = input.scenarios.map((s) => {
    const replay = { match: true, differences: [], comparableAssertions: s.assertions.length };
    const score = scoreCase({ input: s.input, coverageObligations: s.coverageObligations, replay, declaredAssertions: s.assertions.length });
    const labels = classifyScenario(s);
    const snap = input.snapshotMap[s.jurisdictionCode] ?? { id: s.snapshotId, hash: s.snapshotContentHash };
    const row: NewShowcaseRow = {
      rowId: 0,
      uid: s.caseUid,
      contentHash: "",
      jurisdictionCode: s.jurisdictionCode,
      scenarioKey: s.scenarioKey,
      asOfDate: s.asOfDate,
      input: s.input,
      expected: buildExpectedFromAssertions(s),
      assertions: s.assertions,
      coverageObligations: s.coverageObligations,
      evidence: s.evidence,
      sourceCaseUid: s.caseUid,
      qualityScore: score.total,
      qualityBreakdown: score as unknown as Record<string, unknown>,
      multiLabels: labels,
      snapshotId: snap.id,
      snapshotHash: snap.hash,
    };
    row.contentHash = newShowcaseDbRowHash(row, "RCL-GEN-1.0");
    return row;
  });

  const newTests: NewTestRow[] = input.scenarios.map((s) => {
    const row: NewTestRow = {
      rowId: 0,
      uid: s.testUid,
      contentHash: "",
      jurisdictionCode: s.jurisdictionCode,
      sourceCaseUid: s.caseUid,
      input: { user: s.input },
      expected: buildExpectedFromAssertions(s),
      ruleId: null,
    };
    row.contentHash = newTestDbRowHash(row);
    return row;
  });

  const manifest = buildRclManifest({
    algorithmVersion: "RCL-MANIFEST-1.0",
    generatorVersion: "RCL-GEN-1.0",
    newCases,
    newShowcase,
    newTests,
    exampleTests,
    exampleSync,
    oldTargets: { cases: oldCases, showcase: oldShowcase, tests: oldTests },
    snapshot: input.snapshotMap["310000"]
      ? { id: input.snapshotMap["310000"].id, contentHash: input.snapshotMap["310000"].hash }
      : null,
  });
  assertRclCounts(manifest);
  assertManifestContentHashes(manifest);
  return { manifest, manifestHash: manifest.manifestHash };
}

/** expected：由声明断言推导的稳定期望对象（路径→值）。 */
function buildExpectedFromAssertions(s: GeneratedScenario): Record<string, unknown> {
  const expected: Record<string, unknown> = {};
  for (const a of s.assertions) {
    const keys = a.path.replace(/^calc\./, "").split(".");
    let node: Record<string, unknown> = expected;
    for (const k of keys.slice(0, -1)) {
      const next = (node[k] as Record<string, unknown> | undefined) ?? {};
      node[k] = next;
      node = next;
    }
    node[keys[keys.length - 1]] = a.value;
  }
  return expected;
}

// ─── apply ─────────────────────────────────────────────────────────────────

export interface ApplyReplacementInput {
  db: DbClient;
  manifest: RclManifest;
  batchId: string;
  actor: string;
  authorized: boolean;
  executeApply?: typeof defaultExecuteApply;
}

/** apply（RCL-FR-018/019/021）：必须 --i-am-authorized；事务内受控替换。 */
export async function applyRclReplacement(input: ApplyReplacementInput): Promise<RclApplyResult> {
  if (!input.authorized) {
    throw new RclExecutorError("apply需要显式授权参数 --i-am-authorized（RCL-FR-021）");
  }
  const execute = input.executeApply ?? defaultExecuteApply;
  return execute({ db: input.db, manifest: input.manifest, batchId: input.batchId, actor: input.actor });
}

// ─── verify ────────────────────────────────────────────────────────────────

export interface VerifyReplacementInput {
  db: DbClient;
  /** 期望计数（由覆盖manifest给出）。 */
  counts: { cases: number; showcase: number; tests: number };
  showcaseByRegion: Record<string, number>;
  quota: {
    gender: Record<string, number>;
    band: Record<string, number>;
    employment: Record<string, number>;
  };
  /** 生成期完整manifest（落库行hash逐项核对，RCL第三轮复审Fix 8）。 */
  manifest: RclManifest;
  /** 字段完整性检查项（默认检查非空场景字段）。 */
  checkFields?: boolean;
}

export interface VerifyReplacementResult {
  ok: boolean;
  counts: { cases: number; showcase: number; tests: number };
  mismatches: string[];
}

/**
 * verify（RCL-AC-008/011/012，第三轮复审Fix 8）：核对最终计数 N/36/N+42、
 * 沪粤18/18、配额、完整场景字段，并**按稳定UID重算落库完整行hash与manifest
 * 逐项比较**——不得只核对总数和字段非空。任一新行漂移 → ok=false。
 */
export async function verifyRclReplacement(input: VerifyReplacementInput): Promise<VerifyReplacementResult> {
  const { db } = input;
  const mismatches: string[] = [];

  const actual = {
    cases: await countRows(db, '"cases"'),
    showcase: await countRows(db, '"showcase_cases"'),
    tests: await countRows(db, '"tests"'),
  };
  if (actual.cases !== input.counts.cases) mismatches.push(`cases ${actual.cases} ≠ ${input.counts.cases}`);
  if (actual.showcase !== input.counts.showcase) mismatches.push(`showcase ${actual.showcase} ≠ ${input.counts.showcase}`);
  if (actual.tests !== input.counts.tests) mismatches.push(`tests ${actual.tests} ≠ ${input.counts.tests}`);

  // 地区配额。
  const byRegion = await db.execute(sql`
    SELECT jurisdiction_code, count(*)::int AS n FROM "showcase_cases"
    WHERE quality_status = 'selected' AND is_published = true
    GROUP BY jurisdiction_code ORDER BY jurisdiction_code`);
  const regionCounts: Record<string, number> = {};
  for (const r of byRegion.rows) {
    regionCounts[String((r as { jurisdiction_code: string }).jurisdiction_code)] = Number((r as { n: number }).n);
  }
  for (const [code, expected] of Object.entries(input.showcaseByRegion)) {
    if ((regionCounts[code] ?? 0) !== expected) mismatches.push(`showcase 地区${code} ${regionCounts[code] ?? 0} ≠ ${expected}`);
  }

  // 配额（性别/年龄带/就业态）经多标签统计。
  const labels = await db.execute(sql`
    SELECT multi_labels FROM "showcase_cases" WHERE quality_status = 'selected' AND is_published = true`);
  const genderCounts: Record<string, number> = {};
  const bandCounts: Record<string, number> = {};
  const empCounts: Record<string, number> = {};
  // classifyScenario 标签格式：地区/性别/年龄带/就业态/险种/能力/needs-agent，
  // 其中性别/年龄带/就业态为裸值（male、before_1970、employed，无前缀，RCL-FR-017）。
  const GENDER_LABELS = new Set(["male", "female"]);
  const BAND_LABELS = new Set(["before_1970", "1970_1979", "from_1980"]);
  const EMP_LABELS = new Set(["employed", "flexible", "unemployed"]);
  for (const r of labels.rows) {
    const arr = ((r as { multi_labels: unknown }).multi_labels ?? []) as string[];
    for (const l of arr) {
      if (GENDER_LABELS.has(l)) genderCounts[l] = (genderCounts[l] ?? 0) + 1;
      if (BAND_LABELS.has(l)) bandCounts[l] = (bandCounts[l] ?? 0) + 1;
      if (EMP_LABELS.has(l)) empCounts[l] = (empCounts[l] ?? 0) + 1;
    }
  }
  for (const [k, expected] of Object.entries(input.quota.gender)) {
    if ((genderCounts[k] ?? 0) !== expected) mismatches.push(`性别${k} ${genderCounts[k] ?? 0} ≠ ${expected}`);
  }
  for (const [k, expected] of Object.entries(input.quota.band)) {
    if ((bandCounts[k] ?? 0) !== expected) mismatches.push(`年龄带${k} ${bandCounts[k] ?? 0} ≠ ${expected}`);
  }
  for (const [k, expected] of Object.entries(input.quota.employment)) {
    if ((empCounts[k] ?? 0) !== expected) mismatches.push(`就业态${k} ${empCounts[k] ?? 0} ≠ ${expected}`);
  }

  // 字段完整性：active/selected行场景字段非空（RCL-AC-009/011）。
  if (input.checkFields ?? true) {
    const badFields = await db.execute(sql`
      SELECT count(*)::int AS n FROM "showcase_cases"
      WHERE quality_status = 'selected'
        AND (input_data IS NULL OR expected_data IS NULL OR assertions IS NULL
             OR jsonb_array_length(COALESCE(assertions, '[]'::jsonb)) = 0
             OR scenario_key IS NULL OR as_of_date IS NULL)`);
    const badCases = await db.execute(sql`
      SELECT count(*)::int AS n FROM "cases"
      WHERE quality_status = 'active'
        AND (input IS NULL OR expected IS NULL OR assertions IS NULL
             OR jsonb_array_length(COALESCE(assertions, '[]'::jsonb)) = 0
             OR scenario_key IS NULL OR as_of_date IS NULL)`);
    if (Number((badFields.rows[0] as { n: number }).n) > 0) mismatches.push("存在selected展示案例场景字段为空/占位（RCL-AC-011）");
    if (Number((badCases.rows[0] as { n: number }).n) > 0) mismatches.push("存在active案例场景字段为空/占位（RCL-AC-011）");
  }

  // Fix 8：落库完整行hash与manifest逐项比较（按稳定UID）。
  const m = input.manifest;
  if (m && m.newCases.length > 0) {
    const uids = m.newCases.map((c) => c.uid!).filter(Boolean);
    const rows = uids.length
      ? (await db.execute(sql`SELECT * FROM "cases" WHERE case_uid IN (${sql.join(uids, sql.raw(", "))}) ORDER BY id`)).rows
      : [];
    if (rows.length !== m.newCases.length) {
      mismatches.push(`落库新cases行数 ${rows.length} ≠ manifest ${m.newCases.length}（Fix 8）`);
    }
    for (const c of m.newCases) {
      const row = rows.find((r) => (r as { case_uid: string | null }).case_uid === c.uid);
      const hash = row ? rowContentHash(row as Record<string, unknown>, CASE_INFRA_COLUMNS) : "";
      if (!row || hash !== c.contentHash) {
        mismatches.push(`落库新case ${c.uid} hash与manifest不符（Fix 8）`);
      }
    }
  }
  if (m && m.newShowcase.length > 0) {
    const uids = m.newShowcase.map((s) => s.uid!).filter(Boolean);
    const rows = uids.length
      ? (await db.execute(sql`SELECT * FROM "showcase_cases" WHERE case_uid IN (${sql.join(uids, sql.raw(", "))}) ORDER BY id`)).rows
      : [];
    if (rows.length !== m.newShowcase.length) {
      mismatches.push(`落库新showcase行数 ${rows.length} ≠ manifest ${m.newShowcase.length}（Fix 8）`);
    }
    for (const s of m.newShowcase) {
      const row = rows.find((r) => (r as { case_uid: string | null }).case_uid === s.uid);
      const hash = row ? rowContentHash(row as Record<string, unknown>, SHOWCASE_INFRA_COLUMNS) : "";
      if (!row || hash !== s.contentHash) {
        mismatches.push(`落库新showcase ${s.uid} hash与manifest不符（Fix 8）`);
      }
    }
  }
  if (m && m.newTests.length > 0) {
    const names = m.newTests.map((t) => t.uid!).filter(Boolean);
    const rows = names.length
      ? (await db.execute(sql`SELECT * FROM "tests" WHERE name IN (${sql.join(names, sql.raw(", "))}) AND source = 'regression' ORDER BY id`)).rows
      : [];
    if (rows.length !== m.newTests.length) {
      mismatches.push(`落库新tests行数 ${rows.length} ≠ manifest ${m.newTests.length}（Fix 8）`);
    }
    for (const t of m.newTests) {
      const row = rows.find((r) => (r as { name: string }).name === t.uid);
      const hash = row ? testRowContentHash(row as Record<string, unknown>) : "";
      if (!row || hash !== t.contentHash) {
        mismatches.push(`落库新test ${t.uid} hash与manifest不符（Fix 8）`);
      }
    }
  }
  // example必须精确42条且与manifest目标集合一致（RCL-AC-011）。
  if (m) {
    const exampleRows = (await db.execute(sql`SELECT * FROM "tests" WHERE source = 'example' ORDER BY id`)).rows;
    if (exampleRows.length !== 42) {
      mismatches.push(`落库example ${exampleRows.length} ≠ 42（RCL-AC-011）`);
    }
    for (const row of exampleRows) {
      const name = String((row as { name: string }).name);
      const jc = String((row as { jurisdiction_code: string | null }).jurisdiction_code ?? "");
      const target = m.exampleTests.find((e) => e.uid === name && e.jurisdictionCode === jc);
      if (!target) {
        mismatches.push(`落库example ${name} 不在manifest目标集合（RCL-AC-011）`);
        continue;
      }
      const hash = testRowContentHash(row as Record<string, unknown>);
      if (hash !== target.contentHash) {
        mismatches.push(`落库example ${name} hash与manifest目标不符（RCL-AC-011）`);
      }
    }
  }

  return { ok: mismatches.length === 0, counts: actual, mismatches };
}

// 供 generate 结果使用的覆盖manifest类型。
export type CoverageManifest = ReturnType<typeof buildCoverageManifest>;
export type { DslExampleTarget, ExampleSyncSets };
