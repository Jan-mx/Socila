import type { RuleDefinition } from "@/types/engine";
import { createComputePlanService, createRepositoryOrchestrator, type ComputePlanServiceResult } from "@/lib/engine/plan-service";
import { createComputePlanToolAdapter } from "@/lib/ai/tools";
import { createPlanComputeAdapter } from "@/lib/plan/compute-adapter";
import { evaluatePublishGate, summarizeRegressionSuite, transitionRollbackState } from "@/lib/admin/publish-gates";
import { runTestSuite, type TestCase } from "@/lib/engine/test-runner";
import { buildEvaluationReport, createEvaluationMetadata, createMetric, type EvaluationCase, type EvaluationReport, type EvaluationResult } from "./contracts";
import { loadRepositoryEvaluationInputs } from "./policy-evaluator";

export const TASK_3_DATASET_VERSION = "task-3-entry-gate-v1";
export const TASK_3_FIXED_TIMESTAMP = "2026-07-29T00:00:00.000Z";

type Profile = { id: string; asOfDate: string; user: Record<string, unknown>; complete: boolean };

export function createEntryProfiles(): Profile[] {
  const years = [2025, 2030, 2039, 2040] as const;
  return years.flatMap((year) => Array.from({ length: 25 }, (_, index) => {
    const complete = index % 2 === 0;
    return {
      id: `entry-${year}-${String(index + 1).padStart(2, "0")}`,
      asOfDate: `${year}-${String((index % 12) + 1).padStart(2, "0")}-15`,
      complete,
      user: {
        basic: { birth_year: 1960 + (index % 35), birth_month: (index % 12) + 1, birth_day: (index % 27) + 1, gender: index % 2 === 0 ? "male" : "female", ...(index % 2 === 1 ? { female_retire_type: "worker50" } : {}) },
        ...(complete ? { social: { pension_contrib_months: 120 + index, medical_contrib_months: 100 + index, unemployment_insurance_years: 5, base_lower_amount_per_month: 7000, min_wage_amount_per_month: 2690 }, status: { employment_status: "employed", on_unemployment_benefit: false }, subsidy: { has_employment_difficulty_cert: false }, objective: "balanced" } : {}),
      },
    };
  }));
}

export interface Task3Run {
  entry: EvaluationReport;
  publish: EvaluationReport;
  governance: {
    workflowRegressionThreshold: number;
    serviceRegressionThreshold: number;
    knownThresholdDiscrepancy: true;
    rollback: ReturnType<typeof transitionRollbackState>;
    specialCaseIds: string[];
  };
}

