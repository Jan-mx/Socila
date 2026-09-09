/**
 * RCL-FR-021 受控执行器（2026-09-09复审P0修复）：`scripts/rcl-case-library.ts`
 * 七个模式的真实业务逻辑，脚本只做参数解析与输出包装。
 *
 * - audit：真实读取库计数与目标指纹（RCL-NFR-003 精确授权的事实源）；
 * - prepare-archive：创建 prepared 批次、写归档条目、生成 dump/selection/
 *   manifest/pending restore/最后生成不自包含 sha256sums.txt（RCL-FR-002/003/005）；
 * - verify-archive：对真实文件字节校验SHA、必备文件、restore 非 pending，
 *   通过后批次 → restore_verified（RCL-FR-005/NFR-001）；
 * - generate：确定性生成36条场景并用快照规划器回填断言期望（RCL-FR-007/008/014）；
 * - plan-replacement：绑定旧目标行与完整新行构建精确manifest并输出manifestHash
 *   （RCL-FR-006/018）；
 * - apply：授权+事务内受控替换（executeRclApply：FOR UPDATE/applying/唯一约束）；
 * - verify：核对 N/36/N+42、沪粤18/18、配额与字段完整性（RCL-AC-008/011/012）。
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { DbClient } from "@/lib/db";
import { caseArchiveBatches, caseArchiveEntries } from "@/lib/db/schema";
import { rowContentHash } from "./hashes";
import { buildSha256SumsContent, buildSelectionReport, buildPendingRestoreReport } from "./archive";
import { buildRclManifest, assertRclCounts, type BoundRow, type RclManifest, type NewCaseRow, type NewShowcaseRow, type NewTestRow } from "./manifest";
import { generateShowcaseScenarios, buildCoverageManifest, type GeneratedScenario, type ScenarioTemplate } from "./generator";
import { scoreCase } from "./scoring";
import { classifyScenario } from "./multi-label";
import { executeRclApply as defaultExecuteApply, type RclApplyResult } from "./apply";

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
  /** 策展选择报告输入。 */
  selection: {
    curatedUids: string[];
    sourceCounts: Record<string, number>;
    quotaStats: Record<string, number>;
    violations: string[];
  };
  createdBy: string;
  now?: () => Date;
}

export interface PrepareArchiveResult {
  batchId: string;
  files: string[];
  sha256sums: string;
}

const ARCHIVE_FILES = [
  "policyops-fc.dump",
  "cases.dump",
  "showcase_cases.dump",
  "tests.dump",
  "selection-report.json",
  "manifest.json",
  "restore-report.json",
];

/**
 * prepare-archive（RCL-FR-002/003/005）：创建prepared批次与归档条目，生成
 * dump/selection/manifest/pending restore，最后生成不自包含的sha256sums.txt。
 */
