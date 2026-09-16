/**
 * APR-FR-003/010/017：显示元数据（中文名称/说明）入口校验。
 * 新建、Seed与物化入口必须强制名称非空；说明可选；
 * 名称/说明不得包含未经转义的HTML尖括号（PRD §9）。
 */
import { describe, expect, it } from "vitest";
import {
  DisplayMetaError,
  assertDisplayMeta,
  isFallbackName,
} from "../display-names";

describe("assertDisplayMeta（APR-FR-003/010/017）", () => {
  it("合法名称与说明通过", () => {
    const out = assertDisplayMeta("RS-CN-PLAN-V1", {
      name: "国家baseline规划规则集",
      description: "全国统一的规划主规则集",
    });
    expect(out.name).toBe("国家baseline规划规则集");
    expect(out.description).toBe("全国统一的规划主规则集");
  });

  it("说明可缺省为null", () => {
    const out = assertDisplayMeta("P-SH-MIN-WAGE", { name: "上海市最低工资标准" });
    expect(out.name).toBe("上海市最低工资标准");
    expect(out.description).toBeNull();
  });

  it("名称缺失时抛出DisplayMetaError并指向实体编号", () => {
    let err: unknown;
    try {
      assertDisplayMeta("P-X", {});
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(DisplayMetaError);
    expect((err as DisplayMetaError).entityId).toBe("P-X");
    expect((err as DisplayMetaError).field).toBe("name");
  });

  it("空白名称被拒绝", () => {
    expect(() => assertDisplayMeta("P-X", { name: "   " })).toThrow(DisplayMetaError);
  });

  it("非字符串名称被拒绝", () => {
    expect(() =>
      assertDisplayMeta("P-X", { name: 42 as unknown as string }),
    ).toThrow(DisplayMetaError);
    expect(() =>
      assertDisplayMeta("P-X", { name: null as unknown as string }),
    ).toThrow(DisplayMetaError);
  });

  it("名称或说明含HTML尖括号被拒绝（PRD §9）", () => {
    expect(() =>
      assertDisplayMeta("P-X", { name: "<script>名称</script>" }),
    ).toThrow(DisplayMetaError);
    expect(() =>
      assertDisplayMeta("P-X", { name: "合法名称", description: "a > b" }),
    ).toThrow(DisplayMetaError);
  });

  it("说明为空字符串规范化为null", () => {
    const out = assertDisplayMeta("P-X", { name: "名称", description: "" });
    expect(out.description).toBeNull();
  });
});

describe("isFallbackName（APR-FR-017 兼容回退识别）", () => {
  it("名称等于实体编号时识别为迁移回退（待补充）", () => {
    expect(isFallbackName("P-SH-MIN-WAGE", "P-SH-MIN-WAGE")).toBe(true);
  });

  it("正式中文名称不是回退", () => {
    expect(isFallbackName("上海市最低工资标准", "P-SH-MIN-WAGE")).toBe(false);
  });
});
