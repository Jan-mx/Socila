/* eslint-disable @typescript-eslint/no-explicit-any */
import jsonLogic from "json-logic-js";

// Register custom operator: intersects(a, b) - array intersection check
jsonLogic.add_operation("intersects", (a: unknown, b: unknown) => {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  return a.some((item) => b.includes(item));
});

// Register custom operator: ceil(x) - Math.ceil
jsonLogic.add_operation("ceil", (x: unknown) => {
  if (typeof x === "number") return Math.ceil(x);
  if (Array.isArray(x) && typeof x[0] === "number") return Math.ceil(x[0]);
  return 0;
});

// Register custom operator: floor(x) - Math.floor
jsonLogic.add_operation("floor", (x: unknown) => {
  if (typeof x === "number") return Math.floor(x);
  if (Array.isArray(x) && typeof x[0] === "number") return Math.floor(x[0]);
  return 0;
});

/**
 * Evaluate a JSONLogic expression against data.
 * Used for both `when` conditions (returns boolean) and
 * `set` value expressions (returns computed value).
 */
export function evaluateJsonLogic(logic: unknown, data: unknown): any {
  if (logic === null || logic === undefined) return logic;
  if (typeof logic !== "object") return logic;

  // Empty object {} is always-true (catch-all pattern)
  if (
    typeof logic === "object" &&
    !Array.isArray(logic) &&
    Object.keys(logic as object).length === 0
  ) {
    return true;
  }

  return jsonLogic.apply(logic as any, data as any);
}

/**
 * Check if a value looks like a JSONLogic expression (has operator keys).
 * Primitives (string, number, boolean, null) are NOT expressions.
 * Arrays are NOT expressions (they're literal arrays).
 * Objects with operator keys (var, +, -, *, /, max, min, ceil, etc.) ARE expressions.
 */
export function isJsonLogicExpression(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value !== "object") return false;
  if (Array.isArray(value)) return false;

  const keys = Object.keys(value as object);
  if (keys.length === 0) return false;

  // Known JSONLogic operators
  const operators = new Set([
    "var",
    "and",
    "or",
    "!",
    "!!",
    "not",
    "if",
    "==",
    "===",
    "!=",
    "!==",
    ">",
    ">=",
    "<",
    "<=",
    "+",
    "-",
    "*",
    "/",
    "%",
    "max",
    "min",
    "merge",
    "in",
    "cat",
    "substr",
    "log",
    "map",
    "filter",
    "reduce",
    "all",
    "some",
    "none",
    "missing",
    "missing_some",
    // Custom operators
    "intersects",
    "ceil",
    "floor",
  ]);

  return keys.some((k) => operators.has(k));
}
