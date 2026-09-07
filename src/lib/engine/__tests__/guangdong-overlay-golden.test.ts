/**
 * NRP-AC-003 / NRP-FR-008/FR-009 / NRP测试矩阵（黄金/有效期/地区隔离）：
 * 广东省440000权威overlay黄金测试（零数据库依赖）。
 * - 示例用例：广东医保退休年限（2030统一口径）与继承国家baseline的核心场景；
 * - 链式合并：R-220的GD restrict overlay挂载限制与provenance（NRP-AC-005）；
 * - 有效期：GD缴费基数参数在有效窗口内外分别存在/消失；
 * - 完整编排：GD参数覆盖国家框架的语义（30年口径）。
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
const GD_DIR = path.join(process.cwd(), "dsl/regions/guangdong_dsl_v1");

interface ExampleTest {
  rule_id: string;
  example_name: string;
  input: Record<string, unknown>;
  params_override?: Record<string, unknown> | null;
  expected: Record<string, unknown>;
}

function loadRules(dir: string): RuleDefinition[] {
  return readdirSync(path.join(dir, "rules"))
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map(
      (f) =>
        JSON.parse(readFileSync(path.join(dir, "rules", f), "utf8")) as RuleDefinition,
    );
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

function loadPack(dir: string): PackFile {
  const packPath =
    dir === CN_DIR
      ? path.join(dir, "params/policy_params_cn_baseline.json")
      : path.join(dir, "params/policy_params_guangdong_base.json");
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

describe("广东overlay黄金（NRP-AC-003/005，零数据库依赖）", () => {
  const cnRules = loadRules(CN_DIR);
  const gdRules = loadRules(GD_DIR);
  const cnPack = loadPack(CN_DIR);
  const gdPack = loadPack(GD_DIR);
  const baseParams = { ...flatten(cnPack), ...flatten(gdPack) };

  // GD restrict实体不进入可执行规则序列（它只是overlay元数据）。
  const executableRules = cnRules.filter((r) => r.rule_id !== "R-GD-MI-RETIRE-RESTRICT");
  const restrictEntity = gdRules.find((r) => r.rule_id === "R-GD-MI-RETIRE-RESTRICT");

  it("GD restrict实体存在且显式指向国家R-220（NRP-FR-007）", () => {
    expect(restrictEntity).toBeTruthy();
    expect((restrictEntity as unknown as { operation: string }).operation).toBe("restrict");
    expect(
      (restrictEntity as unknown as { target_business_key: string }).target_business_key,
    ).toBe("R-220-MEDICAL-LIFETIME-GAP");
  });

  for (const testCase of (
    JSON.parse(
      readFileSync(path.join(GD_DIR, "tests/rule_examples_as_tests.json"), "utf8"),
    ) as { tests: ExampleTest[] }
  ).tests) {
    it(`GD example: ${testCase.rule_id} — ${testCase.example_name}`, () => {
      const rule = [...cnRules, ...gdRules].find(
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

  it("链式合并：GD restrict挂载到R-220且provenance记录操作与目标键（NRP-AC-005）", () => {
    const chain = ["CN", "440000"];
    const entities: MergeInputEntity[] = [
      ...cnRules.map((r) => ({
        businessKey: r.rule_id!,
        jurisdictionCode: "CN",
        packId: "CN-BASELINE",
        version: 1,
        payload: r,
        operation: "baseline" as const,
        targetBusinessKey: null,
        effectiveFrom: "2024-01-01",
        effectiveTo: null,
      })),
      {
        businessKey: "R-GD-MI-RETIRE-RESTRICT",
        jurisdictionCode: "440000",
        packId: "GD-OVERLAY",
        version: 1,
        payload: restrictEntity,
        operation: "restrict",
        targetBusinessKey: "R-220-MEDICAL-LIFETIME-GAP",
        effectiveFrom: "2022-07-01",
        effectiveTo: null,
      },
    ];
    const merged = mergePolicyContext(entities, chain, "2030-06-01");
    expect(merged.conflicts).toEqual([]);
    const r220 = merged.entities.find(
      (e) => e.businessKey === "R-220-MEDICAL-LIFETIME-GAP",
    );
    expect(r220).toBeTruthy();
    expect(r220!.restrictions).toHaveLength(1);
    const restriction = r220!.restrictions[0] as {
      decision_table: { restriction: { restriction_id: string } };
    };
    expect(restriction.decision_table.restriction.restriction_id).toBe(
      "RES-GD-MI-LOCAL-ACTUAL-YEARS",
    );
    expect(r220!.provenance.map((p) => p.operation)).toEqual([
      "baseline",
      "restrict",
    ]);
    expect(r220!.provenance[1].targetBusinessKey).toBe("R-220-MEDICAL-LIFETIME-GAP");
  });

  it("有效期：GD缴费基数参数在2024窗口内有效、2025-07-01起失效（测试矩阵·有效期）", () => {
    const chain = ["CN", "440000"];
    const toEntity = (p: Record<string, unknown>): MergeInputEntity => ({
      businessKey: p.param_id as string,
      jurisdictionCode: "440000",
      packId: "GD-BASE",
      version: 1,
      payload: p,
      operation: "add",
      targetBusinessKey: null,
      effectiveFrom: p.effective_from as string,
      effectiveTo: (p.effective_to as string | undefined) ?? null,
    });
    const gdEntities = [...gdPack.params, ...gdPack.tables].map(toEntity);
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
      [...cnEntities, ...gdEntities],
      chain,
      "2024-12-01",
    );
    expect(
      inWindow.entities.find((e) => e.businessKey === "P-GD-CONTRIB-BASE-UPPER"),
    ).toBeTruthy();

    // 2025-07-01起新窗口生效（粤人社发〔2025〕32号已编码）。
    const afterWindow = mergePolicyContext(
      [...cnEntities, ...gdEntities],
      chain,
      "2025-07-01",
    );
    const upper2025 = afterWindow.entities.find(
      (e) => e.businessKey === "P-GD-CONTRIB-BASE-UPPER",
    );
    expect(upper2025).toBeTruthy();
    expect((upper2025!.payload as { value?: unknown }).value).toBe(27549);
    // 2030统一的医保年限参数不受影响。
    expect(
      afterWindow.entities.find(
        (e) => e.businessKey === "P-MI-LIFETIME-MALE-YEARS",
      ),
    ).toBeUndefined(); // 2030-01-01前无效——2025-07-01时尚未生效
  });

  it("完整编排：广东口径男性（GD 30年医保年限覆盖）", () => {
    const ordered = executableRules;
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
      }),
      "2030-06-01",
    );
    const calc = result.calc as Record<string, Record<string, unknown>>;
    // 渐进式延迟退休继承国家口径。
    expect(calc.retirement.legal_retire_age_years).toBe(61);
    expect(calc.retirement.legal_retire_age_months).toBe(4);
    // GD医保年限30年（2030口径）→ 要求360月，缺口260月。
    expect(calc.mi.lifetime_required_months).toBe(360);
    expect(calc.mi.lifetime_gap_months).toBe(260);
  });

  it("2025窗口：缴费基数上限27549、下限分档5510/4775（粤人社发〔2025〕32号）", () => {
    const chain = ["CN", "440000"];
    const toEntity = (p: Record<string, unknown>): MergeInputEntity => ({
      businessKey: p.param_id as string,
      jurisdictionCode: "440000",
      packId: "GD-BASE",
      version: 1,
      payload: p,
      operation: "add",
      targetBusinessKey: null,
      effectiveFrom: p.effective_from as string,
      effectiveTo: (p.effective_to as string | undefined) ?? null,
    });
    const gdEntities = [...gdPack.params, ...gdPack.tables].map(toEntity);
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
    const merged = mergePolicyContext([...cnEntities, ...gdEntities], chain, "2025-07-01");
    expect(merged.conflicts).toEqual([]);
    const upper = merged.entities.find(
      (e) => e.businessKey === "P-GD-CONTRIB-BASE-UPPER",
    );
    expect(upper).toBeTruthy();
    expect((upper!.payload as { value?: unknown }).value).toBe(27549);
    const lower = merged.entities.find(
      (e) => e.businessKey === "T-GD-CONTRIB-BASE-LOWER-BY-CITY",
    );
    expect(lower).toBeTruthy();
    const rows = (lower!.payload as { rows?: unknown[] }).rows as Array<
      Record<string, unknown>
    >;
    expect(rows).toEqual(
      expect.arrayContaining([
        { city_group: "guangzhou_province_direct", base_lower: 5510 },
        { city_group: "other_cities", base_lower: 4775 },
      ]),
    );
  });

  it("有效期边界：2025-06-30旧窗口27501，2025-07-01起新窗口27549", () => {
    const chain = ["CN", "440000"];
    const toEntity = (p: Record<string, unknown>): MergeInputEntity => ({
      businessKey: p.param_id as string,
      jurisdictionCode: "440000",
      packId: "GD-BASE",
      version: 1,
      payload: p,
      operation: "add",
      targetBusinessKey: null,
      effectiveFrom: p.effective_from as string,
      effectiveTo: (p.effective_to as string | undefined) ?? null,
    });
    const gdEntities = [...gdPack.params, ...gdPack.tables].map(toEntity);
    const mergedOld = mergePolicyContext([...gdEntities], chain, "2025-06-30");
    const oldUpper = mergedOld.entities.find(
      (e) => e.businessKey === "P-GD-CONTRIB-BASE-UPPER",
    );
    expect((oldUpper!.payload as { value?: unknown }).value).toBe(27501);
    const mergedNew = mergePolicyContext([...gdEntities], chain, "2025-07-01");
    const newUpper = mergedNew.entities.find(
      (e) => e.businessKey === "P-GD-CONTRIB-BASE-UPPER",
    );
    expect((newUpper!.payload as { value?: unknown }).value).toBe(27549);
  });

  it("计发基数：P-GD-PENSION-CALC-BASE-2025=9493（2025年度，深圳另行公布）", () => {
    const chain = ["CN", "440000"];
    const toEntity = (p: Record<string, unknown>): MergeInputEntity => ({
      businessKey: p.param_id as string,
      jurisdictionCode: "440000",
      packId: "GD-BASE",
      version: 1,
      payload: p,
      operation: "add",
      targetBusinessKey: null,
      effectiveFrom: p.effective_from as string,
      effectiveTo: (p.effective_to as string | undefined) ?? null,
    });
    const gdEntities = [...gdPack.params, ...gdPack.tables].map(toEntity);
    const inYear = mergePolicyContext([...gdEntities], chain, "2025-06-15");
    const calcBase = inYear.entities.find(
      (e) => e.businessKey === "P-GD-PENSION-CALC-BASE-2025",
    );
    expect(calcBase).toBeTruthy();
    expect((calcBase!.payload as { value?: unknown }).value).toBe(9493);
    const afterYear = mergePolicyContext([...gdEntities], chain, "2026-01-01");
    expect(
      afterYear.entities.find((e) => e.businessKey === "P-GD-PENSION-CALC-BASE-2025"),
    ).toBeUndefined();
  });

  it("最低工资分档（粤府函〔2026〕188号）：2026-09-01起广州2680/深圳2700/珠海2300/汕头2040", () => {
    const chain = ["CN", "440000"];
    const toEntity = (p: Record<string, unknown>): MergeInputEntity => ({
      businessKey: p.param_id as string,
      jurisdictionCode: "440000",
      packId: "GD-BASE",
      version: 1,
      payload: p,
      operation: "add",
      targetBusinessKey: null,
      effectiveFrom: p.effective_from as string,
      effectiveTo: (p.effective_to as string | undefined) ?? null,
    });
    const gdEntities = [...gdPack.params, ...gdPack.tables].map(toEntity);
    const inEffect = mergePolicyContext([...gdEntities], chain, "2026-09-01");
    const minWage = inEffect.entities.find(
      (e) => e.businessKey === "T-GD-MIN-WAGE-BY-CITY",
    );
    expect(minWage).toBeTruthy();
    const rows = (minWage!.payload as { rows?: unknown[] }).rows as Array<
      Record<string, unknown>
    >;
    expect(rows).toEqual(
      expect.arrayContaining([
        { city: "广州", tier: "一", monthly: 2680, hourly: 25.4 },
        { city: "深圳", tier: "一", monthly: 2700, hourly: 25.4 },
        { city: "珠海", tier: "二", monthly: 2300, hourly: 21.9 },
        { city: "汕头", tier: "三", monthly: 2040, hourly: 20.2 },
      ]),
    );
    const before = mergePolicyContext([...gdEntities], chain, "2026-08-31");
    expect(
      before.entities.find((e) => e.businessKey === "T-GD-MIN-WAGE-BY-CITY"),
    ).toBeUndefined();
  });

  it("失业保险金标准率：P-GD-UNEMPLOYMENT-BENEFIT-RATE=0.9（条例第十九条）", () => {
    const chain = ["CN", "440000"];
    const toEntity = (p: Record<string, unknown>): MergeInputEntity => ({
      businessKey: p.param_id as string,
      jurisdictionCode: "440000",
      packId: "GD-BASE",
      version: 1,
      payload: p,
      operation: "add",
      targetBusinessKey: null,
      effectiveFrom: p.effective_from as string,
      effectiveTo: (p.effective_to as string | undefined) ?? null,
    });
    const gdEntities = [...gdPack.params, ...gdPack.tables].map(toEntity);
    const merged = mergePolicyContext([...gdEntities], chain, "2025-01-12");
    const rate = merged.entities.find(
      (e) => e.businessKey === "P-GD-UNEMPLOYMENT-BENEFIT-RATE",
    );
    expect(rate).toBeTruthy();
    expect((rate!.payload as { value?: unknown }).value).toBe(0.9);
  });

  it("地区隔离：上海不出现GD restrict，GD不出现上海补贴规则（NRP-AC-003/004）", () => {
    // GD链合并后不含上海实体（上海规则根本不在GD语料中，由装载保证）。
    const gdRuleIds = new Set([...cnRules, ...gdRules].map((r) => r.rule_id));
    expect(gdRuleIds.has("R-500-4050-ELIGIBILITY")).toBe(false);
    expect(gdRuleIds.has("R-310-MI-WAITING-PERIOD")).toBe(false);
    // 上海的黄金语料不含GD restrict实体（由golden-fixtures仅装CN+SH保证）。
    const shRules = loadRules(path.join(process.cwd(), "dsl/regions/shanghai_dsl_v1"));
    expect(
      shRules.find((r) => r.rule_id === "R-GD-MI-RETIRE-RESTRICT"),
    ).toBeUndefined();
    expect(shRules.find((r) => r.rule_id === "R-GD-UI-AMOUNT")).toBeUndefined();
  });

  // ── ADR-0010任务2：广东首期能力边界 ────────────────────────────────────────

  /** 按asOf解析CN+GD继承链的有效参数（mergePolicyContext窗口语义，
   * 与生产getEffectiveParams一致：2030年前省级医保年限参数不生效）。 */
  function effectiveGdParams(asOf: string): Record<string, unknown> {
    const chain = ["CN", "440000"];
    const toEntity = (
      p: Record<string, unknown>,
      jurisdictionCode: string,
      packId: string,
    ): MergeInputEntity => ({
      businessKey: p.param_id as string,
      jurisdictionCode,
      packId,
      version: 1,
      payload: p,
      operation: jurisdictionCode === "CN" ? "baseline" : "add",
      targetBusinessKey: null,
      effectiveFrom: p.effective_from as string,
      effectiveTo: (p.effective_to as string | undefined) ?? null,
    });
    const cnEntities = [...cnPack.params, ...cnPack.tables].map((p) =>
      toEntity(p, "CN", "CN-BASELINE"),
    );
    const gdEntities = [...gdPack.params, ...gdPack.tables].map((p) =>
      toEntity(p, "440000", "GD-BASE"),
    );
    const merged = mergePolicyContext(
      [...cnEntities, ...gdEntities],
      chain,
      asOf,
    );
    if (merged.conflicts.length > 0) {
      throw new Error(
        `[effectiveGdParams] 参数合并冲突：${JSON.stringify(merged.conflicts)}`,
      );
    }
    const flat: Record<string, unknown> = {};
    for (const e of merged.entities) {
      const payload = e.payload as Record<string, unknown>;
      flat[e.businessKey] =
        payload.type === "table" || payload.type === "timeline"
          ? (payload.rows ?? [])
          : payload.value;
    }
    return flat;
  }

  /** 广东编排（CN baseline + GD规则，含R-GD-UI-AMOUNT；restrict为元数据无执行行）。
   * 参数按asOf窗口解析——2030年前P-MI-LIFETIME-*不在有效集合。 */
  function gdOrchestrate(
    user: Record<string, unknown>,
    asOf: string,
  ): { calc: Record<string, unknown> } {
    const ordered = [...cnRules, ...gdRules];
    const result = orchestrateInMemory(
      ordered,
      effectiveGdParams(asOf),
      structuredClone(user),
      asOf,
    );
    return { calc: result.calc as Record<string, unknown> };
  }

  it("2030年前（2026-09-01）医保退休地市年限缺参：仅R-220产生needs_agent与W-MI-LOCAL-YEARS-MISSING，医保结论为空，养老/缴费基数/失业资格、期限与金额继续计算", () => {
    const { calc } = gdOrchestrate(
      {
        basic: { gender: "male", birth_year: 1970, birth_date: "1970-06-15" },
        status: { employment_status: "unemployed" },
        social: {
          pension_contrib_months: 120,
          medical_contrib_months: 100,
          unemployment_insurance_years: 3,
        },
        mi: { enroll_date: "2023-01-01", prev_end_date: "2022-12-01" },
        profile: { claim_city: "广州" },
      },
      "2026-09-01",
    );
    const mi = (calc.mi ?? {}) as Record<string, unknown>;
    const unemployment = (calc.unemployment ?? {}) as Record<string, unknown>;
    const warnings = (calc.warnings ?? []) as Array<{ warning_id: string }>;

    // 医保退休结论为空：省级男30/女25参数2030-01-01才生效，市级过渡期缺参。
    expect(mi.lifetime_required_months).toBeUndefined();
    expect(mi.lifetime_gap_months).toBeUndefined();
    // 仅R-220输出能力级守卫：needs_agent + W-MI-LOCAL-YEARS-MISSING。
    expect(calc.needs_agent).toBe(true);
    expect(
      warnings.some((w) => w.warning_id === "W-MI-LOCAL-YEARS-MISSING"),
    ).toBe(true);
    // 无其他MI模块warning（R-300/restrict不得产生MI类告警）。
    for (const w of warnings) {
      expect(w.warning_id.startsWith("W-MI")).toBe(
        w.warning_id === "W-MI-LOCAL-YEARS-MISSING",
      );
    }
    // 养老继续计算：退休年龄（1970男→61岁4个月）与最低缴费年限（2031退休→16年）。
    const retirement = (calc.retirement ?? {}) as Record<string, unknown>;
    expect(retirement.legal_retire_age_years).toBe(61);
    expect(retirement.legal_retire_age_months).toBe(4);
    const pension = (calc.pension ?? {}) as Record<string, unknown>;
    expect(pension.min_years_required).toBe(16);
    // 缴费基数（2025窗口27549）继续解析（窗口语义由effectiveGdParams保证）。
    expect(
      effectiveGdParams("2026-09-01")["P-GD-CONTRIB-BASE-UPPER"],
    ).toBe(27549);
    // 失业资格、期限与金额继续计算（广州最低工资2680×90%=2412）。
    expect(unemployment.eligible).toBe(true);
    expect(unemployment.duration_months).toBe(12);
    expect(unemployment.monthly_amount_est).toBe(2412);
  });

  it("2030-01-01起省级统一男30年、女25年：医保退休直接计算，不再进入人工确认", () => {
    const male = gdOrchestrate(
      {
        basic: { gender: "male", birth_year: 1970, birth_date: "1970-06-15" },
        status: { employment_status: "employed" },
        social: { pension_contrib_months: 120, medical_contrib_months: 100 },
        mi: { enroll_date: "2023-01-01", prev_end_date: "2022-12-01" },
      },
      "2030-01-01",
    );
    expect((male.calc.mi as Record<string, unknown>).lifetime_required_months).toBe(
      360,
    );
    expect((male.calc.mi as Record<string, unknown>).lifetime_gap_months).toBe(260);
    expect(male.calc.needs_agent).not.toBe(true);

    const female = gdOrchestrate(
      {
        basic: {
          gender: "female",
          female_retire_type: "worker50",
          birth_year: 1970,
          birth_date: "1970-06-15",
        },
        status: { employment_status: "employed" },
        social: { pension_contrib_months: 120, medical_contrib_months: 100 },
        mi: { enroll_date: "2023-01-01", prev_end_date: "2022-12-01" },
      },
      "2030-01-01",
    );
    expect(
      (female.calc.mi as Record<string, unknown>).lifetime_required_months,
    ).toBe(300);
    expect((female.calc.mi as Record<string, unknown>).lifetime_gap_months).toBe(
      200,
    );
    expect(female.calc.needs_agent).not.toBe(true);
  });

  it("边界：2029-12-31省级参数尚未生效→R-220守卫；2030-01-01生效→直接计算", () => {
    const user = {
      basic: { gender: "male", birth_year: 1970, birth_date: "1970-06-15" },
      status: { employment_status: "employed" },
      social: { pension_contrib_months: 120, medical_contrib_months: 100 },
      mi: { enroll_date: "2023-01-01", prev_end_date: "2022-12-01" },
    };
    const before = gdOrchestrate(structuredClone(user), "2029-12-31");
    expect(before.calc.needs_agent).toBe(true);
    expect(
      (before.calc.warnings as Array<{ warning_id: string }>).some(
        (w) => w.warning_id === "W-MI-LOCAL-YEARS-MISSING",
      ),
    ).toBe(true);
    const at = gdOrchestrate(structuredClone(user), "2030-01-01");
    expect(
      (at.calc.mi as Record<string, unknown>).lifetime_required_months,
    ).toBe(360);
    expect(at.calc.needs_agent).not.toBe(true);
  });

  it("失业金额规则：领取地市或最低工资缺失时needs_agent且不估算金额（不猜测）", () => {
    const missingCity = gdOrchestrate(
      {
        basic: { gender: "male", birth_year: 1970, birth_date: "1970-06-15" },
        status: { employment_status: "unemployed" },
        social: {
          pension_contrib_months: 120,
          medical_contrib_months: 100,
          unemployment_insurance_years: 3,
        },
        mi: { enroll_date: "2023-01-01", prev_end_date: "2022-12-01" },
      },
      "2026-09-01",
    );
    expect(missingCity.calc.needs_agent).toBe(true);
    expect(
      (missingCity.calc.unemployment as Record<string, unknown>)
        .monthly_amount_est,
    ).toBeUndefined();

    const unknownCity = gdOrchestrate(
      {
        basic: { gender: "male", birth_year: 1970, birth_date: "1970-06-15" },
        status: { employment_status: "unemployed" },
        social: {
          pension_contrib_months: 120,
          medical_contrib_months: 100,
          unemployment_insurance_years: 3,
        },
        mi: { enroll_date: "2023-01-01", prev_end_date: "2022-12-01" },
        profile: { claim_city: "未收录市" },
      },
      "2026-09-01",
    );
    expect(unknownCity.calc.needs_agent).toBe(true);
    expect(
      (unknownCity.calc.warnings as Array<{ warning_id: string }>).some(
        (w) => w.warning_id === "W-UI-MIN-WAGE-MISSING",
      ),
    ).toBe(true);
    expect(
      (unknownCity.calc.unemployment as Record<string, unknown>)
        .monthly_amount_est,
    ).toBeUndefined();
  });
});

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
