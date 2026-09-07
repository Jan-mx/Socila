/**
 * CLG-FR-010 多标签分类：展示案例分类为多标签集合（性别/年龄段/就业/补贴），
 * 不再因性别或年龄提前返回而丢失就业、险种和补贴标签。
 */
import type { BirthYearBand, ShowcaseCandidateRecord } from "./types";

export function classifyShowcase(record: ShowcaseCandidateRecord): string[] {
  const tags: string[] = [];
  const gender = record.gender;
  if (gender === "female" || gender === "male") tags.push(gender);
  if (typeof record.birthYear === "number" && record.birthYear > 0) {
    tags.push(birthYearBand(record.birthYear));
  }
  if (["employed", "flexible", "unemployed"].includes(record.employmentStatus)) {
    tags.push(record.employmentStatus);
    if (record.employmentStatus === "flexible") tags.push("灵活就业");
    if (record.employmentStatus === "unemployed") tags.push("失业");
  }
  const expected = record.expected ?? {};
  if (expected.subsidy_4050) tags.push("4050");
  if (expected.subsidy_daling) tags.push("daling");
  if (expected.subsidy_gangwei) tags.push("gangwei");
  if (typeof expected.pension_amount === "number" || typeof expected.monthly_cost === "number") {
    tags.push("pension_calc");
  }
  return tags;
}

export function birthYearBand(year: number): BirthYearBand {
  if (year < 1970) return "before_1970";
  if (year < 1980) return "1970_1979";
  return "from_1980";
}
