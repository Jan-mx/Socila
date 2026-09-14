/* eslint-disable @typescript-eslint/no-explicit-any */
import type { RuleDefinition, TraceEntry } from "@/types/engine";
import { rulesReads } from "@/server/modules/rules/application";
import { executeRule } from "./executor";
import { getDeep, setDeep } from "./actions";

export interface OrchestratorInput {
  user: Record<string, unknown>;
  as_of_date?: string;
  rule_set_id?: string;
  policy_pack_id?: string;
  // Camel-case aliases for API compatibility
  asOfDate?: string;
  ruleSetId?: string;
  policyPackId?: string;
}

export interface OrchestratorResult {
  plan: Record<string, unknown>;
  calc: Record<string, unknown>;
  user: Record<string, unknown>;
  trace: TraceEntry[];
  meta: {
    rule_set_id: string;
    policy_pack_id: string;
    as_of_date: string;
    rules_executed: number;
  };
  /** Effective rule definitions used in this run (for scenario re-computation) */
  effectiveRules?: RuleDefinition[];
  /** Flattened params used in this run (for scenario re-computation) */
  flatParams?: Record<string, unknown>;
}

const DEFAULT_RULE_SET = "RS-SHANGHAI-PLAN-V1";
const DEFAULT_POLICY_PACK = "SHANGHAI_BASE";
/** 国家baseline参数包（NRP-FR-005）：所有地区解析的参数底层，地区包按键覆盖。 */
export const NATIONAL_PARAM_PACK = "CN-BASELINE";

/**
 * Main orchestrator: loads rule set, params, and executes all rules sequentially.
 */
export async function orchestrate(
  input: OrchestratorInput,
): Promise<OrchestratorResult> {
  const ruleSetId = input.rule_set_id ?? input.ruleSetId ?? DEFAULT_RULE_SET;
  const policyPackId =
    input.policy_pack_id ?? input.policyPackId ?? DEFAULT_POLICY_PACK;
  const asOfDate =
    input.as_of_date ??
    input.asOfDate ??
    new Date().toISOString().split("T")[0];

  // Load rule set, rules, and params from DB.
  // NRP-FR-005/006：参数按继承链扁平化——国家baseline参数包垫底，地区包覆盖同名键。
  const [{ ruleSet, rules: effectiveRules }, nationalParams, regionalParams] =
    await Promise.all([
      rulesReads.getEffectiveRules(ruleSetId, asOfDate),
      rulesReads.getEffectiveParams(NATIONAL_PARAM_PACK, asOfDate),
      rulesReads.getEffectiveParams(policyPackId, asOfDate),
    ]);

  // Flatten params into a params namespace
  const flatParams = flattenParams([...nationalParams, ...regionalParams]);

  // Build initial context.
  // Seed calc._today with asOfDate so R-120's `date_diff_months(_today, retire_date)`
  // resolves (it was previously unset -> null -> months_to_legal_retire always 0).
  const ctx: any = {
    user: structuredClone(input.user),
    params: flatParams,
    calc: { _today: asOfDate },
    plan: {},
  };

  // Build rule map by rule_id for ordered execution
  const ruleMap = new Map<string, any>();
  for (const rule of effectiveRules) {
    ruleMap.set(rule.ruleId, rule);
  }

  // Get ordered rule_id array from rule set (already fetched above)
  const orderedRuleIds = (ruleSet?.rules as string[]) ?? [];

  // Execute rules sequentially in order, collecting RuleDefinitions for reuse
  const allTrace: TraceEntry[] = [];
  const ruleDefs: RuleDefinition[] = [];
  let rulesExecuted = 0;

  for (const ruleId of orderedRuleIds) {
    const dbRule = ruleMap.get(ruleId);
    if (!dbRule) continue;

    // Convert DB row to RuleDefinition
    const ruleDef: RuleDefinition = {
      dsl_version: dbRule.dslVersion,
      rule_id: dbRule.ruleId,
      name: dbRule.name,
      module: dbRule.module,
      status: dbRule.status,
      priority: dbRule.priority,
      effective_from: dbRule.effectiveFrom,
      effective_to: dbRule.effectiveTo,
      supersedes: dbRule.supersedes as string[],
      notes: dbRule.notes ?? undefined,
      inputs: dbRule.inputs as any[],
      parameter_refs: dbRule.parameterRefs as any[],
      decision_table: dbRule.decisionTable as any,
      outputs: dbRule.outputs as any[],
      examples: dbRule.examples as any[],
      evidence: dbRule.evidence as any[],
    };

    ruleDefs.push(ruleDef);

    const result = executeRule(ruleDef, ctx);
    allTrace.push(...result.trace);
    rulesExecuted++;

    // Auto-compute months_to_legal_retire after R-120 runs
    if (ruleId === "R-120-COMPUTE-RETIRE-DATE") {
      autoComputeMonthsToRetire(ctx, asOfDate);
    }
  }

  return {
    plan: ctx.plan ?? {},
    calc: ctx.calc ?? {},
    user: ctx.user ?? {},
    trace: allTrace,
    meta: {
      rule_set_id: ruleSetId,
      policy_pack_id: policyPackId,
      as_of_date: asOfDate,
      rules_executed: rulesExecuted,
    },
    effectiveRules: ruleDefs,
    flatParams,
  };
}

