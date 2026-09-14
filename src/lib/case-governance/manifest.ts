/**
 * RCL-FR-006/015/018、RCL-AC-003/011 精确manifest：
 * - 绑定旧目标行（删除集合）的精确行ID与内容hash（RCL-AC-003：任一漂移失效）；
 * - 绑定新数据行（cases/showcase/tests）的行ID、内容hash、快照ID/hash、
 *   质量评分与分解、来源映射（RCL-FR-006）；
 * - 绑定42条DSL example的保留/更新/新增/删除集合（RCL-FR-018/AC-011，
 *   第三轮复审：禁止在manifest生成后或apply事务外修改example）；
 * - 最终计数 N/36/N+42，N 来自覆盖manifest且exampleTestCount必须显式===42
 *   （RCL-FR-015/AC-011，28/49等数量不得自动成为合法目标）；
 * - manifestHash 由算法版本+全部绑定内容确定性计算（RCL-NFR-002）；
 * - manifest自校验：recomputeManifestHash（正文重算）与文件声明hash、批次
 *   manifestHash三方一致（RCL-FR-005/006，第三轮复审）；
 * - assertManifestContentHashes：每条旧test/example/新行的contentHash必须为
 *   64位非空SHA-256（RCL-FR-002）。
 */
import { DSL_EXAMPLE_COUNT } from "./dsl-examples";
import { canonicalJson, sha256hex } from "./hashes";
import type { GeneratedScenario } from "./generator";
import type { ScenarioAssertion } from "./replay";

export interface BoundRow {
  /** 数据库行ID（apply前重新核对）。 */
  rowId: number;
  uid?: string | null;
  /** 规范化内容哈希（行内容真实SHA，RCL-FR-003语义）。 */
  contentHash: string;
}

/**
 * 新case行（RCL-FR-006/018、RCL-AC-011）：除行绑定/质量外必须携带完整场景
 * 事实——scenarioKey、asOfDate、完整input/expected与显式断言、覆盖义务、证据。
 * apply 落库时这些字段必须逐字节写入（禁止null/空对象/空数组占位）。
 */
export interface NewCaseRow extends BoundRow {
  jurisdictionCode: string;
  scenarioKey: string;
  asOfDate: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
  assertions: ScenarioAssertion[];
  coverageObligations: string[];
  evidence: Array<{ documentId: string; locator: string }>;
  qualityScore: number;
  qualityBreakdown: Record<string, unknown>;
  multiLabels: string[];
  snapshotId: string;
  snapshotHash: string;
  sourceTestUid: string;
}

export interface NewShowcaseRow extends BoundRow {
  jurisdictionCode: string;
  scenarioKey: string;
  asOfDate: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
  assertions: ScenarioAssertion[];
  coverageObligations: string[];
  evidence: Array<{ documentId: string; locator: string }>;
  sourceCaseUid: string;
  qualityScore: number;
  qualityBreakdown: Record<string, unknown>;
  multiLabels: string[];
  snapshotId: string;
  snapshotHash: string;
}

export interface NewTestRow extends BoundRow {
  jurisdictionCode: string;
  sourceCaseUid: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
  ruleId?: string | null;
}

export interface ExampleTestRow extends BoundRow {
  jurisdictionCode: string | null;
}

/**
 * 42条DSL example同步集合（RCL-FR-018/AC-011，第三轮复审）：
 * - retained：与DSL目标内容一致的既有example（保持不动）；
 * - updated：既有example与DSL目标内容不一致（apply事务内更新为目标内容）；
 * - added：DSL目标在库中缺失（apply事务内插入）；
 * - deleted：库中既有但不在DSL目标集合（apply事务内删除）。
 * 全部集合的contentHash均为64位非空SHA-256；同步与旧案例删除、新案例插入
 * 位于同一个apply事务（禁止事务外修改example）。
 */
export interface ExampleSyncSets {
  retained: Array<{ rowId: number; name: string; jurisdictionCode: string; contentHash: string }>;
  /** 漂移示例：携带DB旧hash与完整目标内容（apply事务内更新为目标内容）。 */
  updated: Array<{
    rowId: number;
    name: string;
    jurisdictionCode: string;
    contentHash: string;
    targetHash: string;
    ruleId: string;
    input: Record<string, unknown>;
    paramsOverride: unknown;
    expected: Record<string, unknown>;
  }>;
  added: Array<{ name: string; jurisdictionCode: string; ruleId: string; input: Record<string, unknown>; paramsOverride: unknown; expected: Record<string, unknown>; contentHash: string }>;
  deleted: Array<{ rowId: number; name: string; jurisdictionCode: string | null; contentHash: string }>;
}

