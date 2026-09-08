/**
 * RCL-FR-007/008/012/014、RCL-FR-010/011 确定性地区案例生成器。
 *
 * - 模板为版本化纯数据；同一模板重复生成逐字节一致产物（RCL-NFR-002/AC-005）；
 * - 只生成上海310000与广东440000用户案例；CN仅内部DSL基线、四川仅unsupported负例；
 * - showcase配额：每地区18条、男女9/9、三个年龄段各6、三种就业状态各6（RCL-AC-008）；
 * - 每个case一条地区回归test UID（RCL-FR-013）；
 * - 断言路径/操作符由模板声明，期望值由快照规划器计算后填充（PRD §4：
 *   结构化模板是输入事实源，期望只由修复后的快照规划器计算）。
 */
import { createHash } from "node:crypto";
import { canonicalJson } from "./hashes";
import type { ScenarioAssertion } from "./replay";

export const GENERATOR_VERSION = "RCL-GEN-1.0";

export const SHOWCASE_PER_REGION = 18;

export type BirthYearBand = "before_1970" | "1970_1979" | "from_1980";
export type EmploymentStatus = "employed" | "flexible" | "unemployed";

export interface ScenarioTemplate {
  jurisdictionCode: "310000" | "440000";
  scenarioKey: string;
  capability: string;
  asOfDate: string;
  input: Record<string, unknown>;
  coverageObligations: string[];
  evidence: Array<{ documentId: string; locator: string }>;
  /** 断言路径+操作符（值由快照规划器计算后填充）。 */
  assertionSpecs: Array<{ path: string; operator: ScenarioAssertion["operator"] }>;
  showcaseEligible: boolean;
}

export interface GeneratedScenario {
  scenarioKey: string;
  caseUid: string;
  testUid: string;
  jurisdictionCode: "310000" | "440000";
  asOfDate: string;
  capability: string;
  input: Record<string, unknown>;
  assertions: ScenarioAssertion[];
  coverageObligations: string[];
  evidence: Array<{ documentId: string; locator: string }>;
  snapshotId: string;
  snapshotContentHash: string;
  generatorVersion: string;
  showcaseEligible: boolean;
}

/** 年龄段 → 代表出生年份（模板确定，配额可复现）。 */
const BAND_BIRTH_YEARS: Record<BirthYearBand, number> = {
  before_1970: 1965,
  "1970_1979": 1975,
  from_1980: 1985,
};

/** 年龄带覆盖义务标记（配额断言用）。 */
function bandObligation(band: BirthYearBand): string {
  return `band:${band}`;
}

// ─── 上海模板（RCL-FR-011：退休/养老/医保/失业/灵活就业/补贴）──────────────

function shanghaiTemplate(input: {
  gender: "male" | "female";
  birthYear: number;
  band: BirthYearBand;
  employmentStatus: EmploymentStatus;
  scenarioKey: string;
  capability: string;
  extra?: Record<string, unknown>;
}): ScenarioTemplate {
  const { gender, birthYear, band, employmentStatus, scenarioKey, capability, extra } = input;
  const basic: Record<string, unknown> = {
    gender,
    birth_year: birthYear,
    ...(gender === "female" ? { female_retire_type: "worker50" } : {}),
  };
  const status: Record<string, unknown> = { employment_status: employmentStatus };
  const social: Record<string, unknown> = {
    pension_contrib_months: 180,
    medical_contrib_months: 120,
    ...(employmentStatus === "unemployed" ? { unemployment_insurance_years: 3 } : {}),
  };
  const subsidy: Record<string, unknown> = {};
  if (capability === "subsidy") {
    subsidy.has_employment_difficulty_cert = employmentStatus === "flexible";
  }
  return {
    jurisdictionCode: "310000",
    scenarioKey,
    capability,
    asOfDate: "2026-09-01",
    input: {
      basic,
      status,
      social,
      ...(Object.keys(subsidy).length > 0 ? { subsidy } : {}),
      ...extra,
    },
    coverageObligations: [
      `capability:${capability}`,
      bandObligation(band),
      `employment:${employmentStatus}`,
      `gender:${gender}`,
    ],
    evidence: [{ documentId: "DOC-SH-POLICY-2025", locator: "正文" }],
    assertionSpecs: [
      { path: "calc.retirement.legal_retire_date", operator: "eq" },
      { path: "calc.retirement.legal_retire_age_years", operator: "eq" },
    ],
    showcaseEligible: true,
  };
}

