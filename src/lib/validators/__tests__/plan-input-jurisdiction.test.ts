/**
 * 任务3（JRP-AC-001/006、JRP-FR-001/003）：规划请求 strict Schema 专用测试。
 *
 * - jurisdiction_code 必填（缺失 → 路由层映射 400 JURISDICTION_REQUIRED）；
 * - 拒绝 rule_set_id / policy_pack_id / snapshot_id 与一切未知字段（JRP-FR-003/AC-006）；
 * - 地区代码格式校验（稳定6位行政区划代码或 CN）。
 */
import { describe, it, expect } from "vitest";
import { PlanComputeRequestSchema } from "@/lib/validators/plan-input";

describe("PlanComputeRequestSchema（JRP-FR-001/003 strict）", () => {
  it("合法请求：user + jurisdiction_code 通过（JRP-FR-001）", () => {
    const parsed = PlanComputeRequestSchema.safeParse({
      user: { basic: { gender: "male" } },
      jurisdiction_code: "310000",
    });
    expect(parsed.success).toBe(true);
  });

  it("缺少 jurisdiction_code：拒绝（JRP-AC-001，路由映射 400 JURISDICTION_REQUIRED）", () => {
    const parsed = PlanComputeRequestSchema.safeParse({
      user: { basic: { gender: "male" } },
    });
    expect(parsed.success).toBe(false);
  });

  it("客户端注入 rule_set_id：拒绝（JRP-FR-003/AC-006，不得绕过地区解析）", () => {
    const parsed = PlanComputeRequestSchema.safeParse({
      user: {},
      jurisdiction_code: "310000",
      rule_set_id: "RS-SHANGHAI-PLAN-V1",
    });
    expect(parsed.success).toBe(false);
  });

  it("客户端注入 policy_pack_id：拒绝（JRP-FR-003/AC-006）", () => {
    const parsed = PlanComputeRequestSchema.safeParse({
      user: {},
      jurisdiction_code: "310000",
      policy_pack_id: "SHANGHAI_BASE",
    });
    expect(parsed.success).toBe(false);
  });

  it("客户端注入 snapshot_id：拒绝（JRP-FR-003/AC-006）", () => {
    const parsed = PlanComputeRequestSchema.safeParse({
      user: {},
      jurisdiction_code: "310000",
      snapshot_id: "abc-123",
    });
    expect(parsed.success).toBe(false);
  });

  it("未知字段一律拒绝（strict，JRP-FR-003）", () => {
    const parsed = PlanComputeRequestSchema.safeParse({
      user: {},
      jurisdiction_code: "310000",
      weird_field: 1,
    });
    expect(parsed.success).toBe(false);
  });

  it("非法地区代码格式：拒绝（JRP-FR-002 稳定代码）", () => {
    const parsed = PlanComputeRequestSchema.safeParse({
      user: {},
      jurisdiction_code: "上海",
    });
    expect(parsed.success).toBe(false);
  });

  it("国家代码 CN 与6位省级代码均属合法格式（JRP-FR-002）", () => {
    expect(
      PlanComputeRequestSchema.safeParse({
        user: {},
        jurisdiction_code: "CN",
      }).success,
    ).toBe(true);
    expect(
      PlanComputeRequestSchema.safeParse({
        user: {},
        jurisdiction_code: "440000",
      }).success,
    ).toBe(true);
  });
});