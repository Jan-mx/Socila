/**
 * CLG-FR-005 规范化SHA-256内容哈希：
 * - canonicalJson：键排序+稳定序列化，JSON.stringify序不影响结果；
 * - rowContentHash：按稳定字段顺序计算，时间戳与数据库自增ID可排除
 *   （时间戳/自增ID不进入业务内容哈希）；
 * - RCL第三轮复审：node-postgres对date列返回本地时区Date对象，canonicalJson
 *   必须把Date规范化成YYYY-MM-DD字符串，保证跨时区/跨环境确定性；
 * - testRowContentHash：tests行的唯一规范化hash（plan-replacement与apply共同
 *   调用，RCL-FR-002/AC-003）；排除范围只允许数据库基础字段（自增ID、受控
 *   时间戳与运行时执行状态），name/jurisdiction_code/rule_id/input/
 *   params_override/expected/source/source_case_uid等业务字段全部进入hash。
 */
import { createHash } from "node:crypto";

/** 值规范化：Date→YYYY-MM-DD（node-postgres date列是本地时区Date）。 */
function normalizeValue(value: unknown): unknown {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = normalizeValue((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}

export function sha256hex(input: string): string {
  return createHash("sha256").update(input, "utf-8").digest("hex");
}

/** 单行业务内容哈希：先排除基础设施列（camelCase或snake_case均可），
 * 再对剩余字段规范化序列化（Date自动归一化，跨时区稳定）。 */
export function rowContentHash(
  row: Record<string, unknown>,
  excludeColumns: string[],
): string {
  const excluded = new Set(
    excludeColumns.flatMap((c) =>
      c.includes("_") ? [c, c.replace(/_([a-z])/g, (_, x: string) => x.toUpperCase())] : [c, c.replace(/([A-Z])/g, "_$1").toLowerCase()],
    ),
  );
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (excluded.has(key)) continue;
    filtered[key] = value;
  }
  return sha256hex(canonicalJson(filtered));
}

// ─── RCL第三轮复审：按表的数据库基础列排除清单 ────────────────────────────────
// 排除范围只允许数据库基础字段（自增ID、受控时间戳、运行时执行状态）与自引用
// content_hash列；业务字段必须全部进入hash（RCL-FR-002/AC-003）。

/** tests行的基础列（tests表无content_hash列）。 */
export const TEST_INFRA_COLUMNS = [
  "id",
  "created_at",
  "updated_at",
  "last_run_at",
  "last_run_result",
];

/** cases行的基础列（post_date为历史转录源日期，沿用既有排除）。 */
export const CASE_INFRA_COLUMNS = [
  "id",
  "created_at",
  "updated_at",
  "governed_at",
  "content_hash",
  "post_date",
];

/** showcase_cases行的基础列。 */
export const SHOWCASE_INFRA_COLUMNS = [
  "id",
  "created_at",
  "updated_at",
  "curated_at",
  "content_hash",
];

/** tests行的唯一规范化内容hash（plan-replacement与apply共同调用）。 */
export function testRowContentHash(row: Record<string, unknown>): string {
  return rowContentHash(row, TEST_INFRA_COLUMNS);
}
