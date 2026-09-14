/**
 * NRP-AC-004 / NRP-FR-008/FR-011（四川510000）黄金测试（零数据库依赖）。
 * - 继承国家baseline的退休/养老/失业口径；
 * - 医保退休年限：四川省级统一文件尚处征求意见状态（不可作为事实源），
 *   R-220守卫行进入needs_agent——这正是PRD §10"政策含义存在合理歧义时
 *   停止自动流程"的黄金表达；
 * - 有效期：SC缴费基数参数2025年度窗口外失效；
 * - 地区隔离：SC语料不含上海/广东实体。
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  executeSingleRuleInMemory,
  orchestrateInMemory,
} from "@/lib/engine/orchestrator";
import { mergePolicyContext, type MergeInputEntity } from "@/server/modules/policy/domain/overlay";
import type { RuleDefinition } from "@/types/engine";

const CN_DIR = path.join(process.cwd(), "dsl/regions/cn_dsl_v1");
const SC_DIR = path.join(process.cwd(), "dsl/regions/sichuan_dsl_v1");

interface ExampleTest {
  rule_id: string;
  example_name: string;
  input: Record<string, unknown>;
  params_override?: Record<string, unknown> | null;
  expected: Record<string, unknown>;
}

type PackFile = {
  params: Array<{
    param_id: string;
    type: string;
    value?: unknown;
    effective_from?: string;
    effective_to?: string | null;
    rows?: unknown[];
  }>;
  tables: Array<{
    param_id: string;
    type: string;
    value?: unknown;
    effective_from?: string;
    effective_to?: string | null;
    rows?: unknown[];
  }>;
};

function loadRules(dir: string): RuleDefinition[] {
  return readdirSync(path.join(dir, "rules"))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map(
      (f) =>
        JSON.parse(readFileSync(path.join(dir, "rules", f), "utf8")) as RuleDefinition,
    );
}

function loadPack(dir: string): PackFile {
  const packPath =
    dir === CN_DIR
      ? path.join(dir, "params/policy_params_cn_baseline.json")
      : path.join(dir, "params/policy_params_sichuan_base.json");
  return JSON.parse(readFileSync(packPath, "utf8"));
}

function flatten(pack: PackFile): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of [...pack.params, ...pack.tables]) {
    out[p.param_id] =
      p.type === "table" || p.type === "timeline" ? (p.rows ?? []) : p.value;
  }
  return out;
}

function deepPartialDiff(
  expected: unknown,
  actual: unknown,
  path = "",
): string[] {
  const diffs: string[] = [];
  if (expected === null || expected === undefined) {
    if (actual !== expected) diffs.push(path || "root");
    return diffs;
  }
  if (typeof expected !== "object") {
    if (expected !== actual) {
      diffs.push(`${path || "root"}: ${JSON.stringify(expected)} vs ${JSON.stringify(actual)}`);
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
    diffs.push(...deepPartialDiff(v, (actual as Record<string, unknown>)[k], path ? `${path}.${k}` : k));
  }
  return diffs;
}

describe("四川overlay黄金（NRP-AC-004，零数据库依赖）", () => {
  const cnRules = loadRules(CN_DIR);
  const scRules = loadRules(SC_DIR);
  const cnPack = loadPack(CN_DIR);
  const scPack = loadPack(SC_DIR);
  const baseParams = { ...flatten(cnPack), ...flatten(scPack) };

  for (const testCase of (
    JSON.parse(
      readFileSync(path.join(SC_DIR, "tests/rule_examples_as_tests.json"), "utf8"),
    ) as { tests: ExampleTest[] }
  ).tests) {
    it(`SC example: ${testCase.rule_id} — ${testCase.example_name}`, () => {
      const rule = [...cnRules, ...scRules].find(
        (r) => r.rule_id === testCase.rule_id,
      );
      expect(rule).toBeTruthy();
      const mergedParams = { ...structuredClone(baseParams) };
      const input = testCase.input as Record<string, unknown>;
      if (input.params && typeof input.params === "object") {
        Object.assign(mergedParams, input.params);
      }
      if (testCase.params_override) {
        Object.assign(mergedParams, testCase.params_override);
      }
      const inputAny = input as Record<string, unknown>;
      const ctx: Record<string, unknown> = {
        user: inputAny.user ?? {},
        params: mergedParams,
        calc: inputAny.calc ?? {},
        plan: inputAny.plan ?? {},
      };
      const result = executeSingleRuleInMemory(rule!, ctx);
      const actual = {
        user: result.ctx.user ?? {},
        calc: result.ctx.calc ?? {},
        plan: result.ctx.plan ?? {},
      };
      expect(deepPartialDiff(testCase.expected, actual)).toEqual([]);
    });
  }

  it("有效期：SC缴费基数参数2025年度有效、2026-01-01起失效（测试矩阵·有效期）", () => {
    const chain = ["CN", "510000"];
    const toEntity = (p: Record<string, unknown>): MergeInputEntity => ({
      businessKey: p.param_id as string,
      jurisdictionCode: "510000",
      packId: "SC-BASE",
      version: 1,
      payload: p,
      operation: "add",
      targetBusinessKey: null,
      effectiveFrom: p.effective_from as string,
      effectiveTo: (p.effective_to as string | undefined) ?? null,
    });
    const scEntities = [...scPack.params, ...scPack.tables].map(toEntity);
    const cnEntities = [
      ...(cnPack.params as Array<Record<string, unknown>>).map((p) => ({
        businessKey: p.param_id as string,
        jurisdictionCode: "CN",
        packId: "CN-BASELINE",
        version: 1,
        payload: p,
        operation: "baseline" as const,
        targetBusinessKey: null,
        effectiveFrom: (p.effective_from as string) ?? "2025-01-01",
        effectiveTo: (p.effective_to as string | undefined) ?? null,
      })),
    ];
    const inWindow = mergePolicyContext(
      [...cnEntities, ...scEntities],
      chain,
      "2025-06-01",
    );
    expect(
      inWindow.entities.find((e) => e.businessKey === "P-SC-CONTRIB-BASE-UPPER"),
    ).toBeTruthy();

    const afterWindow = mergePolicyContext(
      [...cnEntities, ...scEntities],
      chain,
      "2026-01-01",
    );
    expect(
      afterWindow.entities.find((e) => e.businessKey === "P-SC-CONTRIB-BASE-UPPER"),
    ).toBeUndefined();
  });

  it("完整编排：四川口径（医保年限未定→needs_agent，其余继承国家）", () => {
    const result = orchestrateInMemory(
      cnRules,
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
      }),
      "2026-01-01",
    );
    const calc = result.calc as Record<string, Record<string, unknown>>;
    // 退休与养老继承国家口径。
    expect(calc.retirement.legal_retire_age_years).toBe(61);
    expect(calc.retirement.legal_retire_age_months).toBe(4);
    expect(calc.pension.min_years_required).toBe(16);
    expect(calc.pension.gap_months).toBe(72);
    // 医保退休年限省级统一文件未印发 → R-220守卫行要求人工确认（PRD §10）。
    expect(result.calc.needs_agent).toBe(true);
    expect(
      (result.calc.warnings as Array<{ warning_id?: string }>).some(
        (w) => w.warning_id === "W-MI-LOCAL-YEARS-MISSING",
      ),
    ).toBe(true);
  });

  it("地区隔离：SC语料不含上海/广东实体（NRP-AC-004）", () => {
    const scRuleIds = new Set([...cnRules, ...scRules].map((r) => r.rule_id));
    expect(scRuleIds.has("R-500-4050-ELIGIBILITY")).toBe(false);
    expect(scRuleIds.has("R-GD-MI-RETIRE-RESTRICT")).toBe(false);
    const scParams = Object.keys(baseParams);
    expect(scParams).not.toContain("P-GD-CONTRIB-BASE-UPPER");
    expect(scParams).not.toContain("P-SH-MIN-WAGE");
  });
});
