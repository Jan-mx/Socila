import assert from "node:assert/strict";

import { serializeEvaluationReport } from "../src/lib/evaluation/contracts";
import {
  POLICY_BENCHMARK_CASES,
  POLICY_BENCHMARK_VERSION,
} from "../src/lib/evaluation/policy-benchmark.v1";
import {
  evaluateCases,
  loadRepositoryEvaluationInputs,
  loadRuleExampleReproductionCases,
  type PolicyEvaluationOutput,
} from "../src/lib/evaluation/policy-evaluator";
import type { RuleDefinition } from "../src/types/engine";

const repository = await loadRepositoryEvaluationInputs();
const options = {
  now: () => new Date("2026-07-29T00:00:00.000Z"),
  normalizeTraceTimestamps: true,
};
const benchmark = evaluateCases(
  POLICY_BENCHMARK_CASES,
  repository.rules,
  repository.params,
  POLICY_BENCHMARK_VERSION,
  options,
);
const benchmarkAgain = evaluateCases(
  POLICY_BENCHMARK_CASES,
  repository.rules,
  repository.params,
  POLICY_BENCHMARK_VERSION,
  options,
);
const reproductionCases = await loadRuleExampleReproductionCases();
const reproduction = evaluateCases(
  reproductionCases,
  repository.rules,
  repository.params,
  "rule-examples-reproduction-v1",
  options,
);

assert.equal(benchmark.report.summary.totalCases, 138);
assert.deepEqual(benchmark.metric("full corpus strict regression match"), {
  name: "full corpus strict regression match",
  numerator: 132,
  denominator: 138,
  scope: "mixed-provenance corpus; not a business-accuracy metric",
  rate: 132 / 138,
});
assert.deepEqual(benchmark.metric("full corpus strict field match"), {
  name: "full corpus strict field match",
  numerator: 250,
  denominator: 258,
  scope: "all expected leaf fields in the mixed-provenance corpus",
  rate: 250 / 258,
});
assert.match(benchmark.report.evaluator, /mixed-provenance/);
assert.deepEqual(
  [
    benchmark.metric("provenance/policy_document strict case match").numerator,
    benchmark.metric("provenance/policy_document strict case match").denominator,
  ],
  [59, 60],
);
assert.deepEqual(
  [
    benchmark.metric("provenance/agency_homepage strict case match").numerator,
    benchmark.metric("provenance/agency_homepage strict case match").denominator,
  ],
  [9, 13],
);
assert.deepEqual(
  [
    benchmark.metric("provenance/product_contract strict case match").numerator,
    benchmark.metric("provenance/product_contract strict case match").denominator,
  ],
  [64, 65],
);
assert.equal(benchmark.metric("rule coverage").numerator, 24);
assert.equal(benchmark.metric("decision-row coverage").numerator, 76);
assert.equal(reproduction.report.summary.totalCases, 28);
assert.equal(
  serializeEvaluationReport(benchmark.report),
  serializeEvaluationReport(benchmarkAgain.report),
  "deterministic check mode must produce byte-identical JSON",
);

const boundaryRule: RuleDefinition = {
  dsl_version: "1",
  rule_id: "R-DIRECT-BOUNDARY",
  name: "direct boundary fixture",
  module: "fixture",
  status: "published",
  priority: 1,
  effective_from: "2025-01-01",
  effective_to: "2025-12-31",
  supersedes: [],
  inputs: [],
  parameter_refs: [],
  decision_table: {
    hit_policy: "first",
    rows: [
      {
        row_id: "row_active",
        when: {},
        then: { actions: [{ type: "set", path: "calc.seen_today", value: { var: "calc._today" } }] },
      },
    ],
  },
  outputs: [],
  examples: [],
  evidence: [],
};
const boundaryEvidence = {
  sourceTitle: "direct fixture",
  sourceIdentifier: "direct fixture",
  derivation: "Exercises rule activation and date propagation.",
  provenanceKind: "product_contract" as const,
  sourceQuality: "internal_contract" as const,
};
const boundary = evaluateCases(
  [
    {
      id: "inactive",
      category: "effective_date_boundary",
      ruleId: boundaryRule.rule_id,
      asOfDate: "2024-12-31",
      input: { user: { marker: "preserved" } },
      expected: { user: { marker: "preserved" } },
      evidence: boundaryEvidence,
    },
    {
      id: "active",
      category: "effective_date_boundary",
      ruleId: boundaryRule.rule_id,
      asOfDate: "2025-01-01",
      input: {},
      expected: { calc: { seen_today: "2025-01-01" } },
      evidence: boundaryEvidence,
    },
    {
      id: "conflicting-today",
      category: "effective_date_boundary",
      ruleId: boundaryRule.rule_id,
      asOfDate: "2025-01-01",
      input: { calc: { _today: "1999-12-31" } },
      expected: { calc: { _today: "2025-01-01", seen_today: "2025-01-01" } },
      evidence: boundaryEvidence,
    },
  ],
  [boundaryRule],
  {},
  "direct-boundary-fixture-v1",
  options,
);
const [inactive, active, conflictingToday] = boundary.report.results.map(
  (result) => result.output as PolicyEvaluationOutput,
);
assert.equal(inactive.ruleActive, false);
assert.equal(inactive.trace.length, 0);
assert.match(inactive.inactivityReason ?? "", /no historical rule version/);
assert.deepEqual(inactive.actual.calc, { _today: "2024-12-31" });
assert.equal(active.ruleActive, true);
assert.equal(active.trace.length, 1);
assert.deepEqual(active.actual.calc, { _today: "2025-01-01", seen_today: "2025-01-01" });
assert.deepEqual(conflictingToday.actual.calc, { _today: "2025-01-01", seen_today: "2025-01-01" });

console.log("direct Node type-strip verification passed");