/**
 * Execute rules using in-memory rule definitions and params (no DB).
 * Used by the test runner and seed validation.
 */
export function orchestrateInMemory(
  rules: RuleDefinition[],
  params: Record<string, unknown>,
  userInput: Record<string, unknown>,
  asOfDate?: string,
): {
  plan: Record<string, unknown>;
  calc: Record<string, unknown>;
  user: Record<string, unknown>;
  trace: TraceEntry[];
} {
  const ctx: any = {
    user: structuredClone(userInput),
    params: structuredClone(params),
    calc: {},
    plan: {},
  };

  const allTrace: TraceEntry[] = [];

  for (const rule of rules) {
    const result = executeRule(rule, ctx);
    allTrace.push(...result.trace);

    // Auto-compute months_to_legal_retire after R-120
    if (rule.rule_id === "R-120-COMPUTE-RETIRE-DATE") {
      autoComputeMonthsToRetire(
        ctx,
        asOfDate ?? new Date().toISOString().split("T")[0],
      );
    }
  }

  return {
    plan: ctx.plan ?? {},
    calc: ctx.calc ?? {},
    user: ctx.user ?? {},
    trace: allTrace,
  };
}

/**
 * Execute a single rule in-memory against a given context.
 * Used by the test runner for single-rule tests.
 */
export function executeSingleRuleInMemory(
  rule: RuleDefinition,
  ctx: any,
): { ctx: any; trace: TraceEntry[] } {
  return executeRule(rule, ctx);
}

/**
 * Flatten DB param rows into a flat params map.
 * Scalar params: params[param_id] = value
 * Table/timeline params: params[param_id] = rows
 * Array params: params[param_id] = value (already an array)
 */
function flattenParams(dbParams: any[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const p of dbParams) {
    const paramId = p.paramId;
    const type = p.type;

    if (type === "table" || type === "timeline") {
      // Table/timeline params store rows in the rows column
      result[paramId] = p.rows ?? [];
    } else {
      // Scalar params (number, boolean, string, array) store in value
      result[paramId] = p.value;
    }
  }

  return result;
}

/**
 * Auto-compute user.subsidy.months_to_legal_retire after R-120.
 * R-520/R-530 depend on this field; it's marked as "可自动算" in the PRD.
 */
function autoComputeMonthsToRetire(ctx: any, asOfDate: string): void {
  const retireDate = getDeep(ctx, "calc.retirement.legal_retire_date");
  const existing = getDeep(ctx, "user.subsidy.months_to_legal_retire");

  if (retireDate && (existing === null || existing === undefined)) {
    const fromParts = asOfDate.split("-");
    const toParts = String(retireDate).split("-");

    if (fromParts.length >= 2 && toParts.length >= 2) {
      const fromYear = parseInt(fromParts[0], 10);
      const fromMonth = parseInt(fromParts[1], 10);
      const toYear = parseInt(toParts[0], 10);
      const toMonth = parseInt(toParts[1], 10);

      const months = (toYear - fromYear) * 12 + (toMonth - fromMonth);
      setDeep(ctx, "user.subsidy.months_to_legal_retire", months);
    }
  }
}

// ─── 快照驱动执行（任务3 JRP-FR-008）────────────────────────────────────────
// 规则引擎从不可变 PolicySnapshot 成员（DB 行形状 payload）还原有序规则与参数，
// 不再按公开请求中的 rule_set_id/policy_pack_id 查询数据库（JRP-FR-004/008）。

export interface SnapshotRuleRow {
  ruleId: string;
  dslVersion: string;
  name: string;
  module: string;
  status: string;
  priority: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  supersedes: unknown;
  inputs: unknown;
  parameterRefs: unknown;
  decisionTable: unknown;
  outputs: unknown;
  examples: unknown;
  evidence: unknown;
  notes?: string | null;
}

