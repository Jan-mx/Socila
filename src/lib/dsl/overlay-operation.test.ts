/**
 * NRP-FR-007：DSL装载的显式overlay操作校验单元测试。
 */
import { describe, it, expect } from "vitest";
import { parseOverlayOperation, DSL_OPERATIONS } from "./overlay-operation";

describe("parseOverlayOperation（NRP-FR-007）", () => {
  it("CN实体必须显式baseline；缺省即错误", () => {
    expect(
      parseOverlayOperation("rule", "R-1", "baseline", null, "CN"),
    ).toEqual({ operation: "baseline", targetBusinessKey: null });
    expect(() => parseOverlayOperation("rule", "R-1", undefined, null, "CN"))
      .toThrowError(/必须显式声明/);
  });

  it("CN实体使用非baseline操作一律拒绝", () => {
    for (const op of ["add", "replace", "restrict", "exempt"] as const) {
      expect(() =>
        parseOverlayOperation("rule", "R-1", op, op === "add" ? null : "T", "CN"),
      ).toThrowError(/只能使用 baseline/);
    }
  });

  it("地区实体缺省add；显式add合法；baseline拒绝", () => {
    expect(parseOverlayOperation("rule", "R-1", undefined, null, "310000")).toEqual({
      operation: "add",
      targetBusinessKey: null,
    });
    expect(parseOverlayOperation("rule", "R-1", "add", null, "440000")).toEqual({
      operation: "add",
      targetBusinessKey: null,
    });
    expect(() =>
      parseOverlayOperation("rule", "R-1", "baseline", null, "310000"),
    ).toThrowError(/不能使用 baseline/);
  });

  it("replace/restrict/exempt必须携带非空目标键；baseline/add不得携带", () => {
    for (const op of ["replace", "restrict", "exempt"] as const) {
      expect(() =>
        parseOverlayOperation("param", "P-1", op, null, "310000"),
      ).toThrowError(/必须携带 target_business_key/);
      expect(
        parseOverlayOperation("param", "P-1", op, "P-TARGET", "310000"),
      ).toEqual({ operation: op, targetBusinessKey: "P-TARGET" });
    }
    expect(() =>
      parseOverlayOperation("param", "P-1", "add", "P-TARGET", "310000"),
    ).toThrowError(/不得携带 target_business_key/);
    expect(() =>
      parseOverlayOperation("rule", "R-1", "baseline", "R-TARGET", "CN"),
    ).toThrowError(/不得携带 target_business_key/);
    expect(() =>
      parseOverlayOperation("param", "P-1", "replace", "", "310000"),
    ).toThrowError(/非空字符串/);
  });

  it("未知操作值拒绝", () => {
    expect(() =>
      parseOverlayOperation("rule", "R-1", "override", null, "310000"),
    ).toThrowError(/operation 必须是/);
    expect(DSL_OPERATIONS).toEqual([
      "baseline",
      "add",
      "replace",
      "restrict",
      "exempt",
    ]);
  });

  it("错误消息包含实体种类、ID与地区，便于DraftBundle修正", () => {
    try {
      parseOverlayOperation("rule_set", "RS-BAD", "replace", null, "510000");
      expect.fail("应抛错");
    } catch (e) {
      expect((e as Error).message).toMatch(/rule_set RS-BAD（jurisdiction=510000）/);
    }
  });
});
