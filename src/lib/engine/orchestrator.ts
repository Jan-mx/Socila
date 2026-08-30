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

  // Load rule set, rules, and params from DB
  const [{ ruleSet, rules: effectiveRules }, effectiveParams] =
    await Promise.all([
      rulesReads.getEffectiveRules(ruleSetId, asOfDate),
      rulesReads.getEffectiveParams(policyPackId, asOfDate),
    ]);

  // Flatten params into a params namespace
  const flatParams = flattenParams(effectiveParams);

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
