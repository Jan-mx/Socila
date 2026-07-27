import { describe, expect, it } from "vitest";
import {
  formatAdminEntityType,
  formatAdminGateCheck,
  formatAdminModule,
  formatAdminStage,
  formatAdminStatus,
  formatAdminTestSource,
} from "./admin-labels";

describe("admin display labels", () => {
  it("formats publish stages", () => {
    expect(formatAdminStage("draft")).toBe("草稿");
    expect(formatAdminStage("staging")).toBe("预发布");
    expect(formatAdminStage("prod")).toBe("生产");
  });

  it("formats entity statuses", () => {
    expect(formatAdminStatus("draft")).toBe("草稿");
    expect(formatAdminStatus("staging")).toBe("预发布");
    expect(formatAdminStatus("published")).toBe("已发布");
    expect(formatAdminStatus("retired")).toBe("已停用");
  });

  it("formats rule modules", () => {
    expect(formatAdminModule("normalization")).toBe("规范化");
    expect(formatAdminModule("retirement")).toBe("退休");
    expect(formatAdminModule("pension")).toBe("养老保险");
    expect(formatAdminModule("medical_insurance")).toBe("医疗保险");
    expect(formatAdminModule("unemployment")).toBe("失业保险");
    expect(formatAdminModule("subsidy")).toBe("补贴");
    expect(formatAdminModule("contribution")).toBe("缴费");
    expect(formatAdminModule("plan")).toBe("方案");
    expect(formatAdminModule("gate")).toBe("发布门禁");
  });

  it("formats entity types and test sources", () => {
    expect(formatAdminEntityType("rule")).toBe("规则");
    expect(formatAdminEntityType("param")).toBe("参数");
    expect(formatAdminEntityType("rule_set")).toBe("规则集");
    expect(formatAdminTestSource("example")).toBe("示例");
    expect(formatAdminTestSource("regression")).toBe("回归");
    expect(formatAdminTestSource("import")).toBe("导入");
  });

  it("formats publish gate checks", () => {
    expect(formatAdminGateCheck("schema")).toBe("结构校验");
    expect(formatAdminGateCheck("examples")).toBe("示例测试");
    expect(formatAdminGateCheck("regression")).toBe("回归测试");
    expect(formatAdminGateCheck("draft_to_staging")).toBe("草稿进入预发布");
    expect(formatAdminGateCheck("rule_exists")).toBe("规则存在性");
    expect(formatAdminGateCheck("transition")).toBe("阶段转换");
    expect(formatAdminGateCheck("value")).toBe("参数值校验");
  });

  it("preserves unknown machine values", () => {
    expect(formatAdminStage("future")).toBe("future");
    expect(formatAdminStatus("custom")).toBe("custom");
    expect(formatAdminModule("other")).toBe("other");
    expect(formatAdminEntityType("unknown")).toBe("unknown");
    expect(formatAdminTestSource("manual")).toBe("manual");
    expect(formatAdminGateCheck("custom_check")).toBe("custom_check");
  });
});
