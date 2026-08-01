import { validateRuleDefinitionAgainstSchema } from "@/lib/dsl/schema-validator";
import type { RuleDefinition } from "@/types/engine";

export type PublishEntityType = "rule" | "param" | "rule_set";
export type PublishStage = "draft" | "staging" | "production";

export interface PublishGateDecision {
  passed: boolean;
  reason?: string;
  results: Record<string, unknown>;
}

export interface RegressionGateInput {
  total: number;
  passed: number;
  failedTests: string[];
  candidateIncluded: boolean;
  exception?: string;
}

type RegressionSuiteLike = {
  total: number;
  passed: number;
  results: readonly {
    pass: boolean;
    name: string;
    trace: readonly { rule_id?: string | null }[];
  }[];
};

export function summarizeRegressionSuite(
  suite: RegressionSuiteLike,
  entityType: PublishEntityType,
  entityId: string,
): RegressionGateInput {
  return {
    total: suite.total,
    passed: suite.passed,
    failedTests: suite.results.filter((result) => !result.pass).map((result) => result.name),
    candidateIncluded: entityType !== "rule" || suite.results.some((result) =>
      result.trace.some((entry) => entry.rule_id === entityId),
    ),
  };
}

export function evaluatePublishGate(input: {
  entityType: PublishEntityType;
  fromStage: PublishStage;
  toStage: PublishStage;
  candidateRule?: RuleDefinition;
  knownParameterIds?: readonly string[];
  regression?: RegressionGateInput;
}): PublishGateDecision {
  if (input.fromStage === "draft" && input.toStage === "staging") {
    if (input.entityType !== "rule") return { passed: true, results: { checks: [{ name: "draft_to_staging", passed: true }] } };
    if (!input.candidateRule) return { passed: false, reason: "未找到规则", results: { checks: [{ name: "rule_exists", passed: false }] } };
    const schema = validateRuleDefinitionAgainstSchema(input.candidateRule);
    const examplesValid = input.candidateRule.examples.length > 0;
    const parameterRefsValid = input.candidateRule.parameter_refs.every((ref) =>
      Boolean(ref.param_id?.trim()) && (!input.knownParameterIds || input.knownParameterIds.includes(ref.param_id)),
    );
    const effectiveDatesValid = input.candidateRule.effective_to == null || input.candidateRule.effective_to >= input.candidateRule.effective_from;
    if (!schema.valid || !examplesValid || !parameterRefsValid || !effectiveDatesValid) {
      return {
        passed: false,
        reason: !schema.valid ? `Schema validation failed: ${schema.errors.slice(0, 3).join("; ")}` : !examplesValid ? "Examples check failed" : !parameterRefsValid ? "Parameter reference check failed" : "Effective date conflict",
        results: { checks: [{ name: "schema", passed: schema.valid, detail: schema.errors.slice(0, 5).join("; ") || undefined }, { name: "examples", passed: examplesValid }, { name: "parameter_refs", passed: parameterRefsValid }, { name: "effective_dates", passed: effectiveDatesValid }], schema_valid: schema.valid, schema_errors: schema.errors.slice(0, 10), examples_valid: examplesValid, parameter_refs_valid: parameterRefsValid, effective_dates_valid: effectiveDatesValid },
      };
    }
    return { passed: true, results: { checks: [{ name: "schema", passed: true }, { name: "examples", passed: true }] } };
  }

  if (input.fromStage === "staging" && input.toStage === "production") {
    const regression = input.regression;
    if (!regression || regression.total === 0) return { passed: false, reason: "未找到回归测试", results: { checks: [{ name: "regression", passed: false, detail: "没有可运行的测试" }], total: 0, passed: 0, pass_rate: 0 } };
    if (regression.exception) return { passed: false, reason: `回归测试运行失败：${regression.exception}`, results: { checks: [{ name: "regression", passed: false, detail: "运行出错" }], total: regression.total, passed: 0, pass_rate: 0 } };
    if (input.entityType === "rule" && !regression.candidateIncluded) return { passed: false, reason: "候选规则未纳入回归执行", results: { checks: [{ name: "candidate_rule", passed: false }], total: regression.total, passed: regression.passed, pass_rate: regression.passed / regression.total } };
    const passRate = regression.passed / regression.total;
    const results = { total: regression.total, passed: regression.passed, pass_rate: passRate, failed_tests: regression.failedTests.slice(0, 10) };
    if (passRate < 0.8) return { passed: false, reason: `Regression pass rate ${(passRate * 100).toFixed(1)}% is below 80% threshold`, results: { checks: [{ name: "regression", passed: false, detail: `通过率 ${(passRate * 100).toFixed(1)}%，低于 80%` }], ...results } };
    return { passed: true, results: { checks: [{ name: "regression", passed: true, detail: `通过率 ${(passRate * 100).toFixed(1)}%（重新运行 ${regression.total} 个测试）` }], ...results } };
  }

  return { passed: false, reason: "不支持此发布阶段转换", results: { checks: [{ name: "transition", passed: false }] } };
}

export function transitionRollbackState(fromStage: PublishStage): { allowed: boolean; toStage: PublishStage | null } {
  return fromStage === "production" ? { allowed: true, toStage: "staging" } : { allowed: false, toStage: null };
}
