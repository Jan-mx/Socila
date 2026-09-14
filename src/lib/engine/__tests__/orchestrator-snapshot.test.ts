/**
 * 任务3（JRP-FR-008/AC-004/005）：快照驱动规则引擎执行专用测试（零数据库依赖）。
 *
 * - `snapshotRulesToDefinitions` / `snapshotParamsToFlat` / `orchestrateSnapshot`
 *   从快照成员 payload（DB行形状）还原有序规则与参数并确定性执行（JRP-FR-008）；
 * - 广东2030年前缺参：needs_agent=true + W-MI-LOCAL-YEARS-MISSING，养老/缴费
 *   基数/最低工资/失业资格/期限/金额等其他模块结果保留（执行要求6、JRP-AC-005）；
 * - 2030-01-01起省级男30年、女25年自动进入有效集合（执行要求7）；
 * - 广东失业金额只由任务2快照规则（R-GD-UI-AMOUNT，最低工资×90%）计算，
 *   用例代码不重写公式（执行要求8）。
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  orchestrateSnapshot,
  snapshotRulesToDefinitions,
  snapshotParamsToFlat,
  type SnapshotRuleRow,
  type SnapshotParamRow,
} from "@/lib/engine/orchestrator";
import type { RuleDefinition } from "@/types/engine";

const CN_DIR = path.join(process.cwd(), "dsl/regions/cn_dsl_v1");
const GD_DIR = path.join(process.cwd(), "dsl/regions/guangdong_dsl_v1");

function loadRules(dir: string): RuleDefinition[] {
  return readdirSync(path.join(dir, "rules"))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map(
      (f) =>
        JSON.parse(readFileSync(path.join(dir, "rules", f), "utf8")) as RuleDefinition,
    );
}

type PackEntry = {
  param_id: string;
  type: string;
  value?: unknown;
  effective_from?: string;
  effective_to?: string | null;
  rows?: unknown[];
};

function loadPackEntries(dir: string): PackEntry[] {
  const packPath =
    dir === CN_DIR
      ? path.join(dir, "params/policy_params_cn_baseline.json")
      : path.join(dir, "params/policy_params_guangdong_base.json");
  const pack = JSON.parse(readFileSync(packPath, "utf8")) as {
    params?: PackEntry[];
    tables?: PackEntry[];
  };
  return [...(pack.params ?? []), ...(pack.tables ?? [])];
}

/** 把 DSL 规则转成"快照成员 payload"（DB 行形状：camelCase）。 */
function toRuleRows(defs: RuleDefinition[]): SnapshotRuleRow[] {
  return defs.map((def) => ({
    ruleId: def.rule_id!,
    name: def.name,
    module: def.module ?? "",
    dslVersion: def.dsl_version,
    status: "published",
    priority: def.priority ?? 0,
    effectiveFrom: def.effective_from ?? "2024-01-01",
    effectiveTo: def.effective_to ?? null,
    supersedes: def.supersedes ?? [],
    inputs: def.inputs ?? [],
    parameterRefs: def.parameter_refs ?? [],
    decisionTable: def.decision_table,
    outputs: def.outputs ?? [],
    examples: def.examples ?? [],
    evidence: def.evidence ?? [],
    version: 1,
  }));
}

/** 把 DSL 参数转成"快照成员 payload"（DB 行形状），并按 asOf 过滤有效窗口。 */
function toParamRows(
  entries: PackEntry[],
  asOfDate: string,
  packId: string,
): SnapshotParamRow[] {
  return entries
    .filter((e) => {
      const from = e.effective_from ?? "2024-01-01";
      if (asOfDate < from) return false;
      if (e.effective_to && asOfDate > e.effective_to) return false;
      return true;
    })
    .map((e) => ({
      paramId: e.param_id,
      type: e.type,
      value: e.value,
      rows: e.rows,
      effectiveFrom: e.effective_from ?? "2024-01-01",
      effectiveTo: e.effective_to ?? null,
      policyPackId: packId,
      version: 1,
    }));
}

