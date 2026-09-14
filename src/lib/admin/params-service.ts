import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { params } from "@/lib/db/schema";

export type ParamRecord = typeof params.$inferSelect;

/** NRP-FR-021：按jurisdiction_code+param_id精确解析（version可选，默认该地区最新）。 */
export async function resolveParamRecordExact(
  paramKey: string,
  jurisdictionCode: string,
  version?: number,
): Promise<ParamRecord | null> {
  const numericId = Number(paramKey);
  if (Number.isInteger(numericId) && numericId > 0) {
    const rows = await db
      .select()
      .from(params)
      .where(and(eq(params.id, numericId), eq(params.jurisdictionCode, jurisdictionCode)))
      .limit(1);
    return rows[0] ?? null;
  }

  const conditions = [eq(params.paramId, paramKey), eq(params.jurisdictionCode, jurisdictionCode)];
  if (version !== undefined) {
    conditions.push(eq(params.version, version));
  }
  const rows = await db
    .select()
    .from(params)
    .where(and(...conditions))
    .orderBy(desc(params.version))
    .limit(1);
  return rows[0] ?? null;
}

export async function resolveParamRecord(paramKey: string): Promise<ParamRecord | null> {
  const numericId = Number(paramKey);

  if (Number.isInteger(numericId) && numericId > 0) {
    const rows = await db
      .select()
      .from(params)
      .where(eq(params.id, numericId))
      .limit(1);
    return rows[0] ?? null;
  }

  const rows = await db
    .select()
    .from(params)
    .where(eq(params.paramId, paramKey))
    .orderBy(desc(params.version))
    .limit(1);

  return rows[0] ?? null;
}

export function validateParamRecord(record: ParamRecord) {
  // 审查缺陷3：参数类型契约统一——
  // 标量类型 number|boolean|string|array 读取value；
  // 行式类型 table|timeline 读取rows；按类型做运行时校验。
  const VALUE_TYPES = ["number", "boolean", "string", "array"];
  const ROW_TYPES = ["table", "timeline"];

  let valueValid: boolean;
  if (VALUE_TYPES.includes(record.type)) {
    if (record.type === "number") {
      valueValid =
        typeof record.value === "number" && Number.isFinite(record.value);
    } else if (record.type === "boolean") {
      valueValid = typeof record.value === "boolean";
    } else if (record.type === "string") {
      valueValid = typeof record.value === "string";
    } else {
      valueValid = Array.isArray(record.value);
    }
    // 标量不得写rows（内容互斥）。
    if (valueValid && record.rows !== null && record.rows !== undefined) {
      valueValid = false;
    }
  } else if (ROW_TYPES.includes(record.type)) {
    valueValid = Array.isArray(record.rows);
  } else {
    valueValid = false;
  }

  const checks = [
    {
      name: "schema",
      passed: Boolean(record.paramId && record.type && record.policyPackId),
      detail: "检查 param_id/type/policy_pack_id",
    },
    {
      name: "value",
      passed: valueValid,
      detail: VALUE_TYPES.includes(record.type)
        ? `${record.type} 需要 ${record.type === "array" ? "数组" : record.type} 类型的 value`
        : ROW_TYPES.includes(record.type)
          ? `${record.type} 需要 rows 数组`
          : `未知参数类型：${record.type}`,
    },
  ];

  return {
    valid: checks.every((check) => check.passed),
    checks,
    results: {
      param_id: record.paramId,
      type: record.type,
    },
  };
}
