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
      const inputAny = input as Record<string, any>;
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
    const toEntity = (p: Record<string, any>): MergeInputEntity => ({
      businessKey: p.param_id,
      jurisdictionCode: "440000",
      packId: "GD-BASE",
      version: 1,
      payload: p,
      operation: "add",
      targetBusinessKey: null,
      effectiveFrom: p.effective_from,
      effectiveTo: p.effective_to ?? null,
    });
    const gdEntities = [...gdPack.params, ...gdPack.tables].map(toEntity);
    const cnEntities = [
      ...(cnPack.params as Array<Record<string, any>>).map((p) => ({
        businessKey: p.param_id,
        jurisdictionCode: "CN",
        packId: "CN-BASELINE",
        version: 1,
        payload: p,
        operation: "baseline" as const,
        targetBusinessKey: null,
        effectiveFrom: p.effective_from ?? "2025-01-01",
        effectiveTo: p.effective_to ?? null,
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

    const afterWindow = mergePolicyContext(
      [...cnEntities, ...gdEntities],
      chain,
      "2025-07-01",
    );
    expect(
      afterWindow.entities.find((e) => e.businessKey === "P-GD-CONTRIB-BASE-UPPER"),
    ).toBeUndefined();
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