/** GD 快照的执行顺序来自快照规则集成员 payload 的 rules 数组。 */
function snapshotRuleOrder(): string[] {
  const rs = JSON.parse(
    readFileSync(
      path.join(GD_DIR, "rule_sets/rule_set_guangdong_plan_v1.json"),
      "utf8",
    ),
  ) as { rules: string[]; rule_set_id: string; version: number };
  return rs.rules;
}

const CN_DEFS = loadRules(CN_DIR);
const GD_DEFS = loadRules(GD_DIR);
const CN_ENTRIES = loadPackEntries(CN_DIR);
const GD_ENTRIES = loadPackEntries(GD_DIR);

/** 可执行规则 = CN 全部 + GD 非元数据规则（restrict 只是 overlay 元数据不执行）。 */
const EXECUTABLE = [...CN_DEFS, ...GD_DEFS].filter(
  (r) => !r.rule_id?.startsWith("R-GD-MI-RETIRE-RESTRICT"),
);

const GD_USER = {
  basic: {
    gender: "male",
    birth_year: 1965,
    birth_month: 1,
    birth_date: "1965-01-15",
  },
  profile: { claim_city: "广州" },
  status: { employment_status: "unemployed" },
  social: { unemployment_insurance_years: 3, medical_contrib_months: 120 },
};

describe("快照成员还原（JRP-FR-008）", () => {
  it("成员payload规则行 → RuleDefinition：关键字段逐项映射（R-010）", () => {
    const def = CN_DEFS.find((r) => r.rule_id === "R-010-PARSE-BIRTH-YEAR")!;
    const rows = toRuleRows([def]);
    const out = snapshotRulesToDefinitions(rows);
    expect(out).toHaveLength(1);
    expect(out[0].rule_id).toBe("R-010-PARSE-BIRTH-YEAR");
    expect(out[0].decision_table).toEqual(def.decision_table);
    expect(out[0].parameter_refs).toEqual(def.parameter_refs ?? []);
    expect(out[0].module).toBe(def.module);
  });

  it("成员payload参数行 → flatParams：标量与表类型（JRP-FR-008）", () => {
    const rows = toParamRows(
      GD_ENTRIES.filter((e) =>
        ["P-GD-UNEMPLOYMENT-BENEFIT-RATE", "T-GD-MIN-WAGE-BY-CITY"].includes(
          e.param_id,
        ),
      ),
      "2026-09-01",
      "GD-BASE",
    );
    const flat = snapshotParamsToFlat(rows);
    expect(flat["P-GD-UNEMPLOYMENT-BENEFIT-RATE"]).toBe(0.9);
    expect(Array.isArray(flat["T-GD-MIN-WAGE-BY-CITY"])).toBe(true);
  });
});

