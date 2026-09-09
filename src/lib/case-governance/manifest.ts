/**
 * RCL-FR-006/015、RCL-AC-003/011 精确manifest：
 * - 绑定旧目标行（删除集合）的精确行ID与内容hash（RCL-AC-003：任一漂移失效）；
 * - 绑定新数据行（cases/showcase/tests）的行ID、内容hash、快照ID/hash、
 *   质量评分与分解、来源映射（RCL-FR-006）；
 * - 绑定42条DSL示例（保留，RCL-AC-011）；
 * - 最终计数 N/36/N+42，N 来自覆盖manifest（RCL-FR-015，禁止硬编码452/500）；
 * - manifestHash 由算法版本+全部绑定内容确定性计算（RCL-NFR-002）。
 */
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

export interface RclManifestInput {
  algorithmVersion: string;
  generatorVersion: string;
  /** 新cases（N条）。 */
  newCases: NewCaseRow[];
  /** 新showcase（36条）。 */
  newShowcase: NewShowcaseRow[];
  /** 新地区回归tests（N条，RCL-FR-013一对一）。 */
  newTests: NewTestRow[];
  /** 42条DSL示例（保留不删，RCL-AC-011）。 */
  exampleTests: ExampleTestRow[];
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

export function computeManifestHash(content: unknown): string {
  return sha256hex(canonicalJson(content));
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

  const core = {
    algorithmVersion: input.algorithmVersion,
    generatorVersion: input.generatorVersion,
    snapshot: input.snapshot,
    // RCL-FR-006：manifestHash 绑定完整场景事实（行绑定+内容+场景+质量+来源），
    // 任一字段漂移都改变 manifestHash（RCL-AC-003）。
    newCases: [...input.newCases]
      .map((r) => ({
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
      }))
      .sort((a, b) => a.rowId - b.rowId),
    newShowcase: [...input.newShowcase]
      .map((r) => ({
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
      }))
      .sort((a, b) => a.rowId - b.rowId),
    newTests: [...input.newTests]
      .map((r) => ({
        rowId: r.rowId,
        contentHash: r.contentHash,
        jurisdictionCode: r.jurisdictionCode,
        sourceCaseUid: r.sourceCaseUid,
        input: r.input,
        expected: r.expected,
        ruleId: r.ruleId ?? null,
      }))
      .sort((a, b) => a.rowId - b.rowId),
    exampleTests: [...input.exampleTests]
      .map((r) => ({ rowId: r.rowId, contentHash: r.contentHash }))
      .sort((a, b) => a.rowId - b.rowId),
    oldTargets: {
      cases: [...input.oldTargets.cases]
        .map((r) => ({ rowId: r.rowId, contentHash: r.contentHash }))
        .sort((a, b) => a.rowId - b.rowId),
      showcase: [...input.oldTargets.showcase]
        .map((r) => ({ rowId: r.rowId, contentHash: r.contentHash }))
        .sort((a, b) => a.rowId - b.rowId),
      tests: [...input.oldTargets.tests]
        .map((r) => ({ rowId: r.rowId, contentHash: r.contentHash }))
        .sort((a, b) => a.rowId - b.rowId),
    },
    counts,
  };
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

/** 断言最终计数 N/36/N+42（RCL-AC-011；N 必须来自manifest而非硬编码）。 */
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
  if (counts.tests !== caseCount + exampleTestCount) {
    throw new Error(
      `tests计数 ${counts.tests} ≠ N+42=${caseCount + exampleTestCount}（RCL-AC-011）`,
    );
  }
}

/** 旧CLG固定目标断言（452/36/528）已废止：不再提供 assertFixedTargetCounts。 */
export type { GeneratedScenario };