/**
 * WI-20260911-03（SHV2-FR-017～023、AC-014～018）RCL V1→V2受控原位改写核心。
 *
 * - 精确计划：绑定codeSha、来源工件指纹/attestation、目标库前置指纹（36 cases+36
 *   showcase+36 regression+44 example+快照+release的规范化指纹）、finalFingerprint
 *   （投影后行集指纹）、3个快照绑定与108条entries（整数ID、新旧UID、新旧内容hash、
 *   新旧快照hash、evidence hash、完整before/after）；planHash由正文确定性重算；
 * - 原位改写：REPEATABLE READ单事务+任务专属pg_advisory_xact_lock；事务内重算前置
 *   指纹与planHash、FOR UPDATE锁定108行、逐行重读核对旧hash后UPDATE为投影行并重读
 *   核对新hash；清空回归test运行结果；写入1个applied批次+恰好108条entries；COMMIT前
 *   finalFingerprint核对；任一漂移整体回滚（SHV2-FR-021）；
 * - 幂等：applied批次+最终指纹一致+108条→noop:true；部分完成/不一致→
 *   REWRITE_STATE_DRIFT稳定错误，禁止补写（SHV2-FR-022）；
 * - transcript_text不虚构：改写仅原样保留（RCL行为NULL仍为NULL）。
 * 与case-governance/case-repair保持独立（CLI为scripts/rcl-case-rewrite-v2.ts）。
 */
import { createHash } from "node:crypto";
import { canonicalJson, rowContentHash, CASE_INFRA_COLUMNS, SHOWCASE_INFRA_COLUMNS, TEST_INFRA_COLUMNS } from "@/lib/case-governance/hashes";
import type { GeneratedScenarioV2 } from "@/lib/case-governance/generator-v2";

export const REWRITE_ALGORITHM_VERSION = "RCL-REWRITE-2.0";
export const SOURCE_GENERATOR_VERSION = "RCL-GEN-1.0";
export const TARGET_GENERATOR_VERSION = "RCL-GEN-2.0";
export const REWRITE_ENTRY_COUNT = 108;
export const TARGET_ROW_COUNTS = { cases: 36, showcases: 36, regressionTests: 36, exampleTests: 44 } as const;

/** 任务专属advisory锁键（sha256("rcl-case-rewrite-v2")前8字节的有符号bigint十进制）。 */
export const REWRITE_ADVISORY_LOCK_KEY = (() => {
  const h = createHash("sha256").update("rcl-case-rewrite-v2", "utf8").digest();
  return h.readBigInt64BE(0).toString();
})();

const SHA256_HEX = /^[0-9a-f]{64}$/;

export class CaseRewriteError extends Error {
  readonly code: string;
  readonly details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(`${code}: ${message}`);
    this.name = "CaseRewriteError";
    this.code = code;
    this.details = details;
  }
}

// ─── 来源工件与绑定 ─────────────────────────────────────────────────────────

export interface SnapshotBinding {
  jurisdictionCode: string;
  asOfDate: string;
  snapshotId: string;
  snapshotContentHash: string;
}

/** `rcl-case-library.ts generate-v2` 的产物（generated-scenarios-v2.json）。 */
export interface GeneratedSource {
  scenarios: GeneratedScenarioV2[];
  libraryManifestHash?: string;
  coverageManifest?: { manifestHash?: string };
  snapshotBindings?: SnapshotBinding[];
}

export function sourceAttestation(source: GeneratedSource): string {
  return sha256(
    canonicalJson({
      scenarioCount: source.scenarios.length,
      entries: source.scenarios
        .map((s) => ({ caseUid: s.caseUid, contentHash: s.contentHash }))
        .sort((a, b) => a.caseUid.localeCompare(b.caseUid)),
    }),
  );
}

export function sourceManifestOf(source: GeneratedSource): Record<string, unknown> {
  return {
    libraryManifestHash: source.libraryManifestHash ?? null,
    coverageManifestHash: source.coverageManifest?.manifestHash ?? null,
    scenarioCount: source.scenarios.length,
  };
}

