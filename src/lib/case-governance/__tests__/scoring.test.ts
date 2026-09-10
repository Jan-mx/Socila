/**
 * RCL-FR-015/016、RCL-AC-006/009 案例质量评分测试：
 * - 总分 = 输入40 + 覆盖30 + 断言重放30；
 * - 无可比较断言 → 重放分0且原因明确（RCL-FR-016/AC-006）；
 * - 有可比断言且一致 → 重放分30；任一断言失败 → 0；
 * - 相同输入两次评分一致（RCL-NFR-002）。
 */
import { describe, it, expect } from "vitest";
import { scoreCase } from "../scoring";

const FULL_INPUT = {
  basic: { gender: "male", birth_year: 1973 },
  status: { employment_status: "unemployed" },
  social: { pension_contrib_months: 180 },
};

describe("RCL-FR-015 质量总分与逐项分解", () => {
  it("输入完整+覆盖充分+断言重放一致 → 满分100且逐项分解真实", () => {
    const score = scoreCase({
      input: FULL_INPUT,
      coverageObligations: ["capability:retirement", "band:1970_1979", "employment:unemployed"],
      replay: { match: true, differences: [], comparableAssertions: 2 },
      declaredAssertions: 2,
    });
    expect(score.total).toBe(100);
    expect(score.inputCompleteness).toBe(40);
    expect(score.coverageObligations).toBe(30);
    expect(score.snapshotReplay).toBe(30);
    expect(score.reasons.length).toBeGreaterThanOrEqual(4);
  });

  it("输入缺性别/出生年/就业/缴费 → 逐项扣分", () => {
    const score = scoreCase({
      input: {},
      coverageObligations: [],
      replay: { match: true, differences: [], comparableAssertions: 1 },
      declaredAssertions: 1,
    });
    expect(score.inputCompleteness).toBe(0);
    expect(score.reasons.some((r) => r.includes("性别：缺失"))).toBe(true);
  });
});

describe("RCL-FR-016/AC-006 无可比断言不得分", () => {
  it("无可比较断言（comparableAssertions=0）→ 重放分0且原因明确", () => {
    const score = scoreCase({
      input: FULL_INPUT,
      coverageObligations: ["capability:retirement"],
      replay: {
        match: false,
        differences: [],
        comparableAssertions: 0,
        reason: "无可比较断言：断言列表为空或全部路径在重放结果中不存在（RCL-FR-016）",
      },
      declaredAssertions: 2,
    });
    expect(score.snapshotReplay).toBe(0);
    expect(score.total).toBe(50);
    expect(score.reasons.some((r) => r.includes("无可比较断言"))).toBe(true);
  });

  it("重放未执行（null）→ 重放分0", () => {
    const score = scoreCase({
      input: FULL_INPUT,
      coverageObligations: ["capability:retirement"],
      replay: null,
      declaredAssertions: 2,
    });
    expect(score.snapshotReplay).toBe(0);
    expect(score.reasons.some((r) => r.includes("未执行"))).toBe(true);
  });

  it("有可比断言但失败 → 重放分0且差异原因记录", () => {
    const score = scoreCase({
      input: FULL_INPUT,
      coverageObligations: ["capability:retirement"],
      replay: {
        match: false,
        differences: ["calc.x: 期望 eq(1)，实际 2"],
        comparableAssertions: 1,
      },
      declaredAssertions: 1,
    });
    expect(score.snapshotReplay).toBe(0);
    expect(score.reasons.some((r) => r.includes("断言差异"))).toBe(true);
  });
});

describe("RCL-NFR-002 确定性", () => {
  it("相同输入两次评分一致", () => {
    const input = {
      input: FULL_INPUT,
      coverageObligations: ["capability:retirement"],
      replay: { match: true, differences: [], comparableAssertions: 1 },
      declaredAssertions: 1,
    };
    expect(scoreCase(input)).toEqual(scoreCase(input));
  });
});
