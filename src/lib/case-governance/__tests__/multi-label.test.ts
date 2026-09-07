/**
 * CLG-FR-010 多标签分类：展示案例分类为多标签集合，
 * 不再因性别/年龄提前返回而丢失就业、险种和补贴标签。
 *
 * Red：实现前模块 `src/lib/case-governance/multi-label` 不存在。
 */
import { describe, it, expect } from "vitest";
import { classifyShowcase } from "../multi-label";
import type { ShowcaseCandidateRecord } from "../types";

function record(overrides: Partial<ShowcaseCandidateRecord> = {}): ShowcaseCandidateRecord {
  return {
    caseUid: "71c427049305-01",
    sourceCaseUid: "71c427049305",
    gender: "female",
    birthYear: 1974,
    employmentStatus: "flexible",
    input: { basic: { gender: "female", birth_year: 1974 }, status: { employment_status: "flexible" } },
    expected: { retire_age: "37岁", subsidy_4050: true, subsidy_daling: true },
    transcriptLength: 200,
    sourceFile: "f.xlsx",
    caseText: "t",
    publicText: "p",
    replay: { match: true, differences: [] },
    ...overrides,
  } as ShowcaseCandidateRecord;
}

describe("CLG-FR-010 多标签分类", () => {
  it("灵活就业女性1974年生且享4050/大龄补贴 → 同时输出性别、年龄段、就业、补贴标签", () => {
    const tags = classifyShowcase(record());
    expect(tags).toContain("female");
    expect(tags).toContain("1970_1979");
    expect(tags).toContain("flexible");
    expect(tags).toContain("4050");
    expect(tags).toContain("daling");
  });

  it("不再因性别提前返回而丢失就业标签（旧categorize缺陷回归）", () => {
    const tags = classifyShowcase(record());
    expect(tags.includes("flexible") || tags.includes("employed") || tags.includes("unemployed")).toBe(true);
    if (record().expected.subsidy_4050) {
      expect(tags).toContain("4050");
    }
  });

  it("失业男性1985年生享岗位补贴 → 输出male/from_1980/unemployed/gangwei", () => {
    const tags = classifyShowcase(
      record({
        gender: "male",
        birthYear: 1985,
        employmentStatus: "unemployed",
        expected: { retire_age: "37岁", subsidy_gangwei: true },
      }),
    );
    expect(tags).toContain("male");
    expect(tags).toContain("from_1980");
    expect(tags).toContain("unemployed");
    expect(tags).toContain("gangwei");
  });

  it("1970年前出生 → before_1970", () => {
    const tags = classifyShowcase(record({ birthYear: 1965, gender: "male", employmentStatus: "employed" }));
    expect(tags).toContain("before_1970");
    expect(tags).toContain("employed");
  });

  it("输出稳定且无重复（确定性，CLG-NFR-002）", () => {
    const a = classifyShowcase(record());
    const b = classifyShowcase(record());
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });
});