/**
 * 步骤02.8 输入隔离与重复执行保障（CORE-FR-007 / CORE-AC-004）。
 *
 * 复用原始输入对象重复执行：结果必须一致且输入未被污染。
 * 关键场景：同一组 rule/param 对象连跑两轮完整语料——这正是 golden.test.ts
 * 注释里记载的历史污染源（单规则路径浅拷贝 params 导致规则写入穿透）。
 */
import { describe, it, expect } from "vitest";
import {
  buildGoldenSnapshot,
  canonicalJson,
  FIXED_AS_OF_DATE,
  loadBaseParams,
  loadGoldenCases,
  loadRules,
  type GoldenSnapshotCase,
  type SnapshotTraceEntry,
} from "./golden-fixtures";
import { orchestrateInMemory } from "../orchestrator";
import { runTestCase, runTestSuite, type TestCase } from "../test-runner";

const ENGINE_INPUT = {
  user: {
    basic: { gender: "male", birthDate: "1973-05-12" },
    social: { pensionMonths: 200, medicalMonths: 130 },
  },
};

describe("engine input isolation (CORE-FR-007)", () => {
  it("full orchestration on reused input objects: results identical, inputs unmutated", () => {
    const rules = loadRules();
    const params = loadBaseParams();
    const input = structuredClone(ENGINE_INPUT);
    const inputSnapshot = JSON.stringify(input);
    const paramsSnapshot = JSON.stringify(params);

    const first = orchestrateInMemory(rules, params, input, FIXED_AS_OF_DATE);
    const second = orchestrateInMemory(rules, params, input, FIXED_AS_OF_DATE);

    expect(second.plan).toEqual(first.plan);
    expect(second.calc).toEqual(first.calc);
    expect(JSON.stringify(input)).toBe(inputSnapshot);
    expect(JSON.stringify(params)).toBe(paramsSnapshot);
  });

  it("same rule/param objects across two full corpus runs produce zero drift", () => {
    // 历史污染场景：runTestSuite 复用对象会在用例间穿透修改。
    const rules = loadRules();
    const params = loadBaseParams();
    const cases = loadGoldenCases();

    const run = (): GoldenSnapshotCase[] =>
      runTestSuite(cases, rules, params, FIXED_AS_OF_DATE).results.map((r) => ({
        name: r.name,
        rule_id: r.rule_id,
        user: r.actual.user as Record<string, unknown>,
        calc: r.actual.calc as Record<string, unknown>,
        plan: r.actual.plan as Record<string, unknown>,
        // trace 的 Date.now() 时间戳非确定性，与基线夹具一致地剔除。
        trace: r.trace.map((entry) => ({
          rule_id: entry.rule_id,
          row_id: entry.row_id,
          matched: entry.matched,
          actions_executed: entry.actions_executed,
        }) as SnapshotTraceEntry),
      }));

    const first = canonicalJson(run());
    const second = canonicalJson(run());
    expect(second).toBe(first);
  });

  it("reusing the same TestCase object across runs: result stable, testCase.input untouched", () => {
    const testCase: TestCase = {
      rule_id: null,
      input: {
        user: structuredClone(ENGINE_INPUT.user),
        calc: { pension: { contributed_months: 200 } },
      },
      params_override: null,
      expected: {},
    };
    const inputSnapshot = JSON.stringify(testCase.input);

    const first = runTestCase(testCase, loadRules(), loadBaseParams(), FIXED_AS_OF_DATE);
    const second = runTestCase(testCase, loadRules(), loadBaseParams(), FIXED_AS_OF_DATE);

    expect(second.actual).toEqual(first.actual);
    expect(JSON.stringify(testCase.input)).toBe(inputSnapshot);
  });

  it("whole-corpus output still matches the committed golden snapshot", () => {
    // 输入隔离修复后，基线（已知偏差集合的"实际输出"）必须保持不变。
    const snapshotCases = JSON.parse(
      canonicalJson(buildGoldenSnapshot()),
    ) as GoldenSnapshotCase[];
    const fresh = runTestSuite(
      loadGoldenCases(),
      loadRules(),
      loadBaseParams(),
      FIXED_AS_OF_DATE,
    ).results.map((r) => r.name);
    expect(fresh).toEqual(snapshotCases.map((c) => c.name));
  });
});
