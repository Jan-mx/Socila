import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { RuleDefinition, TraceEntry } from "@/types/engine";
import { executeRule } from "@/lib/engine/executor";
import {
  buildEvaluationReport,
  createEvaluationMetadata,
  createMetric,
  type EvaluationMetric,
  type EvaluationReport,
  type EvaluationResult,
} from "./contracts";

export const RULE_DENOMINATOR = 24;
export const DECISION_ROW_DENOMINATOR = 76;

export interface PolicyEvidence {
  sourceTitle: string;
  sourceIdentifier: string;
  url?: string;
  derivation: string;
  provenanceKind: "policy_document" | "agency_homepage" | "product_contract" | "repository_reproduction";
  sourceQuality: "document_specific" | "agency_homepage_only" | "internal_contract" | "repository_example";
}

export interface PolicyEvaluationCase {
  id: string;
  category: string;
  ruleId: string;
  module?: string;
  asOfDate?: string;
  input: {
    user?: Record<string, unknown>;
    calc?: Record<string, unknown>;
    plan?: Record<string, unknown>;
    params?: Record<string, unknown>;
  };
  paramsOverride?: Record<string, unknown> | null;
  expected: Record<string, unknown>;
  evidence: PolicyEvidence;
}

export interface PolicyEvaluationOutput {
  actual: Record<string, unknown>;
  differences: FieldDifference[];
  trace: TraceEntry[];
  evidence: PolicyEvidence;
  module: string;
  ruleActive: boolean;
  inactivityReason?: string;
}

export interface FieldDifference {
  path: string;
  expected: unknown;
  actual: unknown;
}

export interface PolicyEvaluationRun {
  report: EvaluationReport;
  uniqueRuleIds: string[];
  uniqueDecisionRowIds: string[];
  metric(name: string): EvaluationMetric;
}

export interface PolicyEvaluationOptions {
  now?: () => Date;
  normalizeTraceTimestamps?: boolean;
}

export async function loadRepositoryEvaluationInputs(root = process.cwd()): Promise<{
  rules: RuleDefinition[];
  params: Record<string, unknown>;
}> {
  const dslRoot = join(root, "dsl", "ssp_dsl_v1");
  const ruleSet = JSON.parse(
    await readFile(join(dslRoot, "rule_sets", "rule_set_shanghai_plan_v1.json"), "utf8"),
  ) as { rules: string[] };
  const ruleDirectory = join(dslRoot, "rules");
  const filenames = (await readdir(ruleDirectory)).filter((name) => name.endsWith(".json"));
  const definitions = await Promise.all(
    filenames.map(async (name) => JSON.parse(await readFile(join(ruleDirectory, name), "utf8")) as RuleDefinition),
  );
  const byId = new Map(definitions.map((rule) => [rule.rule_id, rule]));
  const rules = ruleSet.rules.map((ruleId) => byId.get(ruleId)).filter((rule): rule is RuleDefinition => rule !== undefined);

  if (rules.length !== RULE_DENOMINATOR) {
    throw new Error(`repository rule count changed: expected ${RULE_DENOMINATOR}, found ${rules.length}`);
  }

  const paramPack = JSON.parse(
    await readFile(join(dslRoot, "params", "policy_params_shanghai_base.json"), "utf8"),
  ) as {
    params: Array<{ param_id: string; value: unknown }>;
    tables: Array<{ param_id: string; rows: unknown[] }>;
  };
  const params = Object.fromEntries([
    ...paramPack.params.map((parameter) => [parameter.param_id, parameter.value] as const),
    ...paramPack.tables.map((table) => [table.param_id, table.rows] as const),
  ]);

  return { rules, params };
}

export async function loadRuleExampleReproductionCases(root = process.cwd()): Promise<PolicyEvaluationCase[]> {
  const path = join(root, "dsl", "ssp_dsl_v1", "tests", "rule_examples_as_tests.json");
  const source = JSON.parse(await readFile(path, "utf8")) as {
    tests: Array<{
      rule_id: string;
      example_name: string;
      input: PolicyEvaluationCase["input"];
      params_override?: Record<string, unknown> | null;
      expected: Record<string, unknown>;
    }>;
  };

  return source.tests.map((testCase, index) => ({
    id: `reproduction-${String(index + 1).padStart(2, "0")}`,
    category: "rule_example_reproduction",
    ruleId: testCase.rule_id,
    input: testCase.input,
    paramsOverride: testCase.params_override,
    expected: testCase.expected,
    evidence: {
      sourceTitle: "Repository DSL rule examples",
      sourceIdentifier: `${testCase.rule_id}:${testCase.example_name}`,
      derivation: "Expected fields are reproduced verbatim from the pre-existing DSL example; this is reproduction, not policy accuracy.",
      provenanceKind: "repository_reproduction",
      sourceQuality: "repository_example",
    },
  }));
}

