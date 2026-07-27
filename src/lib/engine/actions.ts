/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Action } from "@/types/engine";
import { evaluateJsonLogic, isJsonLogicExpression } from "./json-logic";
import { getBuiltinFunction } from "./builtins";

/**
 * Deep-get a value from a nested object using a dotted path.
 * e.g., getDeep(ctx, "user.basic.birth_year") -> ctx.user.basic.birth_year
 */
export function getDeep(obj: any, path: string): any {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Deep-set a value in a nested object using a dotted path.
 * Creates intermediate objects as needed.
 * e.g., setDeep(ctx, "calc.pension.gap_months", 12)
 */
export function setDeep(obj: any, path: string, value: unknown): void {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (
      current[part] === null ||
      current[part] === undefined ||
      typeof current[part] !== "object"
    ) {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Execute a single action against the context.
 * CRITICAL: Each action writes to ctx immediately (sequential write-through).
 * Returns the list of paths that were written.
 */
export function executeAction(action: Action, ctx: any): string[] {
  switch (action.type) {
    case "set":
      return executeSet(action, ctx);
    case "lookup":
      return executeLookup(action, ctx);
    case "call":
      return executeCall(action, ctx);
    case "emit_question":
      return executeEmitQuestion(action, ctx);
    case "emit_warning":
      return executeEmitWarning(action, ctx);
    case "emit_caveat":
      return executeEmitCaveat(action, ctx);
    default:
      return [];
  }
}

/**
 * SET action: set(path, value)
 * CRITICAL: If value is a plain object with operator keys, evaluate as JSONLogic.
 * If value is a primitive (string, number, boolean, null), use directly.
 */
function executeSet(
  action: { path: string; value: unknown },
  ctx: any,
): string[] {
  let resolvedValue: unknown;

  if (isJsonLogicExpression(action.value)) {
    resolvedValue = evaluateJsonLogic(action.value, ctx);
  } else {
    resolvedValue = action.value;
  }

  setDeep(ctx, action.path, resolvedValue);
  return [action.path];
}

/**
 * LOOKUP action: lookup(table_param_id, key, into)
 * Resolve key values, then match against param table rows.
 *
 * Range matching (CRITICAL - three cases):
 * 1. Both _min and _max present: min <= value AND value < max (half-open [min, max))
 * 2. Only _max present: value <= max (inclusive upper bound)
 * 3. Only _min present: value >= min (open-ended)
 * 4. Exact field (no _min/_max suffix): equality match
 */
function executeLookup(
  action: {
    table_param_id: string;
    key: Record<string, unknown>;
    into: string;
    into_map?: Record<string, string>;
  },
  ctx: any,
): string[] {
  // Resolve key values
  const resolvedKey: Record<string, any> = {};
  for (const [field, expr] of Object.entries(action.key)) {
    if (isJsonLogicExpression(expr)) {
      resolvedKey[field] = evaluateJsonLogic(expr, ctx);
    } else if (
      typeof expr === "object" &&
      expr !== null &&
      "var" in (expr as any)
    ) {
      resolvedKey[field] = evaluateJsonLogic(expr, ctx);
    } else {
      resolvedKey[field] = expr;
    }
  }

  // Get the table data from params
  const tableData = getDeep(ctx, `params.${action.table_param_id}`);
  if (!Array.isArray(tableData)) {
    if (action.into_map) {
      const paths = Object.values(action.into_map);
      for (const p of paths) setDeep(ctx, p, null);
      return paths;
    }
    setDeep(ctx, action.into, null);
    return [action.into];
  }

  // Find matching row
  const matchingRow = findMatchingRow(tableData, resolvedKey);

  if (matchingRow) {
    // into_map: extract multiple value fields to separate paths
    if (action.into_map) {
      const writtenPaths: string[] = [];
      for (const [tableField, ctxPath] of Object.entries(action.into_map)) {
        const val =
          tableField in matchingRow ? matchingRow[tableField] : null;
        setDeep(ctx, ctxPath, val);
        writtenPaths.push(ctxPath);
      }
      return writtenPaths;
    }

    // Legacy single-field: extract the value field (first non-key field)
    const keyFieldNames = Object.keys(resolvedKey);
    const valueFieldName = Object.keys(matchingRow).find((k) => {
      const isKeyField = keyFieldNames.some(
        (kf) => k === kf || k === `${kf}_min` || k === `${kf}_max`,
      );
      return !isKeyField;
    });

    if (valueFieldName !== undefined) {
      setDeep(ctx, action.into, matchingRow[valueFieldName]);
    } else {
      setDeep(ctx, action.into, null);
    }
  } else {
    if (action.into_map) {
      const paths = Object.values(action.into_map);
      for (const p of paths) setDeep(ctx, p, null);
      return paths;
    }
    setDeep(ctx, action.into, null);
  }

  return action.into_map ? Object.values(action.into_map) : [action.into];
}

/**
 * Find a matching row in a table based on key matching with range support.
 */
function findMatchingRow(
  rows: Record<string, any>[],
  key: Record<string, any>,
): Record<string, any> | null {
  for (const row of rows) {
    if (rowMatches(row, key)) {
      return row;
    }
  }
  return null;
}

/**
 * Check if a row matches the given key values.
 * Supports exact match and range match (_min/_max).
 */
function rowMatches(
  row: Record<string, any>,
  key: Record<string, any>,
): boolean {
  for (const [field, value] of Object.entries(key)) {
    const hasMin = `${field}_min` in row;
    const hasMax = `${field}_max` in row;
    const hasExact = field in row;

    if (hasMin || hasMax) {
      // Range matching
      const numValue = Number(value);
      if (hasMin && hasMax) {
        const min = row[`${field}_min`];
        const max = row[`${field}_max`];
        if (min === max) {
          // Case 1a: Single-value bucket (min === max) -> inclusive equality.
          // T-MIN-PENSION-YEARS-BY-RETIRE-YEAR uses { _min: 2030, _max: 2030 }
          // to mean "retire year 2030"; a half-open [2030, 2030) would never match,
          // silently dropping min-pension-years for retirement years 2030–2038.
          if (numValue !== min) {
            return false;
          }
        } else if (numValue < min || numValue >= max) {
          // Case 1b: Contiguous range -> half-open [min, max).
          return false;
        }
      } else if (hasMax && !hasMin) {
        // Case 2: Only _max -> value <= max (inclusive)
        if (numValue > row[`${field}_max`]) {
          return false;
        }
      } else if (hasMin && !hasMax) {
        // Case 3: Only _min -> value >= min (open-ended)
        if (numValue < row[`${field}_min`]) {
          return false;
        }
      }
    } else if (hasExact) {
      // Case 4: Exact match
      if (row[field] !== value) {
        return false;
      }
    }
    // If neither range nor exact field exists in the row, skip this key
  }
  return true;
}

/**
 * CALL action: call(fn, args, into)
 * Resolve each arg via JSONLogic if it's an object, then call the builtin function.
 */
function executeCall(
  action: { fn: string; args: Record<string, unknown>; into: string },
  ctx: any,
): string[] {
  const fn = getBuiltinFunction(action.fn);
  if (!fn) {
    setDeep(ctx, action.into, null);
    return [action.into];
  }

  // Resolve arguments
  const resolvedArgs: Record<string, unknown> = {};
  for (const [name, expr] of Object.entries(action.args)) {
    if (typeof expr === "object" && expr !== null) {
      resolvedArgs[name] = evaluateJsonLogic(expr, ctx);
    } else {
      resolvedArgs[name] = expr;
    }
  }

  const result = fn(resolvedArgs);
  setDeep(ctx, action.into, result);
  return [action.into];
}

/**
 * EMIT_QUESTION action: Append to calc.agent_questions[], deduplicate by question_id.
 */
function executeEmitQuestion(
  action: {
    value: { question_id: string; text: string; field?: string };
  },
  ctx: any,
): string[] {
  if (!ctx.calc) ctx.calc = {};
  if (!Array.isArray(ctx.calc.agent_questions)) {
    ctx.calc.agent_questions = [];
  }

  const existing = ctx.calc.agent_questions.find(
    (q: any) => q.question_id === action.value.question_id,
  );
  if (!existing) {
    ctx.calc.agent_questions.push({ ...action.value });
  }

  return ["calc.agent_questions"];
}

/**
 * EMIT_WARNING action: Append to calc.warnings[], deduplicate by warning_id.
 */
function executeEmitWarning(
  action: {
    value: { warning_id: string; text: string };
  },
  ctx: any,
): string[] {
  if (!ctx.calc) ctx.calc = {};
  if (!Array.isArray(ctx.calc.warnings)) {
    ctx.calc.warnings = [];
  }

  const existing = ctx.calc.warnings.find(
    (w: any) => w.warning_id === action.value.warning_id,
  );
  if (!existing) {
    ctx.calc.warnings.push({ ...action.value });
  }

  return ["calc.warnings"];
}

/**
 * EMIT_CAVEAT action: Append to calc.caveats[], deduplicate by caveat_id.
 */
function executeEmitCaveat(
  action: {
    value: {
      caveat_id: string;
      text: string;
      confidence: "high" | "medium" | "low";
      source?: string;
    };
  },
  ctx: any,
): string[] {
  if (!ctx.calc) ctx.calc = {};
  if (!Array.isArray(ctx.calc.caveats)) {
    ctx.calc.caveats = [];
  }

  const existing = ctx.calc.caveats.find(
    (c: any) => c.caveat_id === action.value.caveat_id,
  );
  if (!existing) {
    ctx.calc.caveats.push({ ...action.value });
  }

  return ["calc.caveats"];
}
