/**
 * NRP-AC-001 / NRP-FR-005 / NRP-FR-015：国家baseline黄金测试（零数据库依赖）。
 * 直接从 dsl/regions/cn_dsl_v1 装载规则与参数，在内存中执行引擎：
 * - tests/rule_examples_as_tests.json 的全部用例（单规则模式）；
 * - 完整规则集编排场景（归一化→退休→养老→医保→失业→模板→门禁）。
 * 通过条件：通过率100%（NRP测试矩阵"黄金"行）。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  executeSingleRuleInMemory,
  orchestrateInMemory,
} from "@/lib/engine/orchestrator";
import type { RuleDefinition } from "@/types/engine";

const CN_DIR = path.join(process.cwd(), "dsl/regions/cn_dsl_v1");

interface ExampleTest {
  rule_id: string;
  example_name: string;
  input: Record<string, unknown>;
  params_override?: Record<string, unknown> | null;
  expected: Record<string, unknown>;
}

function loadCnRules(): RuleDefinition[] {
  const manifest = JSON.parse(
    readFileSync(path.join(CN_DIR, "rules_manifest.json"), "utf8"),
  ) as { rules: Array<{ rule_id: string; file: string }> };
  return manifest.rules.map(
    (e) =>
      JSON.parse(
        readFileSync(path.join(CN_DIR, "rules", e.file), "utf8"),
      ) as RuleDefinition,
  );
}

function flattenParams(packFile: {
  params: Array<{ param_id: string; type: string; value?: unknown; rows?: unknown[] }>;
  tables: Array<{ param_id: string; type: string; rows?: unknown[] }>;
}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of packFile.params ?? []) {
    out[p.param_id] =
      p.type === "table" || p.type === "timeline" ? (p.rows ?? []) : p.value;
  }
  for (const t of packFile.tables ?? []) {
    out[t.param_id] = t.rows ?? [];
  }
  return out;
}

function deepPartialDiff(
  expected: unknown,
  actual: unknown,
  path: string,
): string[] {
  const diffs: string[] = [];
  if (expected === null || expected === undefined) {
    if (actual !== expected) diffs.push(`${path || "root"}`);
    return diffs;
  }
  if (typeof expected !== "object") {
    if (expected !== actual) {
      diffs.push(
        `${path || "root"}: ${JSON.stringify(expected)} vs ${JSON.stringify(actual)}`,
      );
    }
    return diffs;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      diffs.push(`${path || "root"}: array vs non-array`);
      return diffs;
    }
    for (let i = 0; i < expected.length; i++) {
      diffs.push(...deepPartialDiff(expected[i], actual?.[i], `${path}[${i}]`));
    }
    return diffs;
  }
  if (typeof actual !== "object" || actual === null) {
    diffs.push(`${path || "root"}: obj vs non-obj`);
    return diffs;
  }
  for (const [k, v] of Object.entries(expected as Record<string, unknown>)) {
    diffs.push(
      ...deepPartialDiff(v, (actual as Record<string, unknown>)[k], path ? `${path}.${k}` : k),
    );
  }
  return diffs;
}

describe("CN baseline golden (NRP-AC-001/FR-015, in-memory)", () => {
  const rules = loadCnRules();
  const baseParams = flattenParams(
    JSON.parse(
      readFileSync(
        path.join(CN_DIR, "params/policy_params_cn_baseline.json"),
        "utf8",
      ),
    ),
  );
  const cases = (
    JSON.parse(
      readFileSync(path.join(CN_DIR, "tests/rule_examples_as_tests.json"), "utf8"),
    ) as { tests: ExampleTest[] }
  ).tests;

  it("每条CN基线规则至少有一个黄金用例且全部通过", () => {
    expect(rules.length).toBe(16);
    const coveredRuleIds = new Set(cases.map((c) => c.rule_id));
    // R-011/R-700 由完整编排场景覆盖（无独立单规则用例）。
    for (const ruleId of [
      "R-010-PARSE-BIRTH-YEAR",
      "R-012-NORMALIZE-GENDER",
      "R-020-FEMALE-RETIRE-TYPE",
      "R-110-LOOKUP-LEGAL-RETIRE-AGE",
      "R-115-FLEXIBLE-RETIREMENT",
      "R-120-COMPUTE-RETIRE-DATE",
      "R-200-MIN-PENSION-YEARS",
      "R-210-PENSION-GAP",
      "R-220-MEDICAL-LIFETIME-GAP",
      "R-300-MI-GAP-MONTHS",
      "R-400-UNEMPLOYMENT-ELIGIBILITY",
      "R-410-UNEMPLOYMENT-DURATION",
      "R-420-UI-MEDICAL-COVERAGE",
      "R-900-FINAL-GATE",
    ]) {
      expect(coveredRuleIds.has(ruleId), `${ruleId} 缺少黄金用例`).toBe(true);
    }
  });

  for (const testCase of cases) {
    it(`example: ${testCase.rule_id} — ${testCase.example_name}`, () => {
      const rule = rules.find((r) => r.rule_id === testCase.rule_id);
      expect(rule, `规则 ${testCase.rule_id} 不在CN baseline中`).toBeTruthy();
      const mergedParams = structuredClone(baseParams);
      if (
        testCase.input.params &&
        typeof testCase.input.params === "object"
      ) {
        Object.assign(
          mergedParams,
          structuredClone(testCase.input.params as Record<string, unknown>),
        );
      }
      if (
        testCase.params_override &&
        typeof testCase.params_override === "object"
      ) {
        Object.assign(
          mergedParams,
          structuredClone(testCase.params_override),
        );
      }
      const input = testCase.input as Record<string, unknown>;
      const ctx: Record<string, unknown> = {
        user: (input.user as Record<string, unknown>) ?? {},
        params: mergedParams,
        calc: (input.calc as Record<string, unknown>) ?? {},
        plan: (input.plan as Record<string, unknown>) ?? {},
      };
      const result = executeSingleRuleInMemory(rule!, ctx);
      const actual = {
        user: result.ctx.user ?? {},
        calc: result.ctx.calc ?? {},
        plan: result.ctx.plan ?? {},
      };
      const diffs = deepPartialDiff(testCase.expected, actual, "");
      expect(diffs, diffs.join("; ")).toEqual([]);
    });
  }

  it("完整编排：1970男职工在职（国家口径全链路）", () => {
    const ordered = [...rules];
    const result = orchestrateInMemory(
      ordered,
      structuredClone(baseParams),
      structuredClone({
        basic: {
          gender: "male",
          birth_year: 1970,
          birth_date: "1970-06-15",
        },
        status: { employment_status: "employed" },
        social: {
          pension_contrib_months: 120,
          medical_contrib_months: 100,
          unemployment_insurance_years: 3,
        },
        // 地区未提供医保退休年限时，国家口径进入人工确认（FR-008框架语义）。
        mi: {},
      }),
      "2026-01-01",
    );
    const calc = result.calc as Record<string, Record<string, unknown>>;
    // 渐进式延迟退休：1970年6月男 → 61岁4个月（办法第一条节奏）。
    expect(calc.retirement.legal_retire_age_years).toBe(61);
    expect(calc.retirement.legal_retire_age_months).toBe(4);
    // 退休年份2031 → 最低缴费年限16年（办法第二条时间线）。
    expect(calc.pension.min_years_required).toBe(16);
    // 已缴120月 → 缺口72月。
    expect(calc.pension.gap_months).toBe(72);
    // 医保退休年限缺地区参数 → R-220守卫行要求人工确认（国家框架+地区参数语义）。
    expect(result.calc.needs_agent).toBe(true);
    expect(
      (result.calc.warnings as Array<{ warning_id?: string }>).some(
        (w) => w.warning_id === "W-MI-LOCAL-YEARS-MISSING",
      ),
    ).toBe(true);
  });
});
