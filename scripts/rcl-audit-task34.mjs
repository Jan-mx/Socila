/**
 * 任务34第五轮阶段三：当前持久policyops只读审计 + 可信旧归档 + attestation +
 * repair-forward计划（WI-20260907-04准备，绑定修复后的代码提交SHA）。
 *
 * 用法：
 *   node scripts/rcl-audit-task34.mjs <pre-dump> <post-dump> [--container <name>] [--port <port>] [--trusted-dir <dir>] [--executor-test-report <json>]
 *
 * 全程只读（对持久库）：
 *   - localhost:5432/policyops 仅SELECT（禁止INSERT/UPDATE/DELETE/DDL）；
 *   - pre/post dump恢复到任务专属全新隔离实例（容器）；
 *   - 旧452/36/500可信归档：默认生成到永久目录
 *     F:/Socila/backup/case-library/task34-r4-trusted-old-<ts>/（finally不删除）；
 *     --trusted-dir <dir> 时改为只读复验既有可信归档（8文件完整、SHA全部匹配、
 *     manifest 452/36/500、500 test hash全部非空、restore 40表/20sequence/零
 *     mismatch、第三库再次恢复一致），禁止覆盖或删除该目录；
 *   - 从该归档恢复第三个全新数据库并二次对账；
 *   - 生成绑定最终代码提交SHA的当前36/36/78 attestation；
 *   - 生成repair-forward计划（fresh codeSha/manifestHash/targetFingerprint/
 *     migrationLedgerFingerprint/精确SQL写集合/前置条件/回退点/失败条件），
 *     不执行任何写入。
 *   - migration换行审计（第四轮复审）：Git blob SHA / 工作树raw SHA /
 *     LF规范化SHA / CRLF规范化SHA / 账本SHA / 仅EOL差异 / 真实内容差异。
 *   - 第五轮收紧（WI-20260907-03）：journal非单调/与预期时间不符必须阻断
 *     （不再仅报告）；ID 10～16、21、22账本hash必须等于Git blob LF SHA否则
 *     阻断；隔离库（post恢复库）删除重复行18/19/20后migration×2必须no-op
 *     否则阻断；只有上述全部通过才允许生成repair-forward计划。
 *   - 第六轮（repair执行器）：调用scripts/rcl-repair-forward-task34.mjs plan生成
 *     executable-write-set.json（988条entries+确定性批次ID+planHash），与本审计
 *     交叉核对targetFingerprint/attestation/账本指纹；--executor-test-report复制
 *     隔离演练报告（19场景必须全过）并绑定进repair-forward-plan.json。
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import { runLedgerMigrationRegression, LEDGER_ID_TO_PREFIX } from "./lib/task34-ledger-regression.mjs";

const PRE_DUMP = process.argv[2];
const POST_DUMP = process.argv[3];
const TRUSTED_DIR_ARG = (() => {
  const i = process.argv.indexOf("--trusted-dir");
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
})();
/** 执行器隔离演练报告（scripts/rcl-repair-drill-task34.mjs产物），复制进证据目录并绑定到计划。 */
const TEST_REPORT_ARG = (() => {
  const i = process.argv.indexOf("--executor-test-report");
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
})();
const PERSISTENT_URL = process.env.PERSISTENT_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/policyops";
if (!PRE_DUMP || !POST_DUMP) {
  console.error("用法：node scripts/rcl-audit-task34.mjs <pre-dump> <post-dump> [--container <name>] [--port <port>] [--trusted-dir <dir>] [--executor-test-report <json>]");
  process.exit(1);
}

const WORK_DIR = resolve(process.cwd());
const TSX_CLI = join(WORK_DIR, "node_modules", "tsx", "dist", "cli.mjs");
const CONTAINER = process.env.RCL_AUDIT_PG_CONTAINER ?? "task34-audit-pg";
const DRILL_PASSWORD = "post" + "gres";
const DRILL_PORT = process.env.RCL_AUDIT_PG_PORT ?? "5432";
let BASE = `postgresql://postgres:${DRILL_PASSWORD}@127.0.0.1:${DRILL_PORT}`;
const PRE_DB = `task34_r4_pre_${randomUUID().slice(0, 6)}`;
const POST_DB = `task34_r4_post_${randomUUID().slice(0, 6)}`;
const RESTORE_DB = `task34_r4_restore_${randomUUID().slice(0, 6)}`;
const RE_RESTORE_DB = `task34_r4_rerestore_${randomUUID().slice(0, 6)}`;
const TS = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const AUDIT_DIR = join("F:/Socila/backup/case-library", `task34-r4-audit-${TS}`);
/** 永久可信旧归档目录：生成后不得在finally删除；--trusted-dir时复用既有目录（只读复验，禁止覆盖）。 */
const TRUSTED_DIR = TRUSTED_DIR_ARG ?? join("F:/Socila/backup/case-library", `task34-r4-trusted-old-${TS}`);

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
function sha256Buf(buf) {
  return createHash("sha256").update(buf).digest("hex");
}
function sleepSync(ms) {
  execFileSync("node", ["-e", `setTimeout(()=>{},${ms})`], { stdio: "ignore" });
}

