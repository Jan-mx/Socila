/**
 * SHV2-FR-008～016 / SHV2-AC-006～013 RCL-GEN-2.0 生成器契约（单元层，零数据库）。
 *
 * - 版本与UID：RCL-GEN-2.0、RPC/RPCT-<地区>-<场景键>-V2（SHV2-FR-008/§9.1）；
 * - 配额：36/18/18、每地区男女9/9、年龄段6/6/6、就业6/6/6、18个唯一组合（SHV2-AC-006）；
 * - 上海能力矩阵：六能力各3条且每能力employed/flexible/unemployed各1（SHV2-AC-007）；
 * - 能力专属断言：非退休能力至少断言一个自身能力输出（SHV2-FR-010）；
 * - 完整生日与女性口径（SHV2-FR-011/§8.5）；失业/灵活/补贴输入契约；
 * - 可读内容：case_text/标题/问题/回答非空、互异、含合成声明（SHV2-FR-012/AC-009）；
 * - 数值单源：文案数字只来自 input/expected/asOf/policySources（SHV2-FR-015/AC-011）；
 * - policySources完整且文档真实存在（SHV2-FR-014）；确定性重复生成（NFR-001）。
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  GENERATOR_VERSION_V2,
  SYNTHETIC_DISCLAIMER,
  generateShowcaseScenariosV2,
  buildCoverageManifestV2,
  buildScenarioTemplatesV2,
  recomputeScenarioContentHashV2,
  type GeneratedScenarioV2,
} from "../generator-v2";
import { computeExpectedInMemory } from "./engine-chain-v2";

const REPO_ROOT = process.cwd();

function generateAll(): Promise<GeneratedScenarioV2[]> {
  return generateShowcaseScenariosV2(computeExpectedInMemory);
}

function byRegion(all: GeneratedScenarioV2[], code: string): GeneratedScenarioV2[] {
  return all.filter((s) => s.jurisdictionCode === code);
}

function basicOf(s: GeneratedScenarioV2): Record<string, unknown> {
  return (s.input.basic ?? {}) as Record<string, unknown>;
}
function statusOf(s: GeneratedScenarioV2): Record<string, unknown> {
  return (s.input.status ?? {}) as Record<string, unknown>;
}
function socialOf(s: GeneratedScenarioV2): Record<string, unknown> {
  return (s.input.social ?? {}) as Record<string, unknown>;
}

const CAPABILITY_NAMESPACE: Record<string, string> = {
  retirement: "calc.retirement.",
  pension: "calc.pension.",
  medical: "calc.mi.",
  unemployment: "calc.unemployment.",
  flexible: "calc.flex.",
  subsidy: "calc.subsidy.",
  "mi-2030": "calc.mi.",
  "mi-2026-missing": "calc.needs_agent",
  "ui-amount": "calc.unemployment.",
  "claim-city-missing": "calc.unemployment.",
  "base-boundary": "calc.needs_agent",
};

// ─── SHV2-FR-008 版本与UID ────────────────────────────────────────────────

describe("SHV2-FR-008 生成器版本与V2 UID", () => {
  it("生成器版本固定为RCL-GEN-2.0", () => {
    expect(GENERATOR_VERSION_V2).toBe("RCL-GEN-2.0");
  });

  it("36条全部使用V2 UID：RPC/RPCT-<地区>-<场景键>-V2，不与V1混用", async () => {
    const all = await generateAll();
    expect(all).toHaveLength(36);
    for (const s of all) {
      expect(s.generatorVersion).toBe("RCL-GEN-2.0");
      expect(s.caseUid).toMatch(/^RPC-(310000|440000)-[A-Za-z0-9_-]+-V2$/);
      expect(s.testUid).toMatch(/^RPCT-(310000|440000)-[A-Za-z0-9_-]+-V2$/);
      expect(s.caseUid.endsWith("-V1")).toBe(false);
      expect(s.caseUid).toContain(`-${s.scenarioKey}-V2`);
    }
  });
});

// ─── SHV2-AC-006 总量与策展配额 ───────────────────────────────────────────

describe("SHV2-AC-006 总量与策展配额", () => {
  it("总计36条：上海18、广东18", async () => {
    const all = await generateAll();
    expect(byRegion(all, "310000")).toHaveLength(18);
    expect(byRegion(all, "440000")).toHaveLength(18);
  });

  it.each(["310000", "440000"] as const)("地区%s：男女9/9、三个年龄段各6、三种就业状态各6、18个唯一组合", async (code) => {
    const all = byRegion(await generateAll(), code);
    const count = (pred: (s: GeneratedScenarioV2) => boolean) => all.filter(pred).length;
    expect(count((s) => basicOf(s).gender === "male")).toBe(9);
    expect(count((s) => basicOf(s).gender === "female")).toBe(9);
    for (const band of ["before_1970", "1970_1979", "from_1980"]) {
      expect(count((s) => s.coverageObligations.includes(`band:${band}`)), band).toBe(6);
    }
    for (const st of ["employed", "flexible", "unemployed"]) {
      expect(count((s) => statusOf(s).employment_status === st), st).toBe(6);
    }
    const combos = new Set(
      all.map((s) => `${basicOf(s).gender}|${String(basicOf(s).birth_year)}|${statusOf(s).employment_status}`),
    );
    expect(combos.size).toBe(18);
    // 年龄带与出生年一致（coverageObligations不与input矛盾）。
    for (const s of all) {
      const y = basicOf(s).birth_year as number;
      const band = y < 1970 ? "before_1970" : y < 1980 ? "1970_1979" : "from_1980";
      expect(s.coverageObligations).toContain(`band:${band}`);
    }
  });
});

// ─── SHV2-AC-007 上海能力矩阵 ─────────────────────────────────────────────

describe("SHV2-AC-007 上海六能力矩阵", () => {
  it("六种能力各3条，且每能力employed/flexible/unemployed各1", async () => {
    const sh = byRegion(await generateAll(), "310000");
    const capabilities = ["retirement", "pension", "medical", "unemployment", "flexible", "subsidy"];
    for (const cap of capabilities) {
      const rows = sh.filter((s) => s.capability === cap);
      expect(rows, cap).toHaveLength(3);
      expect(new Set(rows.map((s) => statusOf(s).employment_status))).toEqual(
        new Set(["employed", "flexible", "unemployed"]),
      );
    }
  });

  it("矩阵符合PRD §8.2固定轮转（抽检：retirement-employed=男性before_1970、subsidy-unemployed=女性1970_1979）", async () => {
    const sh = byRegion(await generateAll(), "310000");
    const row = (cap: string, st: string) =>
      sh.find((s) => s.capability === cap && statusOf(s).employment_status === st);
    expect(row("retirement", "employed") && basicOf(row("retirement", "employed")!)).toMatchObject({
      gender: "male",
    });
    expect(row("retirement", "employed")!.coverageObligations).toContain("band:before_1970");
    const sub17 = row("subsidy", "unemployed")!;
    expect(basicOf(sub17)).toMatchObject({ gender: "female" });
    expect(sub17.coverageObligations).toContain("band:1970_1979");
  });
});

// ─── SHV2-FR-010 能力专属断言 ─────────────────────────────────────────────

describe("SHV2-FR-010 能力专属断言（引擎输出可比）", () => {
  it("每条上海能力场景至少断言一个自身能力路径，且该路径在引擎输出中真实存在", async () => {
    const sh = byRegion(await generateAll(), "310000");
    for (const s of sh) {
      const prefix = CAPABILITY_NAMESPACE[s.capability];
      const own = s.assertions.filter((a) => a.path.startsWith(prefix));
      expect(own.length, `${s.scenarioKey} 缺少自身能力断言（${prefix}）`).toBeGreaterThanOrEqual(1);
      for (const a of own) {
        expect(a.value, `${s.scenarioKey} ${a.path} 不可比（undefined）`).not.toBe(undefined);
      }
    }
  });

  it("非退休能力不得只断言calc.retirement.*（退休能力以外的全部场景检查）", async () => {
    const all = await generateAll();
    for (const s of all.filter((x) => x.capability !== "retirement")) {
      const nonRetirement = s.assertions.filter((a) => !a.path.startsWith("calc.retirement."));
      expect(nonRetirement.length, `${s.scenarioKey} 只有退休断言`).toBeGreaterThanOrEqual(1);
    }
  });

  it("退休场景断言法定退休年龄与日期；抽检1967-05男职工=60岁8个月/2028-01-12", async () => {
    const sh = byRegion(await generateAll(), "310000");
    for (const s of sh.filter((x) => x.capability === "retirement")) {
      const paths = s.assertions.map((a) => a.path);
      expect(paths).toContain("calc.retirement.legal_retire_age_years");
      expect(paths).toContain("calc.retirement.legal_retire_date");
    }
    const row = sh.find(
      (s) => s.capability === "retirement" && basicOf(s).birth_date === "1967-05-12",
    )!;
    const val = (p: string) => s_val(row, p);
    expect(val("calc.retirement.legal_retire_age_years")).toBe(60);
    expect(val("calc.retirement.legal_retire_age_months")).toBe(8);
    expect(val("calc.retirement.legal_retire_date")).toBe("2028-01-12");
  });

  it("上海失业（unemployed）场景断言三要素：资格、期限、阶段金额=2340/1872", async () => {
    const sh = byRegion(await generateAll(), "310000");
    const positives = sh.filter(
      (s) => s.capability === "unemployment" && statusOf(s).employment_status === "unemployed",
    );
    expect(positives).toHaveLength(1);
    const row = positives[0];
    expect(s_val(row, "calc.unemployment.eligible")).toBe(true);
    expect(s_val(row, "calc.unemployment.monthly_amount_est")).toBe(1872);
    expect(s_val(row, "calc.unemployment.benefit_stage")).toBe("13-24");
  });

  it("上海灵活就业（flexible）场景断言缴费三要素：7546基数→1509.2/754.6/2263.8", async () => {
    const sh = byRegion(await generateAll(), "310000");
    const row = sh.find(
      (s) => s.capability === "flexible" && statusOf(s).employment_status === "flexible",
    )!;
    expect(s_val(row, "calc.flex.applicable")).toBe(true);
    expect(s_val(row, "calc.flex.contrib_base")).toBe(7546);
    expect(s_val(row, "calc.flex.pension_monthly")).toBe(1509.2);
    expect(s_val(row, "calc.flex.medical_monthly")).toBe(754.6);
    expect(s_val(row, "calc.flex.total_monthly")).toBe(2263.8);
  });

  it("能力不适用于状态时验证不适用：employed/unemployed下flex.applicable=false、非失业失业金eligible=false（不伪造正向资格）", async () => {
    const sh = byRegion(await generateAll(), "310000");
    for (const s of sh.filter((x) => x.capability === "flexible" && statusOf(x).employment_status !== "flexible")) {
      expect(s_val(s, "calc.flex.applicable")).toBe(false);
    }
    for (const s of sh.filter((x) => x.capability === "unemployment" && statusOf(x).employment_status !== "unemployed")) {
      expect(s_val(s, "calc.unemployment.eligible")).toBe(false);
    }
  });

  it("上海补贴三场景分别断言4050/岗位补贴/大龄领金：金额与选择只来自引擎", async () => {
    const sh = byRegion(await generateAll(), "310000");
    const flexRow = sh.find((s) => s.capability === "subsidy" && statusOf(s).employment_status === "flexible")!;
    expect(s_val(flexRow, "calc.subsidy.4050_eligible")).toBe(true);
    expect(s_val(flexRow, "calc.subsidy.4050_amount_est")).toBe(1131.9);
    expect(s_val(flexRow, "calc.subsidy.selected_option")).toBe("4050");
    const empRow = sh.find((s) => s.capability === "subsidy" && statusOf(s).employment_status === "employed")!;
    expect(s_val(empRow, "calc.subsidy.job_eligible")).toBe(true);
    expect(s_val(empRow, "calc.subsidy.job_amount_est")).toBe(1370);
    expect(s_val(empRow, "calc.subsidy.selected_option")).toBe("job_subsidy");
    const unRow = sh.find((s) => s.capability === "subsidy" && statusOf(s).employment_status === "unemployed")!;
    expect(s_val(unRow, "calc.subsidy.older_ui_pension_fund_eligible")).toBe(true);
    expect(s_val(unRow, "calc.subsidy.selected_option")).toBe("older_ui_pension_fund");
  });

  it("上海医保三场景断言等待期与年限缺口：断缴6个月→等待6个月；连续缴费→等待0", async () => {
    const sh = byRegion(await generateAll(), "310000");
    const flexRow = sh.find((s) => s.capability === "medical" && statusOf(s).employment_status === "flexible")!;
    expect(s_val(flexRow, "calc.mi.waiting_period_months")).toBe(6);
    expect(s_val(flexRow, "calc.mi.waiting_required")).toBe(true);
    const empRow = sh.find((s) => s.capability === "medical" && statusOf(s).employment_status === "employed")!;
    expect(s_val(empRow, "calc.mi.lifetime_required_months")).toBe(180);
    const unRow = sh.find((s) => s.capability === "medical" && statusOf(s).employment_status === "unemployed")!;
    expect(s_val(unRow, "calc.mi.waiting_period_months")).toBe(0);
    expect(s_val(unRow, "calc.mi.waiting_required")).toBe(false);
  });
});

// ─── SHV2-FR-011 完整生日与人物输入契约 ───────────────────────────────────

describe("SHV2-FR-011 完整生日与人物输入契约（§8.5）", () => {
  it("全部36条提供一致完整生日：birth_date === birth_year-month-day 且断言退休日期的场景生日齐备", async () => {
    const all = await generateAll();
    for (const s of all) {
      const b = basicOf(s);
      expect(typeof b.birth_year).toBe("number");
      expect(typeof b.birth_month).toBe("number");
      expect(typeof b.birth_day).toBe("number");
      const mm = String(b.birth_month).padStart(2, "0");
      const dd = String(b.birth_day).padStart(2, "0");
      expect(b.birth_date, s.scenarioKey).toBe(`${b.birth_year}-${mm}-${dd}`);
    }
  });

  it("女性场景明确female_retire_type∈{worker50,cadre55}；男性不携带", async () => {
    const all = await generateAll();
    for (const s of all) {
      const b = basicOf(s);
      if (b.gender === "female") {
        expect(["worker50", "cadre55"]).toContain(b.female_retire_type);
      } else {
        expect(b.female_retire_type).toBeUndefined();
      }
    }
  });

  it("失业状态场景明确失业保险年限与领取阶段/已领月数及on_unemployment_benefit", async () => {
    const all = await generateAll();
    for (const s of all.filter((x) => statusOf(x).employment_status === "unemployed")) {
      const social = socialOf(s);
      expect(typeof social.unemployment_insurance_years, s.scenarioKey).toBe("number");
      expect(social.unemployment_insurance_years as number, s.scenarioKey).toBeGreaterThanOrEqual(1);
      const hasStage =
        typeof social.ui_benefit_stage === "string" || typeof social.ui_claimed_months === "number";
      expect(hasStage, `${s.scenarioKey} 缺少领取阶段/已领月数`).toBe(true);
      expect(typeof statusOf(s).on_unemployment_benefit, `${s.scenarioKey} 缺少领取状态`).toBe("boolean");
    }
  });

  it("灵活就业状态场景明确缴费基数（数值在当期上下限内或为明确边界示例）", async () => {
    const all = await generateAll();
    for (const s of all.filter((x) => statusOf(x).employment_status === "flexible")) {
      expect(typeof socialOf(s).flex_contrib_base, s.scenarioKey).toBe("number");
    }
  });

  it("上海补贴场景明确就业困难认定、距退休月数（与引擎退休日期一致）与领取/就业状态", async () => {
    const sh = byRegion(await generateAll(), "310000");
    for (const s of sh.filter((x) => x.capability === "subsidy")) {
      const subsidy = (s.input.subsidy ?? {}) as Record<string, unknown>;
      expect(typeof subsidy.has_employment_difficulty_cert, s.scenarioKey).toBe("boolean");
      expect(typeof subsidy.months_to_legal_retire, `${s.scenarioKey} 缺少距退休月数`).toBe("number");
      // 显式距退休月数必须与引擎按as-of与法定退休日期推导一致（不得凭空填写）。
      const asOf = s.asOfDate;
      const retireDate = String(s_val(s, "calc.retirement.legal_retire_date"));
      const [fy, fm] = asOf.split("-").map(Number);
      const [ty, tm] = retireDate.split("-").map(Number);
      expect(subsidy.months_to_legal_retire, s.scenarioKey).toBe((ty - fy) * 12 + (tm - fm));
    }
  });

  it("字段缺失必须needs_agent：去除就业困难认定的补贴输入使R-500产生needs_agent追问（不默认）", () => {
    const templates = buildScenarioTemplatesV2();
    const sub = templates.find(
      (t) => t.jurisdictionCode === "310000" && t.capability === "subsidy" &&
        (t.input.status as Record<string, unknown>).employment_status === "flexible",
    )!;
    const stripped = structuredClone(sub.input) as Record<string, unknown>;
    delete (stripped.subsidy as Record<string, unknown>).has_employment_difficulty_cert;
    const outcome = computeExpectedInMemory({
      jurisdictionCode: "310000",
      asOfDate: sub.asOfDate,
      input: stripped,
    });
    expect(outcome.calc.needs_agent).toBe(true);
    const questions = (outcome.calc.agent_questions ?? []) as Array<{ field: string }>;
    expect(questions.some((q) => q.field === "user.subsidy.has_employment_difficulty_cert")).toBe(true);
  });

  it("字段缺失必须needs_agent：去除失业金领取阶段的上海失业输入不估算金额", () => {
    const templates = buildScenarioTemplatesV2();
    const ui = templates.find(
      (t) => t.jurisdictionCode === "310000" && t.capability === "unemployment" &&
        (t.input.status as Record<string, unknown>).employment_status === "unemployed",
    )!;
    const stripped = structuredClone(ui.input) as Record<string, unknown>;
    const social = stripped.social as Record<string, unknown>;
    delete social.ui_benefit_stage;
    delete social.ui_claimed_months;
    const outcome = computeExpectedInMemory({
      jurisdictionCode: "310000",
      asOfDate: ui.asOfDate,
      input: stripped,
    });
    expect(outcome.calc.needs_agent).toBe(true);
    const un = outcome.calc.unemployment as Record<string, unknown>;
    expect(un.monthly_amount_est ?? null).toBeNull();
  });
});

// ─── SHV2-FR-012/AC-009 可读内容与合成披露 ────────────────────────────────

describe("SHV2-FR-012/AC-009 可读内容与合成披露", () => {
  it("36条case_text非空（≥200字）且包含合成声明、as-of计算时点与人物出生年", async () => {
    const all = await generateAll();
    for (const s of all) {
      expect(s.caseText.length, s.scenarioKey).toBeGreaterThanOrEqual(200);
      expect(s.caseText).toContain(SYNTHETIC_DISCLAIMER);
      expect(s.caseText).toContain(s.asOfDate);
      expect(s.caseText).toContain(String(basicOf(s).birth_year));
    }
  });

  it("36条标题/问题/回答全部非空且互不相同，均不使用V1占位文案", async () => {
    const all = await generateAll();
    const titles = new Set(all.map((s) => s.title));
    const questions = new Set(all.map((s) => s.userMessage));
    const answers = new Set(all.map((s) => s.aiResponse));
    expect(titles.size).toBe(36);
    expect(questions.size).toBe(36);
    expect(answers.size).toBe(36);
    for (const s of all) {
      expect(s.title.length, s.scenarioKey).toBeGreaterThan(6);
      expect(s.userMessage.length, s.scenarioKey).toBeGreaterThan(10);
      expect(s.aiResponse.length, s.scenarioKey).toBeGreaterThan(80);
      expect(s.title).not.toContain("RPC-");
      expect(s.userMessage).not.toBe("确定性模板生成的政策案例（无真实用户数据）");
      expect(s.aiResponse).not.toBe("由修复后的快照规划器计算期望");
      expect(s.title).not.toMatch(/^政策案例\s/);
      expect(s.aiResponse).toContain("合成");
    }
  });

  it("回答包含结论、个人条件、政策依据、缺失事项与合成免责结构（抽检上海退休与广东缺参场景）", async () => {
    const all = await generateAll();
    const sh = byRegion(all, "310000").find((s) => s.capability === "retirement")!;
    expect(sh.aiResponse).toContain("结论");
    expect(sh.aiResponse).toContain("政策依据");
    expect(sh.aiResponse).toContain("个人条件");
    expect(sh.aiResponse).toContain(SYNTHETIC_DISCLAIMER);
    const gdMissing = byRegion(all, "440000").find((s) => s.capability === "claim-city-missing")!;
    expect(gdMissing.aiResponse).toContain("需补充");
    expect(gdMissing.expected.needs_agent).toBe(true);
  });
});

// ─── SHV2-FR-015/AC-011 数值单源 ──────────────────────────────────────────

describe("SHV2-FR-015 数值单源", () => {
  function numericTokens(text: string): number[] {
    return (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  }
  function collectTokens(value: unknown, out: Set<number> = new Set()): Set<number> {
    if (typeof value === "number") {
      out.add(value);
    } else if (typeof value === "string") {
      for (const n of numericTokens(value)) out.add(n);
    } else if (Array.isArray(value)) {
      for (const v of value) collectTokens(v, out);
    } else if (value !== null && typeof value === "object") {
      for (const v of Object.values(value as Record<string, unknown>)) collectTokens(v, out);
    }
    return out;
  }

  it("文案中的每个数字都来自input/expected/asOfDate/policySources（36条全查）", async () => {
    const all = await generateAll();
    for (const s of all) {
      const allowed = new Set<number>();
      collectTokens(s.input, allowed);
      collectTokens(s.expected, allowed);
      collectTokens(s.asOfDate, allowed);
      collectTokens(s.policySources, allowed);
      collectTokens(s.tags, allowed);
      const text = [s.title, s.userMessage, s.aiResponse, s.caseText].join("\n");
      const tokens = numericTokens(text);
      const missing = [...new Set(tokens)].filter((n) => !allowed.has(n));
      expect(missing, `${s.scenarioKey} 出现无来源数字：${missing.join(",")}`).toEqual([]);
    }
  });

  it("expected只承载引擎输出：needs_agent/结论级别/警告/追问与calc命名空间全部可追溯到引擎结果", async () => {
    const templates = buildScenarioTemplatesV2();
    const all = await generateAll();
    for (let i = 0; i < all.length; i++) {
      const outcome = computeExpectedInMemory(templates[i]);
      const s = all[i];
      expect(s.expected.needs_agent, s.scenarioKey).toBe(outcome.calc.needs_agent === true);
      expect(s.expected.conclusion_level, s.scenarioKey).toBe(
        (outcome.plan.conclusion_level as string) ?? null,
      );
      for (const ns of ["retirement", "pension", "mi", "unemployment", "flex", "subsidy", "contribution"]) {
        const engineNs = outcome.calc[ns] as Record<string, unknown> | undefined;
        const expectedNs = s.expected[ns] as Record<string, unknown> | undefined;
        if (engineNs === undefined) {
          expect(expectedNs, `${s.scenarioKey}.${ns}`).toBeUndefined();
        } else {
          expect(expectedNs, `${s.scenarioKey}.${ns}`).toBeDefined();
          for (const [k, v] of Object.entries(expectedNs ?? {})) {
            expect(v, `${s.scenarioKey}.${ns}.${k}`).toBe(engineNs[k]);
          }
        }
      }
    }
  });
});

// ─── SHV2-FR-014 政策来源 ────────────────────────────────────────────────

describe("SHV2-FR-014 结构化政策来源", () => {
  it("每条案例≥1个来源；字段完整、SHA为64位hex、URL为https官方地址", async () => {
    const all = await generateAll();
    for (const s of all) {
      expect(s.policySources.length, s.scenarioKey).toBeGreaterThanOrEqual(1);
      for (const p of s.policySources) {
        expect(p.documentId, s.scenarioKey).toMatch(/^DOC-(SH|GD|CN)-[A-Z0-9-]+$/);
        expect(p.title.length).toBeGreaterThan(4);
        expect(p.authority.length).toBeGreaterThan(2);
        expect(p.officialUrl.startsWith("https://")).toBe(true);
        expect(typeof p.locator.type).toBe("string");
        expect(p.locator.reference.length).toBeGreaterThan(0);
        expect(p.excerpt.length).toBeGreaterThan(6);
        expect(p.contentSha256).toMatch(/^[0-9a-f]{64}$/);
      }
    }
  });

  it("上海政策来源（DOC-SH-*）全部落在启用白名单域名；国家级来源为DOC-CN-*；来源文档在仓库证据目录真实存在且SHA一致", async () => {
    const sh = byRegion(await generateAll(), "310000");
    const whitelist = new Set(["www.shanghai.gov.cn", "rsj.sh.gov.cn", "ybj.sh.gov.cn"]);
    let shanghaiSources = 0;
    for (const s of sh) {
      for (const p of s.policySources) {
        expect(p.documentId, `${s.scenarioKey} 上海案例不得引用其他地区文档`).toMatch(/^DOC-(SH|CN)-/);
        if (p.documentId.startsWith("DOC-SH-")) {
          shanghaiSources++;
          expect(whitelist.has(new URL(p.officialUrl).hostname), `${s.scenarioKey} ${p.documentId}`).toBe(true);
        }
      }
    }
    expect(shanghaiSources).toBeGreaterThan(0);
    // 文档真实存在：evidence目录（CN/310000/GD分层）含该docId的meta.json，且SHA与URL一致。
    const evidenceRoot = path.join(
      REPO_ROOT,
      "docs/refactor/policy-ops-agent/reports/stage-09-05-national-baseline-overlays/evidence",
    );
    const metaByDoc = new Map<string, { sha256?: string; officialUrl?: string; dir: string }>();
    const scan = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) scan(p);
        else if (e.name === "meta.json") {
          const meta = JSON.parse(readFileSync(p, "utf8")) as { docId?: string; sha256?: string; officialUrl?: string };
          if (meta.docId) metaByDoc.set(meta.docId, { ...meta, dir });
        }
      }
    };
    scan(evidenceRoot);
    const all = await generateAll();
    for (const s of all) {
      for (const p of s.policySources) {
        const meta = metaByDoc.get(p.documentId);
        expect(meta, `${s.scenarioKey} ${p.documentId} 缺证据目录/meta.json`).toBeDefined();
        expect(p.contentSha256, `${s.scenarioKey} ${p.documentId} SHA不一致`).toBe(meta!.sha256);
        expect(p.officialUrl, `${s.scenarioKey} ${p.documentId} URL不一致`).toBe(meta!.officialUrl);
        expect(existsSync(path.join(meta!.dir, "original.html")), `${p.documentId} 缺original.html`).toBe(true);
        expect(existsSync(path.join(meta!.dir, "extracted-text.txt")), `${p.documentId} 缺extracted-text.txt`).toBe(true);
      }
    }
  });

  it("来源与结论对应：上海失业金场景含DOC-SH-UI-BENEFIT-2026；灵活缴费含DOC-SH-FLEX-RATES；医保等待期含DOC-SH-MI-FLEX-WAITING-2025；广东失业金含DOC-GD-MINIMUM-WAGE-2026", async () => {
    const all = await generateAll();
    const docs = (s: GeneratedScenarioV2) => new Set(s.policySources.map((p) => p.documentId));
    const sh = byRegion(all, "310000");
    expect(docs(sh.find((s) => s.capability === "unemployment" && statusOf(s).employment_status === "unemployed")!)).toContain("DOC-SH-UI-BENEFIT-2026");
    expect(docs(sh.find((s) => s.capability === "flexible" && statusOf(s).employment_status === "flexible")!)).toContain("DOC-SH-FLEX-RATES");
    expect(docs(sh.find((s) => s.capability === "medical" && statusOf(s).employment_status === "flexible")!)).toContain("DOC-SH-MI-FLEX-WAITING-2025");
    expect(docs(byRegion(all, "440000").find((s) => s.capability === "ui-amount")!)).toContain("DOC-GD-MINIMUM-WAGE-2026");
  });

  it("广东不再使用泛化占位证据DOC-GD-POLICY-2026", async () => {
    const gd = byRegion(await generateAll(), "440000");
    for (const s of gd) {
      for (const p of s.policySources) {
        expect(p.documentId, s.scenarioKey).not.toBe("DOC-GD-POLICY-2026");
      }
    }
  });
});

// ─── §8.4 广东能力范围与as-of ────────────────────────────────────────────

describe("§8.4 广东能力范围与as-of日期", () => {
  it("覆盖五类既有能力：mi-2030/mi-2026-missing/ui-amount/claim-city-missing/base-boundary", async () => {
    const gd = byRegion(await generateAll(), "440000");
    const caps = new Set(gd.map((s) => s.capability));
    for (const cap of ["mi-2030", "mi-2026-missing", "ui-amount", "claim-city-missing", "base-boundary"]) {
      expect(caps.has(cap), cap).toBe(true);
    }
  });

  it("as-of：2030医保场景=2030-01-01，其余全部=2026-09-01", async () => {
    const all = await generateAll();
    for (const s of all) {
      if (s.jurisdictionCode === "440000" && s.capability === "mi-2030") {
        expect(s.asOfDate, s.scenarioKey).toBe("2030-01-01");
      } else {
        expect(s.asOfDate, s.scenarioKey).toBe("2026-09-01");
      }
    }
  });

  it("广东2030医保断言年限（男360月）；广州失业金2412；缺领取地市不估算金额", async () => {
    const gd = byRegion(await generateAll(), "440000");
    const maleRows = gd.filter(
      (s) => s.capability === "mi-2030" && basicOf(s).gender === "male",
    );
    expect(maleRows.length).toBeGreaterThanOrEqual(1);
    expect(s_val(maleRows[0], "calc.mi.lifetime_required_months")).toBe(360);
    const ui = gd.find((s) => s.capability === "ui-amount")!;
    expect((ui.input.profile as Record<string, unknown>).claim_city_code).toBe("440100");
    expect(s_val(ui, "calc.unemployment.monthly_amount_est")).toBe(2412);
    const missing = gd.find((s) => s.capability === "claim-city-missing")!;
    expect(((missing.input.profile ?? {}) as Record<string, unknown>).claim_city_code).toBeUndefined();
    expect(s_val(missing, "calc.needs_agent")).toBe(true);
    expect(s_val(missing, "calc.unemployment.eligible")).toBe(true);
    // 不估算金额：引擎不输出monthly_amount_est（expected中缺席/为空）。
    expect(s_val(missing, "calc.unemployment.monthly_amount_est") ?? null).toBeNull();
    expect(missing.assertions.some((x) => x.path === "calc.unemployment.monthly_amount_est" && x.operator === "eq")).toBe(false);
  });

  it("广东2026场景医保退休年限缺参：needs_agent=true且W-MI-LOCAL-YEARS-MISSING", async () => {
    const gd = byRegion(await generateAll(), "440000");
    for (const s of gd.filter((x) => x.asOfDate === "2026-09-01")) {
      const warnings = (s.expected.warnings ?? []) as string[];
      expect(warnings, s.scenarioKey).toContain("W-MI-LOCAL-YEARS-MISSING");
      expect(s.expected.needs_agent, s.scenarioKey).toBe(true);
    }
  });
});

// ─── topics/tags/category、快照、quality、确定性 ─────────────────────────

describe("标签、快照绑定、quality与确定性", () => {
  it("category与能力一致；topics/tags非空且包含地区与能力标签", async () => {
    const all = await generateAll();
    const categoryByCapability: Record<string, string> = {
      retirement: "退休",
      pension: "养老",
      medical: "医保",
      unemployment: "失业",
      flexible: "灵活就业",
      subsidy: "补贴",
      "mi-2030": "医保",
      "mi-2026-missing": "医保",
      "ui-amount": "失业",
      "claim-city-missing": "失业",
      "base-boundary": "缴费基数",
    };
    for (const s of all) {
      expect(s.category, s.scenarioKey).toBe(categoryByCapability[s.capability]);
      expect(s.topics.length).toBeGreaterThanOrEqual(2);
      expect(s.tags.length).toBeGreaterThanOrEqual(5);
      expect(s.tags.join("|"), s.scenarioKey).toMatch(/上海|广东/);
      expect(s.tags).toContain(`capability:${s.capability}`);
    }
  });

  it("每条绑定非空snapshotId与snapshotContentHash；quality总分>0且分解完整", async () => {
    const all = await generateAll();
    for (const s of all) {
      expect(s.snapshotId.length, s.scenarioKey).toBeGreaterThan(0);
      expect(s.snapshotContentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(s.quality.total, s.scenarioKey).toBeGreaterThan(0);
      expect(typeof s.quality.inputCompleteness).toBe("number");
      expect(typeof s.quality.coverageObligations).toBe("number");
      expect(typeof s.quality.snapshotReplay).toBe("number");
      expect(s.quality.reasons.length).toBeGreaterThan(0);
    }
  });

  it("重复生成两次逐字节一致（NFR-001）；contentHash为64位hex且重算一致", async () => {
    const a = await generateAll();
    const b = await generateAll();
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    for (const s of a) {
      expect(s.contentHash).toMatch(/^[0-9a-f]{64}$/);
      const { contentHash: _omit, ...rest } = s;
      void _omit;
      expect(recomputeScenarioContentHashV2(rest as GeneratedScenarioV2)).toBe(s.contentHash);
    }
  });

  it("覆盖manifest：36/18/18与manifestHash确定性", async () => {
    const all = await generateAll();
    const m1 = buildCoverageManifestV2(all);
    const m2 = buildCoverageManifestV2([...all].reverse());
    expect(m1.caseCount).toBe(36);
    expect(m1.shanghaiCount).toBe(18);
    expect(m1.guangdongCount).toBe(18);
    expect(m1.generatorVersion).toBe("RCL-GEN-2.0");
    expect(m1.manifestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(m1.manifestHash).toBe(m2.manifestHash);
  });

  it("生成器输出不携带transcript_text字段（转写保持NULL的责任在行投影）", async () => {
    const all = await generateAll();
    for (const s of all) {
      expect(s).not.toHaveProperty("transcriptText");
      expect(s).not.toHaveProperty("transcript_text");
    }
  });
});

// ─── 工具 ────────────────────────────────────────────────────────────────

function s_val(s: GeneratedScenarioV2, p: string): unknown {
  const a = s.assertions.find((x) => x.path === p);
  if (a) return a.value;
  let acc: unknown = s.expected;
  for (const key of p.replace(/^calc\./, "").split(".")) {
    if (acc === null || typeof acc !== "object") return undefined;
    acc = (acc as Record<string, unknown>)[key];
  }
  return acc;
}
