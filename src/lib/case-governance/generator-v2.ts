/**
 * RCL-GEN-2.0（SHV2 WI-20260911-02，SHV2-FR-008～016）确定性案例生成器。
 *
 * - 上海18条按PRD §8.2固定轮转矩阵：能力顺序×就业状态顺序，年龄段=(能力+状态) mod 3，
 *   性别=(能力+状态) mod 2（偶male/奇female），产生性别×年龄段×就业状态18个唯一组合；
 *   六能力各3条且每能力employed/flexible/unemployed各1；
 * - 每条能力至少断言一个自身能力输出（SHV2-FR-010）；断言值、expected全部取自注入的
 *   规则引擎结果（快照规划器或内存链路），`eq`断言路径在引擎输出中不存在→fail-closed抛错；
 * - 精确退休日期场景提供完整生日；女性明确female_retire_type；失业/灵活/补贴显式输入（§8.5）；
 * - 广东18条保持既有能力范围与as-of（2030医保场景2030-01-01），evidence替换为仓库已验证证据；
 * - 每条生成非空case_text、独立标题/问题/回答、topics/tags/category、完整policySources、
 *   snapshot绑定、quality与content hash、合成声明；transcript_text不属于生成器输出（保持NULL）。
 * - 相同模板+相同引擎结果重复生成逐字节一致（SHV2-NFR-001）。
 */
import { createHash } from "node:crypto";
import { canonicalJson } from "./hashes";
import { DSL_EXAMPLE_COUNT } from "./dsl-examples";
import { scoreCase, type ScoreBreakdown } from "./scoring";
import { classifyScenario } from "./multi-label";
import { compareReplayWithAssertions, type ScenarioAssertion } from "./replay";
import { resolvePolicySources } from "./dsl-evidence-index";
import { renderScenarioContent, type ScenarioDraftV2 } from "./case-content-v2";
import type { GeneratedScenario } from "./generator";
import type { PolicySource } from "@/lib/showcase/case-nature";
import { SYNTHETIC_CASE_LABEL, SYNTHETIC_DISCLAIMER } from "@/lib/showcase/labels";

export { SYNTHETIC_CASE_LABEL, SYNTHETIC_DISCLAIMER };

export const GENERATOR_VERSION_V2 = "RCL-GEN-2.0";

export const SHANGHAI_CAPABILITIES = [
  "retirement",
  "pension",
  "medical",
  "unemployment",
  "flexible",
  "subsidy",
] as const;
export type ShanghaiCapability = (typeof SHANGHAI_CAPABILITIES)[number];

export const GUANGDONG_CAPABILITIES = [
  "mi-2030",
  "mi-2026-missing",
  "ui-amount",
  "claim-city-missing",
  "base-boundary",
] as const;
export type GuangdongCapability = (typeof GUANGDONG_CAPABILITIES)[number];

export type CapabilityV2 = ShanghaiCapability | GuangdongCapability;

export type BirthYearBand = "before_1970" | "1970_1979" | "from_1980";
export type EmploymentStatus = "employed" | "flexible" | "unemployed";
type Gender = "male" | "female";

const BANDS: BirthYearBand[] = ["before_1970", "1970_1979", "from_1980"];
const STATUSES: EmploymentStatus[] = ["employed", "flexible", "unemployed"];

export interface AssertionSpec {
  path: string;
  operator: ScenarioAssertion["operator"];
}

export interface ScenarioTemplateV2 {
  jurisdictionCode: "310000" | "440000";
  scenarioKey: string;
  capability: CapabilityV2;
  asOfDate: string;
  input: Record<string, unknown>;
  coverageObligations: string[];
  assertionSpecs: AssertionSpec[];
  /** 结论实际依赖但未经断言路径映射的规则（restrict元数据、发出追问的规则）。 */
  sourceRuleIds?: string[];
  /** 结论实际依赖的参数（无规则消费时的边界口径来源）。 */
  sourceParamIds?: string[];
}

