/**
 * 任务3（JRP-FR-011/016、AC-009/014）：AI 工具地区契约专用测试。
 *
 * - computePlan 工具必须接收 jurisdiction_code（JRP-FR-001/011）；
 * - 模型只能提交地区候选，不能直接产生 confirmed 画像（JRP-FR-016/AC-014）；
 * - 工具调用携带的代码必须与聊天会话已确认地区一致（JRP-NFR-008）；
 * - 候选与已确认地区不一致时不得调用规划（JRP-AC-009 场景）。
 */
import { describe, it, expect } from "vitest";
import {
  computePlanSchema,
  executeUpdateProfile,
  assertToolJurisdiction,
  extractCandidateFromUpdateProfile,
} from "@/lib/ai/tools";

describe("computePlan 工具地区契约（JRP-FR-001/011）", () => {
  it("工具 Schema 必须包含必填 jurisdiction_code（缺失即校验失败）", () => {
    const parsed = computePlanSchema.safeParse({
      basic: { birth_year: 1973, gender: "male" },
    });
    expect(parsed.success).toBe(false);
  });

  it("合法地区代码通过 Schema 校验（CN/6位省码）", () => {
    for (const code of ["310000", "440000"]) {
      const parsed = computePlanSchema.safeParse({
        basic: { birth_year: 1973, gender: "male" },
        jurisdiction_code: code,
      });
      expect(parsed.success).toBe(true);
    }
  });

  it("非法地区代码格式被 Schema 拒绝（不允许自由文本城市）", () => {
    const parsed = computePlanSchema.safeParse({
      basic: { birth_year: 1973, gender: "male" },
      jurisdiction_code: "上海",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("updateProfile 地区候选契约（JRP-FR-016/AC-014）", () => {
  it("模型提交地区候选：返回待确认标记，不产生 confirmed 画像", () => {
    const output = executeUpdateProfile({
      jurisdiction_code: "440000",
      basic: { gender: "female" },
    });
    expect(output.updated).toBe(true);
    // 候选绝不携带 confirmed 语义。
    expect(output.jurisdiction_pending_confirmation).toBe(true);
    expect("jurisdiction_code" in output.profile).toBe(false);
  });

  it("updateProfile 普通字段更新不含任何 jurisdiction 字段", () => {
    const output = executeUpdateProfile({
      basic: { gender: "male" },
    });
    expect("jurisdiction_code" in output.profile).toBe(false);
    expect(output.jurisdiction_pending_confirmation).toBeUndefined();
  });

  it("候选提取：只有显式候选键可提取，普通更新不产生候选（JRP-FR-016）", () => {
    expect(extractCandidateFromUpdateProfile({ jurisdiction_code: "440000" })).toBe(
      "440000",
    );
    expect(extractCandidateFromUpdateProfile({ basic: { gender: "male" } })).toBeNull();
  });
});

describe("工具调用与已确认地区一致性（JRP-NFR-008）", () => {
  it("请求代码与会话已确认代码一致：放行", () => {
    expect(assertToolJurisdiction("310000", "310000")).toBeNull();
  });

  it("不一致：返回稳定 JURISDICTION_CONTEXT_MISMATCH 错误（不调用规划）", () => {
    expect(assertToolJurisdiction("440000", "310000")).toContain(
      "JURISDICTION_CONTEXT_MISMATCH",
    );
  });

  it("会话无已确认地区：返回 JURISDICTION_REQUIRED（模型不得自行确认）", () => {
    expect(assertToolJurisdiction("310000", null)).toContain("JURISDICTION_REQUIRED");
    expect(assertToolJurisdiction(undefined, "310000")).toContain(
      "JURISDICTION_REQUIRED",
    );
  });
});
describe("computePlan 工具领取地市代码契约（JRP-FR-022/023/AC-006）", () => {
  it("工具 Schema 接受合法六位 claim_city_code（440100=广州）", () => {
    const parsed = computePlanSchema.safeParse({
      jurisdiction_code: "440000",
      claim_city_code: "440100",
      basic: { birth_year: 1973, gender: "male" },
    });
    expect(parsed.success).toBe(true);
  });

  it("非法领取地市代码格式被 Schema 拒绝（JRP-AC-006）", () => {
    const parsed = computePlanSchema.safeParse({
      jurisdiction_code: "440000",
      claim_city_code: "广州",
      basic: { birth_year: 1973, gender: "male" },
    });
    expect(parsed.success).toBe(false);
  });

  it("工具 Schema 拒绝直接提交 claim_city 自由文本（AC-003：自由文本城市被拒绝）", () => {
    const parsed = computePlanSchema.safeParse({
      jurisdiction_code: "440000",
      claim_city: "广州",
      basic: { birth_year: 1973, gender: "male" },
    });
    expect(parsed.success).toBe(false);
  });
});