/** 规范化JSON（键排序、稳定序列化）——指纹计算的唯一实现（与hashes.ts同语义）。 */
function canonicalJson(value) {
  const norm = (v) => {
    if (Array.isArray(v)) return v.map(norm);
    if (v !== null && typeof v === "object") {
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = norm(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(norm(value));
}
const sha256hex = (s) => createHash("sha256").update(s, "utf8").digest("hex");

async function main() {
  mkdirSync(AUDIT_DIR, { recursive: true });
  mkdirSync(TRUSTED_DIR, { recursive: true });
  const codeSha = run("git", ["rev-parse", "HEAD"]).trim();
  const report = {
    title: "WI-20260907-04 repair-forward计划与第六轮只读审计证据（repair执行器）",
    generatedAt: new Date().toISOString(),
    codeSha,
    sourceBranch: run("git", ["rev-parse", "--abbrev-ref", "HEAD"]).trim(),
    preDump: PRE_DUMP,
    postDump: POST_DUMP,
    persistentUrl: new URL(PERSISTENT_URL).host + new URL(PERSISTENT_URL).pathname,
    trustedArchiveDir: TRUSTED_DIR,
  };

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
  report.persistent.releases = await q(PERSISTENT_URL, `SELECT id, jurisdiction_code, status, active_snapshot_id, effective_from, effective_to, activated_at FROM jurisdiction_planning_releases ORDER BY id`);
  report.persistent.snapshots = await q(PERSISTENT_URL, `SELECT id, jurisdiction_code, as_of_date, content_hash, created_by FROM policy_snapshots ORDER BY created_at, id`);
  report.persistent.archiveBatches = await q(PERSISTENT_URL, `SELECT id, status, manifest_hash, storage_path, created_at, created_by FROM case_archive_batches ORDER BY created_at, id`);
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

  // 当前36/36/78逐行ID/hash（attestation事实源；hash由后续tsx内联全行重算）。
  report.persistent.rows = {
    cases: await q(PERSISTENT_URL, `SELECT id, case_uid, jurisdiction_code, quality_status, quality_score, content_hash FROM cases ORDER BY id`),
    showcase: await q(PERSISTENT_URL, `SELECT id, case_uid, jurisdiction_code, quality_status, quality_score, content_hash FROM showcase_cases ORDER BY id`),
    regressionTests: await q(PERSISTENT_URL, `SELECT id, name, jurisdiction_code, rule_id, source_case_uid, source FROM tests WHERE source='regression' ORDER BY id`),
    exampleTests: await q(PERSISTENT_URL, `SELECT id, name, jurisdiction_code, rule_id, source FROM tests WHERE source='example' ORDER BY jurisdiction_code, name`),
  };

  // targetFingerprint：与executor.auditRcl同一SQL（三表逐行规范化内容哈希聚合）。
  report.targetFingerprint = (await q(PERSISTENT_URL, `
    SELECT md5(string_agg(to_jsonb(t)::text, '|' ORDER BY to_jsonb(t)::text COLLATE "C")) AS h
    FROM (
      SELECT id, case_uid, content_hash, quality_status FROM "cases"
      UNION ALL
      SELECT id, case_uid, content_hash, quality_status FROM "showcase_cases"
    ) t`))[0].h;
  report.migrationLedgerFingerprint = sha256hex(canonicalJson(
    report.persistent.migrations.map((m) => ({ id: m.id, hash: m.hash, created_at: String(m.created_at) })),
  ));

  // ── 2) 启动任务专属隔离容器，恢复pre/post dump到两个全新实例 ──────────────
  spawnSync("docker", ["rm", "-f", CONTAINER], { encoding: "utf-8" });
  docker("run", "-d", "--name", CONTAINER, "-e", "POSTGRES_PASSWORD=" + DRILL_PASSWORD, "-p", `127.0.0.1::5432`, "pgvector/pgvector:pg17");
  try {
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
      docker("exec", CONTAINER, "psql", "-U", "postgres", "-d", db, "-c", "CREATE EXTENSION IF NOT EXISTS btree_gist");
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
    const rec = spawnSync(process.execPath, [TSX_CLI, "scripts/restore-reconcile.ts"], {
      cwd: WORK_DIR, encoding: "utf-8",
      env: { ...process.env, DATABASE_URL: PERSISTENT_URL, TARGET_DATABASE_URL: `${BASE}/${POST_DB}` },
      timeout: 600000,
    });
    writeFileSync(join(AUDIT_DIR, "compare-current-vs-post.txt"), (rec.stdout ?? "") + (rec.stderr ?? ""));
    report.compare = {
      exitCode: rec.status,
      summary: (rec.stdout ?? "").split("\n").filter((l) => /FAIL|tables:|sequences:|不一致|一致/.test(l)).slice(0, 40),
    };

    // ── 4) migration换行审计（第四轮复审）：blob/raw/LF/CRLF/账本/EOL/真实差异 ──
    const journal = JSON.parse(readFileSync(join(WORK_DIR, "drizzle", "meta", "_journal.json"), "utf8"));
    const journalByTag = {};
    for (const e of journal.entries) journalByTag[e.tag.slice(0, 4)] = Number(e.when);
    const EXPECTED_TIMES = {
      "0010": 1788560000000, "0011": 1788600000000, "0012": 1788640000000,
      "0013": 1788680000000, "0014": 1788705240000, "0015": 1788777720000,
      "0016": 1788785400000, "0017": 1788796800000, "0018": 1788796860000,
    };
    const journalCheck = [];
    let journalMismatch = false;
    for (const [prefix, expected] of Object.entries(EXPECTED_TIMES)) {
      const actual = journalByTag[prefix];
      const ok = actual !== undefined && actual === expected;
      if (!ok) journalMismatch = true;
      journalCheck.push({
        prefix,
        journalWhen: actual ?? null,
        expectedWhen: expected,
        ok,
        note: ok ? "journal when与预期一致" : "journal when与预期不符（阻断）",
      });
    }
    // 严格单调（按SQL前缀顺序）。
    const prefixes = Object.keys(EXPECTED_TIMES);
    let journalMonotonic = true;
    const monotonicDetail = [];
    for (let i = 1; i < prefixes.length; i++) {
      const a = journalByTag[prefixes[i - 1]];
      const b = journalByTag[prefixes[i]];
      const ok = a !== undefined && b !== undefined && b > a;
      if (!ok) journalMonotonic = false;
      monotonicDetail.push({ prev: prefixes[i - 1], next: prefixes[i], prevWhen: a ?? null, nextWhen: b ?? null, ok });
    }
    report.migrationJournal = { journalCheck, journalMonotonic, monotonicDetail };

    // 第五轮收紧：journal非单调/与预期时间不符必须阻断（不再仅报告）。
    if (journalMismatch || !journalMonotonic) {
      throw new Error(
        `journal非严格单调或0010～0018 when与预期不符（阻断）：` +
          JSON.stringify(journalCheck.filter((c) => !c.ok).map((c) => `${c.prefix}=${c.journalWhen}≠预期${c.expectedWhen}`)),
      );
    }

    // 账本created_at同步核对：保留行（10～16、21、22）的created_at必须与预期
    // 时间表严格单调一致（drizzle migrator按账本max created_at决定重放）。
    const ledgerTimeCheck = [];
    let ledgerTimeMismatch = false;
    for (const [id, prefix] of Object.entries(LEDGER_ID_TO_PREFIX)) {
      const row = report.persistent.migrations.find((m) => m.id === Number(id));
      const expected = EXPECTED_TIMES[prefix];
      const ok = row !== undefined && String(row.created_at) === String(expected);
      if (!ok) ledgerTimeMismatch = true;
      ledgerTimeCheck.push({
        id: Number(id), prefix, ledgerCreatedAt: row ? String(row.created_at) : null, expected,
        ok,
        note: ok ? "账本created_at与预期一致" : "账本created_at与预期不符（阻断）",
      });
    }
    report.migrationLedgerTimeCheck = { ledgerTimeCheck, ledgerTimeMismatch };
    if (ledgerTimeMismatch) {
      throw new Error(
        `账本created_at与预期时间表不符（阻断）：` +
          JSON.stringify(ledgerTimeCheck.filter((c) => !c.ok).map((c) => `ID${c.id}(${c.prefix})=${c.ledgerCreatedAt}≠预期${c.expected}`)),
      );
    }

    report.migrationAudit = [];
    for (const f of ["0010", "0011", "0012", "0013", "0014", "0015", "0016", "0017", "0018"]) {
      const matches = readdirSync(join(WORK_DIR, "drizzle")).filter((n) => n.startsWith(`${f}_`) && n.endsWith(".sql"));
      if (matches.length === 0) continue;
      const fileName = matches[0];
      const wtRaw = readFileSync(join(WORK_DIR, "drizzle", fileName));
      const blob = execFileSync("git", ["cat-file", "blob", `HEAD:drizzle/${fileName}`], { maxBuffer: 128 * 1024 * 1024 });
      const wtStr = wtRaw.toString("utf8");
      const lfBuf = Buffer.from(wtStr.replace(/\r\n/g, "\n"), "utf8");
      const crlfBuf = Buffer.from(wtStr.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n"), "utf8");
      const gitBlobSha = sha256Buf(blob);
      const worktreeRawSha = sha256Buf(wtRaw);
      const lfNormalizedSha = sha256Buf(lfBuf);
      const crlfNormalizedSha = sha256Buf(crlfBuf);
      // 工作树raw与Git blob的比较：仅EOL差异 / 真实内容差异 / 完全一致。
      let worktreeVsBlob;
      if (worktreeRawSha === gitBlobSha) worktreeVsBlob = "identical";
      else if (lfNormalizedSha === gitBlobSha) worktreeVsBlob = "eol-only（工作树CRLF，blob为LF）";
      else worktreeVsBlob = "real-content-diff";
      const ledgerRows = report.persistent.migrations.map((m) => {
        let variant = "none";
        if (m.hash === gitBlobSha) variant = "git-blob(LF)";
        else if (m.hash === worktreeRawSha) variant = "worktree-raw";
        else if (m.hash === lfNormalizedSha) variant = "lf-normalized";
        else if (m.hash === crlfNormalizedSha) variant = "crlf-normalized";
        return { id: m.id, hash: String(m.hash), createdAt: String(m.created_at), variant };
      }).filter((r) => r.variant !== "none");
      report.migrationAudit.push({
        file: fileName,
        gitBlobSha,
        worktreeRawSha,
        lfNormalizedSha,
        crlfNormalizedSha,
        worktreeVsBlob,
        ledgerRows,
      });
    }

    // ── 4.5) 第五轮收紧：Git LF hash匹配 + 隔离库删除重复行后migration×2 no-op ──
    // ID 10～16、21、22的账本hash必须等于对应SQL的Git blob LF SHA（0010/0011/0015
    // 为原值不得更新；不匹配即阻断，不得生成repair-forward计划）。
    const fileByPrefix = {};
    for (const f of report.migrationAudit) fileByPrefix[f.file.slice(0, 4)] = f;
    const ledgerHashCheck = [];
    let ledgerHashMismatch = false;
    for (const [id, prefix] of Object.entries(LEDGER_ID_TO_PREFIX)) {
      const row = report.persistent.migrations.find((m) => m.id === Number(id));
      const file = fileByPrefix[prefix];
      const ok = row !== undefined && file !== undefined && String(row.hash) === file.gitBlobSha;
      if (!ok) ledgerHashMismatch = true;
      ledgerHashCheck.push({
        id: Number(id), prefix,
        ledgerHash: row ? String(row.hash) : null,
        gitBlobLfSha: file?.gitBlobSha ?? null,
        ok,
      });
    }
    report.migrationLedgerHashCheck = { ledgerHashCheck, ledgerHashMismatch };
    if (ledgerHashMismatch) {
      throw new Error(
        `账本hash与Git blob LF SHA不匹配（阻断）：` +
          JSON.stringify(ledgerHashCheck.filter((c) => !c.ok).map((c) => `ID${c.id}(${c.prefix})`)),
      );
    }

    // 隔离库（post恢复库）删除账本ID 18/19/20后migration×2必须no-op；否则阻断。
    console.log("[audit] 运行隔离库migration账本回归（post恢复库删除18/19/20后migration×2）…");
    report.ledgerRegression = await runLedgerMigrationRegression({ url: `${BASE}/${POST_DB}`, workDir: WORK_DIR, drizzleFolder: "drizzle" });
    console.log(`[audit] ledgerRegression.ok=${report.ledgerRegression.ok}（删除重复行后migration×2 no-op）`);

    // ── 5) 旧452/36/500可信归档：--trusted-dir时只读复验既有目录（禁止覆盖），
    //      否则生成到永久目录（finally不删除） ────────────────────────────────
    const trustedManifest = TRUSTED_DIR_ARG
      ? await reverifyTrustedArchive(TRUSTED_DIR, PRE_DB)
      : await buildTrustedOldArchive(PRE_DB);

    // ── 6) 当前36/36/78只读attestation（绑定codeSha） ─────────────────────
    const attestation = await buildAttestation(codeSha);

    // ── 6.5) repair执行器只读plan：可执行写集合（988条entries+确定性批次ID）
    //        与本审计交叉核对（targetFingerprint/attestation/账本指纹必须相等） ──
    const writeSetFile = join(AUDIT_DIR, "executable-write-set.json");
    const planRun = spawnSync(process.execPath, [join(WORK_DIR, "scripts", "rcl-repair-forward-task34.mjs"), "plan", "--out", writeSetFile], {
      cwd: WORK_DIR, encoding: "utf-8", timeout: 600000,
      env: { ...process.env, DATABASE_URL: PERSISTENT_URL },
    });
    if (planRun.status !== 0) throw new Error(`repair执行器plan失败（退出${planRun.status}）：${(planRun.stdout || planRun.stderr || "").slice(0, 1500)}`);
    const executorPlan = JSON.parse(planRun.stdout);
    const writeSet = JSON.parse(readFileSync(writeSetFile, "utf8"));
    const crossChecks = {
      targetFingerprint: executorPlan.targetFingerprint === report.targetFingerprint,
      attestationManifestHash: executorPlan.attestationManifestHash === attestation.attestationManifestHash,
      migrationLedgerFingerprint: executorPlan.migrationLedgerFingerprint === report.migrationLedgerFingerprint,
      codeSha: executorPlan.codeSha === codeSha,
      trustedArchiveManifestHash: writeSet.trustedArchive.manifestHash === trustedManifest.manifestHash,
      trustedArchiveDumpSha: writeSet.trustedArchive.dumpSha256 === trustedManifest.dumpSha256,
      entries988: writeSet.entries.length === 988,
      deterministicBatchId: writeSet.trustedBatch.id === "c8a7c104-8b8b-53f5-9bfd-1c8a8a6be141",
      statePending: executorPlan.state?.state === "pending",
      worktreeClean: executorPlan.worktreeDirty === false,
    };
    const failedCross = Object.entries(crossChecks).filter(([, ok]) => !ok).map(([k]) => k);
    if (failedCross.length > 0) {
      throw new Error(`repair执行器plan与审计交叉核对不一致（阻断）：${failedCross.join("、")}`);
    }
    report.executablePlan = {
      file: writeSetFile,
      planHash: writeSet.planHash,
      algorithmVersion: writeSet.algorithmVersion,
      codeSha: writeSet.codeSha,
      trustedBatchId: writeSet.trustedBatch.id,
      entries: writeSet.entries.length,
      ledgerDelete: writeSet.ledgerDelete,
      ledgerKeep: writeSet.ledgerKeep.length,
      preparedBatch: writeSet.preparedBatch,
      businessFingerprints: writeSet.businessFingerprints,
      expectedFinalState: writeSet.expectedFinalState,
      crossChecks,
    };
    console.log(`[audit] executable-write-set planHash=${writeSet.planHash} entries=${writeSet.entries.length} batchId=${writeSet.trustedBatch.id}`);

    // 执行器隔离演练报告（--executor-test-report）：复制进证据目录并绑定。
    if (TEST_REPORT_ARG) {
      const testReport = JSON.parse(readFileSync(TEST_REPORT_ARG, "utf8"));
      writeFileSync(join(AUDIT_DIR, "repair-executor-test-report.json"), JSON.stringify(testReport, null, 2));
      report.executorTestReport = {
        file: join(AUDIT_DIR, "repair-executor-test-report.json"),
        sourceFile: TEST_REPORT_ARG,
        allPassed: testReport.allPassed === true,
        total: testReport.total,
        drillCodeSha: testReport.codeSha,
        drillPlanHash: testReport.planHash,
        postDumpSha256: testReport.postDumpSha256,
        scenarios: (testReport.scenarios ?? []).map((s) => ({ id: s.id, name: s.name, ok: s.ok })),
      };
      if (!report.executorTestReport.allPassed || report.executorTestReport.total !== 19) {
        throw new Error(`repair执行器隔离演练报告未全部通过（阻断）：allPassed=${report.executorTestReport.allPassed} total=${report.executorTestReport.total}`);
      }
    } else {
      report.executorTestReport = null;
    }

    // ── 7) 汇总与repair-forward计划 ───────────────────────────────────────
    report.trustedArchive = trustedManifest;
    report.attestation = {
      attestationManifestHash: attestation.attestationManifestHash,
      counts: attestation.counts,
      targetFingerprint: attestation.targetFingerprint,
    };
    // 完整attestation由内联脚本写入attestation-current.json（含全部行/快照/发布/批次）；
    // 这里只写汇总（不覆盖完整文件）。
    writeFileSync(join(AUDIT_DIR, "attestation-summary.json"), JSON.stringify(attestation, null, 2));
    writeFileSync(join(AUDIT_DIR, "audit-summary.json"), JSON.stringify(report, null, 2));
    writeFileSync(
      join(AUDIT_DIR, "repair-forward-plan.json"),
      JSON.stringify(buildRepairForwardPlan(report, attestation, trustedManifest), null, 2),
    );

    console.log(`[audit] 证据目录：${AUDIT_DIR}`);
    console.log(`[audit] 可信归档目录（永久保留）：${TRUSTED_DIR}`);
    console.log(`[audit] codeSha=${codeSha}`);
    console.log(`[audit] 当前库：${JSON.stringify(counts)}`);
    console.log(`[audit] targetFingerprint=${report.targetFingerprint}`);
    console.log(`[audit] migrationLedgerFingerprint=${report.migrationLedgerFingerprint}`);
    console.log(`[audit] attestationManifestHash=${attestation.attestationManifestHash}`);
    console.log(`[audit] trustedArchiveManifestHash=${trustedManifest.manifestHash}`);
    console.log(`[audit] trustedArchiveDumpSha=${trustedManifest.dumpSha256.slice(0, 16)}`);
    console.log(`[audit] journalMismatch=${journalMismatch}（第五轮起为阻断错误；本次阻断检查通过）`);
    console.log(`[audit] executablePlanHash=${report.executablePlan.planHash} trustedBatchId=${report.executablePlan.trustedBatchId} executorTestReport=${report.executorTestReport ? report.executorTestReport.allPassed : "未提供"}`);
    console.log(`[audit] 完成`);
  } finally {
    // 清理隔离容器与全部隔离库（可信归档目录永久保留，不得删除）。
    for (const db of [PRE_DB, POST_DB, RESTORE_DB, RE_RESTORE_DB]) {
      try {
        docker("exec", CONTAINER, "psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
      } catch { /* 忽略 */ }
    }
    spawnSync("docker", ["rm", "-f", CONTAINER], { encoding: "utf-8" });
    console.log("[audit] 隔离容器与库已清理（可信归档目录保留）");
  }
}

/** 旧可信归档：pre恢复库 → dump + manifest(988行) + verified restore + sha256sums；
 * 再从归档恢复第三个全新库完成二次对账。只写隔离库与文件系统。 */
async function buildTrustedOldArchive(preDb) {
  const dumpName = "policyops-fc.dump";

  // 1) 真实dump（完整库 + 三表）。
  const dumpBuf = dockerExecPgdump(preDb);
  const casesDump = dockerExecPgdump(preDb, "cases");
  const showDump = dockerExecPgdump(preDb, "showcase_cases");
  const testsDump = dockerExecPgdump(preDb, "tests");
  writeFileSync(join(TRUSTED_DIR, dumpName), dumpBuf);
  writeFileSync(join(TRUSTED_DIR, "cases.dump"), casesDump);
  writeFileSync(join(TRUSTED_DIR, "showcase_cases.dump"), showDump);
  writeFileSync(join(TRUSTED_DIR, "tests.dump"), testsDump);

  // 2) manifest：452 cases + 36 showcase + 500 regression（完整逐行ID/UID/64位hash）
  //    + 42 DSL example目标集合与同步集合（来自pre库28条example现状）。
  await runTsxInline(`import { writeFileSync } from "node:fs";
    import { db } from "@/lib/db";
    import { sql } from "drizzle-orm";
    import { rowContentHash, testRowContentHash, CASE_INFRA_COLUMNS, SHOWCASE_INFRA_COLUMNS } from "@/lib/case-governance/hashes";
    import { buildRclManifest, assertManifestContentHashes, recomputeManifestHash } from "@/lib/case-governance/manifest";
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
      rowId: exampleSync.retained.find((r) => r.name === t.name && r.jurisdictionCode === t.jurisdictionCode)?.rowId
        ?? exampleSync.updated.find((u) => u.name === t.name && u.jurisdictionCode === t.jurisdictionCode)?.rowId ?? 0,
      uid: t.name, contentHash: t.contentHash, jurisdictionCode: t.jurisdictionCode,
    }));
    const manifest = buildRclManifest({
      algorithmVersion: "RCL-MANIFEST-1.0", generatorVersion: "RCL-GEN-1.0",
      newCases: [], newShowcase: [], newTests: [], exampleTests, exampleSync,
      oldTargets: { cases: oldCases, showcase: oldShowcase, tests: oldTests },
      snapshot: null,
    });
    assertManifestContentHashes(manifest);
    const emptyTestHashes = oldTests.filter((t) => !/^[0-9a-f]{64}$/.test(t.contentHash)).length;
    if (oldCases.length !== 452) throw new Error("pre归档cases≠452: " + oldCases.length);
    if (oldShowcase.length !== 36) throw new Error("pre归档showcase≠36: " + oldShowcase.length);
    if (oldTests.length !== 500) throw new Error("pre归档regression≠500: " + oldTests.length);
    if (emptyTestHashes !== 0) throw new Error("pre归档存在空test hash: " + emptyTestHashes);
    writeFileSync(${JSON.stringify(join(TRUSTED_DIR, "manifest.json"))}, JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify({
      manifestHash: manifest.manifestHash,
      counts: { cases: oldCases.length, showcase: oldShowcase.length, regression: oldTests.length, example: exampleTests.length },
      emptyTestHashes,
      exampleSync: { retained: exampleSync.retained.length, updated: exampleSync.updated.length, added: exampleSync.added.length, deleted: exampleSync.deleted.length },
    }));
    process.exit(0);
  `, `${BASE}/${preDb}`, AUDIT_DIR);

  // 3) selection-report（归档模式：无新showcase，verified空配额报告；violations必须为空）。
  writeFileSync(
    join(TRUSTED_DIR, "selection-report.json"),
    JSON.stringify({ status: "verified", algorithmVersion: "RCL-GEN-1.0", generatedAt: new Date().toISOString(), curatedUids: [], sourceCounts: {}, quotaStats: {}, violations: [] }, null, 2),
  );

  // 4) 真实恢复演练（第二库RESTORE_DB）+ verified restore-report。
  await buildVerifiedRestoreReportInto(preDb, RESTORE_DB, join(TRUSTED_DIR, dumpName));

  // 5) sha256sums.txt最后生成（恰好7个必备文件各一次，不自包含）。
  const finalFiles = [dumpName, "cases.dump", "showcase_cases.dump", "tests.dump", "selection-report.json", "manifest.json", "restore-report.json"];
  writeFileSync(
    join(TRUSTED_DIR, "sha256sums.txt"),
    finalFiles.map((f) => `${sha256File(join(TRUSTED_DIR, f))}  ${f}`).join("\n") + "\n",
  );

  // 6) 从归档恢复到第三个全新库（RE_RESTORE_DB）并二次对账（全表+全sequence）。
  docker("exec", CONTAINER, "psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS "${RE_RESTORE_DB}" WITH (FORCE)`);
  docker("exec", CONTAINER, "psql", "-U", "postgres", "-c", `CREATE DATABASE "${RE_RESTORE_DB}"`);
  docker("exec", CONTAINER, "psql", "-U", "postgres", "-d", RE_RESTORE_DB, "-c", "CREATE EXTENSION IF NOT EXISTS vector");
  docker("exec", CONTAINER, "psql", "-U", "postgres", "-d", RE_RESTORE_DB, "-c", "CREATE EXTENSION IF NOT EXISTS btree_gist");
  const rest2 = spawnSync("docker", ["exec", "-i", CONTAINER, "pg_restore", "-U", "postgres", "-d", RE_RESTORE_DB, "--clean", "--if-exists"], {
    input: readFileSync(join(TRUSTED_DIR, dumpName)), maxBuffer: 1024 * 1024 * 1024, encoding: "buffer",
  });
  if (rest2.status !== 0) throw new Error(`归档二次恢复失败：${rest2.stderr?.toString().slice(0, 400)}`);
  const reconcile2 = await runTsxInline(`import { writeFileSync } from "node:fs";
    import { drizzle } from "drizzle-orm/node-postgres";
    import pg from "pg";
    import { reconcileDatabases, listSequences, listBaseTables } from "@/lib/case-governance/reconcile";
    const src = drizzle(new pg.Pool({ connectionString: ${JSON.stringify(`${BASE}/${preDb}`)} }));
    const dst = drizzle(new pg.Pool({ connectionString: ${JSON.stringify(`${BASE}/${RE_RESTORE_DB}`)} }));
    const tableMis = (await reconcileDatabases(src, dst)).mismatches;
    const seqMis = [];
    const [sSrc, sDst] = [await listSequences(src), await listSequences(dst)];
    const key = (s) => \`\${s.schema}.\${s.name}\`;
    const dstKeyed = new Map(sDst.map((s) => [key(s), s]));
    for (const s of sSrc) {
      const d = dstKeyed.get(key(s));
      if (!d) { seqMis.push("sequence " + key(s) + " 恢复库缺失"); continue; }
      if (d.lastValue !== s.lastValue || d.isCalled !== s.isCalled) seqMis.push("sequence " + key(s) + " 状态不一致");
    }
    for (const d of sDst) if (!sSrc.some((s) => key(s) === key(d))) seqMis.push("sequence " + key(d) + " 源库缺失");
    const mismatches = [...tableMis, ...seqMis];
    const tSrc = await listBaseTables(src);
    writeFileSync(${JSON.stringify(join(AUDIT_DIR, "trusted-archive-re-reconcile.json"))}, JSON.stringify({
      tables: tSrc.length, sequences: sSrc.length, mismatches, ok: mismatches.length === 0,
      restoredDb: ${JSON.stringify(RE_RESTORE_DB)},
    }, null, 2));
    console.log("re-reconcile " + (mismatches.length === 0 ? "OK" : "FAIL: " + mismatches.join(";")));
    process.exit(mismatches.length === 0 ? 0 : 1);
  `, `${BASE}/${preDb}`, AUDIT_DIR, { TARGET: `${BASE}/${RE_RESTORE_DB}` });

  const manifest = JSON.parse(readFileSync(join(TRUSTED_DIR, "manifest.json"), "utf8"));
  return {
    dir: TRUSTED_DIR,
    manifestHash: manifest.manifestHash,
    manifestRowCounts: { cases: manifest.oldTargets.cases.length, showcase: manifest.oldTargets.showcase.length, tests: manifest.oldTargets.tests.length, example: manifest.exampleTests.length },
    dumpSha256: sha256File(join(TRUSTED_DIR, dumpName)),
    files: finalFiles.map((f) => ({ fileName: f, sha256: sha256File(join(TRUSTED_DIR, f)) })),
    reReconcile: reconcile2,
  };
}

function dockerExecPgdump(db, table) {
  const args = ["exec", CONTAINER, "pg_dump", "-U", "postgres", "-Fc"];
  if (table) args.push("-t", table);
  args.push(db);
  return execFileSync("docker", args, { maxBuffer: 512 * 1024 * 1024 });
}

/**
 * 只读复验既有可信归档（--trusted-dir，第五轮；禁止覆盖/删除该目录）：
 * 1) 8个文件完整（7必备+sha256sums.txt）；
 * 2) sha256sums.txt与全部文件实际SHA逐行匹配；
 * 3) manifest为452/36/500且500 test contentHash全部非空64位hex；
 * 4) restore-report为verified：40表/20 sequence/零mismatch；
 * 5) 第三库再次恢复一致：归档dump恢复到全新库RE_RESTORE_DB，与pre恢复库
 *    全表+全sequence对账零mismatch。
 * 任一检查失败即throw（阻断），不生成repair-forward计划。
 */
async function reverifyTrustedArchive(dir, sourceDb) {
  const required = ["policyops-fc.dump", "cases.dump", "showcase_cases.dump", "tests.dump", "selection-report.json", "manifest.json", "restore-report.json", "sha256sums.txt"];
  const missing = required.filter((f) => !existsSync(join(dir, f)));
  if (missing.length > 0) {
    throw new Error(`可信归档缺失必备文件（阻断）：${missing.join("、")}`);
  }

  // 2) SHA全部匹配。
  const shaChecks = [];
  let shaMatch = true;
  for (const line of readFileSync(join(dir, "sha256sums.txt"), "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(/^([0-9a-f]{64})\s{2}(.+)$/);
    if (!m) {
      shaMatch = false;
      shaChecks.push({ line: trimmed, ok: false });
      continue;
    }
    const [hash, file] = [m[1], m[2]];
    const ok = existsSync(join(dir, file)) && sha256File(join(dir, file)) === hash;
    if (!ok) shaMatch = false;
    shaChecks.push({ file, ok });
  }
  if (!shaMatch) throw new Error("可信归档SHA与sha256sums.txt不匹配（阻断）");

  // 3) manifest 452/36/500 + 500 test hash非空。
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const manifestCounts = {
    cases: manifest.oldTargets?.cases?.length ?? 0,
    showcase: manifest.oldTargets?.showcase?.length ?? 0,
    tests: manifest.oldTargets?.tests?.length ?? 0,
    example: manifest.exampleTests?.length ?? 0,
  };
  const emptyTestHashes = (manifest.oldTargets?.tests ?? []).filter((t) => !/^[0-9a-f]{64}$/.test(t.contentHash)).length;
  if (manifestCounts.cases !== 452 || manifestCounts.showcase !== 36 || manifestCounts.tests !== 500) {
    throw new Error(`可信归档manifest计数不符（阻断）：${JSON.stringify(manifestCounts)}（预期452/36/500）`);
  }
  if (emptyTestHashes !== 0) {
    throw new Error(`可信归档存在空test hash（阻断）：${emptyTestHashes}条`);
  }

  // 4) restore-report verified：40表/20 sequence/零mismatch。
  const restore = JSON.parse(readFileSync(join(dir, "restore-report.json"), "utf8"));
  const restoreOk =
    restore?.status === "verified" &&
    restore?.reconcile?.tableCount === 40 &&
    restore?.reconcile?.sequenceCount === 20 &&
    Array.isArray(restore?.reconcile?.mismatches) &&
    restore.reconcile.mismatches.length === 0;
  if (!restoreOk) {
    throw new Error(`可信归档restore-report不满足40表/20sequence/零mismatch（阻断）：${JSON.stringify(restore?.reconcile)}`);
  }

  // 5) 第三库再次恢复一致：归档dump → RE_RESTORE_DB，与pre恢复库对账。
  docker("exec", CONTAINER, "psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS "${RE_RESTORE_DB}" WITH (FORCE)`);
  docker("exec", CONTAINER, "psql", "-U", "postgres", "-c", `CREATE DATABASE "${RE_RESTORE_DB}"`);
  docker("exec", CONTAINER, "psql", "-U", "postgres", "-d", RE_RESTORE_DB, "-c", "CREATE EXTENSION IF NOT EXISTS vector");
  docker("exec", CONTAINER, "psql", "-U", "postgres", "-d", RE_RESTORE_DB, "-c", "CREATE EXTENSION IF NOT EXISTS btree_gist");
  const rest2 = spawnSync("docker", ["exec", "-i", CONTAINER, "pg_restore", "-U", "postgres", "-d", RE_RESTORE_DB, "--clean", "--if-exists"], {
    input: readFileSync(join(dir, "policyops-fc.dump")), maxBuffer: 1024 * 1024 * 1024, encoding: "buffer",
  });
  if (rest2.status !== 0) throw new Error(`可信归档第三库恢复失败：${rest2.stderr?.toString().slice(0, 400)}`);
  await runTsxInline(`import { writeFileSync } from "node:fs";
    import { drizzle } from "drizzle-orm/node-postgres";
    import pg from "pg";
    import { reconcileDatabases, listSequences, listBaseTables } from "@/lib/case-governance/reconcile";
    const src = drizzle(new pg.Pool({ connectionString: ${JSON.stringify(`${BASE}/${sourceDb}`)} }));
    const dst = drizzle(new pg.Pool({ connectionString: ${JSON.stringify(`${BASE}/${RE_RESTORE_DB}`)} }));
    const tableMis = (await reconcileDatabases(src, dst)).mismatches;
    const seqMis = [];
    const [sSrc, sDst] = [await listSequences(src), await listSequences(dst)];
    const key = (s) => \`\${s.schema}.\${s.name}\`;
    const dstKeyed = new Map(sDst.map((s) => [key(s), s]));
    for (const s of sSrc) {
      const d = dstKeyed.get(key(s));
      if (!d) { seqMis.push("sequence " + key(s) + " 恢复库缺失"); continue; }
      if (d.lastValue !== s.lastValue || d.isCalled !== s.isCalled) seqMis.push("sequence " + key(s) + " 状态不一致");
    }
    for (const d of sDst) if (!sSrc.some((s) => key(s) === key(d))) seqMis.push("sequence " + key(d) + " 源库缺失");
    const mismatches = [...tableMis, ...seqMis];
    const tSrc = await listBaseTables(src);
    writeFileSync(${JSON.stringify(join(AUDIT_DIR, "trusted-archive-re-reconcile.json"))}, JSON.stringify({
      tables: tSrc.length, sequences: sSrc.length, mismatches, ok: mismatches.length === 0,
      restoredDb: ${JSON.stringify(RE_RESTORE_DB)},
    }, null, 2));
    console.log("re-reconcile " + (mismatches.length === 0 ? "OK" : "FAIL: " + mismatches.join(";")));
    process.exit(mismatches.length === 0 ? 0 : 1);
  `, `${BASE}/${sourceDb}`, AUDIT_DIR, { TARGET: `${BASE}/${RE_RESTORE_DB}` });
  const reReconcile = JSON.parse(readFileSync(join(AUDIT_DIR, "trusted-archive-re-reconcile.json"), "utf8"));
  if (!reReconcile.ok) {
    throw new Error(`可信归档第三库恢复对账不一致（阻断）：${reReconcile.mismatches.join("; ")}`);
  }

  return {
    dir,
    reverified: true,
    manifestHash: manifest.manifestHash,
    manifestRowCounts: manifestCounts,
    dumpSha256: sha256File(join(dir, "policyops-fc.dump")),
    files: required.slice(0, 7).map((f) => ({ fileName: f, sha256: sha256File(join(dir, f)) })),
    reReconcile: reReconcile,
    reverifyDetail: { shaMatch, shaChecks, emptyTestHashes, restoreReport: { tableCount: restore.reconcile.tableCount, sequenceCount: restore.reconcile.sequenceCount, mismatches: restore.reconcile.mismatches.length }, thirdDbRestore: reReconcile },
  };
}

/** 恢复演练：RESTORE_DB ← dumpFilePath，buildVerifiedRestoreReport写verified报告。 */
async function buildVerifiedRestoreReportInto(sourceDb, restoreDb, dumpFilePath) {
  docker("exec", CONTAINER, "psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS "${restoreDb}" WITH (FORCE)`);
  docker("exec", CONTAINER, "psql", "-U", "postgres", "-c", `CREATE DATABASE "${restoreDb}"`);
  docker("exec", CONTAINER, "psql", "-U", "postgres", "-d", restoreDb, "-c", "CREATE EXTENSION IF NOT EXISTS vector");
  docker("exec", CONTAINER, "psql", "-U", "postgres", "-d", restoreDb, "-c", "CREATE EXTENSION IF NOT EXISTS btree_gist");
  docker("exec", CONTAINER, "psql", "-U", "postgres", "-d", restoreDb, "-c", `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='agent_app') THEN CREATE ROLE agent_app LOGIN PASSWORD '${DRILL_PASSWORD}'; END IF; END $$;`);
  const rest = spawnSync("docker", ["exec", "-i", CONTAINER, "pg_restore", "-U", "postgres", "-d", restoreDb, "--clean", "--if-exists"], {
    input: readFileSync(dumpFilePath), maxBuffer: 1024 * 1024 * 1024, encoding: "buffer",
  });
  if (rest.status !== 0) throw new Error(`归档恢复演练失败：${rest.stderr?.toString().slice(0, 400)}`);
  await runTsxInline(`import { writeFileSync } from "node:fs";
    import { db } from "@/lib/db";
    import { drizzle } from "drizzle-orm/node-postgres";
    import pg from "pg";
    import { buildVerifiedRestoreReport } from "@/lib/case-governance/reconcile";
    const pool = new pg.Pool({ connectionString: ${JSON.stringify(`${BASE}/${restoreDb}`)} });
    const restoredDb = drizzle(pool);
    const report = await buildVerifiedRestoreReport({
      source: db,
      restored: restoredDb,
      dumpFilePath: ${JSON.stringify(dumpFilePath)},
      restoredDatabaseUrl: ${JSON.stringify(`${BASE}/${restoreDb}`)}.replace(/:[^:@]+@/, ":***@"),
      archiveDir: ${JSON.stringify(TRUSTED_DIR)},
    });
    await pool.end();
    if (report.reconcile.mismatches.length > 0) throw new Error("恢复对账不一致: " + report.reconcile.mismatches.join("; "));
    writeFileSync(${JSON.stringify(join(TRUSTED_DIR, "restore-report.json"))}, JSON.stringify(report, null, 2));
    console.log("restore-report verified", report.reconcile.tableCount, "tables", report.reconcile.sequenceCount, "sequences");
    process.exit(0);
  `, `${BASE}/${sourceDb}`, AUDIT_DIR);
}

/** tsx内联脚本执行（脚本写在scripts/.tmp下，DATABASE_URL指向dbUrl）。 */
async function runTsxInline(src, dbUrl, outDir, extraEnv = {}) {
  const f = join(WORK_DIR, "scripts", `.tmp-r4-audit-${randomUUID().slice(0, 6)}.mts`);
  writeFileSync(f, src);
  try {
    return run(process.execPath, [TSX_CLI, f], { DATABASE_URL: dbUrl, ...extraEnv });
  } finally {
    rmSync(f, { force: true });
  }
}

/** 当前36/36/78 attestation（绑定codeSha；任一数据变化targetFingerprint即变化）。 */
async function buildAttestation(codeSha) {
  const out = await runTsxInline(`import { writeFileSync } from "node:fs";
    import { db } from "@/lib/db";
    import { sql } from "drizzle-orm";
    import { rowContentHash, testRowContentHash, CASE_INFRA_COLUMNS, SHOWCASE_INFRA_COLUMNS, canonicalJson, sha256hex } from "@/lib/case-governance/hashes";
    const caseRows = (await db.execute(sql\`SELECT * FROM "cases" ORDER BY id\`)).rows;
    const showRows = (await db.execute(sql\`SELECT * FROM "showcase_cases" ORDER BY id\`)).rows;
    const regRows = (await db.execute(sql\`SELECT * FROM "tests" WHERE source = 'regression' ORDER BY id\`)).rows;
    const exRows = (await db.execute(sql\`SELECT * FROM "tests" WHERE source = 'example' ORDER BY id\`)).rows;
    const snapRows = (await db.execute(sql\`SELECT id, jurisdiction_code, as_of_date, content_hash FROM policy_snapshots ORDER BY created_at, id\`)).rows;
    const relRows = (await db.execute(sql\`SELECT id, jurisdiction_code, status, effective_from, effective_to, active_snapshot_id FROM jurisdiction_planning_releases ORDER BY id\`)).rows;
    const batchRows = (await db.execute(sql\`SELECT id, status, manifest_hash, storage_path FROM case_archive_batches ORDER BY created_at, id\`)).rows;
    const targetFp = (await db.execute(sql\`SELECT md5(string_agg(to_jsonb(t)::text, '|' ORDER BY to_jsonb(t)::text COLLATE "C")) AS h FROM (SELECT id, case_uid, content_hash, quality_status FROM "cases" UNION ALL SELECT id, case_uid, content_hash, quality_status FROM "showcase_cases") t\`)).rows[0].h;
    const attestation = {
      algorithmVersion: "RCL-ATTESTATION-2.0",
      generatedAt: new Date().toISOString(),
      codeSha: ${JSON.stringify(codeSha)},
      counts: { cases: caseRows.length, showcase: showRows.length, regressionTests: regRows.length, exampleTests: exRows.length },
      targetFingerprint: String(targetFp),
      cases: caseRows.map((r) => ({ dbId: Number(r.id), uid: r.case_uid, hash: rowContentHash(r, CASE_INFRA_COLUMNS) })),
      showcase: showRows.map((r) => ({ dbId: Number(r.id), uid: r.case_uid, hash: rowContentHash(r, SHOWCASE_INFRA_COLUMNS) })),
      regressionTests: regRows.map((r) => ({ dbId: Number(r.id), uid: r.name, hash: testRowContentHash(r) })),
      exampleTests: exRows.map((r) => ({ dbId: Number(r.id), uid: r.name, jurisdictionCode: r.jurisdiction_code, hash: testRowContentHash(r) })),
      snapshots: snapRows.map((r) => ({ id: String(r.id), jurisdictionCode: r.jurisdiction_code, asOfDate: String(r.as_of_date), contentHash: String(r.content_hash) })),
      releases: relRows.map((r) => ({ id: String(r.id), jurisdictionCode: r.jurisdiction_code, status: r.status, effectiveFrom: r.effective_from ? String(r.effective_from) : null, effectiveTo: r.effective_to ? String(r.effective_to) : null, activeSnapshotId: r.active_snapshot_id ? String(r.active_snapshot_id) : null })),
      archiveBatches: batchRows.map((r) => ({ id: String(r.id), status: r.status, manifestHash: r.manifest_hash, storagePath: r.storage_path })),
    };
    const core = { algorithmVersion: attestation.algorithmVersion, codeSha: attestation.codeSha, targetFingerprint: attestation.targetFingerprint, counts: attestation.counts, cases: attestation.cases, showcase: attestation.showcase, regressionTests: attestation.regressionTests, exampleTests: attestation.exampleTests, snapshots: attestation.snapshots, releases: attestation.releases, archiveBatches: attestation.archiveBatches };
    attestation.attestationManifestHash = sha256hex(canonicalJson(core));
    writeFileSync(${JSON.stringify(join(AUDIT_DIR, "attestation-current.json"))}, JSON.stringify(attestation, null, 2));
    console.log(JSON.stringify({ attestationManifestHash: attestation.attestationManifestHash, counts: attestation.counts, targetFingerprint: attestation.targetFingerprint, cases: attestation.cases.length, showcase: attestation.showcase.length, regressionTests: attestation.regressionTests.length, exampleTests: attestation.exampleTests.length, snapshots: attestation.snapshots.length, releases: attestation.releases.length, archiveBatches: attestation.archiveBatches.length }));
    process.exit(0);
  `, PERSISTENT_URL, AUDIT_DIR);
  return JSON.parse(out.trim().split("\n").pop());
}

/** repair-forward计划（只读产物；绑定修复后的codeSha；不执行任何写入）。 */
function buildRepairForwardPlan(report, attestation, trusted) {
  const migrations = report.persistent.migrations;
  const dupIds = [18, 19, 20];
  const dupRows = migrations.filter((m) => dupIds.includes(m.id)).map((m) => ({ id: m.id, hash: m.hash, created_at: String(m.created_at) }));
  const keptRows = migrations.filter((m) => !dupIds.includes(m.id));
  const finalLedgerFingerprint = sha256hex(canonicalJson(
    keptRows.map((m) => ({ id: m.id, hash: m.hash, created_at: String(m.created_at) })),
  ));
  const preparedBatch = report.persistent.archiveBatches.find((b) => b.status === "prepared");
  return {
    title: "WI-20260907-04 repair-forward计划（任务34第六轮只读审计：repair执行器可执行写集合，2026-09-10）",
    generatedAt: new Date().toISOString(),
    status: "只读报告——未执行任何写入；等待用户针对本清单明确授权",
    codeSha: report.codeSha,
    sourceBranch: report.sourceBranch,
    dumps: {
      pre: { file: report.preDump, sha256: report.dumps.pre.sha256 },
      post: { file: report.postDump, sha256: report.dumps.post.sha256 },
    },
    trustedArchiveManifestHash: trusted.manifestHash,
    trustedArchiveDumpSha: trusted.dumpSha256,
    trustedArchiveDir: trusted.dir,
    attestationManifestHash: attestation.attestationManifestHash,
    migrationLedgerFingerprint: report.migrationLedgerFingerprint,
    targetFingerprint: report.targetFingerprint,
    migrationLedgerAudit: {
      total: migrations.length,
      expectedFinalTotal: 18,
      // 已核对的正确判断（本机新鲜读取，见migrationAudit逐文件SHA）：
      canonicalRows: { "0010": 10, "0011": 11, "0012": 12, "0013": 13, "0014": 14, "0015": 15, "0016": 16, "0017": 21, "0018": 22 },
      duplicates: dupRows.map((m) => ({ id: m.id, hash: m.hash.slice(0, 16), created_at: m.created_at, disposition: "删除（0012/0013/0014的CRLF重复登记；原始LF行12/13/14保留）" })),
      missingId: "id 17缺失（重复登记占用id后跳号；序列不要求连续，不补写、不重排主键）",
      keepHashes: "ID 10～16、21、22的原hash全部保留；不得更新ID 10/11/15的账本hash（其hash即0010/0011/0015 Git LF内容）",
    },
    journalCheck: {
      journalMonotonic: report.migrationJournal.journalMonotonic && report.migrationJournal.journalCheck.every((c) => c.ok),
      ledgerCreatedAtMatchesExpected: !report.migrationLedgerTimeCheck.ledgerTimeMismatch,
      ledgerGitBlobHashMatch: !report.migrationLedgerHashCheck.ledgerHashMismatch,
      ledgerRegressionNoopAfterDelete: report.ledgerRegression.ok,
      ledgerDetail: report.migrationLedgerTimeCheck,
      journalDetail: report.migrationJournal,
      ledgerHashDetail: report.migrationLedgerHashCheck,
      disposition:
        "journal严格单调且0010～0018 when与预期时间表一致；账本created_at与预期一致；" +
        "ID 10～16、21、22账本hash===对应SQL的Git blob LF SHA（0010/0011/0015为原值不得更新）；" +
        "隔离库删除重复行18/19/20后migration×2均no-op（账本保持18条，0012～0014不重新生成）；" +
        "本计划不含journal写入",
    },
    ledgerRegressionEvidence: {
      summary: "隔离库（post dump恢复）删除账本ID 18/19/20后migration×2均no-op，账本持续18条；ID 10～16、21、22的hash与created_at保持不变；ID 17缺号不补写不重排；模拟0019（when=1788797000000>1788796860000）只应用一次",
      detail: report.ledgerRegression,
    },
    executor: {
      script: "scripts/rcl-repair-forward-task34.mjs",
      library: "src/lib/case-repair/repair-forward.ts",
      executableWriteSetFile: report.executablePlan.file,
      planHash: report.executablePlan.planHash,
      algorithmVersion: report.executablePlan.algorithmVersion,
      trustedBatchId: report.executablePlan.trustedBatchId,
      trustedBatchIdDerivation: "sha256(\"task34-r4-trusted-archive:\" + trustedArchiveManifestHash)前16字节，设UUID版本位5与RFC4122变体位（确定性，禁止运行时随机UUID）",
      entries: report.executablePlan.entries,
      singleTransaction: true,
      isolation: "REPEATABLE READ + 事务开始即pg_advisory_xact_lock(任务专属键)；并发第二方经40001重试后noop",
      inTransactionChecks: [
        "重算targetFingerprint并与授权参数比较",
        "重建可执行计划（codeSha/可信归档/attestation/988写集合）并与授权planHash比较",
        "FOR UPDATE锁定并核对账本目标行18/19/20完整旧值",
        "FOR UPDATE锁定prepared批次91d60c5f（status=prepared、manifest_hash=c86fcc26…、storage_path与审计一致）",
        "核对cases/showcase/tests/snapshots/releases attestation与业务表指纹（零变化）",
        "核对可信归档目录8文件/sha256sums/manifest正文重算/restore-report 40表20sequence/dump SHA",
        "任一不一致立即回滚（零写入）",
      ],
      applyCommand: `DATABASE_URL=<目标库> node scripts/rcl-repair-forward-task34.mjs apply --i-am-authorized --plan-hash ${report.executablePlan.planHash} --target-fingerprint ${report.targetFingerprint}`,
      persistentGuard: "目标库名为policyops时执行器默认拒绝，需用户授权后显式RCL_REPAIR_ALLOW_PERSISTENT=1；工作树有未提交改动时拒绝",
      idempotency: "第二次执行：全部已完成→noop:true；部分完成或数据不一致→REPAIR_STATE_DRIFT（禁止补写）",
      crossChecks: report.executablePlan.crossChecks,
      isolatedDrill: report.executorTestReport,
    },
    writeSet: [
      {
        step: 1,
        sql: "DELETE FROM drizzle.__drizzle_migrations WHERE (id = 18 AND hash = $1 AND created_at = 1788818400000) OR (id = 19 AND hash = $2 AND created_at = 1788904800000) OR (id = 20 AND hash = $3 AND created_at = 1788991200000) RETURNING id",
        precondition: dupRows.map((m) => ({ id: m.id, hash: m.hash, created_at: m.created_at })),
        tx: "单事务（与步骤3/5/6同一事务）",
        note: "参数化完整旧值条件；RETURNING必须恰好18、19、20三行，缺失/增加/旧值不同整体回滚",
      },
      {
        step: 2,
        sql: "无（保留ID 1～16、21、22原hash与created_at；不更新0010/0011/0015 hash；不补ID 17；不重排主键）",
        precondition: keptRows.map((m) => ({ id: m.id, hash: m.hash, created_at: String(m.created_at) })),
        tx: "无写入",
      },
      {
        step: 3,
        sql: `UPDATE case_archive_batches SET status = 'rolled_back' WHERE id = '${preparedBatch?.id ?? "<prepared批次id>"}' AND status = 'prepared' AND manifest_hash = '${preparedBatch?.manifest_hash ?? "<旧manifestHash>"}' AND storage_path = $1 RETURNING id`,
        precondition: preparedBatch
          ? { id: preparedBatch.id, status: "prepared", manifestHash: preparedBatch.manifest_hash, storagePath: preparedBatch.storage_path }
          : "未发现prepared批次（应报错中止）",
        tx: "单事务",
        note: "RETURNING必须恰好1行；不删除该批次历史entries",
      },
      {
        step: 4,
        sql: "无（保留两个历史applied批次88dd27ba/94ef0a2c及其entries；不在原地伪造hash）",
        tx: "无写入",
      },
      {
        step: 5,
        sql: `INSERT INTO case_archive_batches (id, status, source_counts, retained_counts, deleted_counts, table_hashes, manifest_hash, storage_path, created_by) VALUES ('${report.executablePlan.trustedBatchId}', 'restore_verified', $sourceCounts::jsonb, $retainedCounts::jsonb, $deletedCounts::jsonb, $tableHashes::jsonb, '${trusted.manifestHash}', '${trusted.dir}', 'task34-repair-forward') RETURNING id`,
        precondition: `id ${report.executablePlan.trustedBatchId} 不存在；manifest_hash=${trusted.manifestHash}；storage_path=${trusted.dir}（8文件完整、sha256sums匹配、manifest正文重算一致、restore-report 40表/20 sequence）`,
        values: {
          sourceCounts: { cases: 452, showcaseCases: 36, regressionTests: 500, historicalExampleTests: 28 },
          retainedCounts: { cases: 36, showcaseCases: 36, tests: 78, exampleTests: 42, regressionTests: 36 },
          deletedCounts: { cases: 0, showcaseCases: 0, tests: 0, exampleTests: 0, regressionTests: 0 },
          tableHashes: { trustedArchiveManifestHash: trusted.manifestHash, trustedArchiveDumpSha: trusted.dumpSha256, attestationManifestHash: attestation.attestationManifestHash, migrationLedgerFingerprint: report.migrationLedgerFingerprint, targetFingerprint: report.targetFingerprint },
        },
        tx: "单事务",
        note: "状态restore_verified（不标记applied）；字段为真实计数与hash，不得空对象占位",
      },
      {
        step: 6,
        sql: "INSERT INTO case_archive_entries (archive_batch_id, entity_type, entity_id, case_uid, content_hash, archive_reason) — 参数化多行插入，逐条来自executable-write-set.json的entries[]（452 case + 36 showcase_case + 500 test = 988，全部64位小写hex、同批次entity_type+entity_id无重复）",
        entriesFile: report.executablePlan.file,
        entriesCount: report.executablePlan.entries,
        precondition: "逐行hash与可信归档manifest一致（manifest自校验通过）；rowCount累计必须恰好988",
        tx: "单事务",
      },
      {
        step: 7,
        sql: "无（当前36/36/78、10 snapshots、5 releases与业务政策实体保持零变化；事务内以业务表指纹核对）",
        tx: "无写入",
      },
      {
        step: 8,
        sql: "无（全部snapshot保留，不删除未引用快照）",
        tx: "无写入",
      },
      {
        step: 9,
        sql: "事务内终态核对：账本18条恰为1..16/21/22且原值不变、批次rolled_back、可信批次+988 entries逐项匹配、业务指纹不变；不满足即回滚",
        tx: "单事务（COMMIT前）",
      },
      {
        step: 10,
        sql: "post-repair：pg_dump完整库备份 + 全新PG17+pgvector实例恢复 + 全表/全sequence对账（隔离演练#19已证明40表/20 sequence一致）",
        tx: "备份与恢复对账（只读验证）",
      },
    ],
    expectedFinalState: {
      migrationsLedger: `${keptRows.length}条（删除3条重复登记；0010/0011/0015账本hash保持原值=Git LF内容）`,
      migrationsLedgerFingerprint: finalLedgerFingerprint,
      archiveBatches: `3旧批次（2 applied保留 + 1 prepared→rolled_back）+ 1新增restore_verified可信归档批次 ${report.executablePlan.trustedBatchId}（988 entries）`,
      businessData: "36 cases/36 showcase/78 tests（42 example+36 regression）/10 snapshots/5 releases不变",
      targetFingerprint: report.targetFingerprint,
      attestationManifestHash: attestation.attestationManifestHash,
      executablePlanHash: report.executablePlan.planHash,
    },
    transactionBoundaries: [
      "单事务：账本删除18/19/20、prepared批次91d60c5f→rolled_back、新增可信批次c8a7c104…与988条entries在同一REPEATABLE READ事务提交（不拆T1/T2/T3）",
      "事务开始即pg_advisory_xact_lock(任务专属键)；事务内重算targetFingerprint、FOR UPDATE锁定账本目标行与prepared批次、核对attestation/业务指纹/可信归档；任一不一致立即回滚零写入",
      "第二次执行：全部已完成→noop:true；部分完成或不一致→REPAIR_STATE_DRIFT（禁止补写）；并发两个apply仅一个执行（另一个经40001重试后noop）",
    ],
    rollbackPoints: [
      { name: "操作前pre dump", file: report.preDump, sha256: report.dumps.pre.sha256 },
      { name: "操作后post dump", file: report.postDump, sha256: report.dumps.post.sha256 },
      { name: "执行repair前强制新建完整dump", file: "<repair时新建>", note: "执行repair前必须新建" },
    ],
    failureConditions: [
      "任一目标行hash与attestation/可信归档manifest不符即停止零写入",
      "账本重复行hash/created_at与前置条件不符即停止",
      "prepared批次状态或manifestHash与前置条件不符即停止",
      "0010～0018实际Schema与SQL不符即停止",
      "pre/post dump SHA与sidecar不一致即停止",
      "repair过程中任何新登录/写入改变targetFingerprint即停止",
      "journal非严格单调或0010～0018 when与预期不符：第五轮起为阻断错误（不得生成计划；本次审计已阻断通过）",
      "ID 10～16、21、22账本hash与Git blob LF SHA任一不匹配：阻断（不得生成计划；本次审计已通过）",
      "隔离库删除重复行18/19/20后migration×2非no-op：阻断（不得生成计划；本次审计已通过）",
      "执行repair前必须新建完整dump并验证其SHA；未创建前不得执行任何写入",
    ],
  };
}

main().catch((err) => {
  console.error("[audit] failed:", err);
  process.exit(1);
});