/** 规则引擎结果（快照规划器或内存链路统一形状）。 */
export interface EngineOutcomeV2 {
  snapshotId: string;
  snapshotContentHash: string;
  calc: Record<string, unknown>;
  plan: Record<string, unknown>;
  user: Record<string, unknown>;
}

export type ComputeExpectedV2 = (t: ScenarioTemplateV2) => EngineOutcomeV2 | Promise<EngineOutcomeV2>;

export interface GeneratedScenarioV2 extends ScenarioDraftV2 {
  title: string;
  userMessage: string;
  aiResponse: string;
  caseText: string;
  topics: string[];
  tags: string[];
  category: string;
  quality: ScoreBreakdown;
  contentHash: string;
}

// ─── 人物输入构造 ───────────────────────────────────────────────────────────

interface PersonaSpec {
  gender: Gender;
  y: number;
  m: number;
  d: number;
  femaleRetireType?: "worker50" | "cadre55";
  status: EmploymentStatus;
  onUnemploymentBenefit?: boolean;
  pensionMonths: number;
  medicalMonths: number;
  uiYears?: number;
  uiStage?: "1-12" | "13-24" | "extended";
  uiClaimedMonths?: number;
  flexBase?: number;
  cert?: boolean;
  monthsToRetire?: number;
  mi?: { prev_end_date: string; enroll_date: string };
  claimCityCode?: string;
  /** 上海链路R-600需要的个人确认（0=无补差月份）。 */
  monthsPaidAtOldBase?: number;
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function bandOf(year: number): BirthYearBand {
  if (year < 1970) return "before_1970";
  if (year < 1980) return "1970_1979";
  return "from_1980";
}

function buildInput(p: PersonaSpec): Record<string, unknown> {
  const basic: Record<string, unknown> = {
    gender: p.gender,
    birth_year: p.y,
    birth_month: p.m,
    birth_day: p.d,
    birth_date: iso(p.y, p.m, p.d),
  };
  if (p.gender === "female") {
    if (!p.femaleRetireType) throw new Error("女性人物必须明确female_retire_type（SHV2-FR-011）");
    basic.female_retire_type = p.femaleRetireType;
  }
  const status: Record<string, unknown> = { employment_status: p.status };
  if (p.onUnemploymentBenefit !== undefined) status.on_unemployment_benefit = p.onUnemploymentBenefit;
  const social: Record<string, unknown> = {
    pension_contrib_months: p.pensionMonths,
    medical_contrib_months: p.medicalMonths,
  };
  if (p.uiYears !== undefined) social.unemployment_insurance_years = p.uiYears;
  if (p.uiStage !== undefined) social.ui_benefit_stage = p.uiStage;
  if (p.uiClaimedMonths !== undefined) social.ui_claimed_months = p.uiClaimedMonths;
  if (p.flexBase !== undefined) social.flex_contrib_base = p.flexBase;
  if (p.monthsPaidAtOldBase !== undefined) social.months_paid_at_old_base = p.monthsPaidAtOldBase;
  const input: Record<string, unknown> = { basic, status, social };
  if (p.mi) input.mi = { prev_end_date: p.mi.prev_end_date, enroll_date: p.mi.enroll_date };
  if (p.cert !== undefined || p.monthsToRetire !== undefined) {
    const subsidy: Record<string, unknown> = {};
    if (p.cert !== undefined) subsidy.has_employment_difficulty_cert = p.cert;
    if (p.monthsToRetire !== undefined) subsidy.months_to_legal_retire = p.monthsToRetire;
    input.subsidy = subsidy;
  }
  if (p.claimCityCode !== undefined) input.profile = { claim_city_code: p.claimCityCode };
  return input;
}

function obligations(capability: string, band: BirthYearBand, status: EmploymentStatus, gender: Gender): string[] {
  return [`capability:${capability}`, `band:${band}`, `employment:${status}`, `gender:${gender}`];
}

// ─── 上海模板（PRD §8.2矩阵 + §8.3最低断言 + §8.5人物输入）─────────────────

const SH_AS_OF = "2026-09-01";
const SH_MI_CONTINUOUS = { prev_end_date: "2026-06-30", enroll_date: "2026-07-01" };

/**
 * 每个（能力，状态）格的人物设定。性别与年龄段由矩阵推导，出生年份必须落在推导年龄段内
 * （buildShanghaiTemplates断言校验）；上海链路对R-300/R-500/R-600需要的字段统一给出明确值，
 * 使确定性结论不被无关追问遮蔽；能力不适用的状态验证"不适用"输出而不伪造正向资格。
 */
const SH_PERSONAS: Record<string, Omit<PersonaSpec, "gender" | "status">> = {
  "retirement|employed": { y: 1967, m: 5, d: 12, pensionMonths: 300, medicalMonths: 280 },
  "retirement|flexible": { y: 1974, m: 10, d: 8, femaleRetireType: "cadre55", pensionMonths: 200, medicalMonths: 180, flexBase: 10000 },
  "retirement|unemployed": { y: 1983, m: 2, d: 25, onUnemploymentBenefit: true, pensionMonths: 120, medicalMonths: 100, uiYears: 6, uiStage: "1-12" },
  "pension|employed": { y: 1978, m: 7, d: 19, femaleRetireType: "cadre55", pensionMonths: 160, medicalMonths: 150 },
  "pension|flexible": { y: 1986, m: 11, d: 3, pensionMonths: 96, medicalMonths: 96, flexBase: 9000 },
  "pension|unemployed": { y: 1968, m: 4, d: 30, femaleRetireType: "worker50", onUnemploymentBenefit: true, pensionMonths: 168, medicalMonths: 150, uiYears: 8, uiClaimedMonths: 3 },
  "medical|employed": { y: 1981, m: 8, d: 14, pensionMonths: 120, medicalMonths: 120 },
  "medical|flexible": { y: 1969, m: 1, d: 22, femaleRetireType: "worker50", pensionMonths: 200, medicalMonths: 150, flexBase: 7546, mi: { prev_end_date: "2026-01-31", enroll_date: "2026-07-01" } },
  "medical|unemployed": { y: 1972, m: 12, d: 5, onUnemploymentBenefit: true, pensionMonths: 250, medicalMonths: 150, uiYears: 10, uiStage: "13-24", mi: { prev_end_date: "2026-05-31", enroll_date: "2026-08-01" } },
  "unemployment|employed": { y: 1966, m: 9, d: 9, femaleRetireType: "cadre55", pensionMonths: 360, medicalMonths: 360 },
  "unemployment|flexible": { y: 1977, m: 3, d: 28, pensionMonths: 200, medicalMonths: 200, flexBase: 8000 },
  "unemployment|unemployed": { y: 1988, m: 6, d: 17, femaleRetireType: "worker50", onUnemploymentBenefit: true, pensionMonths: 120, medicalMonths: 120, uiYears: 10, uiClaimedMonths: 14 },
  "flexible|employed": { y: 1979, m: 9, d: 30, pensionMonths: 220, medicalMonths: 220 },
  "flexible|flexible": { y: 1990, m: 4, d: 11, femaleRetireType: "worker50", pensionMonths: 100, medicalMonths: 100, flexBase: 7546 },
  "flexible|unemployed": { y: 1968, m: 8, d: 8, onUnemploymentBenefit: true, pensionMonths: 300, medicalMonths: 260, uiYears: 15, uiStage: "1-12" },
  "subsidy|employed": { y: 1984, m: 1, d: 16, femaleRetireType: "cadre55", pensionMonths: 140, medicalMonths: 140, cert: true, monthsToRetire: 184 },
  "subsidy|flexible": { y: 1969, m: 7, d: 7, pensionMonths: 320, medicalMonths: 300, flexBase: 7546, cert: true, monthsToRetire: 48 },
  "subsidy|unemployed": { y: 1971, m: 9, d: 2, femaleRetireType: "cadre55", onUnemploymentBenefit: true, pensionMonths: 300, medicalMonths: 280, uiYears: 12, uiStage: "13-24", cert: false, monthsToRetire: 6 },
};

const SH_ASSERTIONS: Record<string, AssertionSpec[]> = {
  "retirement|*": [
    { path: "calc.retirement.legal_retire_age_years", operator: "eq" },
    { path: "calc.retirement.legal_retire_age_months", operator: "eq" },
    { path: "calc.retirement.legal_retire_date", operator: "eq" },
  ],
  "pension|*": [
    { path: "calc.pension.min_years_required", operator: "eq" },
    { path: "calc.pension.gap_months", operator: "eq" },
    { path: "calc.pension.gap_years_ceil", operator: "eq" },
    { path: "calc.retirement.legal_retire_date", operator: "eq" },
  ],
  "medical|*": [
    { path: "calc.mi.lifetime_required_months", operator: "eq" },
    { path: "calc.mi.lifetime_gap_months", operator: "eq" },
    { path: "calc.mi.waiting_period_months", operator: "eq" },
    { path: "calc.mi.waiting_required", operator: "eq" },
  ],
  "unemployment|unemployed": [
    { path: "calc.unemployment.eligible", operator: "eq" },
    { path: "calc.unemployment.duration_months", operator: "eq" },
    { path: "calc.unemployment.benefit_stage", operator: "eq" },
    { path: "calc.unemployment.monthly_amount_est", operator: "eq" },
  ],
  "unemployment|*": [
    { path: "calc.unemployment.eligible", operator: "eq" },
    { path: "calc.unemployment.duration_months", operator: "eq" },
  ],
  "flexible|flexible": [
    { path: "calc.flex.applicable", operator: "eq" },
    { path: "calc.flex.contrib_base", operator: "eq" },
    { path: "calc.flex.pension_monthly", operator: "eq" },
    { path: "calc.flex.medical_monthly", operator: "eq" },
    { path: "calc.flex.total_monthly", operator: "eq" },
  ],
  "flexible|*": [{ path: "calc.flex.applicable", operator: "eq" }],
  "subsidy|employed": [
    { path: "calc.subsidy.job_eligible", operator: "eq" },
    { path: "calc.subsidy.job_amount_est", operator: "eq" },
    { path: "calc.subsidy.selected_option", operator: "eq" },
  ],
  "subsidy|flexible": [
    { path: "calc.subsidy.4050_eligible", operator: "eq" },
    { path: "calc.subsidy.4050_amount_est", operator: "eq" },
    { path: "calc.subsidy.selected_option", operator: "eq" },
  ],
  "subsidy|unemployed": [
    { path: "calc.subsidy.older_ui_pension_fund_eligible", operator: "eq" },
    { path: "calc.subsidy.selected_option", operator: "eq" },
  ],
};

function shAssertions(capability: string, status: EmploymentStatus): AssertionSpec[] {
  return SH_ASSERTIONS[`${capability}|${status}`] ?? SH_ASSERTIONS[`${capability}|*`] ?? [];
}

function buildShanghaiTemplates(): ScenarioTemplateV2[] {
  const templates: ScenarioTemplateV2[] = [];
  SHANGHAI_CAPABILITIES.forEach((capability, ci) => {
    STATUSES.forEach((status, si) => {
      const idx = ci + si;
      const band = BANDS[idx % 3];
      const gender: Gender = idx % 2 === 0 ? "male" : "female";
      const persona = SH_PERSONAS[`${capability}|${status}`];
      if (!persona) throw new Error(`缺少上海人物设定：${capability}|${status}`);
      if (bandOf(persona.y) !== band) {
        throw new Error(`上海人物 ${capability}|${status} 出生年份${persona.y}不在矩阵年龄段${band}`);
      }
      const spec: PersonaSpec = {
        ...persona,
        gender,
        status,
        mi: persona.mi ?? SH_MI_CONTINUOUS,
        monthsPaidAtOldBase: 0,
        cert: capability === "subsidy" ? persona.cert : false,
      };
      if (gender === "female" && !spec.femaleRetireType) spec.femaleRetireType = "worker50";
      if (gender === "male") delete spec.femaleRetireType;
      templates.push({
        jurisdictionCode: "310000",
        scenarioKey: `SH-${gender}-${band}-${status}-${capability.toUpperCase()}`,
        capability,
        asOfDate: SH_AS_OF,
        input: buildInput(spec),
        coverageObligations: obligations(capability, band, status, gender),
        assertionSpecs: shAssertions(capability, status),
      });
    });
  });
  return templates;
}

// ─── 广东模板（§8.4：保留既有能力范围与as-of；evidence替换为已验证证据）─────

const GD_AS_OF = "2026-09-01";
const GD_AS_OF_2030 = "2030-01-01";
const GD_YEARS: Record<BirthYearBand, number[]> = {
  before_1970: [1963, 1966, 1969],
  "1970_1979": [1971, 1975, 1979],
  from_1980: [1980, 1984, 1988],
};

function gdPersona(gender: Gender, band: BirthYearBand, status: EmploymentStatus, capability: GuangdongCapability): PersonaSpec {
  const si = STATUSES.indexOf(status);
  const gi = gender === "male" ? 0 : 1;
  const asOf2030 = capability === "mi-2030";
  const spec: PersonaSpec = {
    gender,
    y: GD_YEARS[band][si],
    m: 1 + ((si * 4 + gi * 2) % 12),
    d: 10 + si * 5 + gi,
    femaleRetireType: gender === "female" ? (status === "employed" ? "cadre55" : "worker50") : undefined,
    status,
    pensionMonths: 180,
    medicalMonths: 120,
    mi: asOf2030
      ? { prev_end_date: "2029-12-31", enroll_date: "2030-01-01" }
      : { prev_end_date: "2026-06-30", enroll_date: "2026-07-01" },
  };
  if (status === "unemployed") {
    spec.onUnemploymentBenefit = true;
    spec.uiYears = 3;
    spec.uiClaimedMonths = 2;
  }
  if (status === "flexible") {
    spec.flexBase = capability === "base-boundary" ? 4000 : 6000;
  }
  if (capability === "ui-amount") spec.claimCityCode = "440100";
  return spec;
}

function gdTemplate(gender: Gender, band: BirthYearBand, status: EmploymentStatus, capability: GuangdongCapability): ScenarioTemplateV2 {
  const persona = gdPersona(gender, band, status, capability);
  const obs = obligations(capability, band, status, gender);
  let asOfDate = GD_AS_OF;
  let assertionSpecs: AssertionSpec[] = [];
  let sourceRuleIds: string[] | undefined;
  let sourceParamIds: string[] | undefined;
  switch (capability) {
    case "ui-amount":
      if (status !== "unemployed") throw new Error("ui-amount 必须为失业状态");
      obs.push("ui-amount", "claim-city:valid-440100");
      assertionSpecs = [
        { path: "calc.unemployment.eligible", operator: "eq" },
        { path: "calc.unemployment.duration_months", operator: "eq" },
        { path: "calc.unemployment.monthly_amount_est", operator: "eq" },
      ];
      break;
    case "claim-city-missing":
      if (status !== "unemployed") throw new Error("claim-city-missing 必须为失业状态");
      obs.push("claim-city:missing");
      assertionSpecs = [
        { path: "calc.unemployment.eligible", operator: "eq" },
        { path: "calc.unemployment.duration_months", operator: "eq" },
        { path: "calc.needs_agent", operator: "eq" },
      ];
      sourceRuleIds = ["R-GD-UI-AMOUNT"];
      break;
    case "mi-2030":
      obs.push("mi-2030");
      asOfDate = GD_AS_OF_2030;
      assertionSpecs = [
        { path: "calc.mi.lifetime_required_months", operator: "eq" },
        { path: "calc.mi.lifetime_gap_months", operator: "eq" },
        { path: "calc.retirement.legal_retire_age_years", operator: "eq" },
      ];
      sourceRuleIds = ["R-GD-MI-RETIRE-RESTRICT"];
      break;
    case "mi-2026-missing":
      obs.push("mi-2026-missing");
      assertionSpecs = [
        { path: "calc.needs_agent", operator: "eq" },
        { path: "calc.retirement.legal_retire_age_years", operator: "eq" },
      ];
      sourceRuleIds = ["R-220-MEDICAL-LIFETIME-GAP", "R-GD-MI-RETIRE-RESTRICT"];
      break;
    case "base-boundary":
      obs.push("base-boundary");
      assertionSpecs = [
        { path: "calc.needs_agent", operator: "eq" },
        { path: "calc.retirement.legal_retire_age_years", operator: "eq" },
      ];
      sourceRuleIds = ["R-220-MEDICAL-LIFETIME-GAP"];
      sourceParamIds = ["T-GD-CONTRIB-BASE-LOWER-BY-CITY", "P-GD-CONTRIB-BASE-UPPER"];
      break;
  }
  return {
    jurisdictionCode: "440000",
    scenarioKey: `GD-${gender}-${band}-${status}-${capability.toUpperCase()}`,
    capability,
    asOfDate,
    input: buildInput(persona),
    coverageObligations: obs,
    assertionSpecs,
    ...(sourceRuleIds ? { sourceRuleIds } : {}),
    ...(sourceParamIds ? { sourceParamIds } : {}),
  };
}

function buildGuangdongTemplates(): ScenarioTemplateV2[] {
  const templates: ScenarioTemplateV2[] = [];
  // 前4条固定必选能力（与RCL-GEN-1.0一致），其余按组合轮转（配额由组合本身保证6/6/6）。
  const mandatory: Array<{ gender: Gender; band: BirthYearBand; status: EmploymentStatus; capability: GuangdongCapability }> = [
    { gender: "male", band: "before_1970", status: "unemployed", capability: "ui-amount" },
    { gender: "female", band: "1970_1979", status: "unemployed", capability: "claim-city-missing" },
    { gender: "male", band: "from_1980", status: "employed", capability: "mi-2030" },
    { gender: "female", band: "before_1970", status: "flexible", capability: "mi-2026-missing" },
  ];
  const used = new Set<string>();
  for (const m of mandatory) {
    used.add(`${m.gender}|${m.band}|${m.status}`);
    templates.push(gdTemplate(m.gender, m.band, m.status, m.capability));
  }
  const rotation: GuangdongCapability[] = ["mi-2030", "base-boundary", "mi-2026-missing"];
  let idx = 0;
  for (const gender of ["male", "female"] as const) {
    for (const band of BANDS) {
      for (const status of STATUSES) {
        if (used.has(`${gender}|${band}|${status}`)) continue;
        templates.push(gdTemplate(gender, band, status, rotation[idx % rotation.length]));
        idx++;
      }
    }
  }
  return templates;
}

/** 36条模板（沪18+粤18），纯数据、确定性。 */
export function buildScenarioTemplatesV2(): ScenarioTemplateV2[] {
  return [...buildShanghaiTemplates(), ...buildGuangdongTemplates()];
}

// ─── 生成 ────────────────────────────────────────────────────────────────────

function toUidV2(jurisdictionCode: string, scenarioKey: string): string {
  return `RPC-${jurisdictionCode}-${scenarioKey}-V2`;
}
function toTestUidV2(jurisdictionCode: string, scenarioKey: string): string {
  return `RPCT-${jurisdictionCode}-${scenarioKey}-V2`;
}

function deepGet(root: unknown, dotted: string): unknown {
  let acc: unknown = root;
  for (const key of dotted.split(".")) {
    if (acc === null || acc === undefined || typeof acc !== "object") return undefined;
    acc = (acc as Record<string, unknown>)[key];
  }
  return acc;
}

const EXPECTED_NAMESPACES = ["retirement", "pension", "mi", "unemployment", "flex", "subsidy", "contribution"] as const;

function pruneNamespace(ns: unknown): Record<string, unknown> | undefined {
  if (ns === null || typeof ns !== "object" || Array.isArray(ns)) return undefined;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(ns as Record<string, unknown>).sort()) {
    if (key.startsWith("_")) continue;
    out[key] = structuredClone((ns as Record<string, unknown>)[key]);
  }
  return out;
}

