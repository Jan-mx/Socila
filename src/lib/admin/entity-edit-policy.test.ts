/**
 * 审查缺陷2：管理端编辑字段白名单（TDD Red）。
 * PATCH/PUT/POST不得接受任意body直接写Repository：
 * - 受控字段（status/version/jurisdictionCode/businessKey/ruleId/paramId/
 *   policyPackId/createdAt/updatedAt及蛇形变体）出现即400，不得静默忽略；
 * - 未知字段拒绝（白名单语义）；
 * - 只允许编辑草稿业务内容；状态转换只能走publishing用例。
 */
import { describe, it, expect } from "vitest";
import {
  sanitizeRuleEdit,
  sanitizeParamEdit,
  sanitizeRuleSetEdit,
  CONTROLLED_FIELDS,
} from "./entity-edit-policy";

describe("规则编辑白名单（审查缺陷2）", () => {
  it("允许草稿业务内容字段", () => {
    const out = sanitizeRuleEdit({
      name: "新名称",
      module: "pension",
      priority: 110,
      decisionTable: { hit_policy: "first", rows: [] },
      notes: "备注",
      effectiveFrom: "2024-01-01",
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(Object.keys(out.fields).sort()).toEqual([
        "decisionTable",
        "effectiveFrom",
        "module",
        "name",
        "notes",
        "priority",
      ]);
    }
  });

  it("status字段出现即拒绝且不静默忽略", () => {
    const out = sanitizeRuleEdit({ name: "x", status: "published" });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.controlledFields).toContain("status");
      expect(out.controlledFields).not.toContain("name");
    }
  });

  it("全部受控字段（含蛇形变体）逐一拒绝", () => {
    for (const field of CONTROLLED_FIELDS) {
      const body: Record<string, unknown> = { name: "x" };
      body[field] = field === "version" ? 9 : "x";
      const out = sanitizeRuleEdit(body);
      expect(out.ok, `${field} 应被拒绝`).toBe(false);
      if (!out.ok) expect(out.controlledFields.length).toBeGreaterThan(0);
    }
  });

  it("未知字段拒绝（白名单语义）", () => {
    const out = sanitizeRuleEdit({ name: "x", hackerField: true });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.unknownFields).toContain("hackerField");
  });

  it("空body拒绝", () => {
    expect(sanitizeRuleEdit({}).ok).toBe(false);
  });
});

describe("参数编辑白名单（审查缺陷2）", () => {
  it("允许业务内容字段（value/rows/unit/effective窗口/evidence等）", () => {
    const out = sanitizeParamEdit({
      value: 2690,
      unit: "yuan/month",
      effectiveFrom: "2024-07-01",
      effectiveTo: null,
      note: "x",
      rows: [{ a: 1 }],
      keyFields: ["g"],
      valueFields: ["v"],
      source: "doc:X",
      evidence: [],
    });
    expect(out.ok).toBe(true);
  });

  it("受控字段拒绝", () => {
    for (const field of CONTROLLED_FIELDS) {
      const body: Record<string, unknown> = { note: "x" };
      body[field] = field === "version" ? 9 : "x";
      const out = sanitizeParamEdit(body);
      expect(out.ok, `${field} 应被拒绝`).toBe(false);
    }
    // policyPackId变体
    expect(sanitizeParamEdit({ policy_pack_id: "X" }).ok).toBe(false);
  });

  it("未知字段拒绝", () => {
    const out = sanitizeParamEdit({ value: 1, extra: 1 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.unknownFields).toContain("extra");
  });
});

describe("规则集编辑白名单（审查缺陷2）", () => {
  it("允许rules/description/conflict_resolution/effective_from", () => {
    const out = sanitizeRuleSetEdit({
      rules: ["R-1", "R-2"],
      description: "d",
      conflict_resolution: {},
      effective_from: "2024-01-01",
    });
    expect(out.ok).toBe(true);
  });

  it("status与jurisdiction等受控字段拒绝", () => {
    expect(sanitizeRuleSetEdit({ rules: [], status: "published" }).ok).toBe(false);
    expect(sanitizeRuleSetEdit({ rules: [], jurisdiction_code: "CN" }).ok).toBe(false);
    expect(sanitizeRuleSetEdit({ rules: [], version: 3 }).ok).toBe(false);
  });
});
