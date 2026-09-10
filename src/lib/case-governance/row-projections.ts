/**
 * RCL第三轮复审（Fix 8）：新数据落库后的逐行hash核对。
 *
 * plan-replacement对新cases/showcase/tests计算contentHash时，必须使用与
 * `SELECT *`数据库行完全一致的投影（snake_case列名、未写入列=null、DB默认值），
 * 并且与apply事务内重读落库行使用同一组基础设施排除列，避免plan/apply序列化
 * 差异（RCL-AC-003）。date列由canonicalJson统一归一化为YYYY-MM-DD。
 */
import {
  rowContentHash,
  CASE_INFRA_COLUMNS,
  SHOWCASE_INFRA_COLUMNS,
  TEST_INFRA_COLUMNS,
} from "./hashes";
import type { NewCaseRow, NewShowcaseRow, NewTestRow } from "./manifest";

/** 新case行的完整DB行投影（cases表全部非排除列，未写入列=null）。 */
export function projectNewCaseDbRow(
  c: NewCaseRow,
  generatorVersion: string,
): Record<string, unknown> {
  return {
    case_uid: c.uid ?? null,
    creator: null,
    video_id: null,
    topics: null,
    case_text: null,
    transcript_text: null,
    tags: null,
    is_regression: true,
    source_file: null,
    jurisdiction_code: c.jurisdictionCode,
    quality_score: c.qualityScore,
    quality_status: "active",
    governance_reason: "RCL确定性模板生成（无真实用户数据）",
    scenario_key: c.scenarioKey,
    generator_version: generatorVersion,
    as_of_date: c.asOfDate,
    snapshot_hash: c.snapshotHash,
    coverage_obligations: c.coverageObligations,
    evidence: c.evidence,
    quality_breakdown: c.qualityBreakdown,
    multi_labels: c.multiLabels,
    input: c.input,
    expected: c.expected,
    assertions: c.assertions,
  };
}

/** 新showcase行的完整DB行投影。 */
export function projectNewShowcaseDbRow(
  s: NewShowcaseRow,
  generatorVersion: string,
): Record<string, unknown> {
  return {
    case_uid: s.uid ?? null,
    title: `政策案例 ${s.uid ?? ""}`,
    tags: s.multiLabels,
    user_message: "确定性模板生成的政策案例（无真实用户数据）",
    ai_response: "由修复后的快照规划器计算期望",
    input_data: s.input,
    expected_data: s.expected,
    category: null,
    is_published: true,
    sort_order: 0,
    jurisdiction_code: s.jurisdictionCode,
    source_case_uid: s.sourceCaseUid,
    snapshot_id: s.snapshotId,
    quality_score: s.qualityScore,
    quality_status: "selected",
    curated_by: "rcl-generator",
    scenario_key: s.scenarioKey,
    generator_version: generatorVersion,
    as_of_date: s.asOfDate,
    snapshot_hash: s.snapshotHash,
    coverage_obligations: s.coverageObligations,
    evidence: s.evidence,
    quality_breakdown: s.qualityBreakdown,
    multi_labels: s.multiLabels,
    assertions: s.assertions,
  };
}

/** 新regression test行的完整DB行投影。 */
export function projectNewTestDbRow(t: NewTestRow): Record<string, unknown> {
  return {
    name: t.uid ?? "",
    jurisdiction_code: t.jurisdictionCode,
    rule_id: t.ruleId ?? null,
    input: t.input,
    params_override: null,
    expected: t.expected,
    source: "regression",
    source_case_uid: t.sourceCaseUid,
    last_run_result: null,
  };
}

/** DSL example目标行的完整DB行投影（source固定为example）。 */
export function projectExampleDbRow(e: {
  name: string;
  jurisdictionCode: string;
  ruleId: string | null;
  input: Record<string, unknown>;
  paramsOverride: unknown;
  expected: Record<string, unknown>;
  source: string;
}): Record<string, unknown> {
  return {
    name: e.name,
    jurisdiction_code: e.jurisdictionCode,
    rule_id: e.ruleId,
    input: e.input,
    params_override: e.paramsOverride,
    expected: e.expected,
    source: e.source,
    source_case_uid: null,
    last_run_result: null,
  };
}

/** 新case行hash（=落库后`SELECT *`行在CASE_INFRA_COLUMNS排除下的hash）。 */
export function newCaseDbRowHash(c: NewCaseRow, generatorVersion: string): string {
  return rowContentHash(projectNewCaseDbRow(c, generatorVersion), CASE_INFRA_COLUMNS);
}

/** 新showcase行hash。 */
export function newShowcaseDbRowHash(
  s: NewShowcaseRow,
  generatorVersion: string,
): string {
  return rowContentHash(projectNewShowcaseDbRow(s, generatorVersion), SHOWCASE_INFRA_COLUMNS);
}

/** 新regression test行hash（与testRowContentHash同规则）。 */
export function newTestDbRowHash(t: NewTestRow): string {
  return rowContentHash(projectNewTestDbRow(t), TEST_INFRA_COLUMNS);
}

/** example行hash（plan与apply共同调用，RCL-FR-018/AC-011）。 */
export function exampleDbRowHash(e: {
  name: string;
  jurisdictionCode: string;
  ruleId: string | null;
  input: Record<string, unknown>;
  paramsOverride: unknown;
  expected: Record<string, unknown>;
  source: string;
}): string {
  return rowContentHash(projectExampleDbRow(e), TEST_INFRA_COLUMNS);
}
