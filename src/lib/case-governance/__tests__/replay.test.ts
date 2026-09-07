/**
 * CLG-FR-006 快照重放：展示案例input经候选快照（任务2上海310000候选快照）
 * 重放后与expected比较，输出一致/差异；无未解释差异时为评分提供10分依据。
 *
 * Red：实现前模块 `src/lib/case-governance/replay` 不存在。
 */
import { describe, it, expect } from "vitest";
import { compareReplayToExpected } from "../replay";

describe("CLG-FR-006/007 快照重放比较", () => {
  it("核心字段一致 → match=true", () => {
    const result = compareReplayToExpected(
      {
        calc: { retirement: { legal_retire_age: 37, legal_retire_date: "2036-03" } },
        plan: { min_contrib_years: 15 },
        user: {},
      },
      { retire_age: "37岁", retire_date: "2036-03", min_contrib_years: 15 },
    );
    expect(result.match).toBe(true);
    expect(result.differences).toEqual([]);
  });

  it("retire_date数值不一致 → match=false且差异可解释", () => {
    const result = compareReplayToExpected(
      { calc: { retirement: { legal_retire_date: "2037-06-01" } }, plan: {}, user: {} },
      { retire_date: "2036-03-01" },
    );
    expect(result.match).toBe(false);
    expect(result.differences.some((d) => d.includes("retire_date"))).toBe(true);
  });

  it("补贴布尔不一致 → match=false", () => {
    const result = compareReplayToExpected(
      { calc: { subsidy_4050: false }, plan: {}, user: {} },
      { subsidy_4050: true },
    );
    expect(result.match).toBe(false);
  });

  it("expected为空而calc多出字段 → 不误报", () => {
    const result = compareReplayToExpected(
      { calc: { x: 1, subsidy_4050: true }, plan: {}, user: {} },
      {},
    );
    expect(result.match).toBe(true);
  });

  it("expected字段在重放结果中无对应语义 → 跳过不构成差异（可解释）", () => {
    const result = compareReplayToExpected(
      { calc: { retirement: { legal_retire_age_years: 50 } }, plan: {}, user: {} },
      { retire_age: "37岁" },
    );
    // "37岁"为案例叙述数字（如失业金领取年龄），引擎无对应语义 → 不误报
    expect(result.match).toBe(true);
  });

  it("引擎有对应语义且不一致 → 未解释差异（retire_date）", () => {
    // 语义字段一致场景：引擎legal_retire_date与期望一致
    const ok = compareReplayToExpected(
      { calc: { retirement: { legal_retire_date: "2036-03-01" } }, plan: {}, user: {} },
      { retire_date: "2036-03-01" },
    );
    expect(ok.match).toBe(true);
    const bad = compareReplayToExpected(
      { calc: { retirement: { legal_retire_date: "2037-06-01" } }, plan: {}, user: {} },
      { retire_date: "2036-03-01" },
    );
    expect(bad.match).toBe(false);
    expect(bad.differences.some((d) => d.includes("retire_date"))).toBe(true);
  });

  it("相同输入两次比较结果一致（CLG-NFR-002）", () => {
    const input = { calc: { retirement: { legal_retire_age: 37 } }, plan: {}, user: {} };
    const a = compareReplayToExpected(input, { retire_age: "37岁" });
    const b = compareReplayToExpected(input, { retire_age: "37岁" });
    expect(a).toEqual(b);
  });
});