export interface RclManifestInput {
  algorithmVersion: string;
  generatorVersion: string;
  /** 新cases（N条）。 */
  newCases: NewCaseRow[];
  /** 新showcase（36条）。 */
  newShowcase: NewShowcaseRow[];
  /** 新地区回归tests（N条，RCL-FR-013一对一）。 */
  newTests: NewTestRow[];
  /** 42条DSL示例（目标集合，RCL-AC-011）。 */
  exampleTests: ExampleTestRow[];
  /** 42条DSL example的保留/更新/新增/删除集合（RCL-FR-018）。 */
  exampleSync: ExampleSyncSets;
  /** 旧库删除目标（apply前逐行核对，RCL-AC-003）。 */
  oldTargets: {
    cases: BoundRow[];
    showcase: BoundRow[];
    tests: BoundRow[];
  };
  /** 生成所绑定的快照（修复后日期快照，RCL-FR-007）。 */
  snapshot: { id: string; contentHash: string } | null;
}

export interface RclManifest {
  algorithmVersion: string;
  generatorVersion: string;
  snapshot: { id: string; contentHash: string } | null;
  /** N（新cases数，来自覆盖manifest）。 */
  caseCount: number;
  showcaseCount: number;
  newTestCount: number;
  exampleTestCount: number;
  newCases: NewCaseRow[];
  newShowcase: NewShowcaseRow[];
  newTests: NewTestRow[];
  exampleTests: ExampleTestRow[];
  exampleSync: ExampleSyncSets;
  oldTargets: {
    cases: BoundRow[];
    showcase: BoundRow[];
    tests: BoundRow[];
  };
  counts: {
    cases: number;
    showcase: number;
    tests: number;
  };
  manifestHash: string;
  createdAt: string;
}

/** canonical manifest core（不变量）：manifestHash与createdAt等非确定性元数据
 * 不得进入hash；正文重算与构建共用同一core映射，避免plan/apply序列化差异。 */
interface ManifestCore {
  algorithmVersion: string;
  generatorVersion: string;
  snapshot: { id: string; contentHash: string } | null;
  newCases: unknown[];
  newShowcase: unknown[];
  newTests: unknown[];
  exampleTests: unknown[];
  exampleSync: ExampleSyncSets;
  oldTargets: { cases: unknown[]; showcase: unknown[]; tests: unknown[] };
  counts: { cases: number; showcase: number; tests: number };
}

function mapCaseRow(r: NewCaseRow): Record<string, unknown> {
  return {
    rowId: r.rowId,
    contentHash: r.contentHash,
    jurisdictionCode: r.jurisdictionCode,
    scenarioKey: r.scenarioKey,
    asOfDate: r.asOfDate,
    input: r.input,
    expected: r.expected,
    assertions: r.assertions,
    coverageObligations: r.coverageObligations,
    evidence: r.evidence,
    qualityScore: r.qualityScore,
    qualityBreakdown: r.qualityBreakdown,
    multiLabels: r.multiLabels,
    snapshotId: r.snapshotId,
    snapshotHash: r.snapshotHash,
    sourceTestUid: r.sourceTestUid,
  };
}

function mapShowcaseRow(r: NewShowcaseRow): Record<string, unknown> {
  return {
    rowId: r.rowId,
    contentHash: r.contentHash,
    jurisdictionCode: r.jurisdictionCode,
    scenarioKey: r.scenarioKey,
    asOfDate: r.asOfDate,
    input: r.input,
    expected: r.expected,
    assertions: r.assertions,
    coverageObligations: r.coverageObligations,
    evidence: r.evidence,
    sourceCaseUid: r.sourceCaseUid,
    qualityScore: r.qualityScore,
    qualityBreakdown: r.qualityBreakdown,
    multiLabels: r.multiLabels,
    snapshotId: r.snapshotId,
    snapshotHash: r.snapshotHash,
  };
}

function mapTestRow(r: NewTestRow): Record<string, unknown> {
  return {
    rowId: r.rowId,
    contentHash: r.contentHash,
    jurisdictionCode: r.jurisdictionCode,
    sourceCaseUid: r.sourceCaseUid,
    input: r.input,
    expected: r.expected,
    ruleId: r.ruleId ?? null,
  };
}

/** exampleTests core映射：name/jurisdictionCode/contentHash（RCL-FR-018）。 */
function mapExampleTestRow(r: ExampleTestRow): Record<string, unknown> {
  return { rowId: r.rowId, name: r.uid ?? null, jurisdictionCode: r.jurisdictionCode, contentHash: r.contentHash };
}