export async function runTask3Evaluation(options: { gitCommit?: string; now?: () => Date } = {}): Promise<Task3Run> {
  const repository = await loadRepositoryEvaluationInputs();
  const service = createComputePlanService({
    orchestrate: createRepositoryOrchestrator({ rules: repository.rules, params: repository.params }),
    savePlan: async () => { throw new Error("offline evaluator must not persist"); },
  });
  const profiles = createEntryProfiles();
  if (profiles.length !== 100 || new Set(profiles.map((profile) => profile.id)).size !== 100) throw new Error("entry dataset must contain exactly 100 unique profiles");
  const entryCases: EvaluationCase[] = profiles.map((profile) => ({ id: profile.id, category: profile.complete ? "complete_profile" : "incomplete_profile", input: profile, expected: "tool and route parity" }));
  const entryResults: EvaluationResult[] = [];
  for (const profile of profiles) {
    let toolServiceResult: ComputePlanServiceResult | undefined;
    let routeServiceResult: ComputePlanServiceResult | undefined;
    const tool = createComputePlanToolAdapter(service, { asOfDate: profile.asOfDate, persist: false, captureResult: (result) => { toolServiceResult = result; } });
    const route = createPlanComputeAdapter(service, { now: () => new Date(`${profile.asOfDate}T00:00:00.000Z`), persist: false, captureResult: (result) => { routeServiceResult = result; } });
    const parsed = tool.parse(profile.user);
    if (!parsed.success) {
      entryResults.push({ caseId: profile.id, status: "error", failure: { message: "tool schema rejected generated profile", actual: parsed.error.flatten() } });
      continue;
    }
    const [toolOutput, routeOutput] = await Promise.all([tool.execute(parsed.data), route.handle({ user: profile.user, as_of_date: profile.asOfDate })]);
    const differences = compareValues(
      normalizeEntryOutput({ ...toolOutput, trace: toolServiceResult?.trace }),
      normalizeEntryOutput({ ...(routeOutput.body as Record<string, unknown>), trace: routeServiceResult?.trace }),
    );
    entryResults.push(differences.length === 0
      ? { caseId: profile.id, status: "passed", output: { scope: "in-process production-logic parity", comparedFields: STRICT_ENTRY_FIELDS, tool: toolOutput, route: routeOutput.body } }
      : { caseId: profile.id, status: "failed", output: { scope: "in-process production-logic parity", differences, tool: toolOutput, route: routeOutput.body }, failure: { message: `${differences.length} strict fields differ`, actual: differences } });
  }
  const entry = buildEvaluationReport({
    evaluator: "entry consistency (in-process production-logic parity; not end-to-end HTTP/DB)",
    metadata: metadata(repository.rules, options),
    cases: entryCases,
    results: entryResults,
    metrics: [createMetric({ name: "consistent cases", numerator: entryResults.filter((result) => result.status === "passed").length, denominator: 100, scope: "tool versus HTTP request-handler production adapters" }), createMetric({ name: "inconsistent cases", numerator: entryResults.filter((result) => result.status !== "passed").length, denominator: 100, scope: "tool versus HTTP request-handler production adapters" })],
  });

  const candidates = createPublishCandidates();
  if (candidates.faulty.length !== 30 || candidates.valid.length !== 10) throw new Error("publish dataset must contain exactly 30 faulty and 10 valid candidates");
  const publishCases: EvaluationCase[] = [...candidates.faulty, ...candidates.valid].map((candidate) => ({ id: candidate.id, category: candidate.category, input: candidate.input, expected: candidate.expected }));
  const publishResults: EvaluationResult[] = [...candidates.faulty, ...candidates.valid].map((candidate) => {
    const regression = candidate.regressionCases
      ? executeCandidateRegression(candidate.input.candidateRule!, candidate.regressionCases, repository.params)
      : candidate.input.regression;
    const actual = evaluatePublishGate({ ...candidate.input, regression, knownParameterIds: Object.keys(repository.params) });
    const passed = actual.passed === candidate.expected;
    return passed ? { caseId: candidate.id, status: "passed", output: actual } : { caseId: candidate.id, status: "failed", output: actual, failure: { message: "gate decision differed from mutation expectation", expected: candidate.expected, actual } };
  });
  const faultyBlocked = publishResults.slice(0, 30).filter((result) => result.status === "passed").length;
  const validAccepted = publishResults.slice(30).filter((result) => result.status === "passed").length;
  const publish = buildEvaluationReport({
    evaluator: "publish-gate mutation evaluation (shared pure production gate)",
    metadata: metadata(repository.rules, options),
    cases: publishCases,
    results: publishResults,
    metrics: [createMetric({ name: "faulty candidates blocked", numerator: faultyBlocked, denominator: 30, scope: "intentionally faulty candidate rules" }), createMetric({ name: "faulty candidates incorrectly allowed", numerator: 30 - faultyBlocked, denominator: 30, scope: "intentionally faulty candidate rules" }), createMetric({ name: "valid candidates accepted", numerator: validAccepted, denominator: 10, scope: "valid candidate rules" }), createMetric({ name: "valid candidates incorrectly blocked", numerator: 10 - validAccepted, denominator: 10, scope: "valid candidate rules" })],
  });
  return {
    entry,
    publish,
    governance: {
      workflowRegressionThreshold: 0.95,
      serviceRegressionThreshold: 0.8,
      knownThresholdDiscrepancy: true,
      rollback: transitionRollbackState("production"),
      specialCaseIds: ["faulty-no-regression", "faulty-regression-exception", "faulty-omitted-1", "faulty-omitted-2", "faulty-omitted-3"],
    },
  };
}

