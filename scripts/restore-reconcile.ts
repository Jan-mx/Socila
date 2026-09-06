/**
 * 数据库完整对账（NRP-NFR-011 / NRP-AC-012，审查缺陷7重写）：
 * 从系统目录确定性枚举 public/drizzle/agent/rag 四个schema的全部BASE TABLE
 * （不硬编码表清单），比较两库的：
 * - schema+表集合完全一致；
 * - 每表行计数；
 * - 每行规范化哈希（整行to_jsonb在服务器端序列化→键排序→行哈希集合排序后
 *   生成表哈希，不依赖行顺序）；
 * - 全部sequence当前值；
 * 任一schema、表、计数、哈希或sequence不符即退出1。
 *
 * 用法：
 *   DATABASE_URL=<源库> TARGET_DATABASE_URL=<恢复库> node scripts/restore-reconcile.mjs
 * 连接串只来自进程环境显式设置；输出不含业务正文、用户数据或连接串（NRP-NFR-009）。
 */
import { Client } from "pg";
import { createHash } from "node:crypto";

const sourceUrl = process.env.DATABASE_URL;
const targetUrl = process.env.TARGET_DATABASE_URL;
if (!sourceUrl || !targetUrl) {
  console.error(
    "[reconcile] 需要显式设置 DATABASE_URL（源库）与 TARGET_DATABASE_URL（恢复库）",
  );
  process.exit(1);
}

const SCHEMAS = ["public", "drizzle", "agent", "rag"];

function canonical(value: unknown): string {
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

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

interface Clientish {
  query(text: string): Promise<{ rows: Record<string, unknown>[] }>;
}

async function listTables(client: Clientish): Promise<Map<string, string>> {
  const res = await client.query(
    `select table_schema, table_name from information_schema.tables
     where table_type = 'BASE TABLE'
       and table_schema in ('public', 'drizzle', 'agent', 'rag')
     order by table_schema, table_name`,
  );
  const map = new Map<string, string>();
  for (const row of res.rows) {
    map.set(`${row.table_schema}.${row.table_name}`, row.table_schema as string);
  }
  return map;
}

async function listSequences(client: Clientish): Promise<Map<string, string>> {
  const res = await client.query(
    `select sequence_schema, sequence_name from information_schema.sequences
     where sequence_schema in ('public', 'drizzle', 'agent', 'rag')
     order by sequence_schema, sequence_name`,
  );
  const map = new Map<string, string>();
  for (const row of res.rows) {
    map.set(`${row.sequence_schema}.${row.sequence_name}`, row.sequence_name as string);
  }
  return map;
}

/** 单表快照：计数 + 行哈希集合排序后的表哈希（行哈希=整行to_jsonb规范化哈希）。 */
async function snapshotTable(
  client: Clientish,
  schema: string,
  table: string,
): Promise<{ count: number; tableHash: string }> {
  const countRes = await client.query(
    `select count(*)::int as n from "${schema}"."${table}"`,
  );
  const rows = await client.query(
    `select to_jsonb(t) as row from "${schema}"."${table}" t`,
  );
  const rowHashes = rows.rows
    .map((r) => sha256(canonical(r.row)))
    .sort();
  return {
    count: Number(countRes.rows[0].n),
    tableHash: sha256(canonJSON(rowHashes)),
  };
}

function canonJSON(value: unknown): string {
  return JSON.stringify(value);
}

async function sequenceValues(
  client: Clientish,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const sequences = await listSequences(client);
  for (const [key, name] of sequences) {
    const schema = key.split(".")[0];
    const res = await client.query(
      `select last_value, is_called from "${schema}"."${name}"`,
    );
    map.set(key, `${res.rows[0].last_value}:${res.rows[0].is_called}`);
  }
  return map;
}

async function main() {
  const source = new Client({ connectionString: sourceUrl });
  const target = new Client({ connectionString: targetUrl });
  await source.connect();
  await target.connect();
  // 统一UTC会话时区，保证跨实例序列化一致。
  await source.query("set time zone 'UTC'");
  await target.query("set time zone 'UTC'");

  let failures = 0;

  // 1) schema+表集合一致。
  const srcTables = await listTables(source);
  const tgtTables = await listTables(target);
  for (const [key, schema] of srcTables) {
    if (!tgtTables.has(key)) {
      console.log(`FAIL table-missing-in-target ${key} (${schema})`);
      failures += 1;
    }
  }
  for (const key of tgtTables.keys()) {
    if (!srcTables.has(key)) {
      console.log(`FAIL table-missing-in-source ${key}`);
      failures += 1;
    }
  }
  console.log(`tables: source=${srcTables.size} target=${tgtTables.size}`);

  // 2) 逐表计数与表哈希（仅两边都存在的表）。
  for (const [key, schema] of srcTables) {
    if (!tgtTables.has(key)) continue;
    const tableName = key.split(".")[1];
    try {
      const s = await snapshotTable(source, schema, tableName);
      const t = await snapshotTable(target, schema, tableName);
      const ok = s.count === t.count && s.tableHash === t.tableHash;
      if (!ok) failures += 1;
      console.log(
        `${ok ? "OK " : "FAIL"} ${key}: count=${s.count}/${t.count} hash=${
          ok ? s.tableHash.slice(0, 12) : `${s.tableHash.slice(0, 12)}/${t.tableHash.slice(0, 12)}`
        }`,
      );
    } catch (err) {
      failures += 1;
      console.log(`FAIL ${key}: 对账异常 ${(err as Error).message.slice(0, 80)}`);
    }
  }

  // 3) sequence当前值。
  const srcSeq = await sequenceValues(source);
  const tgtSeq = await sequenceValues(target);
  for (const [key, value] of srcSeq) {
    const tValue = tgtSeq.get(key);
    if (tValue === undefined) {
      console.log(`FAIL sequence-missing-in-target ${key}`);
      failures += 1;
    } else if (tValue !== value) {
      console.log(`FAIL sequence ${key}: source=${value} target=${tValue}`);
      failures += 1;
    }
  }
  for (const key of tgtSeq.keys()) {
    if (!srcSeq.has(key)) {
      console.log(`FAIL sequence-missing-in-source ${key}`);
      failures += 1;
    }
  }
  console.log(`sequences: source=${srcSeq.size} target=${tgtSeq.size}`);

  await source.end();
  await target.end();

  if (failures > 0) {
    console.error(`[reconcile] ${failures} 项不一致——禁止继续migration与物化`);
    process.exit(1);
  }
  console.log(
    `[reconcile] 全部schema/表/sequence计数与规范化行哈希一致（NRP-NFR-011通过）`,
  );
}

main().catch((err) => {
  console.error(`[reconcile] 失败：${err.message}`);
  process.exit(1);
});
