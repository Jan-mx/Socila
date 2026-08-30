/* eslint-disable @typescript-eslint/no-explicit-any */
import type { RuleDefinition, TraceEntry } from "@/types/engine";
import { executeSingleRuleInMemory, orchestrateInMemory } from "./orchestrator";
import { getEffectiveRules, getEffectiveParams } from "@/lib/db/queries";

export interface TestCase {
  rule_id?: string | null;
  example_name?: string;
  name?: string;
  input: Record<string, any>;
  params_override?: Record<string, unknown> | null;
  expected: Record<string, unknown>;
}

export interface TestResult {
  pass: boolean;
  name: string;
  rule_id: string | null;
  actual: Record<string, unknown>;
  expected: Record<string, unknown>;
  diff: DiffEntry[];
  trace: TraceEntry[];
}

export interface DiffEntry {
  path: string;
  expected: unknown;
  actual: unknown;
}

/**
 * Run a single test case.
 *
 * `asOfDate` 省略时全量用例按"当天日期"执行（结果随日期漂移）；
 * 黄金基线与回归比较必须显式传入固定日期。
 *
 * CRITICAL dual params resolution:
 * 1. Start with baseParams from DB (or empty)
 * 2. Merge input.params on top (if present in test input)
 * 3. Merge params_override on top (if present and non-null)
 */
export function runTestCase(
  testCase: TestCase,
  allRules: RuleDefinition[],
  baseParams: Record<string, unknown>,
  asOfDate?: string,
): TestResult {
  const testName =
    testCase.example_name ?? testCase.name ?? testCase.rule_id ?? "unnamed";

  // Build merged params
  const mergedParams = { ...baseParams };

  // Merge input.params if present
  if (testCase.input.params && typeof testCase.input.params === "object") {
    Object.assign(mergedParams, testCase.input.params);
  }

  // Merge params_override if present and non-null
  if (
    testCase.params_override &&
    typeof testCase.params_override === "object"
  ) {
    Object.assign(mergedParams, testCase.params_override);
  }

  // Build user input (remove params from input to avoid confusion)
  const userInput: Record<string, any> = {};
  for (const [key, value] of Object.entries(testCase.input)) {
    if (key !== "params") {
      userInput[key] = value;
    }
  }

  let resultCtx: {
    plan: Record<string, unknown>;
    calc: Record<string, unknown>;
    user: Record<string, unknown>;
    trace: TraceEntry[];
  };

  if (testCase.rule_id) {
    // Single-rule test
    const rule = allRules.find((r) => r.rule_id === testCase.rule_id);
    if (!rule) {
      return {
        pass: false,
        name: testName,
        rule_id: testCase.rule_id,
        actual: {},
        expected: testCase.expected,
        diff: [
          {
            path: "rule",
            expected: testCase.rule_id,
            actual: "not found",
          },
        ],
        trace: [],
      };
    }

    // Build context for single-rule test
    const ctx: any = {
      user: userInput.user ?? {},
      params: mergedParams,
      calc: userInput.calc ?? {},
      plan: userInput.plan ?? {},
    };

    const result = executeSingleRuleInMemory(rule, ctx);
    resultCtx = {
      plan: result.ctx.plan ?? {},
      calc: result.ctx.calc ?? {},
      user: result.ctx.user ?? {},
      trace: result.trace,
    };
  } else {
    // Full rule set test
    resultCtx = orchestrateInMemory(allRules, mergedParams, userInput, asOfDate);
  }

  // Build the actual result to compare against expected
  const actual: Record<string, unknown> = {
    user: resultCtx.user,
    calc: resultCtx.calc,
    plan: resultCtx.plan,
  };

  // Deep partial match
  const diff = deepPartialDiff(testCase.expected, actual, "");

  return {
    pass: diff.length === 0,
    name: testName,
    rule_id: testCase.rule_id ?? null,
    actual,
    expected: testCase.expected,
    diff,
    trace: resultCtx.trace,
  };
}

/**
 * Run multiple test cases and return aggregated results.
 */
export function runTestSuite(
  testCases: TestCase[],
  allRules: RuleDefinition[],
  baseParams: Record<string, unknown>,
  asOfDate?: string,
): {
  total: number;
  passed: number;
  failed: number;
  pass_rate: number;
  results: TestResult[];
} {
  const results = testCases.map((tc) =>
    runTestCase(tc, allRules, baseParams, asOfDate),
  );
  const passed = results.filter((r) => r.pass).length;

  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    pass_rate: results.length > 0 ? passed / results.length : 0,
    results,
  };
}

/**
 * Deep partial match: only check fields present in `expected`.
 * Returns a list of differences.
 */
function deepPartialDiff(
  expected: unknown,
  actual: unknown,
  path: string,
): DiffEntry[] {
  const diffs: DiffEntry[] = [];

  if (expected === null || expected === undefined) {
    if (actual !== expected) {
      diffs.push({ path: path || "root", expected, actual });
    }
    return diffs;
  }

  if (typeof expected !== "object") {
    // Primitive comparison
    if (expected !== actual) {
      diffs.push({ path: path || "root", expected, actual });
    }
    return diffs;
  }

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      diffs.push({ path: path || "root", expected, actual });
      return diffs;
    }
    // Compare array elements
    for (let i = 0; i < expected.length; i++) {
      diffs.push(
        ...deepPartialDiff(expected[i], (actual as any[])[i], `${path}[${i}]`),
      );
    }
    return diffs;
  }

  // Object: only check fields present in expected
  if (typeof actual !== "object" || actual === null) {
    diffs.push({ path: path || "root", expected, actual });
    return diffs;
  }

  for (const [key, expectedValue] of Object.entries(
    expected as Record<string, unknown>,
  )) {
    const actualValue = (actual as Record<string, unknown>)[key];
    const fieldPath = path ? `${path}.${key}` : key;
    diffs.push(...deepPartialDiff(expectedValue, actualValue, fieldPath));
  }

  return diffs;
}