/** expected：只承载引擎输出（needs_agent/结论级别/警告id/追问 + 各calc命名空间，剔除`_`内部键）。 */
function buildExpectedV2(outcome: EngineOutcomeV2): Record<string, unknown> {
  const calc = outcome.calc;
  const warningObjects = Array.isArray(calc.warnings) ? (calc.warnings as unknown[]) : [];
  const warnings = warningObjects
    .map((w) => (w !== null && typeof w === "object" ? String((w as { warning_id?: unknown }).warning_id ?? "") : String(w)))
    .filter(Boolean);
  const warningDetails = warningObjects
    .filter((w) => w !== null && typeof w === "object")
    .map((w) => {
      const r = w as Record<string, unknown>;
      return { warning_id: String(r.warning_id ?? ""), text: String(r.text ?? "") };
    })
    .filter((w) => w.warning_id.length > 0);
  const agentQuestions = Array.isArray(calc.agent_questions)
    ? (calc.agent_questions as unknown[])
        .filter((q) => q !== null && typeof q === "object")
        .map((q) => {
          const r = q as Record<string, unknown>;
          return {
            question_id: String(r.question_id ?? ""),
            field: String(r.field ?? ""),
            text: String(r.text ?? ""),
          };
        })
    : [];
  const expected: Record<string, unknown> = {
    needs_agent: calc.needs_agent === true,
    conclusion_level: (outcome.plan.conclusion_level as string | undefined) ?? null,
    warnings,
    warning_details: warningDetails,
    agent_questions: agentQuestions,
  };
  for (const ns of EXPECTED_NAMESPACES) {
    const pruned = pruneNamespace(calc[ns]);
    if (pruned !== undefined) expected[ns] = pruned;
  }
  return expected;
}