// ─── 广东模板（RCL-FR-010：2026医保缺参/2030年限/失业金额/领取地市/基线与最低工资）──

function guangdongTemplate(input: {
  gender: "male" | "female";
  birthYear: number;
  band: BirthYearBand;
  employmentStatus: EmploymentStatus;
  scenarioKey: string;
  capability: string;
  extra?: Record<string, unknown>;
}): ScenarioTemplate {
  const { gender, birthYear, band, employmentStatus, scenarioKey, capability, extra } = input;
  let asOfDate = "2026-09-01";
  const basic: Record<string, unknown> = {
    gender,
    birth_year: birthYear,
    // 女性口径明确（worker50）：退休年龄/日期才可算（RCL-FR-010/011断言依赖）。
    ...(gender === "female" ? { female_retire_type: "worker50" } : {}),
  };
  const status: Record<string, unknown> = { employment_status: employmentStatus };
  const social: Record<string, unknown> = {
    pension_contrib_months: 180,
    medical_contrib_months: 120,
  };
  const profile: Record<string, unknown> = {};
  const obligations = [
    `capability:${capability}`,
    bandObligation(band),
    `employment:${employmentStatus}`,
    `gender:${gender}`,
  ];
  // 断言spec按能力定制：只声明该场景在快照规划器结果中**确实可算**的路径
  // （RCL-FR-016：无可比断言不得分；路径不存在=不可比）。
  const assertionSpecs: Array<{ path: string; operator: ScenarioAssertion["operator"] }> = [];

  switch (capability) {
    case "mi-2026-missing":
      // 2026窗口：医保退休地市年限缺参 → needs_agent + W-MI-LOCAL-YEARS-MISSING。
      obligations.push("mi-2026-missing");
      assertionSpecs.push({ path: "calc.needs_agent", operator: "eq" });
      assertionSpecs.push({ path: "calc.warnings", operator: "contains" });
      break;
    case "mi-2030":
      // 2030窗口：男30年、女25年（lifetime_required_months 360/300）。
      // 2030参数 effective_from=2030-01-01：该场景的 as_of_date 必须落在2030窗口。
      obligations.push("mi-2030");
      social.medical_contrib_months = 120;
      asOfDate = "2030-01-01";
      assertionSpecs.push({ path: "calc.mi.lifetime_required_months", operator: "eq" });
      assertionSpecs.push({ path: "calc.retirement.legal_retire_age_years", operator: "eq" });
      break;
    case "ui-amount":
      // 失业金额：广州最低工资2680×90%=2412。
      obligations.push("ui-amount");
      obligations.push("claim-city:valid-440100");
      profile.claim_city_code = "440100";
      status.employment_status = "unemployed";
      social.unemployment_insurance_years = 3;
      assertionSpecs.push({ path: "calc.unemployment.monthly_amount_est", operator: "eq" });
      assertionSpecs.push({ path: "calc.unemployment.eligible", operator: "eq" });
      break;
    case "claim-city-missing":
      // 缺失领取地市：needs_agent（不估算金额）。
      obligations.push("claim-city:missing");
      status.employment_status = "unemployed";
      social.unemployment_insurance_years = 3;
      assertionSpecs.push({ path: "calc.needs_agent", operator: "eq" });
      assertionSpecs.push({ path: "calc.unemployment.eligible", operator: "eq" });
      break;
    case "base-boundary":
      obligations.push("base-boundary");
      assertionSpecs.push({ path: "calc.needs_agent", operator: "eq" });
      assertionSpecs.push({ path: "calc.retirement.legal_retire_age_years", operator: "eq" });
      break;
    default:
      obligations.push(`capability:${capability}`);
      assertionSpecs.push({ path: "calc.retirement.legal_retire_age_years", operator: "eq" });
  }

  return {
    jurisdictionCode: "440000",
    scenarioKey,
    capability,
    asOfDate,
    input: {
      basic,
      status,
      social,
      ...(Object.keys(profile).length > 0 ? { profile } : {}),
      ...extra,
    },
    coverageObligations: obligations,
    evidence: [{ documentId: "DOC-GD-POLICY-2026", locator: "正文" }],
    assertionSpecs,
    showcaseEligible: true,
  };
}