/** Convert a DB rule row (camelCase) to an engine RuleDefinition (snake_case). */
export function dbRuleToDefinition(r: any): RuleDefinition {
  return {
    dsl_version: r.dslVersion,
    rule_id: r.ruleId,
    name: r.name,
    module: r.module,
    status: r.status,
    priority: r.priority,
    effective_from: r.effectiveFrom,
    effective_to: r.effectiveTo,
    supersedes: r.supersedes as string[],
    notes: r.notes ?? undefined,
    inputs: r.inputs as any[],
    parameter_refs: r.parameterRefs as any[],
    decision_table: r.decisionTable as any,
    outputs: r.outputs as any[],
    examples: r.examples as any[],
    evidence: r.evidence as any[],
  };
}

/**
 * Load the effective rules + flattened params from the DB for a given date.
 * Shared by runTest (single) and runDbTestSuite (batch) so both run the engine
 * identically.
 *
 * 规则按"规则集声明顺序"排序，使内存编排 (orchestrateInMemory) 与生产 orchestrate()
 * 的执行顺序一致——规则输出会喂给后续规则，执行顺序对结果有意义。
 */
export async function loadEffectiveEngine(asOfDate?: string): Promise<{
  allRules: RuleDefinition[];
  baseParams: Record<string, unknown>;
}> {
  const date = asOfDate ?? new Date().toISOString().split("T")[0];
  const ruleSetId = "RS-SHANGHAI-PLAN-V1";
  const policyPackId = "SHANGHAI_BASE";

  const [{ ruleSet, rules: dbRules }, dbParams] = await Promise.all([
    getEffectiveRules(ruleSetId, date),
    getEffectiveParams(policyPackId, date),
  ]);

  let allRules: RuleDefinition[] = dbRules.map(dbRuleToDefinition);

  const order = (ruleSet?.rules as string[] | undefined) ?? [];
  if (order.length > 0) {
    const pos = new Map(order.map((id, i) => [id, i] as const));
    allRules = [...allRules].sort(
      (a, b) =>
        (pos.get(a.rule_id) ?? Number.MAX_SAFE_INTEGER) -
        (pos.get(b.rule_id) ?? Number.MAX_SAFE_INTEGER),
    );
  }

  const baseParams: Record<string, unknown> = {};
  for (const p of dbParams) {
    const paramId = (p as any).paramId;
    const type = (p as any).type;
    if (type === "table" || type === "timeline") {
      baseParams[paramId] = (p as any).rows ?? [];
    } else {
      baseParams[paramId] = (p as any).value;
    }
  }

  return { allRules, baseParams };
}

/**
 * Run a single test from DB data (used by API route).
 */
export async function runTest(opts: {
  ruleId?: string;
  input: Record<string, unknown>;
  paramsOverride: Record<string, unknown>;
  expected: Record<string, unknown>;
}): Promise<TestResult> {
  const { allRules, baseParams } = await loadEffectiveEngine();
  const testCase: TestCase = {
    rule_id: opts.ruleId ?? null,
    input: opts.input,
    params_override: opts.paramsOverride,
    expected: opts.expected,
  };
  return runTestCase(testCase, allRules, baseParams);
}

/**
 * Re-run a batch of DB-persisted tests *freshly* against the current rules/params
 * and return the aggregate pass-rate. Used by the staging→production publish gate
 * so promotion never trusts a stale `lastRunResult`.
 *
 * `options.overrideRules` 把"正在被晋升的规则"叠加进有效规则集（按 rule_id 覆盖/追加）。
 * 这很关键：getEffectiveRules 只返回 published 规则，而被晋升的规则此刻还是 staging，
 * 若不叠加，门禁要么找不到该规则（全测失败 → 永远无法晋升），要么拿旧 published 版本
 * 充数（给出虚假信心）。
 */
export async function runDbTestSuite(
  cases: Array<{
    ruleId?: string | null;
    name?: string;
    input: Record<string, unknown>;
    paramsOverride?: Record<string, unknown> | null;
    expected: Record<string, unknown>;
  }>,
  options?: { overrideRules?: RuleDefinition[] },
): Promise<ReturnType<typeof runTestSuite>> {
  const { allRules, baseParams } = await loadEffectiveEngine();

  let rules = allRules;
  const overrides = options?.overrideRules ?? [];
  if (overrides.length > 0) {
    const byId = new Map(overrides.map((r) => [r.rule_id, r] as const));
    rules = allRules.map((r) => byId.get(r.rule_id) ?? r);
    for (const r of overrides) {
      if (!allRules.some((x) => x.rule_id === r.rule_id)) rules.push(r);
    }
  }

  const testCases: TestCase[] = cases.map((c) => ({
    rule_id: c.ruleId ?? null,
    name: c.name,
    input: c.input as Record<string, any>,
    params_override: c.paramsOverride ?? null,
    expected: c.expected,
  }));
  return runTestSuite(testCases, rules, baseParams);
}
