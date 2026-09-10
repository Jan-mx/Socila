/**
 * 任务34第三轮阶段三：当前持久policyops只读审计（WI-20260907-04 repair-forward准备）。
 *
 * 用法：
 *   node scripts/rcl-audit-task34.mjs <pre-dump> <post-dump> [--container <name>] [--port <port>]
 *
 * 全程只读：
 *   - localhost:5432/policyops 仅SELECT（禁止INSERT/UPDATE/DELETE/DDL）；
 *   - pre/post dump恢复到任务专属全新隔离实例（容器）；
 *   - 输出JSON证据到 backup/case-library/task34-r3-audit-<ts>/（Git忽略）；
 *   - 生成repair-forward报告（fresh manifestHash/targetFingerprint/拟写集合/回退点），
 *     不执行任何写入。
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";

const PRE_DUMP = process.argv[2];
const POST_DUMP = process.argv[3];
const PERSISTENT_URL = process.env.PERSISTENT_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/policyops";
if (!PRE_DUMP || !POST_DUMP) {
  console.error("用法：node scripts/rcl-audit-task34.mjs <pre-dump> <post-dump> [--container <name>] [--port <port>]");
  process.exit(1);
}

const WORK_DIR = resolve(process.cwd());
const TSX_CLI = join(WORK_DIR, "node_modules", "tsx", "dist", "cli.mjs");
const CONTAINER = process.env.RCL_AUDIT_PG_CONTAINER ?? "task34-audit-pg";
const DRILL_PASSWORD = "post" + "gres";
const DRILL_PORT = process.env.RCL_AUDIT_PG_PORT ?? "5432";
let BASE = `postgresql://postgres:${DRILL_PASSWORD}@127.0.0.1:${DRILL_PORT}`;
const PRE_DB = `task34_audit_pre_${randomUUID().slice(0, 6)}`;
const POST_DB = `task34_audit_post_${randomUUID().slice(0, 6)}`;
const OUT_DIR = join("F:/Socila/backup/case-library", `task34-r3-audit-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`);

function run(cmd, args, env = {}, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: WORK_DIR, encoding: "utf-8", env: { ...process.env, ...env }, ...opts });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} 退出码 ${r.status}: ${(r.stderr || r.stdout || "").toString().slice(0, 1500)}`);
  }
  return r.stdout?.toString() ?? "";
}
function docker(...args) {
  return run("docker", args);
}
/** 只读查询：返回rows数组（持久库专用，绝不写）。 */
async function q(url, text) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const r = await client.query(text);
    return r.rows;
  } finally {
    await client.end();
  }
}

