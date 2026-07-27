import { describe, it, expect } from "vitest";
import { executeRule } from "../executor";
import { getDeep, setDeep, executeAction } from "../actions";
import type { RuleDefinition } from "@/types/engine";

function makeRule(partial: Partial<RuleDefinition>): RuleDefinition {
  return {
    dsl_version: "ssp_dsl_v1",
    rule_id: "R-TEST",
    name: "test",
    status: "published",
    priority: 0,
    effective_from: "2025-01-01",
    inputs: [],
    parameter_refs: [],
    decision_table: { hit_policy: "first", rows: [] },
    outputs: [],
    examples: [],
    ...partial,
  };
}

describe("actions · getDeep/setDeep", () => {
  it("按点路径读写嵌套对象", () => {
    const ctx: Record<string, unknown> = {};
    setDeep(ctx, "calc.pension.gap_months", 12);
    expect(getDeep(ctx, "calc.pension.gap_months")).toBe(12);
  });

  it("读不存在路径返回 undefined", () => {
    expect(getDeep({}, "a.b.c")).toBeUndefined();
  });
});

describe("executor · executeRule (hit_policy=first)", () => {
  it("空 when {} 为永真兜底行", () => {
    const rule = makeRule({
      decision_table: {
        hit_policy: "first",
        rows: [
          {
            row_id: "row-default",
            when: {},
            then: { actions: [{ type: "set", path: "calc.x", value: 1 }] },
          },
        ],
      },
    });
    const ctx: Record<string, unknown> = { calc: {} };
    const { trace } = executeRule(rule, ctx);
    expect(getDeep(ctx, "calc.x")).toBe(1);
    expect(trace[0].matched).toBe(true);
    expect(trace[0].row_id).toBe("row-default");
  });

  it("first 命中后停止（不执行后续行）", () => {
    const rule = makeRule({
      decision_table: {
        hit_policy: "first",
        rows: [
          {
            row_id: "row-1",
            when: {},
            then: { actions: [{ type: "set", path: "calc.hit", value: "first" }] },
          },
          {
            row_id: "row-2",
            when: {},
            then: { actions: [{ type: "set", path: "calc.hit", value: "second" }] },
          },
        ],
      },
    });
    const ctx: Record<string, unknown> = { calc: {} };
    executeRule(rule, ctx);
    expect(getDeep(ctx, "calc.hit")).toBe("first");
  });

  it("无命中行时产出 matched=false 的 trace", () => {
    const rule = makeRule({
      decision_table: {
        hit_policy: "first",
        rows: [
          {
            row_id: "row-1",
            when: { "==": [{ var: "user.basic.gender" }, "male"] },
            then: { actions: [{ type: "set", path: "calc.x", value: 1 }] },
          },
        ],
      },
    });
    const ctx: Record<string, unknown> = {
      user: { basic: { gender: "female" } },
      calc: {},
    };
    const { trace } = executeRule(rule, ctx);
    expect(trace).toHaveLength(1);
    expect(trace[0].matched).toBe(false);
    expect(trace[0].row_id).toBe("none");
  });
});

describe("actions · emit_* 写入 ctx.calc（plan-service 据此抽取）", () => {
  it("emit_question 追加到 calc.agent_questions 并按 id 去重", () => {
    const ctx: Record<string, unknown> = { calc: {} };
    executeAction(
      {
        type: "emit_question",
        value: { question_id: "Q1", text: "你的性别？", field: "basic.gender" },
      },
      ctx,
    );
    executeAction(
      {
        type: "emit_question",
        value: { question_id: "Q1", text: "重复问题", field: "basic.gender" },
      },
      ctx,
    );
    const questions = getDeep(ctx, "calc.agent_questions") as unknown[];
    expect(questions).toHaveLength(1);
  });

  it("emit_warning / emit_caveat 各自累积", () => {
    const ctx: Record<string, unknown> = { calc: {} };
    executeAction(
      { type: "emit_warning", value: { warning_id: "W1", text: "注意" } },
      ctx,
    );
    executeAction(
      {
        type: "emit_caveat",
        value: { caveat_id: "C1", text: "仅供参考", confidence: "medium" },
      },
      ctx,
    );
    expect((getDeep(ctx, "calc.warnings") as unknown[]).length).toBe(1);
    expect((getDeep(ctx, "calc.caveats") as unknown[]).length).toBe(1);
  });
});

describe("actions · lookup 区间表匹配（_min/_max）", () => {
  it("单值桶 _min === _max 按等值命中（退休年份 2030–2038 不再丢失最低缴费年限）", () => {
    const ctx: Record<string, unknown> = {
      params: {
        "T-MIN-PENSION": [
          { retire_year_max: 2029, min_years: 15 },
          { retire_year_min: 2030, retire_year_max: 2030, min_years: 15.5 },
          { retire_year_min: 2036, retire_year_max: 2036, min_years: 18.5 },
          { retire_year_min: 2039, min_years: 20 },
        ],
      },
      calc: {},
    };
    executeAction(
      {
        type: "lookup",
        table_param_id: "T-MIN-PENSION",
        key: { retire_year: 2030 },
        into: "calc.min_years",
      },
      ctx,
    );
    expect(getDeep(ctx, "calc.min_years")).toBe(15.5);

    executeAction(
      {
        type: "lookup",
        table_param_id: "T-MIN-PENSION",
        key: { retire_year: 2036 },
        into: "calc.min_years_2036",
      },
      ctx,
    );
    expect(getDeep(ctx, "calc.min_years_2036")).toBe(18.5);
  });

  it("连续区间 _min < _max 仍按半开 [min, max) 命中", () => {
    const ctx: Record<string, unknown> = {
      params: {
        "T-RANGE": [
          { years_min: 1, years_max: 5, months: 12 },
          { years_min: 5, years_max: 10, months: 18 },
        ],
      },
      calc: {},
    };
    // 5 落在 [5,10) 而非 [1,5)
    executeAction(
      {
        type: "lookup",
        table_param_id: "T-RANGE",
        key: { years: 5 },
        into: "calc.m",
      },
      ctx,
    );
    expect(getDeep(ctx, "calc.m")).toBe(18);
  });
});
