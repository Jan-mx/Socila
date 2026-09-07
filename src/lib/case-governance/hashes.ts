/**
 * CLG-FR-005 规范化SHA-256内容哈希：
 * - canonicalJson：键排序+稳定序列化，JSON.stringify序不影响结果；
 * - rowContentHash：按稳定字段顺序计算，时间戳与数据库自增ID可排除
 *   （时间戳/自增ID不进入业务内容哈希）。
 */
import { createHash } from "node:crypto";

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

export function sha256hex(input: string): string {
  return createHash("sha256").update(input, "utf-8").digest("hex");
}

/**
 * 单行业务内容哈希：先排除基础设施列（camelCase或snake_case均可），
 * 再对剩余字段规范化序列化。
 */
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
