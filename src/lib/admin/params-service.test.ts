/**
 * 审查缺陷3：参数类型契约统一（TDD Red）。
 * DSL与现有数据库的标量类型为 number|boolean|string|array；
 * 行式参数类型为 table|timeline。不得把标量改成不存在的scalar类型。
 * validateParamRecord必须按类型做运行时校验：
 * - number/boolean/string读取value（number须为数值、boolean须为布尔、string须为字符串）；
 * - array读取value（须为数组）；
 * - table/timeline读取rows（须为数组）。
 */
import { describe, it, expect } from "vitest";
import { validateParamRecord, type ParamRecord } from "./params-service";

function rec(overrides: Partial<ParamRecord>): ParamRecord {
  return {
    id: 1,
    policyPackId: "PACK",
    jurisdictionCode: "310000",
    businessKey: "P-X",
    paramId: "P-X",
    type: "number",
    value: 1,
    unit: null,
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
    source: null,
    keyFields: null,
    valueFields: null,
    rows: null,
    note: null,
    version: 1,
    status: "draft",
    operation: "add",
    targetBusinessKey: null,
    evidence: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ParamRecord;
}

describe("参数类型契约（审查缺陷3）", () => {
  it("number类型读取value且须为数值", () => {
    expect(validateParamRecord(rec({ type: "number", value: 7 })).valid).toBe(true);
    expect(validateParamRecord(rec({ type: "number", value: null })).valid).toBe(false);
    expect(validateParamRecord(rec({ type: "number", value: "7" })).valid).toBe(false);
  });

  it("boolean类型读取value且须为布尔", () => {
    expect(validateParamRecord(rec({ type: "boolean", value: true })).valid).toBe(true);
    expect(validateParamRecord(rec({ type: "boolean", value: "true" })).valid).toBe(false);
  });

  it("string类型读取value且须为字符串", () => {
    expect(validateParamRecord(rec({ type: "string", value: "x" })).valid).toBe(true);
    expect(validateParamRecord(rec({ type: "string", value: 1 })).valid).toBe(false);
  });

  it("array类型读取value且须为数组", () => {
    expect(validateParamRecord(rec({ type: "array", value: [7, 8] })).valid).toBe(true);
    expect(validateParamRecord(rec({ type: "array", value: "7,8" })).valid).toBe(false);
  });

  it("table/timeline类型读取rows且须为数组", () => {
    expect(
      validateParamRecord(rec({ type: "table", value: null, rows: [{ m: 1 }] })).valid,
    ).toBe(true);
    expect(
      validateParamRecord(rec({ type: "timeline", value: null, rows: [] })).valid,
    ).toBe(true);
    expect(
      validateParamRecord(rec({ type: "table", value: null, rows: null })).valid,
    ).toBe(false);
  });

  it("数值参数误写入rows视为无效（不得把数值写入rows）", () => {
    expect(
      validateParamRecord(rec({ type: "number", value: null, rows: [1] })).valid,
    ).toBe(false);
  });

  it("未知类型无效", () => {
    expect(validateParamRecord(rec({ type: "scalar", value: 1 })).valid).toBe(false);
    expect(validateParamRecord(rec({ type: "whatever", value: 1 })).valid).toBe(false);
  });
});
