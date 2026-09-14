/**
 * RCL-FR-017 多标签分类：地区、性别、年龄、就业、险种、政策能力和needs-agent
 * 标签同时保留（不提前返回单分类）。接入生成器场景与落库路径。
 */
import type { GeneratedScenario } from "./generator";

export type BirthYearBand = "before_1970" | "1970_1979" | "from_1980";

export function birthYearBand(year: number): BirthYearBand {
  if (year < 1970) return "before_1970";
  if (year < 1980) return "1970_1979";
  return "from_1980";
}

/** 场景 → 多标签集合（地区/性别/年龄段/就业/险种/能力/needs-agent）。 */
export function classifyScenario(scenario: GeneratedScenario): string[] {
  const tags: string[] = [];
  tags.push(scenario.jurisdictionCode === "310000" ? "上海" : "广东");
  tags.push(scenario.jurisdictionCode);

  const basic = (scenario.input.basic ?? {}) as Record<string, unknown>;
  const status = (scenario.input.status ?? {}) as Record<string, unknown>;
  const gender = basic.gender;
  if (gender === "female" || gender === "male") tags.push(String(gender));
  if (typeof basic.birth_year === "number" && basic.birth_year > 0) {
    tags.push(birthYearBand(basic.birth_year));
  }
  const employment = String(status.employment_status ?? "");
  if (["employed", "flexible", "unemployed"].includes(employment)) {
    tags.push(employment);
    if (employment === "flexible") tags.push("灵活就业");
    if (employment === "unemployed") tags.push("失业");
  }

  // 险种与能力标签（capability前缀）。
  tags.push(`capability:${scenario.capability}`);
  const social = (scenario.input.social ?? {}) as Record<string, unknown>;
  if (social.pension_contrib_months !== undefined) tags.push("险种:养老");
  if (social.medical_contrib_months !== undefined) tags.push("险种:医保");
  if (social.unemployment_insurance_years !== undefined) tags.push("险种:失业");

  // needs-agent：断言包含 needs_agent=true 或 is_null 类断言。
  if (
    scenario.assertions.some(
      (a) => a.path.endsWith("needs_agent") && a.operator === "eq" && a.value === true,
    )
  ) {
    tags.push("needs-agent");
  }
  return tags;
}
