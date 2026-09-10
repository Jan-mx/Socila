/**
 * 任务3（JRP-FR-022/023、JRP-AC-006）：广东领取地市代码规范化专用测试。
 *
 * - 有效广东地级市代码 → 规则内部 claim_city 规范名称（与最低工资表键一致）；
 * - 缺失、未知、跨省代码 → 不生成 claim_city 且带稳定问题（不估算金额）；
 * - 非广东地区提交的代码不参与计算（跨省拒绝）。
 */
import { describe, it, expect } from "vitest";
import {
  GD_CLAIM_CITY_CODE_TO_NAME,
  normalizeClaimCityCode,
} from "../claim-city";

describe("广东领取地市代码规范化（JRP-FR-022/023/AC-006）", () => {
  it("有效广东地级市代码映射为规则内部名称（广州440100）", () => {
    const r = normalizeClaimCityCode({
      jurisdictionCode: "440000",
      claimCityCode: "440100",
    });
    expect(r.claimCity).toBe("广州");
    expect(r.issue).toBeUndefined();
  });

  it("有效深圳代码 440300 → 深圳（最低工资表键一致）", () => {
    const r = normalizeClaimCityCode({
      jurisdictionCode: "440000",
      claimCityCode: "440300",
    });
    expect(r.claimCity).toBe("深圳");
  });

  it("缺失领取地市代码 → claimCity null + missing 问题（JRP-AC-006）", () => {
    const r = normalizeClaimCityCode({
      jurisdictionCode: "440000",
      claimCityCode: undefined,
    });
    expect(r).toEqual({
      claimCity: null,
      issue: "claim-city-missing",
    });
  });

  it("未知代码（非广东地级市，如 999999）→ 不估算（JRP-AC-006）", () => {
    const r = normalizeClaimCityCode({
      jurisdictionCode: "440000",
      claimCityCode: "999999",
    });
    expect(r).toEqual({ claimCity: null, issue: "claim-city-unknown" });
  });

  it("跨省代码（上海310000）提交给广东 → 未知/不估算（JRP-FR-023）", () => {
    const r = normalizeClaimCityCode({
      jurisdictionCode: "440000",
      claimCityCode: "310000",
    });
    expect(r.claimCity).toBeNull();
    expect(r.issue).toBe("claim-city-unknown");
  });

  it("非广东地区（上海）提交任何代码都不会参与计算（JRP-FR-023 跨省拒绝）", () => {
    const r = normalizeClaimCityCode({
      jurisdictionCode: "310000",
      claimCityCode: "440100",
    });
    expect(r).toEqual({ claimCity: null, issue: "claim-city-not-gd" });
  });

  it("空白代码与缺失等价（不估算）", () => {
    const r = normalizeClaimCityCode({
      jurisdictionCode: "440000",
      claimCityCode: "   ",
    });
    expect(r.issue).toBe("claim-city-missing");
  });

  it("覆盖全部21个广东地级市代码（完整性与最低工资表键对齐）", () => {
    const expectedCityNames = [
      "广州", "韶关", "深圳", "珠海", "汕头", "佛山", "江门", "湛江",
      "茂名", "肇庆", "惠州", "梅州", "汕尾", "河源", "阳江", "清远",
      "东莞", "中山", "潮州", "揭阳", "云浮",
    ];
    expect(Object.values(GD_CLAIM_CITY_CODE_TO_NAME).sort()).toEqual(
      [...expectedCityNames].sort(),
    );
    for (const [code, city] of Object.entries(GD_CLAIM_CITY_CODE_TO_NAME)) {
      expect(code).toMatch(/^44\d{4}$/);
      const r = normalizeClaimCityCode({
        jurisdictionCode: "440000",
        claimCityCode: code,
      });
      expect(r.claimCity).toBe(city);
    }
  });
});