export interface SnapshotParamRow {
  paramId: string;
  type: string;
  value?: unknown;
  rows?: unknown;
  effectiveFrom: string;
  effectiveTo: string | null;
  policyPackId?: string;
  version?: number;
}

export interface SnapshotRuleSetRow {
  ruleSetId: string;
  rules: string[];
  version: number;
}

export interface OrchestrateSnapshotInput {
  user: Record<string, unknown>;
  asOfDate: string;
  /** 执行顺序来源：快照规则集成员 payload 的 rules 数组。 */
  ruleSet: SnapshotRuleSetRow | null;
  /** 快照规则成员 payload（DB 行形状）。 */
  rules: SnapshotRuleRow[];
  /** 快照参数成员 payload（DB 行形状，含有效窗口已按快照日期固定）。 */
  params: SnapshotParamRow[];
}

/** 快照成员规则行 → RuleDefinition（字段与 orchestrate 的 DB 行映射一致）。 */
export function snapshotRulesToDefinitions(
  ruleRows: SnapshotRuleRow[],
): RuleDefinition[] {
  return ruleRows.map((dbRule) => ({
    dsl_version: dbRule.dslVersion,
    rule_id: dbRule.ruleId,
    name: dbRule.name,
    module: dbRule.module,
    status: (dbRule.status === "published" ||
    dbRule.status === "draft" ||
    dbRule.status === "retired"
      ? dbRule.status
      : "draft") as RuleDefinition["status"],
    priority: dbRule.priority,
    effective_from: dbRule.effectiveFrom,
    effective_to: dbRule.effectiveTo,
    supersedes: (dbRule.supersedes as string[]) ?? [],
    notes: dbRule.notes ?? undefined,
    inputs: (dbRule.inputs as any[]) ?? [],
    parameter_refs: (dbRule.parameterRefs as any[]) ?? [],
    decision_table: dbRule.decisionTable as any,
    outputs: (dbRule.outputs as any[]) ?? [],
    examples: (dbRule.examples as any[]) ?? [],
    evidence: (dbRule.evidence as any[]) ?? [],
  }));
}

/** 快照成员参数行 → 扁平参数命名空间（表/时间线取 rows，其余取 value）。 */
export function snapshotParamsToFlat(
  paramRows: SnapshotParamRow[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const p of paramRows) {
    if (p.type === "table" || p.type === "timeline") {
      result[p.paramId] = p.rows ?? [];
    } else {
      result[p.paramId] = p.value;
    }
  }
  return result;
}

/**
 * 从活动快照成员执行规则引擎（JRP-FR-008）：快照已按 as_of_date 固定成员，
 * 本函数不做任何数据库查询与窗口过滤——成员即权威执行集合。
 */
export function orchestrateSnapshot(
  input: OrchestrateSnapshotInput,
): OrchestratorResult {
  const asOfDate = input.asOfDate;
  const ruleDefs = snapshotRulesToDefinitions(input.rules);
  const flatParams = snapshotParamsToFlat(input.params);

  const ruleMap = new Map<string, RuleDefinition>();
  for (const rule of ruleDefs) {
    ruleMap.set(rule.rule_id, rule);
  }

  // 执行顺序来自快照规则集成员 payload；规则集缺失时按业务键稳定排序。
  const orderedRuleIds =
    input.ruleSet?.rules.length
      ? input.ruleSet.rules
      : ruleDefs.map((r) => r.rule_id).sort();

  const ctx: any = {
    user: structuredClone(input.user),
    params: flatParams,
    calc: { _today: asOfDate },
    plan: {},
  };

  const allTrace: TraceEntry[] = [];
  const executedDefs: RuleDefinition[] = [];
  let rulesExecuted = 0;

  for (const ruleId of orderedRuleIds) {
    const rule = ruleMap.get(ruleId);
    if (!rule) continue;
    executedDefs.push(rule);
    const result = executeRule(rule, ctx);
    allTrace.push(...result.trace);
    rulesExecuted++;
    if (ruleId === "R-120-COMPUTE-RETIRE-DATE") {
      autoComputeMonthsToRetire(ctx, asOfDate);
    }
  }

  const packIds = [
    ...new Set(input.params.map((p) => p.policyPackId).filter(Boolean)),
  ];

  return {
    plan: ctx.plan ?? {},
    calc: ctx.calc ?? {},
    user: ctx.user ?? {},
    trace: allTrace,
    meta: {
      rule_set_id: input.ruleSet?.ruleSetId ?? "snapshot",
      policy_pack_id: packIds.length > 0 ? packIds.join("+") : "snapshot",
      as_of_date: asOfDate,
      rules_executed: rulesExecuted,
    },
    effectiveRules: executedDefs,
    flatParams,
  };
}