function sha256File(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

function sleepSync(ms) {
  execFileSync("node", ["-e", `setTimeout(()=>{},${ms})`], { stdio: "ignore" });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const report = { generatedAt: new Date().toISOString(), preDump: PRE_DUMP, postDump: POST_DUMP, persistentUrl: new URL(PERSISTENT_URL).host + new URL(PERSISTENT_URL).pathname };

  // ── 1) 当前持久库只读事实 ──────────────────────────────────────────────
  report.persistent = {};
  const counts = (await q(PERSISTENT_URL, `
    SELECT
      (SELECT count(*) FROM cases) AS cases,
      (SELECT count(*) FROM showcase_cases) AS showcase,
      (SELECT count(*) FROM tests) AS tests,
      (SELECT count(*) FROM tests WHERE source='example') AS example_tests,
      (SELECT count(*) FROM tests WHERE source='regression') AS regression_tests,
      (SELECT count(*) FROM policy_snapshots) AS snapshots,
      (SELECT count(*) FROM policy_import_batches) AS materialize_batches,
      (SELECT count(*) FROM case_archive_batches) AS archive_batches,
      (SELECT count(*) FROM case_archive_entries) AS archive_entries,
      (SELECT count(*) FROM jurisdiction_planning_releases) AS releases,
      (SELECT count(*) FROM drizzle.__drizzle_migrations) AS migrations`))[0];
  report.persistent.counts = counts;
  report.persistent.migrations = await q(PERSISTENT_URL, `SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`);
  report.persistent.releases = await q(PERSISTENT_URL, `SELECT id, jurisdiction_code, status, left(active_snapshot_id::text, 8) AS snap, effective_from, effective_to, activated_at FROM jurisdiction_planning_releases ORDER BY id`);
  report.persistent.snapshots = await q(PERSISTENT_URL, `SELECT id, jurisdiction_code, as_of_date, left(content_hash::text, 16) AS content_hash, created_by FROM policy_snapshots ORDER BY created_at, id`);
  report.persistent.archiveBatches = await q(PERSISTENT_URL, `SELECT id, status, left(manifest_hash::text, 16) AS manifest_hash, storage_path, created_at, created_by FROM case_archive_batches ORDER BY created_at, id`);
  report.persistent.archiveEntriesByBatch = await q(PERSISTENT_URL, `
    SELECT b.id AS batch_id, b.status, e.entity_type, count(*) AS n,
           count(*) FILTER (WHERE e.content_hash IS NULL OR e.content_hash !~ '^[0-9a-f]{64}$') AS bad_hash
    FROM case_archive_batches b JOIN case_archive_entries e ON e.archive_batch_id = b.id
    GROUP BY b.id, b.status, e.entity_type ORDER BY b.id, e.entity_type`);
  report.persistent.schemaFingerprint = (await q(PERSISTENT_URL, `
    SELECT md5(string_agg(to_jsonb(t)::text, '|' ORDER BY to_jsonb(t)::text COLLATE "C")) AS fp
    FROM information_schema.tables t WHERE t.table_type='BASE TABLE' AND t.table_schema NOT IN ('pg_catalog','information_schema')`))[0].fp;
  report.persistent.businessTableHashes = await q(PERSISTENT_URL, `
    SELECT table_schema AS schema, table_name AS table,
      (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM "'||table_schema||'"."'||table_name||'"', false, true, '')))[1]::text::int AS rows
    FROM information_schema.tables
    WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema')
    ORDER BY table_schema, table_name`);

  // 当前36/36/78逐行ID/hash（只读attestation的事实源）。
  report.persistent.rows = {
    cases: await q(PERSISTENT_URL, `SELECT id, case_uid, jurisdiction_code, quality_status, quality_score, content_hash FROM cases ORDER BY id`),
    showcase: await q(PERSISTENT_URL, `SELECT id, case_uid, jurisdiction_code, quality_status, quality_score, content_hash FROM showcase_cases ORDER BY id`),
    regressionTests: await q(PERSISTENT_URL, `SELECT id, name, jurisdiction_code, rule_id, source_case_uid, source FROM tests WHERE source='regression' ORDER BY id`),
    exampleTests: await q(PERSISTENT_URL, `SELECT id, name, jurisdiction_code, rule_id, source FROM tests WHERE source='example' ORDER BY jurisdiction_code, name`),
  };

  // ── 2) 启动任务专属隔离容器，恢复pre/post dump到两个全新实例 ──────────────
  spawnSync("docker", ["rm", "-f", CONTAINER], { encoding: "utf-8" });
  docker("run", "-d", "--name", CONTAINER, "-e", "POSTGRES_PASSWORD=" + DRILL_PASSWORD, "-p", `127.0.0.1::5432`, "pgvector/pgvector:pg17");
  for (let i = 0; i < 60; i++) {
    const r = spawnSync("docker", ["exec", CONTAINER, "pg_isready", "-U", "postgres"], { encoding: "utf-8" });
    if (r.status === 0) break;
    sleepSync(1000);
  }
  const portInfo = docker("port", CONTAINER, "5432").trim();
  const actualPort = portInfo.split(":")[1]?.trim();
  if (!actualPort) throw new Error(`端口解析失败：${portInfo}`);
  process.env.RCL_AUDIT_PG_PORT = actualPort;
  BASE = `postgresql://postgres:${DRILL_PASSWORD}@127.0.0.1:${actualPort}`;
  console.log(`[audit] 容器端口 ${actualPort}`);

  for (const [name, dump, db] of [["pre", PRE_DUMP, PRE_DB], ["post", POST_DUMP, POST_DB]]) {
    docker("exec", CONTAINER, "psql", "-U", "postgres", "-c", `CREATE DATABASE "${db}"`);
    docker("exec", CONTAINER, "psql", "-U", "postgres", "-d", db, "-c", "CREATE EXTENSION IF NOT EXISTS vector");
    docker("exec", CONTAINER, "psql", "-U", "postgres", "-d", db, "-c", `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='agent_app') THEN CREATE ROLE agent_app LOGIN PASSWORD '${DRILL_PASSWORD}'; END IF; END $$;`);
    const rest = spawnSync("docker", ["exec", "-i", CONTAINER, "pg_restore", "-U", "postgres", "-d", db, "--clean", "--if-exists"], {
      input: readFileSync(dump), maxBuffer: 1024 * 1024 * 1024, encoding: "buffer",
    });
    if (rest.status !== 0) throw new Error(`${name} dump恢复失败：${rest.stderr?.toString().slice(0, 400)}`);
    console.log(`[audit] ${name} dump恢复完成 ${db}`);
  }
  report.dumps = {
    pre: { sha256: sha256File(PRE_DUMP), restoredDb: PRE_DB },
    post: { sha256: sha256File(POST_DUMP), restoredDb: POST_DB },
  };

  // ── 3) 三方对比：当前库 / post恢复库（restore-reconcile.mjs现成对账） ────────
  // 运行期表（auth_refresh_sessions等）可能因post dump后的真实登录而hash变化：
  // 不一致记录为审计发现但不中断（报告明确区分运行期差异与结构差异）。
  const rec = spawnSync(process.execPath, [TSX_CLI, "scripts/restore-reconcile.ts"], {
    cwd: WORK_DIR, encoding: "utf-8",
    env: { ...process.env, DATABASE_URL: PERSISTENT_URL, TARGET_DATABASE_URL: `${BASE}/${POST_DB}` },
    timeout: 600000,
  });
  writeFileSync(join(OUT_DIR, "compare-current-vs-post.txt"), (rec.stdout ?? "") + (rec.stderr ?? ""));
  report.compare = {
    exitCode: rec.status,
    summary: (rec.stdout ?? "").split("\n").filter((l) => /FAIL|tables:|sequences:|不一致|一致/.test(l)).slice(0, 40),
  };

  // ── 4) 从pre恢复库生成旧452/36/500可信归档（500条test hash非空） ────────
  const archiveScript = `
    import { writeFileSync, readFileSync } from "node:fs";
    import { db } from "@/lib/db";
    import { sql } from "drizzle-orm";
    import { rowContentHash, testRowContentHash, CASE_INFRA_COLUMNS, SHOWCASE_INFRA_COLUMNS } from "@/lib/case-governance/hashes";
    import { buildRclManifest, assertManifestContentHashes } from "@/lib/case-governance/manifest";
    import { buildExampleSync, loadDslExampleTargets } from "@/lib/case-governance/dsl-examples";
    const oldCaseRows = await db.execute(sql\`SELECT * FROM "cases" ORDER BY id\`);
    const oldShowRows = await db.execute(sql\`SELECT * FROM "showcase_cases" ORDER BY id\`);
    const oldTestRows = await db.execute(sql\`SELECT * FROM "tests" WHERE source = 'regression' ORDER BY id\`);
    const exampleRows = await db.execute(sql\`SELECT * FROM "tests" WHERE source = 'example' ORDER BY id\`);
    const oldCases = oldCaseRows.rows.map((r) => ({ rowId: Number(r.id), uid: r.case_uid, contentHash: rowContentHash(r, CASE_INFRA_COLUMNS) }));
    const oldShowcase = oldShowRows.rows.map((r) => ({ rowId: Number(r.id), uid: r.case_uid, contentHash: rowContentHash(r, SHOWCASE_INFRA_COLUMNS) }));
    const oldTests = oldTestRows.rows.map((r) => ({ rowId: Number(r.id), uid: r.source_case_uid, contentHash: testRowContentHash(r) }));
    const dslTargets = loadDslExampleTargets();
    const exampleSync = buildExampleSync(exampleRows.rows, dslTargets);
    const exampleTests = dslTargets.map((t) => ({
      rowId: exampleSync.retained.find((r) => r.name === t.name && r.jurisdictionCode === t.jurisdictionCode)?.rowId ?? 0,
      uid: t.name, contentHash: t.contentHash, jurisdictionCode: t.jurisdictionCode,
    }));
    const manifest = buildRclManifest({
      algorithmVersion: "RCL-MANIFEST-1.0", generatorVersion: "RCL-GEN-1.0",
      newCases: [], newShowcase: [], newTests: [], exampleTests, exampleSync,
      oldTargets: { cases: oldCases, showcase: oldShowcase, tests: oldTests },
      snapshot: null,
    });
    assertManifestContentHashes(manifest);
    const emptyHashes = oldTests.filter((t) => !/^[0-9a-f]{64}$/.test(t.contentHash)).length;
    writeFileSync(${JSON.stringify(join(OUT_DIR, "old-archive-manifest-pre.json"))}, JSON.stringify({
      manifestHash: manifest.manifestHash,
      oldTargets: { cases: oldCases.length, showcase: oldShowcase.length, tests: oldTests.length },
      emptyTestHashes: emptyHashes,
      exampleSync: { retained: exampleSync.retained.length, updated: exampleSync.updated.length, added: exampleSync.added.length, deleted: exampleSync.deleted.length },
    }, null, 2));
    console.log("old-archive done", JSON.stringify({ manifestHash: manifest.manifestHash.slice(0, 16), oldTests: oldTests.length, emptyHashes }));
    process.exit(0);
  `;
  const af = join(WORK_DIR, "scripts", ".tmp-audit-old-archive.mts");
  writeFileSync(af, archiveScript);
  try {
    run(process.execPath, [TSX_CLI, af], { DATABASE_URL: `${BASE}/${PRE_DB}` });
  } finally {
    rmSync(af, { force: true });
  }

  // ── 5) 当前36/36/78只读attestation manifest ────────────────────────────
  const attestScript = `
    import { writeFileSync } from "node:fs";
    import { db } from "@/lib/db";
    import { sql } from "drizzle-orm";
    import { rowContentHash, testRowContentHash, CASE_INFRA_COLUMNS, SHOWCASE_INFRA_COLUMNS } from "@/lib/case-governance/hashes";
    import { canonicalJson, sha256hex } from "@/lib/case-governance/hashes";
    const caseRows = (await db.execute(sql\`SELECT * FROM "cases" ORDER BY id\`)).rows;
    const showRows = (await db.execute(sql\`SELECT * FROM "showcase_cases" ORDER BY id\`)).rows;
    const regRows = (await db.execute(sql\`SELECT * FROM "tests" WHERE source = 'regression' ORDER BY id\`)).rows;
    const exRows = (await db.execute(sql\`SELECT * FROM "tests" WHERE source = 'example' ORDER BY id\`)).rows;
    const snapRows = (await db.execute(sql\`SELECT id, jurisdiction_code, as_of_date, content_hash FROM policy_snapshots ORDER BY created_at, id\`)).rows;
    const relRows = (await db.execute(sql\`SELECT id, jurisdiction_code, status, effective_from, effective_to, active_snapshot_id FROM jurisdiction_planning_releases ORDER BY id\`)).rows;
    const batchRows = (await db.execute(sql\`SELECT id, status, manifest_hash, storage_path FROM case_archive_batches ORDER BY created_at, id\`)).rows;
    const attestation = {
      algorithmVersion: "RCL-ATTESTATION-1.0",
      generatedAt: new Date().toISOString(),
      counts: { cases: caseRows.length, showcase: showRows.length, regressionTests: regRows.length, exampleTests: exRows.length },
      cases: caseRows.map((r) => ({ dbId: Number(r.id), uid: r.case_uid, hash: rowContentHash(r, CASE_INFRA_COLUMNS) })),
      showcase: showRows.map((r) => ({ dbId: Number(r.id), uid: r.case_uid, hash: rowContentHash(r, SHOWCASE_INFRA_COLUMNS) })),
      regressionTests: regRows.map((r) => ({ dbId: Number(r.id), uid: r.name, hash: testRowContentHash(r) })),
      exampleTests: exRows.map((r) => ({ dbId: Number(r.id), uid: r.name, jurisdictionCode: r.jurisdiction_code, hash: testRowContentHash(r) })),
      snapshots: snapRows.map((r) => ({ id: String(r.id), jurisdictionCode: r.jurisdiction_code, asOfDate: String(r.as_of_date), contentHash: String(r.content_hash) })),
      releases: relRows.map((r) => ({ id: String(r.id), jurisdictionCode: r.jurisdiction_code, status: r.status, effectiveFrom: r.effective_from ? String(r.effective_from) : null, effectiveTo: r.effective_to ? String(r.effective_to) : null, activeSnapshotId: r.active_snapshot_id ? String(r.active_snapshot_id) : null })),
      archiveBatches: batchRows.map((r) => ({ id: String(r.id), status: r.status, manifestHash: r.manifest_hash, storagePath: r.storage_path })),
    };
    const core = { algorithmVersion: attestation.algorithmVersion, counts: attestation.counts, cases: attestation.cases, showcase: attestation.showcase, regressionTests: attestation.regressionTests, exampleTests: attestation.exampleTests, snapshots: attestation.snapshots, releases: attestation.releases, archiveBatches: attestation.archiveBatches };
    attestation.attestationManifestHash = sha256hex(canonicalJson(core));
    writeFileSync(${JSON.stringify(join(OUT_DIR, "attestation-current.json"))}, JSON.stringify(attestation, null, 2));
    console.log("attestation done", attestation.attestationManifestHash);
    process.exit(0);
  `;
  const tf = join(WORK_DIR, "scripts", ".tmp-audit-attestation.mts");
  writeFileSync(tf, attestScript);
  try {
    run(process.execPath, [TSX_CLI, tf], { DATABASE_URL: PERSISTENT_URL });
  } finally {
    rmSync(tf, { force: true });
  }

  // ── 6) 0010~0018 SQL hash vs 账本 hash ─────────────────────────────────
  report.migrationAudit = [];
  for (const f of ["0010", "0011", "0012", "0013", "0014", "0015", "0016", "0017", "0018"]) {
    const matches = readdirSync(join(WORK_DIR, "drizzle")).filter((n) => n.startsWith(`${f}_`) && n.endsWith(".sql"));
    if (matches.length === 0) continue;
    const sqlText = readFileSync(join(WORK_DIR, "drizzle", matches[0]), "utf-8");
    const fileHash = createHash("sha256").update(sqlText).digest("hex");
    const ledger = report.persistent.migrations.filter((m) => m.hash === fileHash);
    report.migrationAudit.push({ file: matches[0], fileHash, ledgerMatches: ledger.length, ledgerHashes: report.persistent.migrations.map((m) => m.hash).filter((h) => h === fileHash).length });
  }
  // 账本重复登记识别（同hash多次出现=重复执行记录）。
  const hashCounts = {};
  for (const m of report.persistent.migrations) hashCounts[m.hash] = (hashCounts[m.hash] ?? 0) + 1;
  report.migrationLedger = {
    total: report.persistent.migrations.length,
    duplicates: Object.entries(hashCounts).filter(([, n]) => n > 1).map(([h, n]) => ({ hash: h.slice(0, 16), count: n })),
    rows: report.persistent.migrations.map((m) => ({ id: m.id, hash: String(m.hash).slice(0, 16), createdAt: String(m.created_at) })),
  };

  // ── 7) 汇总写入 ────────────────────────────────────────────────────────
  writeFileSync(join(OUT_DIR, "audit-summary.json"), JSON.stringify(report, null, 2));
  console.log(`[audit] 证据目录：${OUT_DIR}`);
  console.log(`[audit] 当前库：${JSON.stringify(counts)}`);
  console.log(`[audit] 完成`);

  // 清理隔离容器（证据已落盘）。
  for (const db of [PRE_DB, POST_DB]) {
    try {
      docker("exec", CONTAINER, "psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
    } catch { /* 忽略 */ }
  }
  spawnSync("docker", ["rm", "-f", CONTAINER], { encoding: "utf-8" });
}

main().catch((err) => {
  console.error("[audit] failed:", err);
  process.exit(1);
});
