/* eslint-disable @typescript-eslint/no-explicit-any */
import type { RuleDefinition, TraceEntry, Action } from "@/types/engine";
import { evaluateJsonLogic } from "./json-logic";
import { executeAction } from "./actions";

/**
 * Execute a single rule's decision table against the context.
 *
 * For hit_policy "first": evaluate rows in order, first match executes actions, stop.
 * For hit_policy "all": evaluate all rows, execute actions for all matches.
 *
 * CRITICAL: Empty when: {} is always-true (catch-all/default row).
 * CRITICAL: Each action writes to ctx immediately; next action sees updated values.
 *
 * Returns updated ctx and trace entries.
 */
export function executeRule(
  rule: RuleDefinition,
  ctx: any,
): { ctx: any; trace: TraceEntry[] } {
  const { decision_table } = rule;
  const hitPolicy = decision_table.hit_policy;
  const traceEntries: TraceEntry[] = [];

  for (const row of decision_table.rows) {
    const matched = evaluateCondition(row.when, ctx);

    if (matched) {
      const writes: string[] = [];

      // Execute actions sequentially - each writes to ctx immediately
      for (const action of row.then.actions) {
        const actionWrites = executeAction(action as Action, ctx);
        writes.push(...actionWrites);
      }

      traceEntries.push({
        rule_id: rule.rule_id,
        row_id: row.row_id,
        matched: true,
        actions_executed: row.then.actions as Action[],
        timestamp: Date.now(),
      });

      // For "first" hit policy, stop after first match
      if (hitPolicy === "first") {
        break;
      }
    }
  }

  // If no rows matched, add a trace entry indicating no match
  if (traceEntries.length === 0) {
    traceEntries.push({
      rule_id: rule.rule_id,
      row_id: "none",
      matched: false,
      actions_executed: [],
      timestamp: Date.now(),
    });
  }

  return { ctx, trace: traceEntries };
}

/**
 * Evaluate a `when` condition.
 * Empty object {} is treated as always-true (catch-all).
 */
function evaluateCondition(when: Record<string, unknown>, ctx: any): boolean {
  // Empty when {} is always-true
  if (Object.keys(when).length === 0) {
    return true;
  }

  const result = evaluateJsonLogic(when, ctx);

  // Coerce to boolean
  return Boolean(result);
}