function mapBoundRow(r: BoundRow): Record<string, unknown> {
  return { rowId: r.rowId, contentHash: r.contentHash };
}

function sortSync<T>(rows: T[], key: (r: T) => string | number): T[] {
  return [...rows].sort((a, b) => (String(key(a)) < String(key(b)) ? -1 : 1));
}

/** 从构建输入构造canonical core。 */
function buildCoreFromInput(input: RclManifestInput): ManifestCore {
  const counts = {
    cases: input.newCases.length,
    showcase: input.newShowcase.length,
    tests: input.newTests.length + input.exampleTests.length,
  };
  return {
    algorithmVersion: input.algorithmVersion,
    generatorVersion: input.generatorVersion,
    snapshot: input.snapshot,
    newCases: input.newCases.map(mapCaseRow).sort((a, b) => (a.rowId as number) - (b.rowId as number)),
    newShowcase: input.newShowcase.map(mapShowcaseRow).sort((a, b) => (a.rowId as number) - (b.rowId as number)),
    newTests: input.newTests.map(mapTestRow).sort((a, b) => (a.rowId as number) - (b.rowId as number)),
    exampleTests: sortSync(input.exampleTests.map(mapExampleTestRow), (r) => r.rowId as number),
    exampleSync: {
      retained: sortSync(input.exampleSync.retained, (r) => r.rowId),
      updated: sortSync(input.exampleSync.updated, (r) => r.rowId),
      added: sortSync(input.exampleSync.added, (r) => r.name),
      deleted: sortSync(input.exampleSync.deleted, (r) => r.rowId),
    },
    oldTargets: {
      cases: input.oldTargets.cases.map(mapBoundRow).sort((a, b) => (a.rowId as number) - (b.rowId as number)),
      showcase: input.oldTargets.showcase.map(mapBoundRow).sort((a, b) => (a.rowId as number) - (b.rowId as number)),
      tests: input.oldTargets.tests.map(mapBoundRow).sort((a, b) => (a.rowId as number) - (b.rowId as number)),
    },
    counts,
  };
}

/** 从manifest正文（含manifestHash/createdAt）重算core——自校验用。 */
function buildCoreFromBody(m: RclManifest): ManifestCore {
  return {
    algorithmVersion: m.algorithmVersion,
    generatorVersion: m.generatorVersion,
    snapshot: m.snapshot,
    newCases: m.newCases.map(mapCaseRow).sort((a, b) => (a.rowId as number) - (b.rowId as number)),
    newShowcase: m.newShowcase.map(mapShowcaseRow).sort((a, b) => (a.rowId as number) - (b.rowId as number)),
    newTests: m.newTests.map(mapTestRow).sort((a, b) => (a.rowId as number) - (b.rowId as number)),
    exampleTests: sortSync(m.exampleTests.map(mapExampleTestRow), (r) => r.rowId as number),
    exampleSync: {
      retained: sortSync(m.exampleSync.retained, (r) => r.rowId),
      updated: sortSync(m.exampleSync.updated, (r) => r.rowId),
      added: sortSync(m.exampleSync.added, (r) => r.name),
      deleted: sortSync(m.exampleSync.deleted, (r) => r.rowId),
    },
    oldTargets: {
      cases: m.oldTargets.cases.map(mapBoundRow).sort((a, b) => (a.rowId as number) - (b.rowId as number)),
      showcase: m.oldTargets.showcase.map(mapBoundRow).sort((a, b) => (a.rowId as number) - (b.rowId as number)),
      tests: m.oldTargets.tests.map(mapBoundRow).sort((a, b) => (a.rowId as number) - (b.rowId as number)),
    },
    counts: m.counts,
  };
}

export function computeManifestHash(content: unknown): string {
  return sha256hex(canonicalJson(content));
}

/** 从manifest正文重算manifestHash（读取/verify-archive/apply/verify共用）。 */
export function recomputeManifestHash(m: RclManifest): string {
  return computeManifestHash(buildCoreFromBody(m));
}