/** 案例内容hash：除contentHash外全部字段的规范化SHA-256。 */
export function recomputeScenarioContentHashV2(s: Omit<GeneratedScenarioV2, "contentHash"> & { contentHash?: string }): string {
  const { contentHash: _omit, ...rest } = s;
  void _omit;
  return createHash("sha256").update(canonicalJson(rest), "utf8").digest("hex");
}

/**
 * 生成36条V2场景。期望值、断言值、policySources、文案全部由注入的引擎结果确定；
 * 任一`eq`断言路径在引擎输出中不存在、断言自洽重放不通过或来源为空 → 抛错（fail-closed）。
 */
export async function generateShowcaseScenariosV2(computeExpected: ComputeExpectedV2): Promise<GeneratedScenarioV2[]> {
  const templates = buildScenarioTemplatesV2();
  const out: GeneratedScenarioV2[] = [];
  for (const t of templates) {
    const outcome = await computeExpected(t);
    if (!outcome.snapshotId || !outcome.snapshotContentHash) {
      throw new Error(`${t.scenarioKey}: 引擎结果缺少快照绑定（SHV2-NFR-006 fail-closed）`);
    }
    const assertions: ScenarioAssertion[] = t.assertionSpecs.map((spec) => {
      const value = deepGet(outcome.calc, spec.path.replace(/^calc\./, ""));
      if (spec.operator === "eq" && value === undefined) {
        throw new Error(`${t.scenarioKey}: 断言路径 ${spec.path} 在引擎输出中不存在（不得填充默认值）`);
      }
      return { path: spec.path, operator: spec.operator, value: value === undefined ? null : value };
    });
    const replay = compareReplayWithAssertions(
      { plan: outcome.plan, calc: outcome.calc, user: outcome.user },
      assertions,
    );
    if (replay.comparableAssertions === 0 || !replay.match) {
      throw new Error(`${t.scenarioKey}: 断言自洽重放失败：${replay.reason ?? replay.differences.join("; ")}`);
    }
    const policySources: PolicySource[] = resolvePolicySources({
      jurisdictionCode: t.jurisdictionCode,
      asOfDate: t.asOfDate,
      assertedPaths: assertions.map((a) => a.path),
      sourceRuleIds: t.sourceRuleIds,
      sourceParamIds: t.sourceParamIds,
    });
    if (policySources.length === 0) {
      throw new Error(`${t.scenarioKey}: 无可用结构化政策来源（SHV2-FR-014 fail-closed）`);
    }
    const draft: ScenarioDraftV2 = {
      scenarioKey: t.scenarioKey,
      caseUid: toUidV2(t.jurisdictionCode, t.scenarioKey),
      testUid: toTestUidV2(t.jurisdictionCode, t.scenarioKey),
      jurisdictionCode: t.jurisdictionCode,
      asOfDate: t.asOfDate,
      capability: t.capability,
      input: structuredClone(t.input),
      expected: buildExpectedV2(outcome),
      assertions,
      coverageObligations: [...t.coverageObligations],
      policySources,
      snapshotId: outcome.snapshotId,
      snapshotContentHash: outcome.snapshotContentHash,
      generatorVersion: GENERATOR_VERSION_V2,
    };
    const content = renderScenarioContent(draft);
    const tags = classifyScenario({
      jurisdictionCode: t.jurisdictionCode,
      input: draft.input,
      capability: t.capability,
      assertions,
    } as unknown as GeneratedScenario);
    const quality = scoreCase({
      input: draft.input,
      coverageObligations: draft.coverageObligations,
      replay,
      declaredAssertions: assertions.length,
    });
    const withoutHash: Omit<GeneratedScenarioV2, "contentHash"> = {
      ...draft,
      title: content.title,
      userMessage: content.userMessage,
      aiResponse: content.aiResponse,
      caseText: content.caseText,
      topics: content.topics,
      tags,
      category: content.category,
      quality,
    };
    out.push({ ...withoutHash, contentHash: recomputeScenarioContentHashV2(withoutHash) });
  }
  return out;
}

