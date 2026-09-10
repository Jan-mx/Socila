/**
 * CLG-FR-012/CLG-NFR-001 恢复对账：全新PG17+pgvector实例恢复后，
 * 逐表核对表集合、行数与规范化行哈希（与源库一致才允许restore_verified）。
 *
 * RCL第三轮复审（RCL-FR-004/AC-004）：恢复演练必须由同一实现生成真实
 * restore-report——全部表（schema/table/rows/64位规范化hash）与全部sequence
 * 的真实确定性状态（lastValue/isCalled）；禁止手工构造空明细verified报告。
 *
 * 只读：对源库与恢复库各执行SELECT，不修改任何数据。
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { DbClient } from "@/lib/db";
import type { RestoreReport } from "./archive";
import { sha256hex } from "./hashes";

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

/** sequence真实确定性状态（RCL-FR-004：lastValue/isCalled）。 */
export interface SequenceState {
  schema: string;
  name: string;
  lastValue: number | null;
  isCalled: boolean;
}

/** 枚举全部sequence的真实last_value/is_called（pg_sequences无is_called列，
 * 逐序列查询当前状态，与restore-reconcile.mjs同法；确定性排序）。 */
export async function listSequences(
  client: DbClient,
): Promise<SequenceState[]> {
  const result = await client.execute(sql`
    SELECT sequence_schema AS schema, sequence_name AS name
    FROM information_schema.sequences
    WHERE sequence_schema NOT IN (${sql.raw("'pg_catalog', 'information_schema'")})
    ORDER BY sequence_schema, sequence_name`);
  const states: SequenceState[] = [];
  for (const row of result.rows) {
    const schema = String((row as { schema: string }).schema);
    const name = String((row as { name: string }).name);
    const stateRes = await client.execute(
      sql.raw(`SELECT last_value, is_called FROM "${schema}"."${name}"`),
    );
    const state = stateRes.rows[0] as { last_value: number | string | null; is_called: boolean };
    states.push({
      schema,
      name,
      // int8列被node-postgres解析为字符串：统一转number（null保持null）。
      lastValue: state.last_value === null ? null : Number(state.last_value),
      isCalled: Boolean(state.is_called),
    });
  }
  return states;
}

/** 每张表真实rows与64位规范化hash（恢复报告tables明细，RCL-FR-004要求
 * 64位SHA-256；服务端聚合规范化文本→客户端sha256，确定性且跨环境稳定）。 */
export async function tableDetailsWithHash(
  client: DbClient,
): Promise<Array<{ schema: string; table: string; rows: number; hash: string }>> {
  const tables = await listBaseTables(client);
  const details: Array<{ schema: string; table: string; rows: number; hash: string }> = [];
  for (const t of tables) {
    const countRes = await client.execute(
      sql.raw(`SELECT count(*)::int AS n FROM "${t.schema}"."${t.table}"`),
    );
    const rows = Number((countRes.rows[0] as { n: number }).n ?? 0);
    const aggRes = await client.execute(
      sql.raw(`SELECT string_agg(to_jsonb(t)::text, '|' ORDER BY to_jsonb(t)::text COLLATE "C") AS agg FROM "${t.schema}"."${t.table}" t`),
    );
    const agg = String((aggRes.rows[0] as { agg: string | null }).agg ?? "");
    details.push({ schema: t.schema, table: t.table, rows, hash: sha256hex(agg) });
  }
  return details;
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
  for (const t of dstTables) {
    if (!srcTables.some((s) => s.schema === t.schema && s.table === t.table)) {
      mismatches.push(`表 ${t.schema}.${t.table} 在源库缺失`);
    }
  }
  return {
    ok: mismatches.length === 0,
    mismatches,
    tableCount: srcTables.length,
  };
}

/** 对账sequence集合与真实状态（源 vs 恢复）。 */
async function reconcileSequences(
  source: DbClient,
  restored: DbClient,
): Promise<string[]> {
  const mismatches: string[] = [];
  const src = await listSequences(source);
  const dst = await listSequences(restored);
  const dstKeyed = new Map(dst.map((s) => [`${s.schema}.${s.name}`, s]));
  const srcKeyed = new Map(src.map((s) => [`${s.schema}.${s.name}`, s]));
  for (const [key, s] of srcKeyed) {
    const d = dstKeyed.get(key);
    if (!d) {
      mismatches.push(`sequence ${key} 在恢复库缺失`);
      continue;
    }
    if (d.lastValue !== s.lastValue || d.isCalled !== s.isCalled) {
      mismatches.push(`sequence ${key} 状态不一致：源${s.lastValue}:${s.isCalled} vs 恢复${d.lastValue}:${d.isCalled}`);
    }
  }
  for (const key of dstKeyed.keys()) {
    if (!srcKeyed.has(key)) mismatches.push(`sequence ${key} 在源库缺失`);
  }
  return mismatches;
}

/** 计算归档目录中全部归档文件（不含清单自身与restore-report自身）的实际SHA。 */
function archiveFileHashes(
  archiveDir: string,
  readFile: (p: string) => Buffer,
): Record<string, string> {
  const names = [
    "policyops-fc.dump",
    "cases.dump",
    "showcase_cases.dump",
    "tests.dump",
    "selection-report.json",
    "manifest.json",
  ];
  const hashes: Record<string, string> = {};
  for (const name of names) {
    hashes[name] = createHash("sha256").update(readFile(path.join(archiveDir, name))).digest("hex");
  }
  return hashes;
}

/**
 * 由同一实现生成真实verified restore-report（RCL-FR-004/AC-004）：
 * - sourceDump.sha256 = 真实dump字节SHA；
 * - 版本来自源库；表/sequence明细来自恢复库并逐项对账；
 * - archiveFileHashes与实际归档文件SHA一致；
 * - 任一不一致进入reconcile.mismatches（verify-archive据此fail-closed）。
 */
export async function buildVerifiedRestoreReport(input: {
  source: DbClient;
  restored: DbClient;
  dumpFilePath: string;
  restoredDatabaseUrl: string;
  restoredAt?: string;
  archiveDir?: string;
  readFile?: (p: string) => Buffer;
}): Promise<RestoreReport> {
  const readFile = input.readFile ?? ((p: string) => readFileSync(p));

  const dumpSha256 = createHash("sha256").update(readFile(input.dumpFilePath)).digest("hex");

  const versionRes = await input.source.execute(sql`SELECT version()`);
  const postgresVersion = String((versionRes.rows[0] as { version: string }).version).split(" ")[1] ?? "";
  const vectorRes = await input.source.execute(sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`);
  const pgvectorVersion = (vectorRes.rows[0] as { extversion?: string } | undefined)?.extversion ?? null;

  const [tableMismatches, seqMismatches, tables, sequences] = await Promise.all([
    reconcileDatabases(input.source, input.restored).then((r) => r.mismatches),
    reconcileSequences(input.source, input.restored),
    tableDetailsWithHash(input.restored),
    listSequences(input.restored),
  ]);

  const fileHashes = input.archiveDir ? archiveFileHashes(input.archiveDir, readFile) : {};

  return {
    status: "verified",
    sourceDump: { fileName: "policyops-fc.dump", sha256: dumpSha256 },
    environment: {
      postgresVersion,
      pgvectorVersion,
      restoredDatabaseUrl: input.restoredDatabaseUrl,
      restoredAt: input.restoredAt ?? new Date().toISOString(),
    },
    reconcile: {
      tableCount: tables.length,
      sequenceCount: sequences.length,
      tables,
      sequences,
      mismatches: [...tableMismatches, ...seqMismatches],
    },
    archiveFileHashes: fileHashes,
  };
}