export function sourceArtifactFingerprint(source: GeneratedSource): string {
  return sha256(canonicalJson({ manifest: sourceManifestOf(source), attestation: sourceAttestation(source) }));
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** 改写批次ID：sha256("rcl-case-rewrite-v2:<planHash>")前16字节设v5版本/变体位。 */
export function deriveRewriteBatchId(planHash: string): string {
  const digest = createHash("sha256").update(`rcl-case-rewrite-v2:${planHash}`, "utf8").digest();
  const b = Buffer.from(digest.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// ─── CLI参数守卫（SHV2-FR-023）──────────────────────────────────────────────

export type RewriteMode = "audit" | "plan" | "apply" | "verify";

export interface RewriteArgs {
  ok: true;
  mode: RewriteMode;
  generated?: string;
  planFile?: string;
  iAmAuthorized: boolean;
  planHash?: string;
  targetFingerprint?: string;
  out?: string;
  actor?: string;
}

function argOf(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

export function parseRewriteArgs(argv: string[]): RewriteArgs {
  const [mode] = argv;
  if (mode !== "audit" && mode !== "plan" && mode !== "apply" && mode !== "verify") {
    throw new CaseRewriteError("USAGE", "用法：rcl-case-rewrite-v2.ts audit|plan|apply|verify --generated <generated-scenarios-v2.json> [--plan-file <rewrite-plan-v2.json>]");
  }
  const generated = argOf(argv, "--generated");
  if (!generated) throw new CaseRewriteError("USAGE", "缺少 --generated <generated-scenarios-v2.json>");
  if (mode === "apply") {
    const iAmAuthorized = argv.includes("--i-am-authorized");
    const planHash = argOf(argv, "--plan-hash");
    const targetFingerprint = argOf(argv, "--target-fingerprint");
    const planFile = argOf(argv, "--plan-file");
    if (!iAmAuthorized) throw new CaseRewriteError("USAGE", "apply需要显式授权参数 --i-am-authorized");
    if (!planHash) throw new CaseRewriteError("USAGE", "apply需要 --plan-hash <hash>");
    if (!targetFingerprint) throw new CaseRewriteError("USAGE", "apply需要 --target-fingerprint <fingerprint>");
    if (!planFile) throw new CaseRewriteError("USAGE", "apply需要 --plan-file <rewrite-plan-v2.json>");
    return { ok: true, mode, generated, planFile, iAmAuthorized, planHash, targetFingerprint, actor: argOf(argv, "--actor") };
  }
  if (mode === "verify") {
    const planFile = argOf(argv, "--plan-file");
    if (!planFile) throw new CaseRewriteError("USAGE", "verify需要 --plan-file <rewrite-plan-v2.json>");
    return { ok: true, mode, generated, planFile, iAmAuthorized: false };
  }
  return { ok: true, mode, generated, planFile: argOf(argv, "--plan-file"), iAmAuthorized: false, out: argOf(argv, "--out") };
}

// ─── 行匹配与投影 ───────────────────────────────────────────────────────────

type Row = Record<string, unknown>;
export interface MatchedRows {
  cases: Array<{ row: Row; scenario: GeneratedScenarioV2 }>;
  showcases: Array<{ row: Row; scenario: GeneratedScenarioV2 }>;
  tests: Array<{ row: Row; scenario: GeneratedScenarioV2 }>;
  mismatches: string[];
}

function scenarioKeyFromV1Uid(uid: string): { jurisdictionCode: string; key: string } | null {
  const m = /^RPC-(\d{6})-(.+)-V1$/.test(uid) ? /^RPC-(\d{6})-(.+)-V1$/.exec(uid) : null;
  return m ? { jurisdictionCode: m[1], key: m[2] } : null;
}

function bandOfYear(year: unknown): string | null {
  if (typeof year !== "number" || !(year > 1900)) return null;
  if (year < 1970) return "before_1970";
  if (year < 1980) return "1970_1979";
  return "from_1980";
}

/** 人物槽位（地区×性别×年龄段×就业状态）：V2矩阵按PRD §8.2重新分配能力，
 * 因此V1→V2的匹配身份是槽位而非scenario_key（同一槽位的场景键可随能力升级变化）。 */
function slotOfScenario(s: GeneratedScenarioV2): string {
  const basic = (s.input.basic ?? {}) as Record<string, unknown>;
  const status = (s.input.status ?? {}) as Record<string, unknown>;
  return `${s.jurisdictionCode}|${String(basic.gender)}|${bandOfYear(basic.birth_year)}|${String(status.employment_status)}`;
}

function slotOfEngineInput(input: unknown, jurisdictionCode: string): string | null {
  if (input === null || typeof input !== "object") return null;
  const root = input as Record<string, unknown>;
  const basic = (root.basic ?? {}) as Record<string, unknown>;
  const status = (root.status ?? {}) as Record<string, unknown>;
  const gender = typeof basic.gender === "string" ? basic.gender : null;
  const band = bandOfYear(basic.birth_year);
  const employment = typeof status.employment_status === "string" ? status.employment_status : null;
  if (!gender || !band || !employment) return null;
  return `${jurisdictionCode}|${gender}|${band}|${employment}`;
}

/** 按人物槽位与场景一一对应；重复/缺失/版本不符均报mismatch。 */
export function matchRowsToScenarios(input: {
  caseRows: Row[];
  showcaseRows: Row[];
  testRows: Row[];
  scenarios: GeneratedScenarioV2[];
}): MatchedRows {
  const mismatches: string[] = [];
  const bySlot = new Map<string, GeneratedScenarioV2>();
  for (const s of input.scenarios) {
    const slot = slotOfScenario(s);
    if (bySlot.has(slot)) mismatches.push(`人物槽位重复：${slot}（${s.scenarioKey}）`);
    bySlot.set(slot, s);
  }
  const pick = (row: Row, slot: string, label: string): { row: Row; scenario: GeneratedScenarioV2 } | null => {
    const s = bySlot.get(slot);
    if (!s) {
      mismatches.push(`${label} ${String(row.id)} 无对应场景（${slot}）`);
      return null;
    }
    return { row, scenario: s };
  };

  const cases: Array<{ row: Row; scenario: GeneratedScenarioV2 }> = [];
  for (const row of input.caseRows) {
    const slot = slotOfEngineInput(row.input, String(row.jurisdiction_code ?? ""));
    if (String(row.generator_version ?? "") !== SOURCE_GENERATOR_VERSION) {
      mismatches.push(`case ${String(row.id)} generator_version=${String(row.generator_version)} ≠ ${SOURCE_GENERATOR_VERSION}`);
      continue;
    }
    const uid = String(row.case_uid ?? "");
    if (!uid.endsWith("-V1")) mismatches.push(`case ${String(row.id)} UID非V1：${uid}`);
    if (!slot) {
      mismatches.push(`case ${String(row.id)} 无法解析人物槽位`);
      continue;
    }
    const m = pick(row, slot, "case");
    if (m) cases.push(m);
  }
  const showcases: Array<{ row: Row; scenario: GeneratedScenarioV2 }> = [];
  for (const row of input.showcaseRows) {
    const slot = slotOfEngineInput(row.input_data, String(row.jurisdiction_code ?? ""));
    if (String(row.generator_version ?? "") !== SOURCE_GENERATOR_VERSION) {
      mismatches.push(`showcase ${String(row.id)} generator_version≠${SOURCE_GENERATOR_VERSION}`);
      continue;
    }
    if (!slot) {
      mismatches.push(`showcase ${String(row.id)} 无法解析人物槽位`);
      continue;
    }
    const m = pick(row, slot, "showcase");
    if (m) showcases.push(m);
  }
  const tests: Array<{ row: Row; scenario: GeneratedScenarioV2 }> = [];
  for (const row of input.testRows) {
    if (String(row.source ?? "") !== "regression") continue;
    const parsed = scenarioKeyFromV1Uid(String(row.source_case_uid ?? ""));
    if (!parsed) {
      mismatches.push(`test ${String(row.id)} source_case_uid非V1 UID：${String(row.source_case_uid)}`);
      continue;
    }
    // 回归test无独立画像输入：槽位经由同UID的case行传递，这里用引擎输入（{user:…}）解析。
    const slot = slotOfEngineInput((row.input as { user?: unknown } | null)?.user, parsed.jurisdictionCode)
      ?? slotOfEngineInput(row.input, parsed.jurisdictionCode);
    if (!slot) {
      mismatches.push(`test ${String(row.id)} 无法解析人物槽位`);
      continue;
    }
    const m = pick(row, slot, "test");
    if (m) tests.push(m);
  }
  if (cases.length !== input.scenarios.length) mismatches.push(`cases匹配数 ${cases.length} ≠ ${input.scenarios.length}`);
  if (showcases.length !== input.scenarios.length) mismatches.push(`showcases匹配数 ${showcases.length} ≠ ${input.scenarios.length}`);
  if (tests.length !== input.scenarios.length) mismatches.push(`tests匹配数 ${tests.length} ≠ ${input.scenarios.length}`);
  return { cases, showcases, tests, mismatches };
}

export function projectRewrittenCaseRow(row: Row, s: GeneratedScenarioV2): Row {
  return {
    ...row,
    case_uid: s.caseUid,
    topics: structuredClone(s.topics),
    case_text: s.caseText,
    tags: structuredClone(s.tags),
    is_regression: true,
    jurisdiction_code: s.jurisdictionCode,
    quality_score: s.quality.total,
    quality_status: "active",
    governance_reason: "RCL-GEN-2.0确定性合成政策案例（无真实用户数据）",
    scenario_key: s.scenarioKey,
    generator_version: TARGET_GENERATOR_VERSION,
    as_of_date: s.asOfDate,
    snapshot_hash: s.snapshotContentHash,
    coverage_obligations: structuredClone(s.coverageObligations),
    evidence: structuredClone(s.policySources),
    quality_breakdown: structuredClone(s.quality),
    multi_labels: structuredClone(s.tags),
    input: structuredClone(s.input),
    expected: structuredClone(s.expected),
    assertions: structuredClone(s.assertions),
  };
}

export function projectRewrittenShowcaseRow(row: Row, s: GeneratedScenarioV2): Row {
  return {
    ...row,
    case_uid: s.caseUid,
    title: s.title,
    tags: structuredClone(s.tags),
    user_message: s.userMessage,
    ai_response: s.aiResponse,
    input_data: structuredClone(s.input),
    expected_data: structuredClone(s.expected),
    category: s.category,
    is_published: true,
    jurisdiction_code: s.jurisdictionCode,
    source_case_uid: s.caseUid,
    snapshot_id: s.snapshotId,
    quality_score: s.quality.total,
    quality_status: "selected",
    scenario_key: s.scenarioKey,
    generator_version: TARGET_GENERATOR_VERSION,
    as_of_date: s.asOfDate,
    snapshot_hash: s.snapshotContentHash,
    coverage_obligations: structuredClone(s.coverageObligations),
    evidence: structuredClone(s.policySources),
    quality_breakdown: structuredClone(s.quality),
    multi_labels: structuredClone(s.tags),
    assertions: structuredClone(s.assertions),
  };
}

export function projectRewrittenTestRow(row: Row, s: GeneratedScenarioV2): Row {
  return {
    ...row,
    name: s.testUid,
    jurisdiction_code: s.jurisdictionCode,
    rule_id: null,
    input: { user: structuredClone(s.input) },
    params_override: null,
    expected: structuredClone(s.expected),
    source: "regression",
    source_case_uid: s.caseUid,
    last_run_result: null,
    last_run_at: null,
  };
}

export function evidenceHashOf(s: GeneratedScenarioV2): string {
  return sha256(canonicalJson(s.policySources));
}

function hashProjection(projection: Row, cols: string[]): string {
  return rowContentHash(projection, cols);
}

// ─── 指纹 ───────────────────────────────────────────────────────────────────

export interface FingerprintInput {
  cases: Row[];
  showcases: Row[];
  tests: Row[];
  snapshots: Row[];
  releases: Row[];
}

/** 业务行+快照+release的规范化指纹（行内hash排除基础设施列；任一业务字段漂移即变化）。 */
export function rowsFingerprint(input: FingerprintInput): string {
  const hashAll = (rows: Row[], cols: string[]) => rows.map((r) => rowContentHash(r, cols));
  return sha256(
    canonicalJson({
      cases: hashAll(input.cases, CASE_INFRA_COLUMNS),
      showcases: hashAll(input.showcases, SHOWCASE_INFRA_COLUMNS),
      tests: hashAll(input.tests, TEST_INFRA_COLUMNS),
      snapshots: input.snapshots,
      releases: input.releases,
    }),
  );
}

// ─── 计划 ───────────────────────────────────────────────────────────────────

export type RewriteEntityType = "case" | "showcase_case" | "test";

export interface RewritePlanEntry {
  entityType: RewriteEntityType;
  entityId: number;
  scenarioKey: string;
  oldUid: string | null;
  newUid: string;
  oldContentHash: string;
  newContentHash: string;
  oldSnapshotHash: string | null;
  newSnapshotHash: string;
  evidenceHash: string;
  before: Row;
  after: Row;
}

export interface RewritePlan {
  algorithmVersion: string;
  batchId: string;
  codeSha: string;
  sourceFingerprint: string;
  targetFingerprint: string;
  finalFingerprint: string;
  sourceGeneratorVersion: string;
  targetGeneratorVersion: string;
  sourceManifest: Record<string, unknown>;
  sourceAttestation: string;
  snapshotBindings: SnapshotBinding[];
  rowCounts: { cases: number; showcases: number; regressionTests: number; entries: number };
  entries: RewritePlanEntry[];
  planHash: string;
}

const ENTRY_ORDER: Record<RewriteEntityType, number> = { case: 0, showcase_case: 1, test: 2 };

/**
 * 构建精确改写计划。matched必须无mismatch（否则抛错）；snapshotBindings来自来源工件并
 * 与release核对（由调用方或audit完成）；finalFingerprint由投影行+未变快照/release行计算。
 */
export function buildRewritePlan(input: {
  codeSha: string;
  source: GeneratedSource;
  targetFingerprint: string;
  matched: MatchedRows;
  snapshotRows: Row[];
  releaseRows: Row[];
  /** 库中source='example'的测试行（改写不变，但进入finalFingerprint的行集合）。 */
  exampleTestRows?: Row[];
}): RewritePlan {
  if (input.matched.mismatches.length > 0) {
    throw new CaseRewriteError("MATCH_FAILED", `行匹配失败：${input.matched.mismatches.slice(0, 8).join("；")}`, input.matched.mismatches);
  }
  if (!SHA256_HEX.test(input.targetFingerprint)) {
    throw new CaseRewriteError("PLAN_INVALID", `targetFingerprint非法：${input.targetFingerprint}`);
  }
  const entries: RewritePlanEntry[] = [];
  const push = (entityType: RewriteEntityType, m: { row: Row; scenario: GeneratedScenarioV2 }, cols: string[], project: (row: Row, s: GeneratedScenarioV2) => Row, uidColumn: string): void => {
    const afterProj = project(m.row, m.scenario);
    const oldHash = hashProjection(m.row, cols);
    // 先基于排除content_hash基础设施列的业务投影计算目标hash（防循环），再把该hash
    // 写入after投影的content_hash列（cases/showcase_cases；tests表无该列不写）。
    const newHash = hashProjection(afterProj, cols);
    if (entityType !== "test") afterProj.content_hash = newHash;
    // before/after统一经canonicalJson归一化（Date→YYYY-MM-DD字符串）：计划落盘复跑、
    // apply事务内重算与verify三方hash/正文一致（JSON.round-trip不改变hash）。
    const before = JSON.parse(canonicalJson(m.row)) as Row;
    const after = JSON.parse(canonicalJson(afterProj)) as Row;
    entries.push({
      entityType,
      entityId: Number(m.row.id),
      scenarioKey: m.scenario.scenarioKey,
      oldUid: (m.row[uidColumn] as string | null) ?? null,
      newUid: String(afterProj[uidColumn]),
      oldContentHash: oldHash,
      newContentHash: newHash,
      oldSnapshotHash: (m.row.snapshot_hash as string | null) ?? null,
      newSnapshotHash: m.scenario.snapshotContentHash,
      evidenceHash: evidenceHashOf(m.scenario),
      before,
      after,
    });
  };
  for (const m of input.matched.cases) push("case", m, CASE_INFRA_COLUMNS, projectRewrittenCaseRow, "case_uid");
  for (const m of input.matched.showcases) push("showcase_case", m, SHOWCASE_INFRA_COLUMNS, projectRewrittenShowcaseRow, "case_uid");
  for (const m of input.matched.tests) push("test", m, TEST_INFRA_COLUMNS, projectRewrittenTestRow, "name");
  entries.sort((a, b) => (ENTRY_ORDER[a.entityType] - ENTRY_ORDER[b.entityType]) || (a.entityId - b.entityId));
  if (entries.length !== REWRITE_ENTRY_COUNT) {
    throw new CaseRewriteError("PLAN_INVALID", `entries ${entries.length} ≠ ${REWRITE_ENTRY_COUNT}`);
  }
  // finalFingerprint与computeBusinessFingerprint的行集合/顺序完全对齐：
  // cases/showcases=全部行（36条均被改写，按id升序）；tests=44条example（原样，
  // 按id升序）+36条regression投影，按id全局升序穿插。
  const finalTests = [
    ...(input.exampleTestRows ?? []),
    ...input.matched.tests.map((m) => projectRewrittenTestRow(m.row, m.scenario)),
  ].sort((a, b) => Number(a.id) - Number(b.id));
  const finalFingerprint = rowsFingerprint({
    cases: input.matched.cases.map((m) => projectRewrittenCaseRow(m.row, m.scenario)),
    showcases: input.matched.showcases.map((m) => projectRewrittenShowcaseRow(m.row, m.scenario)),
    tests: finalTests,
    snapshots: input.snapshotRows,
    releases: input.releaseRows,
  });
  const snapshotBindings = bindingsFromScenarios(input.source);
  const body: Omit<RewritePlan, "planHash" | "batchId"> = {
    algorithmVersion: REWRITE_ALGORITHM_VERSION,
    codeSha: input.codeSha,
    sourceFingerprint: sourceArtifactFingerprint(input.source),
    targetFingerprint: input.targetFingerprint,
    finalFingerprint,
    sourceGeneratorVersion: SOURCE_GENERATOR_VERSION,
    targetGeneratorVersion: TARGET_GENERATOR_VERSION,
    sourceManifest: sourceManifestOf(input.source),
    sourceAttestation: sourceAttestation(input.source),
    snapshotBindings,
    rowCounts: { cases: 36, showcases: 36, regressionTests: 36, entries: REWRITE_ENTRY_COUNT },
    entries,
  };
  const planHash = rewritePlanHash({ ...body, batchId: "", planHash: "" } as RewritePlan);
  const batchId = deriveRewriteBatchId(planHash);
  return { ...body, batchId, planHash };
}

function bindingsFromScenarios(source: GeneratedSource): SnapshotBinding[] {
  if (source.snapshotBindings && source.snapshotBindings.length > 0) return structuredClone(source.snapshotBindings);
  const map = new Map<string, SnapshotBinding>();
  for (const s of source.scenarios) {
    map.set(`${s.jurisdictionCode}|${s.asOfDate}`, {
      jurisdictionCode: s.jurisdictionCode,
      asOfDate: s.asOfDate,
      snapshotId: s.snapshotId,
      snapshotContentHash: s.snapshotContentHash,
    });
  }
  return [...map.values()].sort((a, b) => `${a.jurisdictionCode}|${a.asOfDate}`.localeCompare(`${b.jurisdictionCode}|${b.asOfDate}`));
}

/** planHash：由除planHash自身外的全部正文规范化计算（batchId派生自planHash，不进入）。 */
export function rewritePlanHash(plan: RewritePlan): string {
  const { planHash: _p, batchId: _b, ...core } = plan;
  void _p;
  void _b;
  return sha256(canonicalJson(core));
}

/** 计划正文自校验（读取侧）：条目数、hash形状、UID成对、计数与绑定。 */
export function verifyPlanBody(plan: RewritePlan): string[] {
  const problems: string[] = [];
  if (plan.algorithmVersion !== REWRITE_ALGORITHM_VERSION) problems.push(`algorithmVersion ${plan.algorithmVersion} ≠ ${REWRITE_ALGORITHM_VERSION}`);
  if (plan.entries.length !== REWRITE_ENTRY_COUNT) problems.push(`entries ${plan.entries.length} ≠ ${REWRITE_ENTRY_COUNT}`);
  const byType = { case: 0, showcase_case: 0, test: 0 };
  for (const e of plan.entries) {
    byType[e.entityType as keyof typeof byType] = (byType[e.entityType as keyof typeof byType] ?? 0) + 1;
    if (!Number.isInteger(e.entityId)) problems.push(`entry ${e.entityType}/${e.entityId} 整数ID非法`);
    if (!SHA256_HEX.test(e.oldContentHash) || !SHA256_HEX.test(e.newContentHash) || !SHA256_HEX.test(e.evidenceHash)) {
      problems.push(`entry ${e.entityType}/${e.entityId} hash非法`);
    }
    if (!SHA256_HEX.test(e.newSnapshotHash)) problems.push(`entry ${e.entityType}/${e.entityId} newSnapshotHash非法`);
    if (e.oldUid === e.newUid || !String(e.newUid).endsWith("-V2")) problems.push(`entry ${e.entityType}/${e.entityId} UID不成对升级：${e.oldUid}→${e.newUid}`);
    if (!e.before || !e.after || Object.keys(e.after).length === 0) problems.push(`entry ${e.entityType}/${e.entityId} before/after缺失`);
    // 业务content_hash契约（2026-09-12独立审查）：case/showcase条目before/after必须
    // 携带业务content_hash且after等于newContentHash；tests表无该列，出现即计划非法。
    if (e.entityType === "test") {
      if ("content_hash" in e.after || "content_hash" in e.before) {
        problems.push(`entry ${e.entityType}/${e.entityId} test行不应携带content_hash键`);
      }
    } else {
      if (e.after.content_hash !== e.newContentHash) {
        problems.push(`entry ${e.entityType}/${e.entityId} after业务content_hash与newContentHash不一致`);
      }
      if (!("content_hash" in e.before) || !("content_hash" in e.after)) {
        problems.push(`entry ${e.entityType}/${e.entityId} before/after缺业务content_hash字段`);
      }
    }
  }
  if (byType.case !== 36 || byType.showcase_case !== 36 || byType.test !== 36) {
    problems.push(`entries类型计数 ${JSON.stringify(byType)} ≠ 36/36/36`);
  }
  if (plan.sourceGeneratorVersion !== SOURCE_GENERATOR_VERSION || plan.targetGeneratorVersion !== TARGET_GENERATOR_VERSION) {
    problems.push("生成器版本绑定不符");
  }
  if (!SHA256_HEX.test(plan.sourceAttestation) || !SHA256_HEX.test(plan.sourceFingerprint) || !SHA256_HEX.test(plan.targetFingerprint) || !SHA256_HEX.test(plan.finalFingerprint)) {
    problems.push("计划指纹形状非法");
  }
  return problems;
}

// ─── 状态分类（SHV2-FR-022）────────────────────────────────────────────────

export type RewriteState = "pending" | "applied" | "drift";

export function classifyRewriteState(input: {
  batch: { planHash: string; status: string; entryCount: number } | null;
  liveFingerprint: string | null;
  finalFingerprint: string;
  planHash: string;
}): RewriteState {
  const { batch } = input;
  if (!batch) return "pending";
  if (batch.planHash !== input.planHash) return "drift";
  if (batch.status !== "applied") return "drift";
  if (batch.entryCount !== REWRITE_ENTRY_COUNT) return "drift";
  if (input.liveFingerprint !== input.finalFingerprint) return "drift";
  return "applied";
}

// ─── 数据库执行（pg Client）────────────────────────────────────────────────

export interface DbClient {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

async function q(client: DbClient, text: string, values?: unknown[]): Promise<Record<string, unknown>[]> {
  const r = await client.query(text, values);
  return r.rows;
}

const SNAPSHOT_COLS = `id, jurisdiction_code, as_of_date, content_hash`;
const RELEASE_COLS = `id, jurisdiction_code, active_snapshot_id, status, effective_from, effective_to`;

export async function fetchFingerprintRows(client: DbClient): Promise<{ cases: Row[]; showcases: Row[]; tests: Row[]; snapshots: Row[]; releases: Row[] }> {
  return {
    cases: await q(client, `SELECT * FROM "cases" ORDER BY id`),
    showcases: await q(client, `SELECT * FROM "showcase_cases" ORDER BY id`),
    tests: await q(client, `SELECT * FROM "tests" ORDER BY id`),
    snapshots: await q(client, `SELECT ${SNAPSHOT_COLS} FROM "policy_snapshots" ORDER BY id`),
    releases: await q(client, `SELECT ${RELEASE_COLS} FROM "jurisdiction_planning_releases" ORDER BY id`),
  };
}

export async function computeBusinessFingerprint(client: DbClient): Promise<string> {
  const rows = await fetchFingerprintRows(client);
  return rowsFingerprint(rows);
}

export interface RewriteAuditResult {
  mode: "audit";
  databaseName: string;
  counts: { cases: number; showcases: number; regressionTests: number; exampleTests: number; snapshots: number; releases: number };
  sourceFingerprint: string;
  sourceArtifactFingerprint: string;
  sourceAttestation: string;
  allV1: boolean;
  mismatches: string[];
  existingBatches: Array<{ planHash: string; status: string; entryCount: number; finalFingerprint: string }>;
  state: RewriteState;
}

/** audit（只读）：计数、V1状态、前置指纹、既有批次与状态分类。 */
export async function auditRewrite(input: { client: DbClient; source: GeneratedSource; databaseName: string }): Promise<RewriteAuditResult> {
  const { client, source } = input;
  const rows = await fetchFingerprintRows(client);
  const fingerprint = rowsFingerprint(rows);
  const counts = {
    cases: rows.cases.length,
    showcases: rows.showcases.length,
    regressionTests: rows.tests.filter((t) => t.source === "regression").length,
    exampleTests: rows.tests.filter((t) => t.source === "example").length,
    snapshots: rows.snapshots.length,
    releases: rows.releases.length,
  };
  const allV1 =
    rows.cases.every((c) => c.generator_version === SOURCE_GENERATOR_VERSION) &&
    rows.showcases.every((s) => s.generator_version === SOURCE_GENERATOR_VERSION);
  const matched = matchRowsToScenarios({ caseRows: rows.cases, showcaseRows: rows.showcases, testRows: rows.tests, scenarios: source.scenarios });
  const batchRows = await q(client, `SELECT b.plan_hash, b.status, b.final_fingerprint, b.source_attestation, (SELECT count(*)::int FROM case_rewrite_entries e WHERE e.batch_id = b.id) AS entry_count FROM case_rewrite_batches b ORDER BY b.created_at`);
  const existingBatches = batchRows.map((b) => ({
    planHash: String(b.plan_hash),
    status: String(b.status),
    entryCount: Number(b.entry_count ?? 0),
    finalFingerprint: String(b.final_fingerprint),
  }));
  const attestation = sourceAttestation(source);
  let state: RewriteState;
  if (matched.mismatches.length > 0) state = "drift";
  else if (existingBatches.length === 0) state = "pending";
  else if (existingBatches.some((b) => b.status === "applied" && b.entryCount === REWRITE_ENTRY_COUNT && b.finalFingerprint === fingerprint)) state = "applied";
  else state = "drift";
  return {
    mode: "audit",
    databaseName: input.databaseName,
    counts,
    sourceFingerprint: fingerprint,
    sourceArtifactFingerprint: sourceArtifactFingerprint(source),
    sourceAttestation: attestation,
    allV1,
    mismatches: matched.mismatches,
    existingBatches,
    state,
  };
}

const REWRITE_COLUMNS: Record<RewriteEntityType, { table: string; cols: string[]; uidColumn: string; hashCols: string[] }> = {
  case: { table: "cases", uidColumn: "case_uid", hashCols: CASE_INFRA_COLUMNS, cols: [] },
  showcase_case: { table: "showcase_cases", uidColumn: "case_uid", hashCols: SHOWCASE_INFRA_COLUMNS, cols: [] },
  test: { table: "tests", uidColumn: "name", hashCols: TEST_INFRA_COLUMNS, cols: [] },
};

function updatableColumns(entityType: RewriteEntityType, after: Row): string[] {
  const exclude = new Set<string>(["id", ...REWRITE_COLUMNS[entityType].hashCols]);
  // cases/showcase_cases的业务content_hash列必须随同一事务写入V2目标hash（after投影
  // 已携带）；tests表无content_hash列，after无此键即天然不更新。
  exclude.delete("content_hash");
  return Object.keys(after).filter((k) => !exclude.has(k));
}

async function readRow(client: DbClient, entityType: RewriteEntityType, id: number): Promise<Row> {
  const rows = await q(client, `SELECT * FROM "${REWRITE_COLUMNS[entityType].table}" WHERE id = $1`, [id]);
  if (rows.length !== 1) throw new CaseRewriteError("ROW_MISSING", `${entityType} ${id} 不存在`);
  return rows[0];
}

async function rowHashMatches(client: DbClient, entityType: RewriteEntityType, id: number, expected: string): Promise<boolean> {
  const row = await readRow(client, entityType, id);
  return rowContentHash(row, REWRITE_COLUMNS[entityType].hashCols) === expected;
}

export type RewriteFailurePoint = "after_lock" | "after_updates" | "after_entries";

export interface RewriteApplyResult {
  mode: "apply";
  applied: boolean;
  noop: boolean;
  batchId: string;
  planHash: string;
  finalFingerprint: string;
  entries: number;
}

/**
 * 单事务原位改写。injectFailureAt仅供演练/测试注入故障点（验证整体回滚），
 * 正常路径不得设置。
 */
export async function executeRewriteApply(input: {
  client: DbClient;
  source: GeneratedSource;
  plan: RewritePlan;
  actor: string;
  injectFailureAt?: RewriteFailurePoint;
}): Promise<RewriteApplyResult> {
  const { client, plan } = input;
  const bodyProblems = verifyPlanBody(plan);
  if (bodyProblems.length > 0) {
    throw new CaseRewriteError("PLAN_INVALID", `计划正文自校验失败：${bodyProblems.slice(0, 5).join("；")}`);
  }
  const recomputedHash = rewritePlanHash(plan);
  if (recomputedHash !== plan.planHash) {
    throw new CaseRewriteError("PLAN_HASH_MISMATCH", `planHash重算不一致：声明${plan.planHash} 重算${recomputedHash}`);
  }

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await applyOnce(input, attempt);
    } catch (err) {
      lastError = err;
      const code = err instanceof CaseRewriteError ? err.code : "";
      if (code === "SERIALIZATION_RETRY" && attempt === 1) continue;
      throw err;
    }
  }
  throw lastError;
}

async function applyOnce(input: { client: DbClient; source: GeneratedSource; plan: RewritePlan; actor: string; injectFailureAt?: RewriteFailurePoint }, attempt: number): Promise<RewriteApplyResult> {
  const { client, plan } = input;
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  try {
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [REWRITE_ADVISORY_LOCK_KEY]);

    // 1) 事务内重算实时指纹并先做状态分类：终态→noop；漂移→禁止补写；
    //    pending时才要求前置指纹与计划一致（复跑幂等不依赖V1前置态）。
    const liveFingerprint = await computeBusinessFingerprint(client);
    const batchRows = await q(client, `SELECT b.plan_hash, b.status, b.final_fingerprint, (SELECT count(*)::int FROM case_rewrite_entries e WHERE e.batch_id = b.id) AS entry_count FROM case_rewrite_batches b WHERE b.plan_hash = $1`, [plan.planHash]);
    const batch = batchRows[0]
      ? { planHash: String(batchRows[0].plan_hash), status: String(batchRows[0].status), entryCount: Number(batchRows[0].entry_count ?? 0), finalFingerprint: String(batchRows[0].final_fingerprint) }
      : null;
    const state = classifyRewriteState({ batch, liveFingerprint, finalFingerprint: plan.finalFingerprint, planHash: plan.planHash });
    if (state === "applied") {
      await client.query("ROLLBACK");
      return { mode: "apply", applied: false, noop: true, batchId: plan.batchId, planHash: plan.planHash, finalFingerprint: plan.finalFingerprint, entries: REWRITE_ENTRY_COUNT };
    }
    if (state === "drift") {
      throw new CaseRewriteError("REWRITE_STATE_DRIFT", "批次/指纹状态漂移：禁止补写，请停止并报告（部分完成不得自动续写）");
    }
    if (liveFingerprint !== plan.targetFingerprint) {
      throw new CaseRewriteError("TARGET_FINGERPRINT_MISMATCH", `目标库前置指纹不一致：库${liveFingerprint} ≠ 计划${plan.targetFingerprint}`);
    }

    // 3) FOR UPDATE锁定108行并核对ID集合。
    for (const entityType of ["case", "showcase_case", "test"] as const) {
      const meta = REWRITE_COLUMNS[entityType];
      const ids = plan.entries.filter((e) => e.entityType === entityType).map((e) => e.entityId).sort((a, b) => a - b);
      const locked = await q(client, `SELECT id FROM "${meta.table}" WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`, [ids]);
      const lockedIds = locked.map((r) => Number(r.id));
      if (JSON.stringify(lockedIds) !== JSON.stringify(ids)) {
        throw new CaseRewriteError("ROW_SET_MISMATCH", `${entityType} 锁定行集合与计划不符`);
      }
    }
    if (input.injectFailureAt === "after_lock") {
      throw new CaseRewriteError("INJECTED_FAILURE", "演练注入：after_lock");
    }

    // 4) 逐行：重读核对旧hash → UPDATE投影 → 重读核对新hash。
    for (const e of plan.entries) {
      const meta = REWRITE_COLUMNS[e.entityType];
      const live = await readRow(client, e.entityType, e.entityId);
      const liveHash = rowContentHash(live, meta.hashCols);
      if (liveHash !== e.oldContentHash) {
        throw new CaseRewriteError("ROW_DRIFT", `${e.entityType}/${e.entityId} 旧内容hash漂移：库${liveHash} ≠ 计划${e.oldContentHash}`);
      }
      const after = e.entityType === "case" ? projectRewrittenCaseRow(live, scenarioOf(input.source, e)) : e.entityType === "showcase_case" ? projectRewrittenShowcaseRow(live, scenarioOf(input.source, e)) : projectRewrittenTestRow(live, scenarioOf(input.source, e));
      // 业务content_hash列以计划目标hash为准随同一事务写入（cases/showcase_cases）。
      if (e.entityType !== "test") after.content_hash = e.newContentHash;
      const cols = updatableColumns(e.entityType, after);
      const assignments = cols.map((c, i) => `"${c}" = $${i + 2}`).join(", ");
      // jsonb列（对象/数组）必须显式JSON字符串：node-pg默认把JS数组序列化为PG数组字面量（非JSON）。
      const params = cols.map((c) => {
        const v = after[c];
        return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
      });
      await client.query(`UPDATE "${meta.table}" SET ${assignments} WHERE id = $1`, [e.entityId, ...params]);
      const reread = await readRow(client, e.entityType, e.entityId);
      const newHash = rowContentHash(reread, meta.hashCols);
      if (newHash !== e.newContentHash) {
        throw new CaseRewriteError("POST_UPDATE_HASH_MISMATCH", `${e.entityType}/${e.entityId} 更新后hash不一致：库${newHash} ≠ 计划${e.newContentHash}`);
      }
      // 单独核对数据库content_hash字段等于newContentHash（业务hash列同步写入的显式契约）。
      if (e.entityType !== "test" && reread.content_hash !== e.newContentHash) {
        throw new CaseRewriteError("POST_UPDATE_HASH_MISMATCH", `${e.entityType}/${e.entityId} 业务content_hash列不一致：库${String(reread.content_hash)} ≠ 计划${e.newContentHash}`);
      }
      if (canonicalJson(reread) !== canonicalJson(after)) {
        throw new CaseRewriteError("POST_UPDATE_ROW_MISMATCH", `${e.entityType}/${e.entityId} 更新后行与投影不一致`);
      }
    }
    if (input.injectFailureAt === "after_updates") {
      throw new CaseRewriteError("INJECTED_FAILURE", "演练注入：after_updates");
    }

    // 5) 审计：1个applied批次 + 恰好108条entries。
    await client.query(
      `INSERT INTO case_rewrite_batches (id, plan_hash, code_sha, source_fingerprint, target_fingerprint, final_fingerprint,
         source_generator_version, target_generator_version, source_manifest, source_attestation, snapshot_bindings,
         row_counts, status, created_by, created_at, applied_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11::jsonb,$12::jsonb,'applied',$13,now(),now())`,
      [
        plan.batchId, plan.planHash, plan.codeSha, plan.sourceFingerprint, plan.targetFingerprint, plan.finalFingerprint,
        plan.sourceGeneratorVersion, plan.targetGeneratorVersion, JSON.stringify(plan.sourceManifest), plan.sourceAttestation,
        JSON.stringify(plan.snapshotBindings), JSON.stringify(plan.rowCounts), input.actor,
      ],
    );
    for (const e of plan.entries) {
      await client.query(
        `INSERT INTO case_rewrite_entries (batch_id, entity_type, entity_id, old_uid, new_uid, old_content_hash,
           new_content_hash, old_snapshot_hash, new_snapshot_hash, evidence_hash, before, after)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)`,
        [plan.batchId, e.entityType, e.entityId, e.oldUid, e.newUid, e.oldContentHash, e.newContentHash, e.oldSnapshotHash, e.newSnapshotHash, e.evidenceHash, JSON.stringify(e.before), JSON.stringify(e.after)],
      );
    }
    const entryCount = await q(client, `SELECT count(*)::int AS n FROM case_rewrite_entries WHERE batch_id = $1`, [plan.batchId]);
    if (Number(entryCount[0].n) !== REWRITE_ENTRY_COUNT) {
      throw new CaseRewriteError("ENTRY_COUNT_MISMATCH", `entries ${entryCount[0].n} ≠ ${REWRITE_ENTRY_COUNT}`);
    }
    if (input.injectFailureAt === "after_entries") {
      throw new CaseRewriteError("INJECTED_FAILURE", "演练注入：after_entries");
    }

    // 6) COMMIT前终态指纹核对。
    const finalFingerprint = await computeBusinessFingerprint(client);
    if (finalFingerprint !== plan.finalFingerprint) {
      throw new CaseRewriteError("FINAL_FINGERPRINT_MISMATCH", `终态指纹不一致：库${finalFingerprint} ≠ 计划${plan.finalFingerprint}`);
    }
    await client.query("COMMIT");
    return { mode: "apply", applied: true, noop: false, batchId: plan.batchId, planHash: plan.planHash, finalFingerprint: plan.finalFingerprint, entries: REWRITE_ENTRY_COUNT };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    // 并发裁决：advisory锁等待后快照过期（40001）→ 提示外层重试（新事务识别noop）。
    const pgCode = (err as { code?: string } | null | undefined)?.code;
    if (pgCode === "40001" && attempt === 1) {
      throw new CaseRewriteError("SERIALIZATION_RETRY", "并发事务快照过期（40001），以全新事务重试一次");
    }
    throw err;
  }
}

function scenarioOf(source: GeneratedSource, e: RewritePlanEntry): GeneratedScenarioV2 {
  const s = source.scenarios.find((x) => x.scenarioKey === e.scenarioKey);
  if (!s) throw new CaseRewriteError("SCENARIO_MISSING", `场景缺失：${e.scenarioKey}`);
  return s;
}

// ─── verify ────────────────────────────────────────────────────────────────

export interface RewriteVerifyResult {
  mode: "verify";
  ok: boolean;
  problems: string[];
  counts: { cases: number; showcases: number; tests: number; examples: number; regression: number };
  fingerprint: string;
}

/** verify：终态指纹、批次/entries审计、逐行新hash、计数与可读性契约。 */
export async function verifyRewrite(input: { client: DbClient; source: GeneratedSource; plan: RewritePlan }): Promise<RewriteVerifyResult> {
  const { client, plan } = input;
  const problems: string[] = [...verifyPlanBody(plan)];
  const fingerprint = await computeBusinessFingerprint(client);
  if (fingerprint !== plan.finalFingerprint) {
    problems.push(`终态指纹不一致：库${fingerprint} ≠ 计划${plan.finalFingerprint}`);
  }
  const batchRows = await q(client, `SELECT id, status, plan_hash FROM case_rewrite_batches WHERE plan_hash = $1`, [plan.planHash]);
  if (batchRows.length !== 1) problems.push(`计划批次缺失或重复：${batchRows.length}`);
  else {
    const batchId = String(batchRows[0].id);
    const entryRows = await q(client, `SELECT entity_type, entity_id, new_uid, new_content_hash FROM case_rewrite_entries WHERE batch_id = $1`, [batchId]);
    if (entryRows.length !== REWRITE_ENTRY_COUNT) problems.push(`entries ${entryRows.length} ≠ ${REWRITE_ENTRY_COUNT}`);
    for (const e of plan.entries) {
      const found = entryRows.find((r) => r.entity_type === e.entityType && Number(r.entity_id) === e.entityId);
      if (!found) {
        problems.push(`entry缺失：${e.entityType}/${e.entityId}`);
        continue;
      }
      const liveHashOk = await rowHashMatches(client, e.entityType, e.entityId, e.newContentHash);
      if (!liveHashOk) problems.push(`entry ${e.entityType}/${e.entityId} 落库行hash与计划不一致`);
      const live = await readRow(client, e.entityType, e.entityId);
      // 显式核对业务content_hash列：该列不在基础设施排除hash内，被篡改时指纹与行hash
      // 均不受影响，只有逐条核对能发现（2026-09-12独立审查契约）。
      if (e.entityType !== "test" && live.content_hash !== e.newContentHash) {
        problems.push(`entry ${e.entityType}/${e.entityId} 业务content_hash列与审计new_content_hash不一致：库${String(live.content_hash)} ≠ 审计${e.newContentHash}`);
      }
      if (String(live[REWRITE_COLUMNS[e.entityType].uidColumn]) !== String(found.new_uid)) {
        problems.push(`entry ${e.entityType}/${e.entityId} UID不一致`);
      }
    }
  }
  const counts = await q(client, `SELECT
    (SELECT count(*)::int FROM cases) AS cases,
    (SELECT count(*)::int FROM showcase_cases) AS showcases,
    (SELECT count(*)::int FROM tests) AS tests,
    (SELECT count(*)::int FROM tests WHERE source = 'example') AS examples,
    (SELECT count(*)::int FROM tests WHERE source = 'regression') AS regression`);
  const c = counts[0] as Record<string, number>;
  if (c.cases !== 36 || c.showcases !== 36 || c.tests !== 80 || c.examples !== 44 || c.regression !== 36) {
    problems.push(`计数 ${JSON.stringify(c)} ≠ 36/36/80（44 example+36 regression）`);
  }
  const shGd = await q(client, `SELECT jurisdiction_code, count(*)::int AS n FROM showcase_cases WHERE is_published = true GROUP BY jurisdiction_code`);
  const byRegion: Record<string, number> = {};
  for (const r of shGd) byRegion[String(r.jurisdiction_code)] = Number(r.n);
  if (byRegion["310000"] !== 18 || byRegion["440000"] !== 18) {
    problems.push(`showcase地区计数 ${JSON.stringify(byRegion)} ≠ 沪18/粤18`);
  }
  const readability = await q(client, `SELECT count(*)::int AS n FROM cases WHERE generator_version = 'RCL-GEN-2.0' AND (case_text IS NULL OR length(case_text) < 200 OR transcript_text IS NOT NULL)`);
  if (Number(readability[0].n) !== 0) problems.push(`存在空正文/虚构转写的V2 case：${readability[0].n}`);
  const placeholder = await q(client, `SELECT count(*)::int AS n FROM showcase_cases WHERE generator_version = 'RCL-GEN-2.0' AND (user_message = '确定性模板生成的政策案例（无真实用户数据）' OR ai_response = '由修复后的快照规划器计算期望')`);
  if (Number(placeholder[0].n) !== 0) problems.push(`存在占位问答的V2 showcase：${placeholder[0].n}`);
  return {
    mode: "verify",
    ok: problems.length === 0,
    problems,
    counts: { cases: c.cases, showcases: c.showcases, tests: c.tests, examples: c.examples, regression: c.regression },
    fingerprint,
  };
}