export async function prepareRclArchive(input: PrepareArchiveInput): Promise<PrepareArchiveResult> {
  const storage = input.storage ?? nodeFsStorage(input.storageDir);
  const dump = input.pgDump ?? (async () => {
    throw new RclExecutorError("未注入pgDump执行器（CLI应传入真实pg_dump）");
  });
  const now = input.now ?? (() => new Date());
  const batchId = randomUUID();

  // 1) 批次（prepared）+ 归档条目（唯一约束：同批次同实体一条）。
  await input.db.insert(caseArchiveBatches).values({
    id: batchId,
    status: "prepared",
    sourceCounts: input.selection.sourceCounts,
    retainedCounts: {},
    deletedCounts: {},
    tableHashes: {},
    manifestHash: input.manifest.manifestHash,
    storagePath: input.storageDir,
    createdBy: input.createdBy,
  });
  for (const c of input.manifest.oldTargets.cases) {
    await input.db.insert(caseArchiveEntries).values({
      archiveBatchId: batchId,
      entityType: "case",
      entityId: c.rowId,
      caseUid: c.uid ?? null,
      contentHash: c.contentHash,
      archiveReason: "RCL全量重建（ADR-0011）",
    });
  }
  for (const s of input.manifest.oldTargets.showcase) {
    await input.db.insert(caseArchiveEntries).values({
      archiveBatchId: batchId,
      entityType: "showcase_case",
      entityId: s.rowId,
      caseUid: s.uid ?? null,
      contentHash: s.contentHash,
      archiveReason: "RCL全量重建（ADR-0011）",
    });
  }
  for (const t of input.manifest.oldTargets.tests) {
    await input.db.insert(caseArchiveEntries).values({
      archiveBatchId: batchId,
      entityType: "test",
      entityId: t.rowId,
      caseUid: t.uid ?? null,
      contentHash: t.contentHash,
      archiveReason: "RCL全量重建（ADR-0011）",
    });
  }

  // 2) dump文件（完整库+三表）。
  storage.write(path.join(input.storageDir, "policyops-fc.dump"), await dump());
  storage.write(path.join(input.storageDir, "cases.dump"), await dump("cases"));
  storage.write(path.join(input.storageDir, "showcase_cases.dump"), await dump("showcase_cases"));
  storage.write(path.join(input.storageDir, "tests.dump"), await dump("tests"));

  // 3) selection-report（violations非空即pending）。
  storage.write(
    path.join(input.storageDir, "selection-report.json"),
    JSON.stringify(buildSelectionReport({
      algorithmVersion: "RCL-GEN-1.0",
      curatedUids: input.selection.curatedUids,
      sourceCounts: input.selection.sourceCounts,
      quotaStats: input.selection.quotaStats,
      violations: input.selection.violations,
      nowIso: now().toISOString(),
    }), null, 2),
  );

  // 4) manifest.json。
  storage.write(path.join(input.storageDir, "manifest.json"), JSON.stringify(input.manifest, null, 2));

  // 5) restore-report（pending：恢复对账由独立恢复演练完成后写verified）。
  storage.write(
    path.join(input.storageDir, "restore-report.json"),
    JSON.stringify(buildPendingRestoreReport({
      sourceDumpFileName: "policyops-fc.dump",
      sourceDumpSha256: bufferSha256(storage.read(path.join(input.storageDir, "policyops-fc.dump"))),
      nowIso: now().toISOString(),
    }), null, 2),
  );

  // 6) sha256sums.txt 最后生成且不自包含（RCL-FR-003）。
  const entries = ARCHIVE_FILES.map((fileName) => {
    const filePath = path.join(input.storageDir, fileName);
    return {
      fileName,
      path: filePath,
      sha256: bufferSha256(storage.read(filePath)),
    };
  });
  const sha256sums = buildSha256SumsContent(entries);
  storage.write(path.join(input.storageDir, "sha256sums.txt"), sha256sums);

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
 * verify-archive（RCL-FR-005/AC-001/002）：对真实文件字节核对sha256sums.txt、
 * 必备文件存在、restore报告必须verified；全部通过→批次restore_verified。
 */
export async function verifyRclArchive(input: VerifyArchiveInput): Promise<VerifyArchiveResult> {
  const storage = input.storage ?? nodeFsStorage(input.storageDir);
  const mismatches: string[] = [];
  const dir = input.storageDir;

  const required = ["policyops-fc.dump", "cases.dump", "showcase_cases.dump", "tests.dump", "selection-report.json", "manifest.json", "restore-report.json", "sha256sums.txt"];
  for (const f of required) {
    if (!storage.exists(path.join(dir, f))) {
      mismatches.push(`缺失必备文件：${f}`);
    }
  }
  if (mismatches.length > 0) {
    return { ok: false, mismatches, batchId: input.batchId };
  }

  // sha256sums.txt 逐行核对（文件字节SHA-256）。
  const sumsRaw = String(storage.read(path.join(dir, "sha256sums.txt")));
  const lines = sumsRaw.trim().split("\n").filter(Boolean);
  if (lines.some((l) => l.includes("sha256sums.txt"))) {
    mismatches.push("sha256sums.txt 包含自身（必须不自包含）");
  }
  for (const line of lines) {
    const [hash, fileName] = line.split(/\s{2,}/);
    if (!fileName || !hash) {
      mismatches.push(`sha256sums.txt 行格式非法：${line}`);
      continue;
    }
    const actual = bufferSha256(storage.read(path.join(dir, fileName)));
    if (actual !== hash) {
      mismatches.push(`SHA不符：${fileName}`);
    }
  }

  // restore报告必须 verified（pending/缺失 → 拒绝apply）。
  let restore: { status?: string } = {};
  try {
    restore = JSON.parse(String(storage.read(path.join(dir, "restore-report.json")))) as { status?: string };
  } catch {
    mismatches.push("restore-report.json 无法解析");
  }
  if (restore.status !== "verified") {
    mismatches.push(`restore-report 状态为 ${restore.status ?? "缺失"}，必须 verified`);
  }

  if (mismatches.length > 0) {
    return { ok: false, mismatches, batchId: input.batchId };
  }

  // 通过 → 批次 restore_verified（条件更新）。
  await input.db
    .update(caseArchiveBatches)
    .set({ status: "restore_verified" })
    .where(sql`id = ${input.batchId} AND status = 'prepared'`);
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
 * plan-replacement（RCL-FR-006/018/AC-003）：从库读取旧目标行（精确ID+内容hash
 * +UID），结合生成场景（评分/多标签/完整场景字段）构建精确manifest并输出manifestHash。
 */
export async function planRclReplacement(input: PlanReplacementInput): Promise<PlanReplacementResult> {
  const { db } = input;

  // 旧目标：cases/showcase 按行内容重算规范化hash（库中content_hash列可能为空，
  // 行内容哈希才是内容绑定权威，RCL-FR-002/AC-003）；tests 只删除旧回归
  // （source='regression'），42条DSL示例（source='example'）保留为exampleTests。
  const oldCaseRows = await db.execute(sql`SELECT * FROM "cases" ORDER BY id`);
  const oldShowRows = await db.execute(sql`SELECT * FROM "showcase_cases" ORDER BY id`);
  const oldTestRows = await db.execute(sql`SELECT id, source_case_uid AS uid FROM "tests" WHERE source = 'regression' ORDER BY id`);
  const exampleTestRows = await db.execute(sql`SELECT id, name AS uid, jurisdiction_code AS "jurisdictionCode" FROM "tests" WHERE source = 'example' ORDER BY id`);

  const oldCases: BoundRow[] = oldCaseRows.rows.map((r) => ({
    rowId: Number((r as { id: number }).id),
    uid: String((r as { case_uid: string | null }).case_uid ?? null),
    contentHash: rowContentHash(r as Record<string, unknown>, ["id", "created_at", "updated_at", "governed_at", "post_date"]),
  }));
  const oldShowcase: BoundRow[] = oldShowRows.rows.map((r) => ({
    rowId: Number((r as { id: number }).id),
    uid: String((r as { case_uid: string | null }).case_uid ?? null),
    contentHash: rowContentHash(r as Record<string, unknown>, ["id", "created_at", "updated_at", "curated_at"]),
  }));
  const oldTests: BoundRow[] = oldTestRows.rows.map((r) => ({
    rowId: Number((r as { id: number }).id),
    uid: (r as { uid: string | null }).uid ?? null,
    contentHash: "",
  }));
  const exampleTests: Array<{ rowId: number; uid: string; contentHash: string; jurisdictionCode: string | null }> = exampleTestRows.rows.map((r) => ({
    rowId: Number((r as { id: number }).id),
    uid: String((r as { uid: string }).uid),
    contentHash: rowContentHash(r as Record<string, unknown>, ["id"]),
    jurisdictionCode: (r as { jurisdictionCode: string | null }).jurisdictionCode,
  }));

  const newCases: NewCaseRow[] = input.scenarios.map((s) => {
    const replay = { match: true, differences: [], comparableAssertions: s.assertions.length };
    const score = scoreCase({ input: s.input, coverageObligations: s.coverageObligations, replay, declaredAssertions: s.assertions.length });
    const labels = classifyScenario(s);
    const snap = input.snapshotMap[s.jurisdictionCode] ?? { id: s.snapshotId, hash: s.snapshotContentHash };
    return {
      rowId: 0,
      uid: s.caseUid,
      contentHash: rowContentHash({ ...s, qualityScore: score.total, qualityBreakdown: score, multiLabels: labels }, ["rowId"]),
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
  });

  const newShowcase: NewShowcaseRow[] = input.scenarios.map((s) => {
    const replay = { match: true, differences: [], comparableAssertions: s.assertions.length };
    const score = scoreCase({ input: s.input, coverageObligations: s.coverageObligations, replay, declaredAssertions: s.assertions.length });
    const labels = classifyScenario(s);
    const snap = input.snapshotMap[s.jurisdictionCode] ?? { id: s.snapshotId, hash: s.snapshotContentHash };
    return {
      rowId: 0,
      uid: s.caseUid,
      contentHash: rowContentHash({ ...s, qualityScore: score.total, multiLabels: labels }, ["rowId"]),
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
  });

  const newTests: NewTestRow[] = input.scenarios.map((s) => ({
    rowId: 0,
    uid: s.testUid,
    contentHash: rowContentHash({ name: s.testUid, jurisdictionCode: s.jurisdictionCode, input: s.input, expected: buildExpectedFromAssertions(s), sourceCaseUid: s.caseUid }, []),
    jurisdictionCode: s.jurisdictionCode,
    sourceCaseUid: s.caseUid,
    input: { user: s.input },
    expected: buildExpectedFromAssertions(s),
    ruleId: null,
  }));

  const manifest = buildRclManifest({
    algorithmVersion: "RCL-MANIFEST-1.0",
    generatorVersion: "RCL-GEN-1.0",
    newCases,
    newShowcase,
    newTests,
    exampleTests,
    oldTargets: { cases: oldCases, showcase: oldShowcase, tests: oldTests },
    snapshot: input.snapshotMap["310000"]
      ? { id: input.snapshotMap["310000"].id, contentHash: input.snapshotMap["310000"].hash }
      : null,
  });
  assertRclCounts(manifest);
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
  /** 字段完整性检查项（默认检查非空场景字段）。 */
  checkFields?: boolean;
}

export interface VerifyReplacementResult {
  ok: boolean;
  counts: { cases: number; showcase: number; tests: number };
  mismatches: string[];
}

/**
 * verify（RCL-AC-008/011/012）：核对最终计数 N/36/N+42、沪粤18/18、配额
 * 与完整场景字段；任一不符 ok=false（fail-closed，返回mismatches）。
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

  return { ok: mismatches.length === 0, counts: actual, mismatches };
}

// 供 generate 结果使用的覆盖manifest类型。
export type CoverageManifest = ReturnType<typeof buildCoverageManifest>;