export function evaluateCases(
  cases: PolicyEvaluationCase[],
  rules: RuleDefinition[],
  baseParams: Record<string, unknown>,
  datasetVersion: string,
  options: PolicyEvaluationOptions = {},
): PolicyEvaluationRun {
  const ruleById = new Map(rules.map((rule) => [rule.rule_id, rule]));
  let matchedFields = 0;
  let totalFields = 0;
  const results: EvaluationResult<PolicyEvaluationOutput>[] = [];

  for (const evaluationCase of cases) {
    validateCaseProvenance(evaluationCase.evidence);
    const rule = ruleById.get(evaluationCase.ruleId);
    const expectedLeaves = leafEntries(evaluationCase.expected);
    totalFields += expectedLeaves.length;

    if (!rule) {
      results.push({
        caseId: evaluationCase.id,
        status: "error",
        failure: {
          message: `rule not found: ${evaluationCase.ruleId}`,
          expected: evaluationCase.expected,
        },
      });
      continue;
    }

    const ctx = {
      user: structuredClone(evaluationCase.input.user ?? {}),
      calc: {
        ...structuredClone(evaluationCase.input.calc ?? {}),
        ...(evaluationCase.asOfDate ? { _today: evaluationCase.asOfDate } : {}),
      },
      plan: structuredClone(evaluationCase.input.plan ?? {}),
      params: {
        ...structuredClone(baseParams),
        ...structuredClone(evaluationCase.input.params ?? {}),
        ...structuredClone(evaluationCase.paramsOverride ?? {}),
      },
    };
    const ruleActive = evaluationCase.asOfDate === undefined || isRuleEffectiveOn(rule, evaluationCase.asOfDate);
    const execution = ruleActive ? executeRule(rule, ctx) : { ctx, trace: [] };
    const trace = options.normalizeTraceTimestamps
      ? execution.trace.map((entry) => {
          const stable: TraceEntry = { ...entry };
          delete stable.timestamp;
          return stable;
        })
      : execution.trace;
    const actual = { user: execution.ctx.user, calc: execution.ctx.calc, plan: execution.ctx.plan };
    const differences = expectedLeaves.flatMap(({ path, value }) => {
      const actualValue = getAtPath(actual, path);
      if (deepEqual(value, actualValue)) {
        matchedFields += 1;
        return [];
      }
      return [{ path, expected: value, actual: actualValue }];
    });
    const output: PolicyEvaluationOutput = {
      actual,
      differences,
      trace,
      evidence: evaluationCase.evidence,
      module: evaluationCase.module ?? rule.module ?? "unclassified",
      ruleActive,
      ...(ruleActive
        ? {}
        : {
            inactivityReason: `loaded rule is not effective on ${evaluationCase.asOfDate}; no historical rule version is present in the repository dataset`,
          }),
    };

    results.push(
      differences.length === 0
        ? { caseId: evaluationCase.id, status: "passed", output }
        : {
            caseId: evaluationCase.id,
            status: "failed",
            output,
            failure: {
              message: `${differences.length} of ${expectedLeaves.length} expected fields differed`,
              expected: evaluationCase.expected,
              actual,
            },
          },
    );
  }

  const executedResults = results.filter((result): result is EvaluationResult<PolicyEvaluationOutput> & { output: PolicyEvaluationOutput } =>
    result.output !== undefined,
  );
  const uniqueRuleIds = sortedUnique(executedResults.flatMap((result) => result.output.trace.map((entry) => entry.rule_id)));
  const uniqueDecisionRowIds = sortedUnique(
    executedResults.flatMap((result) =>
      result.output.trace.filter((entry) => entry.row_id !== "none").map((entry) => `${entry.rule_id}:${entry.row_id}`),
    ),
  );
  const passedCases = results.filter((result) => result.status === "passed").length;
  const reproduction = datasetVersion.includes("reproduction");
  const metrics = [
    createMetric({
      name: reproduction ? "reproduction strict case match" : "full corpus strict regression match",
      numerator: passedCases,
      denominator: cases.length,
      scope: reproduction ? "repository-authored reproduction cases" : "mixed-provenance corpus; not a business-accuracy metric",
    }),
    createMetric({
      name: reproduction ? "reproduction strict field match" : "full corpus strict field match",
      numerator: matchedFields,
      denominator: totalFields,
      scope: reproduction ? "repository-authored expected leaf fields" : "all expected leaf fields in the mixed-provenance corpus",
    }),
    createMetric({ name: "rule coverage", numerator: uniqueRuleIds.length, denominator: RULE_DENOMINATOR, scope: "repository rules" }),
    createMetric({
      name: "decision-row coverage",
      numerator: uniqueDecisionRowIds.length,
      denominator: DECISION_ROW_DENOMINATOR,
      scope: "repository decision rows; row_id=none excluded",
    }),
    ...provenanceMetrics(cases, results),
    ...moduleMetrics(cases, results),
  ];

  const dslVersions = sortedUnique(rules.map((rule) => rule.dsl_version));
  const report = buildEvaluationReport({
    evaluator: reproduction ? "rule-example reproduction" : "mixed-provenance policy and product-contract benchmark",
    metadata: createEvaluationMetadata({
      model: "none-offline-engine",
      promptVersion: "none",
      dslVersion: dslVersions.join(","),
      parameterVersion: "SHANGHAI_BASE@2026-02-26",
      datasetVersion,
      gitCommit: process.env.EVALUATION_GIT_COMMIT ?? "not-recorded",
      repetitions: 1,
    }, { now: options.now }),
    cases,
    results,
    metrics,
  });

  return {
    report,
    uniqueRuleIds,
    uniqueDecisionRowIds,
    metric(name: string) {
      const metric = report.metrics.find((candidate) => candidate.name === name);
      if (!metric) throw new Error(`metric not found: ${name}`);
      return metric;
    },
  };
}

