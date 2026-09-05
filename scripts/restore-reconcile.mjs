/**
 * 数据库逐表对账（NRP-NFR-011 / NRP-AC-012）：
 * 比较源库与目标库（全新PG17真实恢复结果）的逐表计数与规范化行哈希。
 *
 * 用法：
 *   DATABASE_URL=<源库> TARGET_DATABASE_URL=<目标库> node scripts/restore-reconcile.mjs
 *
 * 两库连接串均来自进程环境显式设置；输出不含连接串与凭据（NRP-NFR-009）。
 * 任一表计数或行哈希不符时退出码1。
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

const TABLES = [
  "rules",
  "params",
  "rule_sets",
  "policy_pack_versions",
  "tests",
  "cases",
  "showcase_cases",
  "policy_snapshots",
  "policy_snapshot_members",
  "policy_conflicts",
  "jurisdictions",
  "workflows",
  "publishes",
  "users",
];

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeys(value[k]);
    return out;
  }
  return value;
}

function canonical(value) {
  return JSON.stringify(sortKeys(value));
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function snapshotTable(client, table) {
  const countRes = await client.query(`select count(*)::int as n from "${table}"`);
  const rows = await client.query(`select * from "${table}" order by 1`);
  const normalized = rows.rows.map((row) => {
    const plain = {};
    for (const [k, v] of Object.entries(row)) {
      plain[k] = v instanceof Date ? v.toISOString() : v;
    }
    return plain;
  });
  return {
    count: countRes.rows[0].n,
    hash: sha256(canonical(normalized)),
  };
}

async function main() {
  const source = new Client({ connectionString: sourceUrl });
  const target = new Client({ connectionString: targetUrl });
  await source.connect();
  await target.connect();

  let failures = 0;
  for (const table of TABLES) {
    let s;
    let t;
    let missing = false;
    try {
      s = await snapshotTable(source, table);
    } catch {
      s = { count: -1, hash: "absent" };
    }
    try {
      t = await snapshotTable(target, table);
    } catch {
      t = { count: -1, hash: "absent" };
      missing = true;
    }
    const ok = !missing && s.count === t.count && s.hash === t.hash;
    if (!ok) failures += 1;
    console.log(
      `${ok ? "OK " : "FAIL"} ${table}: source=${s.count} target=${
        missing ? "absent" : t.count
      }${ok ? "" : ` (sourceHash=${s.hash.slice(0, 12)} targetHash=${t.hash.slice(0, 12)})`}`,
    );
  }

  await source.end();
  await target.end();

  if (failures > 0) {
    console.error(`[reconcile] ${failures} 张表不一致——禁止继续migration与物化`);
    process.exit(1);
  }
  console.log("[reconcile] 全部表计数与规范化行哈希一致（NRP-NFR-011通过）");
}

main().catch((err) => {
  console.error(`[reconcile] 失败：${err.message}`);
  process.exit(1);
});