describe("快照驱动编排（JRP-AC-004/005）", () => {
  it("广东2030年前快照成员：整体成功，needs_agent=true、W-MI-LOCAL-YEARS-MISSING、医保退休结论为空，其他模块结果保留（执行要求6）", () => {
    const asOf = "2026-09-01";
    const rules = toRuleRows(EXECUTABLE);
    const params = toParamRows(GD_ENTRIES, asOf, "GD-BASE").concat(
      toParamRows(CN_ENTRIES, asOf, "CN-BASELINE"),
    );
    // 2030年前快照不得包含 P-MI-LIFETIME-*（参数窗口自2030-01-01起）。
    const flat = snapshotParamsToFlat(params);
    expect(flat["P-MI-LIFETIME-MALE-YEARS"]).toBeUndefined();

    const result = orchestrateSnapshot({
      user: GD_USER,
      asOfDate: asOf,
      ruleSet: { ruleSetId: "RS-GD-PLAN-V1", rules: snapshotRuleOrder(), version: 2 },
      rules,
      params,
    });

    // 请求整体成功：plan/calc 完整返回。
    expect(result.calc).toBeDefined();
    // 能力级缺参：needs_agent=true（契约语义）+ 稳定 warning。
    expect(result.calc.needs_agent).toBe(true);
    const warnings = ((result.calc.warnings as Array<{ warning_id?: string }>) ?? []).map(
      (w) => w.warning_id,
    );
    expect(warnings).toContain("W-MI-LOCAL-YEARS-MISSING");
    // 医保退休年限结论为空。
    expect(
      (result.calc.mi as Record<string, unknown> | undefined)
        ?.lifetime_gap_months,
    ).toBeFalsy();
    // 其他模块继续计算：养老退休日期、缴费基数、失业资格/期限/金额保留。
    const calc = result.calc as Record<string, unknown>;
    expect(
      (calc.retirement as Record<string, unknown> | undefined)
        ?.legal_retire_date,
    ).toBeTruthy();
    const unemployment = (calc.unemployment as Record<string, unknown> | undefined) ?? {};
    expect(unemployment.eligible).toBe(true);
    expect(unemployment.duration_months).toBeTruthy();
    // 失业保险金金额由任务2快照规则计算（广州最低工资2680×90%=2412），任务3未重写公式。
    expect(unemployment.monthly_amount_est).toBe(2412);
  });

  it("2030-01-01起省级男30年/女25年参数进入有效集合，R-220不再触发能力级缺参（执行要求7）", () => {
    const asOf = "2030-01-01";
    const rules = toRuleRows(EXECUTABLE);
    const params = toParamRows(GD_ENTRIES, asOf, "GD-BASE").concat(
      toParamRows(CN_ENTRIES, asOf, "CN-BASELINE"),
    );
    const flat = snapshotParamsToFlat(params);
    expect(flat["P-MI-LIFETIME-MALE-YEARS"]).toBe(30);

    const result = orchestrateSnapshot({
      user: { ...GD_USER, social: { ...GD_USER.social, medical_contrib_months: 120 } },
      asOfDate: asOf,
      ruleSet: { ruleSetId: "RS-GD-PLAN-V1", rules: snapshotRuleOrder(), version: 2 },
      rules,
      params,
    });

    // 男30年：已缴120月（10年），缺口 = 360 - 120 = 240；省级统一参数生效。
    const mi = (result.calc.mi as Record<string, unknown>) ?? {};
    expect(mi.lifetime_required_months).toBe(360);
    expect(mi.lifetime_gap_months).toBe(240);
    // 参数齐全后 R-220 不再产生缺参 warning（needs_agent 可能仍由其他
    // 用户输入缺失触发，但不得来自 W-MI-LOCAL-YEARS-MISSING）。
    const warnings = ((result.calc.warnings as Array<{ warning_id?: string }>) ?? []).map(
      (w) => w.warning_id,
    );
    expect(warnings).not.toContain("W-MI-LOCAL-YEARS-MISSING");
  });

  it("失业待遇只透传用户确认领取地市：快照规则计算金额，无 claim_city 时 needs_agent 且金额为空（执行要求8）", () => {
    const asOf = "2026-09-01";
    const rules = toRuleRows(EXECUTABLE);
    const params = toParamRows(GD_ENTRIES, asOf, "GD-BASE").concat(
      toParamRows(CN_ENTRIES, asOf, "CN-BASELINE"),
    );

    const withoutCity = orchestrateSnapshot({
      user: { ...GD_USER, profile: {} },
      asOfDate: asOf,
      ruleSet: { ruleSetId: "RS-GD-PLAN-V1", rules: snapshotRuleOrder(), version: 2 },
      rules,
      params,
    });
    const unemployment = (withoutCity.calc.unemployment as Record<string, unknown>) ?? {};
    expect(withoutCity.calc.needs_agent).toBe(true);
    expect(unemployment.monthly_amount_est).toBeFalsy();

    const withCity = orchestrateSnapshot({
      user: { ...GD_USER, profile: { claim_city: "深圳" } },
      asOfDate: asOf,
      ruleSet: { ruleSetId: "RS-GD-PLAN-V1", rules: snapshotRuleOrder(), version: 2 },
      rules,
      params,
    });
    expect(
      (withCity.calc.unemployment as Record<string, unknown>).monthly_amount_est,
    ).toBe(2430); // 深圳 2700×0.9，公式来自快照参数与任务2规则
  });
});