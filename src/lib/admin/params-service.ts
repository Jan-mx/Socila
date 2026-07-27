import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { params } from "@/lib/db/schema";

export type ParamRecord = typeof params.$inferSelect;

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
  const checks = [
    {
      name: "schema",
      passed: Boolean(record.paramId && record.type && record.policyPackId),
      detail: "检查 param_id/type/policy_pack_id",
    },
    {
      name: "value",
      passed:
        record.type === "scalar"
          ? record.value !== null
          : Array.isArray(record.rows),
      detail:
        record.type === "scalar"
          ? "scalar 需要 value"
          : "table/timeline/array 需要 rows",
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