export interface CoverageManifestV2 {
  generatorVersion: string;
  caseCount: number;
  shanghaiCount: number;
  guangdongCount: number;
  exampleTestCount: number;
  entries: Array<{ caseUid: string; testUid: string; contentHash: string }>;
  manifestHash: string;
}

/** 覆盖manifest：按caseUid排序的内容hash清单与确定性manifestHash（SHV2-FR-016输入）。 */
export function buildCoverageManifestV2(scenarios: GeneratedScenarioV2[]): CoverageManifestV2 {
  const entries = [...scenarios]
    .map((s) => ({ caseUid: s.caseUid, testUid: s.testUid, contentHash: s.contentHash }))
    .sort((a, b) => a.caseUid.localeCompare(b.caseUid));
  const core = { generatorVersion: GENERATOR_VERSION_V2, exampleTestCount: DSL_EXAMPLE_COUNT, entries };
  const manifestHash = createHash("sha256").update(canonicalJson(core), "utf8").digest("hex");
  return {
    generatorVersion: GENERATOR_VERSION_V2,
    caseCount: new Set(entries.map((e) => e.caseUid)).size,
    shanghaiCount: scenarios.filter((s) => s.jurisdictionCode === "310000").length,
    guangdongCount: scenarios.filter((s) => s.jurisdictionCode === "440000").length,
    exampleTestCount: DSL_EXAMPLE_COUNT,
    entries,
    manifestHash,
  };
}