/** 上海18条：性别×年龄段×就业态全覆盖（2×3×3=18）。 */
function buildShanghaiTemplates(): ScenarioTemplate[] {
  const templates: ScenarioTemplate[] = [];
  const bands: BirthYearBand[] = ["before_1970", "1970_1979", "from_1980"];
  const statuses: EmploymentStatus[] = ["employed", "flexible", "unemployed"];
  // 每(性别,年龄带,就业态)恰一条：能力按组合轮转覆盖六大能力。
  const capabilities = ["retirement", "pension", "medical", "unemployment", "flexible", "subsidy"];
  let idx = 0;
  for (const gender of ["male", "female"] as const) {
    for (const band of bands) {
      for (const employmentStatus of statuses) {
        const capability = capabilities[idx % capabilities.length];
        templates.push(
          shanghaiTemplate({
            gender,
            birthYear: BAND_BIRTH_YEARS[band],
            band,
            employmentStatus,
            scenarioKey: `SH-${gender}-${band}-${employmentStatus}-${capability.toUpperCase()}`,
            capability,
          }),
        );
        idx++;
      }
    }
  }
  return templates;
}

/** 广东18条：同配额结构，能力覆盖RCL-FR-010必选场景。 */
function buildGuangdongTemplates(): ScenarioTemplate[] {
  const templates: ScenarioTemplate[] = [];
  const bands: BirthYearBand[] = ["before_1970", "1970_1979", "from_1980"];
  const statuses: EmploymentStatus[] = ["employed", "flexible", "unemployed"];
  // 前4条固定RCL-FR-010必选能力，其余按组合轮转。
  const mandatory: Array<{ gender: "male" | "female"; band: BirthYearBand; status: EmploymentStatus; capability: string }> = [
    { gender: "male", band: "before_1970", status: "unemployed", capability: "ui-amount" },
    { gender: "female", band: "1970_1979", status: "unemployed", capability: "claim-city-missing" },
    { gender: "male", band: "from_1980", status: "employed", capability: "mi-2030" },
    { gender: "female", band: "before_1970", status: "flexible", capability: "mi-2026-missing" },
  ];
  const used = new Set<string>();
  for (const m of mandatory) {
    const key = `${m.gender}|${m.band}|${m.status}`;
    used.add(key);
    templates.push(
      guangdongTemplate({
        gender: m.gender,
        birthYear: BAND_BIRTH_YEARS[m.band],
        band: m.band,
        employmentStatus: m.status,
        scenarioKey: `GD-${m.gender}-${m.band}-${m.status}-${m.capability.toUpperCase()}`,
        capability: m.capability,
      }),
    );
  }
  // 剩余14条：只用不强制就业状态的capability轮转（ui-amount/claim-city-missing
  // 强制unemployed，只出现在mandatory中），配额由组合本身保证6/6/6。
  const capabilities = ["mi-2030", "base-boundary", "mi-2026-missing"];
  let idx = 0;
  for (const gender of ["male", "female"] as const) {
    for (const band of bands) {
      for (const employmentStatus of statuses) {
        const key = `${gender}|${band}|${employmentStatus}`;
        if (used.has(key)) continue;
        const capability = capabilities[idx % capabilities.length];
        templates.push(
          guangdongTemplate({
            gender,
            birthYear: BAND_BIRTH_YEARS[band],
            band,
            employmentStatus,
            scenarioKey: `GD-${gender}-${band}-${employmentStatus}-${capability.toUpperCase()}`,
            capability,
          }),
        );
        idx++;
      }
    }
  }
  return templates;
}

