/**
 * 任务3（JRP-FR-010/012/015、JRP-AC-003/017）地区选择器纯逻辑测试。
 */
import { describe, it, expect } from "vitest";
import {
  isSupportedPlanningJurisdiction,
  buildJurisdictionConfirmRequest,
  readJurisdictionFromProfile,
} from "./jurisdiction-selector-logic";

describe("地区选择器逻辑（JRP-FR-010/012）", () => {
  it("首期只支持上海与广东；四川明确 unsupported（JRP-AC-017）", () => {
    expect(isSupportedPlanningJurisdiction("310000")).toBe(true);
    expect(isSupportedPlanningJurisdiction("440000")).toBe(true);
    expect(isSupportedPlanningJurisdiction("510000")).toBe(false);
    expect(isSupportedPlanningJurisdiction("999999")).toBe(false);
  });

  it("确认请求只携带稳定代码与 selector 来源（JRP-FR-015）", () => {
    const req = buildJurisdictionConfirmRequest("conv-1", "440000");
    expect(req.url).toBe("/api/conversations/conv-1/jurisdiction");
    expect(req.body).toEqual({ code: "440000", source: "selector" });
  });

  it("画像确认地区读取：confirmed=true 才返回（JRP-AC-013/FR-017）", () => {
    expect(
      readJurisdictionFromProfile({
        jurisdiction: {
          code: "310000",
          name: "上海市",
          level: "province",
          confirmed: true,
          confirmedAt: "2026-09-07T10:00:00.000Z",
          source: "selector",
        },
      }),
    ).toEqual({ code: "310000", name: "上海市" });

    // 未确认/候选不得作为权威地区。
    expect(
      readJurisdictionFromProfile({
        jurisdiction: { code: "440000", confirmed: false },
      }),
    ).toBeNull();
    expect(
      readJurisdictionFromProfile({ jurisdiction_code: "440000" }),
    ).toBeNull();
    expect(readJurisdictionFromProfile(null)).toBeNull();
    expect(readJurisdictionFromProfile(undefined)).toBeNull();
  });
});