export function validateCaseProvenance(evidence: PolicyEvidence): void {
  if (!evidence.sourceTitle.trim() || !evidence.sourceIdentifier.trim() || !evidence.derivation.trim()) {
    throw new Error("evidence source title, identifier, and derivation are required");
  }
  if (evidence.url !== undefined && !evidence.url.startsWith("https://")) {
    throw new Error("evidence URL must use HTTPS");
  }

  const requiredQuality: Record<PolicyEvidence["provenanceKind"], PolicyEvidence["sourceQuality"]> = {
    policy_document: "document_specific",
    agency_homepage: "agency_homepage_only",
    product_contract: "internal_contract",
    repository_reproduction: "repository_example",
  };
  const expectedQuality = requiredQuality[evidence.provenanceKind];
  if (evidence.sourceQuality !== expectedQuality) {
    throw new Error(`${evidence.provenanceKind} evidence must use sourceQuality=${expectedQuality}`);
  }
  if ((evidence.provenanceKind === "policy_document" || evidence.provenanceKind === "agency_homepage") && !evidence.url) {
    throw new Error(`${evidence.provenanceKind} evidence requires a source URL`);
  }
}

function isRuleEffectiveOn(rule: RuleDefinition, asOfDate: string): boolean {
  return asOfDate >= rule.effective_from && (rule.effective_to == null || asOfDate <= rule.effective_to);
}

function provenanceMetrics(cases: PolicyEvaluationCase[], results: EvaluationResult[]): EvaluationMetric[] {
  const resultById = new Map(results.map((result) => [result.caseId, result]));
  const kinds = sortedUnique(cases.map((testCase) => testCase.evidence.provenanceKind));
  return kinds.flatMap((kind) => {
    const subset = cases.filter((testCase) => testCase.evidence.provenanceKind === kind);
    const totalLeaves = subset.reduce((sum, testCase) => sum + leafEntries(testCase.expected).length, 0);
    const passed = subset.filter((testCase) => resultById.get(testCase.id)?.status === "passed").length;
    const matchedLeaves = subset.reduce((sum, testCase) => {
      const result = resultById.get(testCase.id) as EvaluationResult<PolicyEvaluationOutput> | undefined;
      const differences = result?.output?.differences.length ?? leafEntries(testCase.expected).length;
      return sum + leafEntries(testCase.expected).length - differences;
    }, 0);
    const scope =
      kind === "policy_document"
        ? "document-specific policy-source cases"
        : kind === "agency_homepage"
          ? "policy-claim cases backed only by agency homepages; not document-verified"
          : kind === "product_contract"
            ? "internal product-contract regression cases; not policy accuracy"
            : "repository-authored reproduction cases; not policy accuracy";
    return [
      createMetric({ name: `provenance/${kind} strict case match`, numerator: passed, denominator: subset.length, scope }),
      createMetric({ name: `provenance/${kind} strict field match`, numerator: matchedLeaves, denominator: totalLeaves, scope }),
    ];
  });
}

function moduleMetrics(cases: PolicyEvaluationCase[], results: EvaluationResult[]): EvaluationMetric[] {
  const resultById = new Map(results.map((result) => [result.caseId, result]));
  const modules = sortedUnique(cases.map((testCase) => testCase.module ?? "unclassified"));
  return modules.map((module) => {
    const moduleCases = cases.filter((testCase) => (testCase.module ?? "unclassified") === module);
    const passed = moduleCases.filter((testCase) => resultById.get(testCase.id)?.status === "passed").length;
    return createMetric({
      name: `module/${module} strict case match`,
      numerator: passed,
      denominator: moduleCases.length,
      scope: `${module} cases`,
    });
  });
}

function leafEntries(value: unknown, path = ""): Array<{ path: string; value: unknown }> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [{ path, value }];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    leafEntries(child, path ? `${path}.${key}` : key),
  );
}

function getAtPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current === null || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}