/** 构建精确manifest：N = newCases.length（不硬编码452/500，RCL-FR-015）。 */
export function buildRclManifest(input: RclManifestInput): RclManifest {
  const caseCount = input.newCases.length;
  const showcaseCount = input.newShowcase.length;
  const newTestCount = input.newTests.length;
  const exampleTestCount = input.exampleTests.length;
  const counts = {
    cases: caseCount,
    showcase: showcaseCount,
    tests: newTestCount + exampleTestCount,
  };

  const core = buildCoreFromInput(input);
  const manifestHash = computeManifestHash(core);

  return {
    algorithmVersion: input.algorithmVersion,
    generatorVersion: input.generatorVersion,
    snapshot: input.snapshot,
    caseCount,
    showcaseCount,
    newTestCount,
    exampleTestCount,
    newCases: [...input.newCases].sort((a, b) => a.rowId - b.rowId),
    newShowcase: [...input.newShowcase].sort((a, b) => a.rowId - b.rowId),
    newTests: [...input.newTests].sort((a, b) => a.rowId - b.rowId),
    exampleTests: [...input.exampleTests].sort((a, b) => a.rowId - b.rowId),
    exampleSync: input.exampleSync,
    oldTargets: {
      cases: [...input.oldTargets.cases].sort((a, b) => a.rowId - b.rowId),
      showcase: [...input.oldTargets.showcase].sort((a, b) => a.rowId - b.rowId),
      tests: [...input.oldTargets.tests].sort((a, b) => a.rowId - b.rowId),
    },
    counts,
    manifestHash,
    createdAt: new Date().toISOString(),
  };
}

/** 断言最终计数 N/36/N+44（RCL-AC-011；SHV2起example=44）。exampleTestCount必须
 * 显式===DSL_EXAMPLE_COUNT：当前28、49或其他数量不得自动成为合法目标（第三轮复审）。 */
export function assertRclCounts(
  manifest: Pick<RclManifest, "counts" | "caseCount" | "exampleTestCount">,
): void {
  const { counts, caseCount, exampleTestCount } = manifest;
  if (counts.cases !== caseCount) {
    throw new Error(`cases计数 ${counts.cases} ≠ manifest N=${caseCount}（RCL-FR-015）`);
  }
  if (counts.showcase !== 36) {
    throw new Error(`showcase计数 ${counts.showcase} ≠ 36（RCL-AC-008）`);
  }
  if (exampleTestCount !== DSL_EXAMPLE_COUNT) {
    throw new Error(
      `exampleTestCount ${exampleTestCount} ≠ ${DSL_EXAMPLE_COUNT}（RCL-AC-011：必须为地区DSL精确${DSL_EXAMPLE_COUNT}条）`,
    );
  }
  if (counts.tests !== caseCount + exampleTestCount) {
    throw new Error(
      `tests计数 ${counts.tests} ≠ N+${DSL_EXAMPLE_COUNT}=${caseCount + exampleTestCount}（RCL-AC-011）`,
    );
  }
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * 断言manifest全部行绑定hash为64位非空SHA-256（RCL-FR-002/AC-003）：
 * 旧目标（含旧regression test）与42条DSL example必须逐条具有非空内容hash，
 * 不得以空串或非hash占位。
 */
export function assertManifestContentHashes(m: RclManifest): void {
  const problems: string[] = [];
  const check = (label: string, hash: string | null | undefined): void => {
    if (!hash || !SHA256_HEX.test(hash)) {
      problems.push(`${label} contentHash 非法（${hash ?? "空"}）`);
    }
  };
  for (const c of m.oldTargets.cases) check(`旧case ${c.rowId}`, c.contentHash);
  for (const s of m.oldTargets.showcase) check(`旧showcase ${s.rowId}`, s.contentHash);
  for (const t of m.oldTargets.tests) check(`旧test ${t.rowId}`, t.contentHash);
  for (const e of m.exampleTests) check(`example ${e.uid ?? e.rowId}`, e.contentHash);
  for (const r of m.exampleSync.retained) check(`example保留 ${r.rowId}`, r.contentHash);
  for (const u of m.exampleSync.updated) {
    check(`example更新 ${u.rowId}`, u.contentHash);
    check(`example更新目标 ${u.rowId}`, u.targetHash);
  }
  for (const a of m.exampleSync.added) check(`example新增 ${a.name}`, a.contentHash);
  for (const d of m.exampleSync.deleted) check(`example删除 ${d.rowId}`, d.contentHash);
  for (const c of m.newCases) check(`新case ${c.uid ?? c.rowId}`, c.contentHash);
  for (const s of m.newShowcase) check(`新showcase ${s.uid ?? s.rowId}`, s.contentHash);
  for (const t of m.newTests) check(`新test ${t.uid ?? t.rowId}`, t.contentHash);
  if (problems.length > 0) {
    throw new Error(
      `manifest内容hash不完整（RCL-FR-002 fail-closed）：${problems.slice(0, 10).join("；")}`,
    );
  }
}

/** 旧CLG固定目标断言（452/36/528）已废止：不再提供 assertFixedTargetCounts。 */
export type { GeneratedScenario };
