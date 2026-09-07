/**
 * CLG-FR-012/CLG-NFR-001 恢复对账：全新PG17+pgvector实例恢复后，
 * 逐表核对表集合、行数与规范化行哈希（与源库一致才允许restore_verified）。
 *
 * 只读：对源库与恢复库各执行SELECT，不修改任何数据。
 */
import { sql } from "drizzle-orm";
import type { DbClient } from "@/lib/db";

export interface ReconcileResult {
  ok: boolean;
  mismatches: string[];
  tableCount: number;
}

/** 规范化整行哈希：to_jsonb(t)::text 的MD5（键序由JSONB决定，稳定）。 */
export function normalizedTableHash(
  client: DbClient,
  schema: string,
  table: string,
): Promise<string> {
  // COLLATE "C"：按字节序排序（与libc locale无关），保证跨环境/跨容器确定性；
  // ORDER BY 1依赖libc collation版本，在中文+符号长文本上跨容器不稳定。
  return client
    .execute(sql.raw(`SELECT md5(string_agg(to_jsonb(t)::text, '|' ORDER BY to_jsonb(t)::text COLLATE "C")) AS h FROM "${schema}"."${table}" t`))
    .then((r) => String((r.rows[0] as { h: string }).h));
}

export async function listBaseTables(
  client: DbClient,
): Promise<Array<{ schema: string; table: string }>> {
  const result = await client.execute(sql`
    SELECT table_schema AS schema, table_name AS table
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY table_schema, table_name`);
  return result.rows.map((row) => ({
    schema: String((row as { schema: string }).schema),
    table: String((row as { table: string }).table),
  }));
}

/**
 * 逐表对账：表集合一致、行数一致、规范化行哈希一致。
 * 任一不符返回mismatches明细（不抛错，供调用方决定禁止apply）。
 */
export async function reconcileDatabases(
  source: DbClient,
  restored: DbClient,
): Promise<ReconcileResult> {
  const mismatches: string[] = [];
  const srcTables = await listBaseTables(source);
  const dstTables = await listBaseTables(restored);
  const dstKeys = new Set(dstTables.map((t) => `${t.schema}.${t.table}`));

  for (const t of srcTables) {
    const key = `${t.schema}.${t.table}`;
    if (!dstKeys.has(key)) {
      mismatches.push(`表 ${key} 在恢复库缺失`);
      continue;
    }
    const [srcCount, dstCount] = await Promise.all([
      source
        .execute(sql.raw(`SELECT count(*)::int AS n FROM "${t.schema}"."${t.table}"`))
        .then((r) => Number((r.rows[0] as { n: number }).n)),
      restored
        .execute(sql.raw(`SELECT count(*)::int AS n FROM "${t.schema}"."${t.table}"`))
        .then((r) => Number((r.rows[0] as { n: number }).n)),
    ]);
    if (srcCount !== dstCount) {
      mismatches.push(`表 ${key} 行数不一致：源${srcCount} vs 恢复${dstCount}`);
      continue;
    }
    const [srcHash, dstHash] = await Promise.all([
      normalizedTableHash(source, t.schema, t.table),
      normalizedTableHash(restored, t.schema, t.table),
    ]);
    if (srcHash !== dstHash) {
      mismatches.push(`表 ${key} 规范化行哈希不一致`);
    }
  }
  return {
    ok: mismatches.length === 0,
    mismatches,
    tableCount: srcTables.length,
  };
}
