import { describe, expect, it } from "vitest";

import { createComputePlanService, createRepositoryOrchestrator } from "@/lib/engine/plan-service";
import { createComputePlanToolAdapter } from "@/lib/ai/tools";
import { createPlanComputeAdapter } from "@/lib/plan/compute-adapter";
import { evaluatePublishGate, summarizeRegressionSuite, transitionRollbackState } from "@/lib/admin/publish-gates";
import { createEntryProfiles, createPublishCandidates } from "@/lib/evaluation/task-3-evaluator";
import { runTestSuite } from "@/lib/engine/test-runner";
import type { RuleDefinition } from "@/types/engine";

const rule: RuleDefinition = {
  dsl_version: "1",
  rule_id: "R-EVALUATION-FIXTURE",
  name: "evaluation fixture",
  module: "fixture",
  status: "published",
  priority: 1,
  effective_from: "2020-01-01",
  effective_to: null,
  supersedes: [],
  inputs: [],
  parameter_refs: [],
  decision_table: { hit_policy: "first", rows: [{ row_id: "yes", when: {}, then: { actions: [{ type: "set", path: "calc.ok", value: true }] } }] },
  outputs: [],
  examples: [{ name: "fixture", input: {}, expected: {} }],
  evidence: [],
};

describe("Task 3 production boundaries", () => {
  it("uses the same injectable service for tool and route shaping with an in-memory repository engine", async () => {
    const service = createComputePlanService({
      orchestrate: createRepositoryOrchestrator({ rules: [rule], params: {} }),
      savePlan: async () => ({ id: "never-used", createdAt: new Date(0), userInput: {}, calcResult: {}, planOutput: {}, trace: [], ruleSetVersion: null, policyPackVersion: null, conclusionLevel: null, asOfDate: null, sessionId: null }),
    });
    const tool = createComputePlanToolAdapter(service, { asOfDate: "2030-06-01", persist: false });
    const route = createPlanComputeAdapter(service, { now: () => new Date("2030-06-01T00:00:00.000Z"), persist: false });
    const user = { basic: { gender: "male" as const } };

    const toolResult = await tool.execute(user);
    const routeResult = await route.handle({ user, as_of_date: "2030-06-01" });

    expect(toolResult).toMatchObject({ success: true, plan_id: null, calc: { _today: "2030-06-01", ok: true } });
    expect(routeResult).toMatchObject({ status: 200, body: { plan_id: null, calc: { _today: "2030-06-01", ok: true } } });
  });

  it("blocks malformed rules and applies the production 80 percent regression threshold", () => {
    expect(evaluatePublishGate({
      entityType: "rule",
      fromStage: "draft",
      toStage: "staging",
      candidateRule: { ...rule, decision_table: { hit_policy: "invalid", rows: [] } as never },
    }).passed).toBe(false);
    expect(evaluatePublishGate({
      entityType: "rule",
      fromStage: "staging",
      toStage: "production",
      candidateRule: rule,
      regression: { total: 10, passed: 8, failedTests: [], candidateIncluded: true },
    }).passed).toBe(true);
  });

  it("blocks a staging rule omitted from every regression trace while recognizing an executed rule", () => {
    const suite = runTestSuite([
      { rule_id: rule.rule_id, name: "executed-rule", input: {}, expected: { calc: { ok: true } } },
    ], [rule], {});
    const omitted = summarizeRegressionSuite(suite, "rule", "R-OMITTED-FROM-TRACE");
    const executed = summarizeRegressionSuite(suite, "rule", rule.rule_id);

    expect(omitted.candidateIncluded).toBe(false);
    expect(evaluatePublishGate({
      entityType: "rule",
      fromStage: "staging",
      toStage: "production",
      regression: omitted,
    }).passed).toBe(false);
    expect(executed.candidateIncluded).toBe(true);
  });

  it("models the production rollback transition without asserting database audit persistence", () => {
    expect(transitionRollbackState("production")).toEqual({ allowed: true, toStage: "staging" });
    expect(transitionRollbackState("staging")).toEqual({ allowed: false, toStage: null });
  });

  it("locks the versioned evaluator datasets to the required profile and mutation populations", () => {
    const profiles = createEntryProfiles();
    const mutations = createPublishCandidates();
    expect(profiles).toHaveLength(100);
    expect(new Set(profiles.map((profile) => profile.asOfDate.slice(0, 4)))).toEqual(new Set(["2025", "2030", "2039", "2040"]));
    expect(new Set(profiles.map((profile) => profile.complete))).toEqual(new Set([true, false]));
    expect(mutations.faulty).toHaveLength(30);
    expect(mutations.valid).toHaveLength(10);
    const categories = new Set(mutations.faulty.map((candidate) => candidate.category));
    for (const category of ["missing_invalid_structure", "missing_examples", "boundary_condition_mutation", "missing_invalid_parameter_reference", "decision_order_mutation", "effective_date_conflict", "candidate_rule_omitted_from_regression"]) {
      expect(categories).toContain(category);
    }
  });
});
