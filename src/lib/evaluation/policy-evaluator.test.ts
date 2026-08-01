import { describe, expect, it } from "vitest";

import { POLICY_BENCHMARK_CASES, POLICY_BENCHMARK_VERSION } from "./policy-benchmark.v1";
import {
  DECISION_ROW_DENOMINATOR,
  RULE_DENOMINATOR,
  evaluateCases,
  loadRepositoryEvaluationInputs,
  loadRuleExampleReproductionCases,
  validateCaseProvenance,
  type PolicyEvaluationOutput,
} from "./policy-evaluator";
import { serializeEvaluationReport } from "./contracts";
import type { RuleDefinition } from "@/types/engine";

describe("independent policy benchmark", () => {
  it("contains at least 60 document-specific policy cases with complete evidence metadata", () => {
    expect(POLICY_BENCHMARK_VERSION).toMatch(/^policy-benchmark-v\d+$/);
    const policyDocumentCases = POLICY_BENCHMARK_CASES.filter(
      (testCase) => testCase.evidence.provenanceKind === "policy_document",
    );
    expect(policyDocumentCases.length).toBeGreaterThanOrEqual(60);
    expect(new Set(POLICY_BENCHMARK_CASES.map((testCase) => testCase.id)).size).toBe(
      POLICY_BENCHMARK_CASES.length,
    );

    for (const testCase of POLICY_BENCHMARK_CASES) {
      expect(testCase.evidence.sourceTitle.trim()).not.toBe("");
      expect(testCase.evidence.sourceIdentifier.trim()).not.toBe("");
      expect(testCase.evidence.derivation.trim()).not.toBe("");
      expect(["policy_document", "agency_homepage", "product_contract"]).toContain(
        testCase.evidence.provenanceKind,
      );
      expect(["document_specific", "agency_homepage_only", "internal_contract"]).toContain(
        testCase.evidence.sourceQuality,
      );
      if (testCase.evidence.url !== undefined) {
        expect(testCase.evidence.url).toMatch(/^https:\/\//);
      }
      expect(Object.keys(testCase.expected).length).toBeGreaterThan(0);
    }
  });

  it("keeps product-state assertions and repository-derived evidence out of document-specific policy cases", () => {
    const policyDocumentCases = POLICY_BENCHMARK_CASES.filter(
      (testCase) => testCase.evidence.provenanceKind === "policy_document",
    );

    for (const testCase of policyDocumentCases) {
      const serializedExpected = JSON.stringify(testCase.expected);
      const serializedEvidence = `${testCase.evidence.sourceIdentifier}\n${testCase.evidence.derivation}`;

      expect(serializedExpected).not.toContain("female_retire_type_status");
      expect(serializedExpected).not.toContain("needs_agent");
      expect(serializedEvidence).not.toMatch(/T-SH-|repository|product contract|internal contract/i);
    }
  });

  it("does not treat Shanghai subsidy zero defaults or incomplete positive eligibility inputs as document policy", () => {
    const shanghaiSubsidyCases = POLICY_BENCHMARK_CASES.filter(
      (testCase) => testCase.evidence.sourceIdentifier === "上海市规范性文件库 REPORT_NDOC_007767",
    );

    for (const testCase of shanghaiSubsidyCases) {
      const subsidy = (testCase.expected.calc as Record<string, unknown> | undefined)?.subsidy as Record<string, unknown> | undefined;
      expect(subsidy?.["4050_amount_est"]).not.toBe(0);
      expect(subsidy?.job_amount_est).not.toBe(0);

      if (subsidy?.["4050_eligible"] === true || subsidy?.job_eligible === true) {
        const user = testCase.input.user as Record<string, Record<string, unknown>> | undefined;
        expect(user?.subsidy?.has_employment_difficulty_cert).toBe(true);
        expect(user?.status?.employment_status).toBe("flexible");
        expect(user?.social?.employee_pension_insurance_enrolled).toBe(true);
        expect(user?.social?.employee_medical_insurance_enrolled).toBe(true);
      }
    }
  });

  it("covers every required policy area, including household registration and date boundaries", () => {
    const categories = new Set(POLICY_BENCHMARK_CASES.map((testCase) => testCase.category));
    for (const required of [
      "retirement",
      "pension",
      "medical_insurance",
      "household_registration",
      "subsidy",
      "missing_fields",
      "effective_date_boundary",
    ]) {
      expect(categories.has(required)).toBe(true);
    }
  });
});

describe("policy evaluator", () => {
  const rule: RuleDefinition = {
    dsl_version: "1",
    rule_id: "R-TEST",
    name: "test",
    module: "test",
    status: "published",
    priority: 1,
    effective_from: "2025-01-01",
    effective_to: null,
    supersedes: [],
    inputs: [],
    parameter_refs: [],
    decision_table: {
      hit_policy: "first",
      rows: [
        {
          row_id: "row_yes",
          when: { "==": [{ var: "user.yes" }, true] },
          then: { actions: [{ type: "set", path: "calc.answer", value: 1 }] },
        },
      ],
    },
    outputs: [],
    examples: [],
    evidence: [],
  };

  it("computes strict case and leaf-field matches without hiding failures", () => {
    const report = evaluateCases(
      [
        {
          id: "pass",
          category: "test",
          ruleId: "R-TEST",
          input: { user: { yes: true } },
          expected: { calc: { answer: 1 } },
          evidence: {
            sourceTitle: "fixture",
            sourceIdentifier: "fixture",
            derivation: "1 equals 1.",
            provenanceKind: "product_contract",
            sourceQuality: "internal_contract",
          },
        },
        {
          id: "fail",
          category: "test",
          ruleId: "R-TEST",
          input: { user: { yes: true } },
          expected: { calc: { answer: 2, second: 3 } },
          evidence: {
            sourceTitle: "fixture",
            sourceIdentifier: "fixture",
            derivation: "Two asserted leaves.",
            provenanceKind: "product_contract",
            sourceQuality: "internal_contract",
          },
        },
      ],
      [rule],
      {},
      "fixture-v1",
    );

    expect(report.metric("full corpus strict regression match")).toMatchObject({ numerator: 1, denominator: 2 });
    expect(report.metric("full corpus strict field match")).toMatchObject({ numerator: 1, denominator: 3 });
    expect(report.metric("provenance/product_contract strict case match")).toMatchObject({ numerator: 1, denominator: 2 });
    expect(report.report.failures).toHaveLength(1);
    expect(report.report.failures[0].failure?.actual).toBeDefined();
  });

  it("counts an unmatched trace as rule execution but not decision-row coverage", () => {
    const result = evaluateCases(
      [
        {
          id: "unmatched",
          category: "test",
          ruleId: "R-TEST",
          input: { user: { yes: false } },
          expected: { user: { yes: false } },
          evidence: {
            sourceTitle: "fixture",
            sourceIdentifier: "fixture",
            derivation: "Input is preserved.",
            provenanceKind: "product_contract",
            sourceQuality: "internal_contract",
          },
        },
      ],
      [rule],
      {},
      "fixture-v1",
    );

    expect(result.metric("rule coverage")).toMatchObject({ numerator: 1, denominator: RULE_DENOMINATOR });
    expect(result.metric("decision-row coverage")).toMatchObject({ numerator: 0, denominator: DECISION_ROW_DENOMINATOR });
  });

  it("loads and evaluates the existing 28 DSL examples as reproduction", async () => {
    const repository = await loadRepositoryEvaluationInputs();
    const cases = await loadRuleExampleReproductionCases();
    const result = evaluateCases(cases, repository.rules, repository.params, "rule-examples-reproduction-v1");

    expect(cases).toHaveLength(28);
    expect(result.report.evaluator).toContain("reproduction");
    expect(result.report.results).toHaveLength(28);
  });

  it("propagates asOfDate and executes a rule only inside its effective interval", () => {
    const datedRule: RuleDefinition = {
      ...rule,
      effective_from: "2025-01-01",
      effective_to: "2025-12-31",
      decision_table: {
        hit_policy: "first",
        rows: [
          {
            row_id: "row_dated",
            when: {},
            then: {
              actions: [
                { type: "set", path: "calc.answer", value: 1 },
                { type: "set", path: "calc.seen_today", value: { var: "calc._today" } },
              ],
            },
          },
        ],
      },
    };
    const evidence = {
      sourceTitle: "fixture",
      sourceIdentifier: "fixture",
      derivation: "Exercises an inclusive effective interval.",
      provenanceKind: "product_contract" as const,
      sourceQuality: "internal_contract" as const,
    };
    const result = evaluateCases(
      [
        {
          id: "before",
          category: "effective_date_boundary",
          ruleId: "R-TEST",
          asOfDate: "2024-12-31",
          input: { user: { marker: "before" } },
          expected: { user: { marker: "before" } },
          evidence,
        },
        {
          id: "active",
          category: "effective_date_boundary",
          ruleId: "R-TEST",
          asOfDate: "2025-01-01",
          input: {},
          expected: { calc: { answer: 1, seen_today: "2025-01-01" } },
          evidence,
        },
        {
          id: "after",
          category: "effective_date_boundary",
          ruleId: "R-TEST",
          asOfDate: "2026-01-01",
          input: { user: { marker: "after" } },
          expected: { user: { marker: "after" } },
          evidence,
        },
      ],
      [datedRule],
      {},
      "fixture-v1",
    );
    const outputs = result.report.results.map((entry) => entry.output as PolicyEvaluationOutput);

    expect(outputs.map((output) => output.ruleActive)).toEqual([false, true, false]);
    expect(outputs.map((output) => output.trace.length)).toEqual([0, 1, 0]);
    expect(outputs.map((output) => output.actual.calc)).toEqual([
      { _today: "2024-12-31" },
      { _today: "2025-01-01", answer: 1, seen_today: "2025-01-01" },
      { _today: "2026-01-01" },
    ]);
  });

  it("keeps declared asOfDate authoritative over conflicting calc._today input", () => {
    const datedRule: RuleDefinition = {
      ...rule,
      decision_table: {
        hit_policy: "first",
        rows: [
          {
            row_id: "row_dated",
            when: {},
            then: {
              actions: [{ type: "set", path: "calc.seen_today", value: { var: "calc._today" } }],
            },
          },
        ],
      },
    };
    const result = evaluateCases(
      [
        {
          id: "conflicting-today",
          category: "effective_date_boundary",
          ruleId: "R-TEST",
          asOfDate: "2025-01-01",
          input: { calc: { _today: "1999-12-31" } },
          expected: { calc: { _today: "2025-01-01", seen_today: "2025-01-01" } },
          evidence: {
            sourceTitle: "fixture",
            sourceIdentifier: "fixture",
            derivation: "The declared evaluation date is authoritative.",
            provenanceKind: "product_contract",
            sourceQuality: "internal_contract",
          },
        },
      ],
      [datedRule],
      {},
      "fixture-v1",
    );

    const output = result.report.results[0].output as PolicyEvaluationOutput;
    expect(output.actual.calc).toEqual({ _today: "2025-01-01", seen_today: "2025-01-01" });
  });

  it("rejects inconsistent evidence provenance and quality metadata", () => {
    expect(() =>
      validateCaseProvenance({
        sourceTitle: "Agency homepage",
        sourceIdentifier: "homepage",
        url: "https://example.invalid/",
        derivation: "A claim that is not document-specific.",
        provenanceKind: "agency_homepage",
        sourceQuality: "document_specific",
      }),
    ).toThrow("agency_homepage_only");
  });

  it("can normalize clocks and traces for byte-deterministic check reports", () => {
    const testCase = {
      id: "deterministic",
      category: "test",
      ruleId: "R-TEST",
      input: { user: { yes: true } },
      expected: { calc: { answer: 1 } },
      evidence: {
        sourceTitle: "fixture",
        sourceIdentifier: "fixture",
        derivation: "Deterministic report fixture.",
        provenanceKind: "product_contract" as const,
        sourceQuality: "internal_contract" as const,
      },
    };
    const options = {
      now: () => new Date("2026-07-29T00:00:00.000Z"),
      normalizeTraceTimestamps: true,
    };

    const first = evaluateCases([testCase], [rule], {}, "fixture-v1", options);
    const second = evaluateCases([testCase], [rule], {}, "fixture-v1", options);

    expect(serializeEvaluationReport(first.report)).toBe(serializeEvaluationReport(second.report));
    expect((first.report.results[0].output as PolicyEvaluationOutput).trace[0].timestamp).toBeUndefined();
  });
});