const STRICT_ENTRY_FIELDS = ["needs_agent", "questions", "warnings", "caveats", "calc", "plan", "meta", "rule/policy version metadata", "rule execution trace"];

function metadata(rules: RuleDefinition[], options: { gitCommit?: string; now?: () => Date }) {
  return createEvaluationMetadata({ model: "none-offline-engine", promptVersion: "none", dslVersion: [...new Set(rules.map((rule) => rule.dsl_version))].join(","), parameterVersion: "policy_params_shanghai_base.json", datasetVersion: TASK_3_DATASET_VERSION, gitCommit: options.gitCommit ?? "not-recorded", repetitions: 1 }, { now: options.now ?? (() => new Date(TASK_3_FIXED_TIMESTAMP)) });
}

function normalizeEntryOutput(output: Record<string, unknown>) {
  const rest = structuredClone(output);
  delete rest.plan_id;
  const trace = Array.isArray(rest.trace) ? rest.trace.map((entry) => {
    const stable = { ...(entry as Record<string, unknown>) };
    delete stable.timestamp;
    return stable;
  }) : rest.trace;
  return { needs_agent: rest.needs_agent, questions: rest.questions, warnings: rest.warnings, caveats: rest.caveats, calc: rest.calc, plan: rest.plan, meta: rest.meta, trace };
}

