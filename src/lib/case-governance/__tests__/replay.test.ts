/**
 * RCL-FR-016、RCL-AC-006 可比较断言重放：
 * - 场景携带显式断言（path/operator/value，见PRD §4 RegionalPolicyScenario）；
 * - 重放必须对**至少一个**声明断言实际计算并比对，全部断言都不可比
 *   （路径在结果中不存在、operator不支持等）→ 重放失败（不得获得重放分）；
 * - 任一断言不满足 → match=false 且差异可解释；
 * - 相同输入两次比较结果一致（RCL-NFR-002）。
 */
import { describe, it, expect } from "vitest";
import { compareReplayWithAssertions, type ScenarioAssertion } from "../replay";

const FULL_CALC = {
  retirement: { legal_retire_date: "2036-03-01", legal_retire_age_years: 60 },
  needs_agent: false,
  unemployment: { eligible: true, monthly_amount_est: 2412 },
  mi: { lifetime_gap_months: null },
};

describe("RCL-FR-016 可比较断言重放", () => {
  it("断言全部满足 → match=true", () => {
    const assertions: ScenarioAssertion[] = [
      { path: "calc.retirement.legal_retire_date", operator: "eq", value: "2036-03-01" },
      { path: "calc.unemployment.monthly_amount_est", operator: "eq", value: 2412 },
    ];
    const result = compareReplayWithAssertions(
      { plan: {}, calc: FULL_CALC, user: {} },
      assertions,
    );
    expect(result.match).toBe(true);
    expect(result.differences).toEqual([]);
    expect(result.comparableAssertions).toBe(2);
  });

  it("断言不满足 → match=false 且差异可解释（RCL-AC-006）", () => {
    const assertions: ScenarioAssertion[] = [
      { path: "calc.unemployment.monthly_amount_est", operator: "eq", value: 9999 },
    ];
    const result = compareReplayWithAssertions(
      { plan: {}, calc: FULL_CALC, user: {} },
      assertions,
    );
    expect(result.match).toBe(false);
    expect(result.differences.some((d) => d.includes("monthly_amount_est"))).toBe(true);
  });

  it("无可比较断言（断言列表为空或全部路径不存在）→ 重放失败，不得分（RCL-FR-016/AC-006）", () => {
    // 空断言列表。
    const empty = compareReplayWithAssertions({ plan: {}, calc: FULL_CALC, user: {} }, []);
    expect(empty.match).toBe(false);
    expect(empty.reason).toContain("无可比较断言");

    // 断言路径在重放结果中不存在。
    const missing = compareReplayWithAssertions(
      { plan: {}, calc: FULL_CALC, user: {} },
      [{ path: "calc.nonexistent.field", operator: "eq", value: 1 }],
    );
    expect(missing.match).toBe(false);
    expect(missing.reason).toContain("无可比较断言");
  });

  it("operator=contains 与 is_null 支持（PRD §4）", () => {
    const contains = compareReplayWithAssertions(
      { plan: {}, calc: { warnings: ["缺参", "其他"] }, user: {} },
      [{ path: "calc.warnings", operator: "contains", value: "缺参" }],
    );
    expect(contains.match).toBe(true);

    const isNull = compareReplayWithAssertions(
      { plan: {}, calc: { mi: { lifetime_gap_months: null } }, user: {} },
      [{ path: "calc.mi.lifetime_gap_months", operator: "is_null" }],
    );
    expect(isNull.match).toBe(true);
  });

  it("部分断言可比且满足、其余不可比 → 至少一个可比即可通过（RCL-FR-016）", () => {
    const assertions: ScenarioAssertion[] = [
      { path: "calc.retirement.legal_retire_date", operator: "eq", value: "2036-03-01" },
      { path: "calc.unknown.path", operator: "eq", value: 1 },
    ];
    const result = compareReplayWithAssertions(
      { plan: {}, calc: FULL_CALC, user: {} },
      assertions,
    );
    expect(result.match).toBe(true);
    expect(result.comparableAssertions).toBe(1);
  });

  it("相同输入两次比较结果一致（RCL-NFR-002）", () => {
    const assertions: ScenarioAssertion[] = [
      { path: "calc.retirement.legal_retire_date", operator: "eq", value: "2036-03-01" },
    ];
    const a = compareReplayWithAssertions({ plan: {}, calc: FULL_CALC, user: {} }, assertions);
    const b = compareReplayWithAssertions({ plan: {}, calc: FULL_CALC, user: {} }, assertions);
    expect(a).toEqual(b);
  });
});