function toUid(jurisdictionCode: string, scenarioKey: string): string {
  return `RPC-${jurisdictionCode}-${scenarioKey}-V1`;
}

function toTestUid(jurisdictionCode: string, scenarioKey: string): string {
  return `RPCT-${jurisdictionCode}-${scenarioKey}-V1`;
}

/**
 * 生成36条showcase场景（沪18+粤18）。
 * 断言值由调用方经 `computeExpected` 从快照规划器计算结果填充；
 * 未提供时断言值保持 null（模板级占位，集成流程必须填充并校验至少一条可比）。
 */
export async function generateShowcaseScenarios(
  computeExpected?: (
    t: ScenarioTemplate,
  ) =>
    | { snapshotId: string; snapshotContentHash: string; values: Array<{ path: string; value: unknown }> }
    | Promise<{ snapshotId: string; snapshotContentHash: string; values: Array<{ path: string; value: unknown }> }>,
): Promise<GeneratedScenario[]> {
  const templates = [...buildShanghaiTemplates(), ...buildGuangdongTemplates()];
  const built: GeneratedScenario[] = [];
  for (const t of templates) {
    let snapshotId = "";
    let snapshotContentHash = "";
    let values: Array<{ path: string; value: unknown }> = [];
    if (computeExpected) {
      const computed = await computeExpected(t);
      snapshotId = computed.snapshotId;
      snapshotContentHash = computed.snapshotContentHash;
      values = computed.values;
    }
    const assertions: ScenarioAssertion[] = t.assertionSpecs.map((spec) => {
      const found = values.find((v) => v.path === spec.path);
      return {
        path: spec.path,
        operator: spec.operator,
        value: found ? found.value : null,
      };
    });
    built.push({
      scenarioKey: t.scenarioKey,
      caseUid: toUid(t.jurisdictionCode, t.scenarioKey),
      testUid: toTestUid(t.jurisdictionCode, t.scenarioKey),
      jurisdictionCode: t.jurisdictionCode,
      asOfDate: t.asOfDate,
      capability: t.capability,
      input: t.input,
      assertions,
      coverageObligations: t.coverageObligations,
      evidence: t.evidence,
      snapshotId,
      snapshotContentHash,
      generatorVersion: GENERATOR_VERSION,
      showcaseEligible: t.showcaseEligible,
    });
  }
  return built;
}

/** 覆盖manifest：N=唯一case数、36、42示例占位与manifestHash（RCL-AC-005/011）。 */
export function buildCoverageManifest(
  scenarios: GeneratedScenario[],
  exampleTestCount = 42,
): {
  caseCount: number;
  showcaseCount: number;
  exampleTestCount: number;
  generatorVersion: string;
  scenarioKeys: string[];
  manifestHash: string;
} {
  const scenarioKeys = scenarios.map((s) => s.caseUid).sort();
  const caseCount = new Set(scenarioKeys).size;
  const core = {
    generatorVersion: GENERATOR_VERSION,
    scenarioKeys,
    exampleTestCount,
  };
  const manifestHash = createHash("sha256")
    .update(canonicalJson(core))
    .digest("hex");
  return {
    caseCount,
    showcaseCount: scenarios.length,
    exampleTestCount,
    generatorVersion: GENERATOR_VERSION,
    scenarioKeys,
    manifestHash,
  };
}