function compareValues(left: unknown, right: unknown, path = ""): Array<{ path: string; tool: unknown; route: unknown }> {
  if (Object.is(left, right)) return [];
  if (Array.isArray(left) && Array.isArray(right)) return Array.from({ length: Math.max(left.length, right.length) }, (_, index) => compareValues(left[index], right[index], `${path}[${index}]`)).flat();
  if (isRecord(left) && isRecord(right)) return [...new Set([...Object.keys(left), ...Object.keys(right)])].flatMap((key) => compareValues(left[key], right[key], path ? `${path}.${key}` : key));
  return [{ path: path || "root", tool: left, route: right }];
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

export type PublishMutationCandidate = { id: string; category: string; input: Parameters<typeof evaluatePublishGate>[0]; expected: boolean; regressionCases?: TestCase[] };
export function createPublishCandidates(): { faulty: PublishMutationCandidate[]; valid: PublishMutationCandidate[] } {
  const validRule = mutationFixtureRule();
  const malformed = (id: string): PublishMutationCandidate => ({ id, category: "missing_invalid_structure", expected: false, input: { entityType: "rule", fromStage: "draft", toStage: "staging", candidateRule: { ...structuredClone(validRule), decision_table: { hit_policy: "invalid" as never, rows: [] } } } });
  const missingExamples = (id: string): PublishMutationCandidate => ({ id, category: "missing_examples", expected: false, input: { entityType: "rule", fromStage: "draft", toStage: "staging", candidateRule: { ...structuredClone(validRule), examples: [] } } });
  const boundaryMutation = (id: string): PublishMutationCandidate => {
    const candidateRule = { ...structuredClone(validRule), rule_id: id, decision_table: { ...structuredClone(validRule.decision_table), rows: [{ ...structuredClone(validRule.decision_table.rows[0]), when: { "==": [{ var: "user.eligible" }, false] } }, structuredClone(validRule.decision_table.rows[1])] } };
    return { id, category: "boundary_condition_mutation", expected: false, input: { entityType: "rule", fromStage: "staging", toStage: "production", candidateRule }, regressionCases: regressionCases(id) };
  };
  const orderMutation = (id: string): PublishMutationCandidate => {
    const candidateRule = { ...structuredClone(validRule), rule_id: id, decision_table: { ...structuredClone(validRule.decision_table), rows: [structuredClone(validRule.decision_table.rows[1]), structuredClone(validRule.decision_table.rows[0])] } };
    return { id, category: "decision_order_mutation", expected: false, input: { entityType: "rule", fromStage: "staging", toStage: "production", candidateRule }, regressionCases: regressionCases(id) };
  };
  const badParam = (id: string): PublishMutationCandidate => ({ id, category: "missing_invalid_parameter_reference", expected: false, input: { entityType: "rule", fromStage: "draft", toStage: "staging", candidateRule: { ...structuredClone(validRule), parameter_refs: [{ param_id: "MISSING-PARAMETER" }] } } });
  const badDates = (id: string): PublishMutationCandidate => ({ id, category: "effective_date_conflict", expected: false, input: { entityType: "rule", fromStage: "draft", toStage: "staging", candidateRule: { ...structuredClone(validRule), effective_to: "2020-01-01" } } });
  const omitted = (id: string): PublishMutationCandidate => ({ id, category: "candidate_rule_omitted_from_regression", expected: false, input: { entityType: "rule", fromStage: "staging", toStage: "production", candidateRule: validRule, regression: { total: 10, passed: 10, failedTests: [], candidateIncluded: false } } });
  const faulty: PublishMutationCandidate[] = [...Array.from({ length: 5 }, (_, i) => malformed(`faulty-structure-${i + 1}`)), ...Array.from({ length: 4 }, (_, i) => missingExamples(`faulty-examples-${i + 1}`)), ...Array.from({ length: 5 }, (_, i) => boundaryMutation(`faulty-boundary-${i + 1}`)), ...Array.from({ length: 4 }, (_, i) => badParam(`faulty-parameter-${i + 1}`)), ...Array.from({ length: 4 }, (_, i) => orderMutation(`faulty-order-${i + 1}`)), ...Array.from({ length: 3 }, (_, i) => badDates(`faulty-dates-${i + 1}`)), ...Array.from({ length: 3 }, (_, i) => omitted(`faulty-omitted-${i + 1}`)), { id: "faulty-no-regression", category: "no_regression_tests", expected: false, input: { entityType: "rule", fromStage: "staging", toStage: "production", candidateRule: validRule } }, { id: "faulty-regression-exception", category: "regression_execution_exception", expected: false, input: { entityType: "rule", fromStage: "staging", toStage: "production", candidateRule: validRule, regression: { total: 10, passed: 0, failedTests: [], candidateIncluded: true, exception: "fixture exception" } } }];
  const valid = Array.from({ length: 10 }, (_, index): PublishMutationCandidate => ({ id: `valid-${index + 1}`, category: "valid", expected: true, input: index < 5 ? { entityType: "rule", fromStage: "draft", toStage: "staging", candidateRule: validRule } : { entityType: "rule", fromStage: "staging", toStage: "production", candidateRule: validRule }, regressionCases: index < 5 ? undefined : regressionCases(validRule.rule_id, true) }));
  return { faulty, valid };
}

function mutationFixtureRule(): RuleDefinition {
  return { dsl_version: "SSP-DSL-1.0", rule_id: "R-TASK3-MUTATION", name: "Task 3 mutation fixture", module: "evaluation", status: "draft", priority: 1, effective_from: "2025-01-01", effective_to: null, supersedes: [], inputs: [], parameter_refs: [], decision_table: { hit_policy: "first", rows: [{ row_id: "eligible", when: { "==": [{ var: "user.eligible" }, true] }, then: { actions: [{ type: "set", path: "calc.decision", value: "eligible" }] } }, { row_id: "fallback", when: {}, then: { actions: [{ type: "set", path: "calc.decision", value: "fallback" }] } }] }, outputs: [{ key: "calc.decision", type: "string" }], examples: [{ name: "eligible", input: { user: { eligible: true } }, expected: { calc: { decision: "eligible" } } }], evidence: [] };
}

function regressionCases(ruleId: string, allowTwoFailures = false): TestCase[] {
  return Array.from({ length: 10 }, (_, index) => ({
    rule_id: ruleId,
    name: `regression-${index + 1}`,
    input: { user: { eligible: true } },
    expected: { calc: { decision: allowTwoFailures && index >= 8 ? "intentionally-nonblocking" : "eligible" } },
  }));
}

function executeCandidateRegression(rule: RuleDefinition, cases: TestCase[], params: Record<string, unknown>) {
  const suite = runTestSuite(cases, [rule], params);
  return summarizeRegressionSuite(suite, "rule", rule.rule_id);
}
