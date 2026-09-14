/**
 * 任务34 repair-forward执行器隔离演练（WI-20260907-04，仅隔离库；不触碰持久policyops）。
 *
 * 用法：
 *   node scripts/rcl-repair-drill-task34.mjs <post-dump> [--out <证据目录>]
 *
 * 从post dump恢复到任务专属全新PG17+pgvector隔离容器，按顺序验证19个场景：
 *   1 audit初始指纹与plan一致（含attestation与第五轮审计一致的交叉核对）；
 *   2 缺授权拒绝零写入；3 错planHash拒绝；4 错targetFingerprint拒绝；
 *   5 账本旧值漂移拒绝；6 prepared批次状态/hash漂移拒绝；
 *   7 可信归档文件/SHA/manifest漂移拒绝（临时副本，不触碰永久归档）；
 *   8 988 entries任一非法hash/重复拒绝；
 *   9 正常apply单事务成功；10 账本18条；11 prepared批次rolled_back；
 *   12 新可信批次restore_verified；13 新entries恰好988；
 *   14 36/36/78、10 snapshots、5 releases及全部业务表hash不变；
 *   15 migration×2均no-op；16 repair复跑noop:true；
 *   17 并发两个apply只有一个执行、另一个noop；
 *   18 每个故障注入点均完整回滚；
 *   19 repair后完整dump在第三个全新实例恢复40表/20 sequence一致。
 * 结果写入 <out>/repair-executor-test-report.json。
 */
import { spawnSync, spawn, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, cpSync, readdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import pg from "pg";

const POST_DUMP = process.argv[2];
const OUT_DIR = (() => { const i = process.argv.indexOf("--out"); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null; })();
if (!POST_DUMP) {
  console.error("用法：node scripts/rcl-repair-drill-task34.mjs <post-dump> [--out <证据目录>]");
  process.exit(1);
}
const WORK_DIR = resolve(process.cwd());
const CLI = join(WORK_DIR, "scripts", "rcl-repair-forward-task34.mjs");
const TSX_CLI = join(WORK_DIR, "node_modules", "tsx", "dist", "cli.mjs");
const CONTAINER = process.env.RCL_REPAIR_DRILL_PG_CONTAINER ?? "task34-repair-drill-pg";
const PASSWORD = "post" + "gres";
const TRUSTED_DIR = "F:/Socila/backup/case-library/task34-r4-trusted-old-2026-09-10T06-59-14";
const EXPECTED_ATTESTATION_R5 = "8941655bf87fd0e4dd29a67d3fcf341c1ede00a08727109187b9665e29372e77";
const R5_CODE_SHA = "1fe702b2b61ac5b8c754ac966471998a6a38fa9f";
const TRUSTED_BATCH_ID = "c8a7c104-8b8b-53f5-9bfd-1c8a8a6be141";
const PREPARED_BATCH_ID = "91d60c5f-d979-4843-a43f-20daf4fa8945";
const FAULT_POINTS = ["after-ledger-delete", "after-prepared-update", "after-batch-insert", "mid-entries", "before-commit"];

let BASE = "";
const results = [];
const meta = { startedAt: new Date().toISOString(), postDump: POST_DUMP, postDumpSha256: sha256File(POST_DUMP) };

function sha256File(p) { return createHash("sha256").update(readFileSync(p)).digest("hex"); }
function run(cmd, args, env = {}, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: WORK_DIR, encoding: "utf-8", env: { ...process.env, ...env }, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} 退出码 ${r.status}: ${(r.stderr || r.stdout || "").toString().slice(0, 1500)}`);
  return r.stdout?.toString() ?? "";
}
function docker(...args) { return run("docker", args); }
function sleepSync(ms) { spawnSync(process.execPath, ["-e", `setTimeout(()=>{},${ms})`], { stdio: "ignore" }); }
function record(id, name, ok, evidence) {
  results.push({ id, name, ok, evidence });
  console.log(`[drill] #${id} ${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) throw new Error(`场景#${id} 失败：${name} → ${JSON.stringify(evidence).slice(0, 800)}`);
}

/** 执行器CLI（隔离库；演练在未提交工作树上运行，显式允许dirty）。 */
function cli(args, url, env = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    cwd: WORK_DIR, encoding: "utf-8", timeout: 600_000,
    env: { ...process.env, DATABASE_URL: url, RCL_REPAIR_ALLOW_DIRTY: "1", ...env },
  });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* 非JSON输出视为失败 */ }
  return { code: r.status ?? -1, json, stderr: (r.stderr ?? "").slice(0, 800), stdout: (r.stdout ?? "").slice(0, 800) };
}
function cliAsync(args, url, env = {}) {
  return new Promise((resolveP) => {
    const child = spawn(process.execPath, [CLI, ...args], { cwd: WORK_DIR, env: { ...process.env, DATABASE_URL: url, RCL_REPAIR_ALLOW_DIRTY: "1", ...env } });
    let out = ""; let err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("close", (code) => { let json = null; try { json = JSON.parse(out); } catch { /* ignore */ } resolveP({ code, json, stderr: err.slice(0, 800) }); });
  });
}

async function query(url, text, values = []) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("SET TimeZone TO 'UTC'"); await c.query("SET DateStyle TO 'ISO, YMD'");
    return (await c.query(text, values)).rows;
  } finally { await c.end(); }
}
const FP = (t) => `SELECT md5(coalesce(string_agg(to_jsonb(t)::text, '|' ORDER BY to_jsonb(t)::text COLLATE "C"), '')) AS h FROM ${t} t`;
async function stateOf(url) {
  const ledger = (await query(url, `SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`)).map((r) => ({ id: Number(r.id), hash: r.hash, createdAt: String(r.created_at) }));
  const batches = await query(url, `SELECT id, status, manifest_hash, storage_path, created_by, source_counts, retained_counts, deleted_counts, table_hashes FROM case_archive_batches ORDER BY id`);
  const entriesByBatch = await query(url, `SELECT archive_batch_id, count(*)::int AS n FROM case_archive_entries GROUP BY archive_batch_id ORDER BY archive_batch_id`);
  const counts = (await query(url, `SELECT (SELECT count(*)::int FROM cases) c, (SELECT count(*)::int FROM showcase_cases) s, (SELECT count(*)::int FROM tests) t, (SELECT count(*)::int FROM tests WHERE source='example') e, (SELECT count(*)::int FROM tests WHERE source='regression') r, (SELECT count(*)::int FROM policy_snapshots) sn, (SELECT count(*)::int FROM jurisdiction_planning_releases) rel`))[0];
  const fp = {};
  for (const [k, t] of [["cases", '"cases"'], ["showcaseCases", '"showcase_cases"'], ["tests", '"tests"'], ["policySnapshots", '"policy_snapshots"'], ["jurisdictionPlanningReleases", '"jurisdiction_planning_releases"']]) {
    fp[k] = (await query(url, FP(t)))[0].h;
  }
  return {
    ledger, ledgerIds: ledger.map((r) => r.id),
    batches: batches.map((b) => ({ id: b.id, status: b.status, manifestHash: b.manifest_hash, storagePath: b.storage_path, createdBy: b.created_by, sourceCounts: b.source_counts, retainedCounts: b.retained_counts, deletedCounts: b.deleted_counts, tableHashes: b.table_hashes })),
    entriesByBatch: Object.fromEntries(entriesByBatch.map((e) => [e.archive_batch_id, e.n])),
    counts: { cases: counts.c, showcase: counts.s, tests: counts.t, example: counts.e, regression: counts.r, snapshots: counts.sn, releases: counts.rel },
    businessFingerprints: fp,
  };
}
function sameState(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
/** jsonb列返回键序由服务端决定：比较前按键排序规范化。 */
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v).sort()) o[k] = canon(v[k]); return o; }
  return v;
}
const canonEq = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

function createDb(db) {
  docker("exec", CONTAINER, "psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
  docker("exec", CONTAINER, "psql", "-U", "postgres", "-c", `CREATE DATABASE "${db}"`);
  docker("exec", CONTAINER, "psql", "-U", "postgres", "-d", db, "-c", "CREATE EXTENSION IF NOT EXISTS vector");
  docker("exec", CONTAINER, "psql", "-U", "postgres", "-d", db, "-c", "CREATE EXTENSION IF NOT EXISTS btree_gist");
  docker("exec", CONTAINER, "psql", "-U", "postgres", "-d", db, "-c", `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='agent_app') THEN CREATE ROLE agent_app LOGIN PASSWORD '${PASSWORD}'; END IF; END $$;`);
}
function restoreDump(db, dumpPath) {
  const r = spawnSync("docker", ["exec", "-i", CONTAINER, "pg_restore", "-U", "postgres", "-d", db, "--clean", "--if-exists"], { input: readFileSync(dumpPath), maxBuffer: 1024 * 1024 * 1024, encoding: "buffer" });
  if (r.status !== 0) throw new Error(`pg_restore ${db} 失败：${r.stderr?.toString().slice(0, 400)}`);
}
function restorePost(db) { createDb(db); restoreDump(db, POST_DUMP); }

/** 临时可信归档副本（永久目录只读、禁止覆盖）；返回副本路径。 */
function trustedCopy(mutate) {
  const dir = mkdtempSync(join(tmpdir(), "task34-repair-trusted-"));
  for (const f of readdirSync(TRUSTED_DIR)) cpSync(join(TRUSTED_DIR, f), join(dir, f));
  mutate(dir);
  return dir;
}
function rewriteSums(dir) {
  const files = ["policyops-fc.dump", "cases.dump", "showcase_cases.dump", "tests.dump", "selection-report.json", "manifest.json", "restore-report.json"];
  writeFileSync(join(dir, "sha256sums.txt"), files.map((f) => `${sha256File(join(dir, f))}  ${f}`).join("\n") + "\n");
}
function runTsxInline(src, url, extraEnv = {}) {
  const f = join(WORK_DIR, "scripts", `.tmp-repair-drill-${randomUUID().slice(0, 6)}.mts`);
  writeFileSync(f, src);
  try { return run(process.execPath, [TSX_CLI, f], { DATABASE_URL: url, ...extraEnv }); } finally { rmSync(f, { force: true }); }
}

async function main() {
  const outDir = OUT_DIR ?? mkdtempSync(join(tmpdir(), "task34-repair-drill-out-"));
  mkdirSync(outDir, { recursive: true });
  spawnSync("docker", ["rm", "-f", CONTAINER], { encoding: "utf-8" });
  docker("run", "-d", "--name", CONTAINER, "-e", "POSTGRES_PASSWORD=" + PASSWORD, "-p", "127.0.0.1::5432", "pgvector/pgvector:pg17");
  const tmpDirs = [];
  try {
    for (let i = 0; i < 60; i++) { if (spawnSync("docker", ["exec", CONTAINER, "pg_isready", "-U", "postgres"], { encoding: "utf-8" }).status === 0) break; sleepSync(1000); }
    const port = docker("port", CONTAINER, "5432").trim().split(":")[1]?.trim();
    if (!port) throw new Error("端口解析失败");
    BASE = `postgresql://postgres:${PASSWORD}@127.0.0.1:${port}`;
    meta.containerPort = port;
    meta.codeSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: WORK_DIR, encoding: "utf8" }).trim();
    meta.worktreeDirty = execFileSync("git", ["status", "--porcelain"], { cwd: WORK_DIR, encoding: "utf8" }).trim().length > 0;
    console.log(`[drill] 容器端口 ${port} codeSha=${meta.codeSha} dirty=${meta.worktreeDirty}`);

    const DB = `task34_repair_main_${randomUUID().slice(0, 6)}`;
    const URL = `${BASE}/${DB}`;
    restorePost(DB);
    console.log(`[drill] post dump恢复 → ${DB}`);
    const pre = await stateOf(URL);

    // ── #1 plan + audit 初始指纹一致；attestation与第五轮审计交叉核对 ─────────────
    const planFile = join(outDir, "executable-write-set.drill.json");
    const plan = cli(["plan", "--out", planFile], URL);
    const audit = cli(["audit"], URL);
    const planDoc = JSON.parse(readFileSync(planFile, "utf8"));
    const attCross = runTsxInline(`import pg from "pg";
      import { buildAttestation, setDeterministicSession } from "@/lib/case-repair/repair-forward";
      const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
      await setDeterministicSession(c);
      const a = await buildAttestation(c, ${JSON.stringify(R5_CODE_SHA)});
      console.log(a.attestationManifestHash); await c.end(); process.exit(0);`, URL).trim().split("\n").pop();
    record(1, "audit初始指纹与plan一致；attestation(codeSha=1fe702b)===第五轮审计8941655b…",
      plan.code === 0 && audit.code === 0 && audit.json?.state?.state === "pending" && plan.json?.state?.state === "pending"
        && audit.json.targetFingerprint === plan.json.targetFingerprint && audit.json.planHash === plan.json.planHash
        && audit.json.migrationLedgerFingerprint === "492c5fbe645d3540f86d86629bb9d43717d9e942438fd24ecb83eb6445274a4a"
        && audit.json.trustedBatchId === TRUSTED_BATCH_ID && planDoc.entries.length === 988 && planDoc.trustedBatch.id === TRUSTED_BATCH_ID
        && planDoc.planHash === plan.json.planHash && attCross === EXPECTED_ATTESTATION_R5 && pre.ledger.length === 21,
      { planHash: plan.json?.planHash, targetFingerprint: plan.json?.targetFingerprint, auditState: audit.json?.state, attestationCross: attCross, migrationLedgerFingerprint: audit.json?.migrationLedgerFingerprint, entries: planDoc.entries?.length, ledgerCount: pre.ledger.length });
    const P = plan.json.planHash; const F = plan.json.targetFingerprint;
    meta.planHash = P; meta.targetFingerprint = F; meta.attestationManifestHashDrill = plan.json.attestationManifestHash;

    // ── #2 缺授权 ─────────────────────────────────────────────────────────────
    let r = cli(["apply", "--plan-hash", P, "--target-fingerprint", F], URL);
    record(2, "缺 --i-am-authorized 拒绝且零写入", r.code === 2 && r.json?.error === "AUTHORIZATION_REQUIRED" && sameState(pre, await stateOf(URL)), { code: r.code, error: r.json?.error });
    // ── #3 错planHash ─────────────────────────────────────────────────────────
    const badP = P.slice(0, 63) + (P.endsWith("0") ? "1" : "0");
    r = cli(["apply", "--i-am-authorized", "--plan-hash", badP, "--target-fingerprint", F], URL);
    record(3, "错planHash拒绝且零写入", r.code === 3 && r.json?.error === "PLAN_HASH_MISMATCH" && sameState(pre, await stateOf(URL)), { code: r.code, error: r.json?.error });
    // ── #4 错targetFingerprint ────────────────────────────────────────────────
    const badF = F.slice(0, 31) + (F.endsWith("0") ? "1" : "0");
    r = cli(["apply", "--i-am-authorized", "--plan-hash", P, "--target-fingerprint", badF], URL);
    record(4, "错targetFingerprint拒绝且零写入", r.code === 4 && r.json?.error === "TARGET_FINGERPRINT_MISMATCH" && sameState(pre, await stateOf(URL)), { code: r.code, error: r.json?.error });

    // ── #5 账本旧值漂移 ───────────────────────────────────────────────────────
    await query(URL, `UPDATE drizzle.__drizzle_migrations SET hash = $1 WHERE id = 19`, ["f".repeat(64)]);
    const r5a = cli(["apply", "--i-am-authorized", "--plan-hash", P, "--target-fingerprint", F], URL);
    const s5a = await stateOf(URL);
    await query(URL, `UPDATE drizzle.__drizzle_migrations SET hash = $1 WHERE id = 19`, ["781fe578fc346e3307de6bdd45392f6a9d4b3b6653e71e5cf2c3520605a4fe33"]);
    await query(URL, `UPDATE drizzle.__drizzle_migrations SET created_at = 1 WHERE id = 18`);
    const r5b = cli(["apply", "--i-am-authorized", "--plan-hash", P, "--target-fingerprint", F], URL);
    const s5b = await stateOf(URL);
    await query(URL, `UPDATE drizzle.__drizzle_migrations SET created_at = 1788818400000 WHERE id = 18`);
    record(5, "账本旧值漂移（id19 hash / id18 created_at）拒绝且零写入",
      r5a.code === 5 && r5a.json?.error === "REPAIR_STATE_DRIFT" && r5b.code === 5 && r5b.json?.error === "REPAIR_STATE_DRIFT"
        && s5a.ledger.length === 21 && s5b.ledger.length === 21 && s5a.batches.length === 3 && !s5a.batches.some((b) => b.id === TRUSTED_BATCH_ID) && sameState(pre, await stateOf(URL)),
      { a: { code: r5a.code, error: r5a.json?.error }, b: { code: r5b.code, error: r5b.json?.error } });

    // ── #6 prepared批次漂移 ───────────────────────────────────────────────────
    await query(URL, `UPDATE case_archive_batches SET status = 'applied' WHERE id = $1`, [PREPARED_BATCH_ID]);
    const r6a = cli(["apply", "--i-am-authorized", "--plan-hash", P, "--target-fingerprint", F], URL);
    const s6a = await stateOf(URL);
    await query(URL, `UPDATE case_archive_batches SET status = 'prepared' WHERE id = $1`, [PREPARED_BATCH_ID]);
    await query(URL, `UPDATE case_archive_batches SET manifest_hash = $2 WHERE id = $1`, [PREPARED_BATCH_ID, "0".repeat(64)]);
    const r6b = cli(["apply", "--i-am-authorized", "--plan-hash", P, "--target-fingerprint", F], URL);
    const s6b = await stateOf(URL);
    await query(URL, `UPDATE case_archive_batches SET manifest_hash = $2 WHERE id = $1`, [PREPARED_BATCH_ID, "c86fcc26c0456be43a9c9dd581657229082edf3ed9eaf68d2edf2d4e90339d55"]);
    record(6, "prepared批次状态/manifest_hash漂移拒绝且零写入",
      r6a.code === 5 && r6a.json?.error === "REPAIR_STATE_DRIFT" && r6b.code === 5 && r6b.json?.error === "REPAIR_STATE_DRIFT"
        && s6a.ledger.length === 21 && s6b.ledger.length === 21 && !s6a.batches.some((b) => b.id === TRUSTED_BATCH_ID) && sameState(pre, await stateOf(URL)),
      { a: { code: r6a.code, error: r6a.json?.error }, b: { code: r6b.code, error: r6b.json?.error } });

    // ── #7 可信归档文件/SHA/manifest漂移（临时副本） ───────────────────────────
    const t7a = trustedCopy((d) => { const p = join(d, "sha256sums.txt"); writeFileSync(p, readFileSync(p, "utf8").replace(/^[0-9a-f]{64}/m, "0".repeat(64))); });
    const t7b = trustedCopy((d) => { const p = join(d, "manifest.json"); const m = JSON.parse(readFileSync(p, "utf8")); m.oldTargets.tests[0].contentHash = "e".repeat(64); writeFileSync(p, JSON.stringify(m, null, 2)); rewriteSums(d); });
    const t7c = trustedCopy((d) => { unlinkSync(join(d, "restore-report.json")); });
    tmpDirs.push(t7a, t7b, t7c);
    const r7a = cli(["apply", "--i-am-authorized", "--plan-hash", P, "--target-fingerprint", F, "--trusted-dir", t7a], URL);
    const r7b = cli(["apply", "--i-am-authorized", "--plan-hash", P, "--target-fingerprint", F, "--trusted-dir", t7b], URL);
    const r7c = cli(["apply", "--i-am-authorized", "--plan-hash", P, "--target-fingerprint", F, "--trusted-dir", t7c], URL);
    record(7, "可信归档SHA清单/manifest正文/缺文件漂移拒绝且零写入（永久归档未触碰）",
      [r7a, r7b, r7c].every((x) => x.code === 6 && x.json?.error === "TRUSTED_ARCHIVE_MISMATCH") && sameState(pre, await stateOf(URL))
        && sha256File(join(TRUSTED_DIR, "manifest.json")) === "ae094690149ad27cdb85da5c83401591552c720bf151a4c4bf86fb94b1ea4c4e",
      { a: r7a.json?.message?.slice(0, 120), b: r7b.json?.message?.slice(0, 120), c: r7c.json?.message?.slice(0, 120) });

    // ── #8 988 entries任一非法hash / 重复拒绝 ──────────────────────────────────
    const t8a = trustedCopy((d) => { const p = join(d, "manifest.json"); const m = JSON.parse(readFileSync(p, "utf8")); m.oldTargets.tests[0].contentHash = ""; writeFileSync(p, JSON.stringify(m, null, 2)); rewriteSums(d); });
    const t8b = trustedCopy((d) => { const p = join(d, "manifest.json"); const m = JSON.parse(readFileSync(p, "utf8")); m.oldTargets.cases[1].rowId = m.oldTargets.cases[0].rowId; writeFileSync(p, JSON.stringify(m, null, 2)); rewriteSums(d); });
    tmpDirs.push(t8a, t8b);
    const r8a = cli(["apply", "--i-am-authorized", "--plan-hash", P, "--target-fingerprint", F, "--trusted-dir", t8a], URL);
    const r8b = cli(["apply", "--i-am-authorized", "--plan-hash", P, "--target-fingerprint", F, "--trusted-dir", t8b], URL);
    record(8, "988 entries任一非法hash（ENTRY_HASH_INVALID）/重复（ENTRY_DUPLICATE）拒绝且零写入",
      r8a.code === 6 && r8a.json?.error === "ENTRY_HASH_INVALID" && r8b.code === 6 && r8b.json?.error === "ENTRY_DUPLICATE" && sameState(pre, await stateOf(URL)),
      { a: r8a.json?.error, b: r8b.json?.error });

    // ── #9 正常apply ──────────────────────────────────────────────────────────
    const ok = cli(["apply", "--i-am-authorized", "--plan-hash", P, "--target-fingerprint", F], URL);
    const post = await stateOf(URL);
    record(9, "正常apply单事务成功（applied:true，988 entries，RETURNING 18/19/20）",
      ok.code === 0 && ok.json?.applied === true && ok.json?.noop === false && JSON.stringify(ok.json?.ledgerDeleted) === "[18,19,20]" && ok.json?.entriesInserted === 988 && ok.json?.preparedBatchRolledBack === PREPARED_BATCH_ID && ok.json?.trustedBatchId === TRUSTED_BATCH_ID,
      { code: ok.code, applied: ok.json?.applied, ledgerDeleted: ok.json?.ledgerDeleted, entriesInserted: ok.json?.entriesInserted, attempts: ok.json?.attempts, error: ok.json?.error, message: ok.json?.message });
    // ── #10 账本18条 ──────────────────────────────────────────────────────────
    const keptPre = pre.ledger.filter((l) => ![18, 19, 20].includes(l.id));
    record(10, "结果账本18条恰为1..16/21/22且保留行hash/created_at原值不变",
      post.ledger.length === 18 && JSON.stringify(post.ledgerIds) === JSON.stringify([...Array.from({ length: 16 }, (_, i) => i + 1), 21, 22]) && JSON.stringify(post.ledger) === JSON.stringify(keptPre),
      { ledgerIds: post.ledgerIds });
    // ── #11 prepared批次rolled_back ───────────────────────────────────────────
    const pb = post.batches.find((b) => b.id === PREPARED_BATCH_ID);
    record(11, "prepared批次91d60c5f→rolled_back且历史entries保留",
      pb?.status === "rolled_back" && post.entriesByBatch[PREPARED_BATCH_ID] === pre.entriesByBatch[PREPARED_BATCH_ID],
      { status: pb?.status, entriesBefore: pre.entriesByBatch[PREPARED_BATCH_ID], entriesAfter: post.entriesByBatch[PREPARED_BATCH_ID] });
    // ── #12 新可信批次 ────────────────────────────────────────────────────────
    const tb = post.batches.find((b) => b.id === TRUSTED_BATCH_ID);
    record(12, "新可信批次c8a7c104 restore_verified、真实计数/table_hashes、created_by=task34-repair-forward",
      tb?.status === "restore_verified" && tb?.createdBy === "task34-repair-forward" && tb?.manifestHash === "da0ea94d4e8ce07b06dd50d2cdd4780110c256705fd7f024c83f5e4378cb32ef" && tb?.storagePath === TRUSTED_DIR
        && canonEq(tb?.sourceCounts, { cases: 452, showcaseCases: 36, regressionTests: 500, historicalExampleTests: 28 })
        && canonEq(tb?.retainedCounts, { cases: 36, showcaseCases: 36, tests: 78, exampleTests: 42, regressionTests: 36 })
        && Object.values(tb?.deletedCounts ?? { x: 1 }).every((v) => v === 0)
        && tb?.tableHashes?.trustedArchiveManifestHash === "da0ea94d4e8ce07b06dd50d2cdd4780110c256705fd7f024c83f5e4378cb32ef"
        && tb?.tableHashes?.trustedArchiveDumpSha === "0e3c3d8b984bd992508d7a8fc4a32d162a96bf76634392cdbb6b0e1bc4264c11"
        && /^[0-9a-f]{64}$/.test(tb?.tableHashes?.attestationManifestHash ?? "") && tb?.tableHashes?.migrationLedgerFingerprint === "492c5fbe645d3540f86d86629bb9d43717d9e942438fd24ecb83eb6445274a4a",
      { batch: tb });
    // ── #13 988 entries逐项匹配（verify --plan） ─────────────────────────────
    const v = cli(["verify", "--plan", planFile], URL);
    record(13, "新entries恰好988且与manifest逐项一致（verify --plan ok）",
      post.entriesByBatch[TRUSTED_BATCH_ID] === 988 && v.code === 0 && v.json?.ok === true && v.json?.trustedEntries === 988 && v.json?.state?.state === "repaired",
      { entries: post.entriesByBatch[TRUSTED_BATCH_ID], verify: v.json?.state });
    // ── #14 业务零变化 ────────────────────────────────────────────────────────
    record(14, "36/36/78、10 snapshots、5 releases及全部业务表hash不变",
      JSON.stringify(post.counts) === JSON.stringify(pre.counts) && JSON.stringify(post.businessFingerprints) === JSON.stringify(pre.businessFingerprints)
        && post.counts.cases === 36 && post.counts.showcase === 36 && post.counts.tests === 78 && post.counts.snapshots === 10 && post.counts.releases === 5
        && JSON.stringify(planDoc.businessFingerprints) === JSON.stringify(post.businessFingerprints),
      { counts: post.counts, fingerprints: post.businessFingerprints });
    // ── #15 migration×2 no-op ────────────────────────────────────────────────
    run("node", ["scripts/run-migrations.mjs"], { DATABASE_URL: URL });
    const m1 = (await stateOf(URL)).ledger.length;
    run("node", ["scripts/run-migrations.mjs"], { DATABASE_URL: URL });
    const m2 = (await stateOf(URL)).ledger.length;
    record(15, "repair后migration执行两次均no-op（账本持续18条）", m1 === 18 && m2 === 18, { afterFirst: m1, afterSecond: m2 });
    // ── #16 复跑noop ──────────────────────────────────────────────────────────
    const again = cli(["apply", "--i-am-authorized", "--plan-hash", P, "--target-fingerprint", F], URL);
    record(16, "repair复跑noop:true且状态不变", again.code === 0 && again.json?.noop === true && again.json?.applied === false && sameState(post, await stateOf(URL)), { code: again.code, noop: again.json?.noop, error: again.json?.error });

    // ── #17 并发：两个apply只有一个执行 ────────────────────────────────────────
    const DBC = `task34_repair_conc_${randomUUID().slice(0, 6)}`; const URLC = `${BASE}/${DBC}`;
    restorePost(DBC);
    const planC = cli(["plan"], URLC);
    const [c1, c2] = await Promise.all([
      cliAsync(["apply", "--i-am-authorized", "--plan-hash", planC.json.planHash, "--target-fingerprint", planC.json.targetFingerprint], URLC),
      cliAsync(["apply", "--i-am-authorized", "--plan-hash", planC.json.planHash, "--target-fingerprint", planC.json.targetFingerprint], URLC),
    ]);
    const applied = [c1, c2].filter((x) => x.code === 0 && x.json?.applied === true);
    const noops = [c1, c2].filter((x) => x.code === 0 && x.json?.noop === true);
    const sC = await stateOf(URLC);
    record(17, "并发两个apply：恰好一个applied、另一个noop；终态一致",
      applied.length === 1 && noops.length === 1 && sC.ledger.length === 18 && sC.entriesByBatch[TRUSTED_BATCH_ID] === 988 && sC.batches.find((b) => b.id === PREPARED_BATCH_ID)?.status === "rolled_back",
      { c1: { code: c1.code, applied: c1.json?.applied, noop: c1.json?.noop, attempts: c1.json?.attempts, error: c1.json?.error }, c2: { code: c2.code, applied: c2.json?.applied, noop: c2.json?.noop, attempts: c2.json?.attempts, error: c2.json?.error } });

    // ── #18 故障注入：每个点完整回滚 ──────────────────────────────────────────
    const DBF = `task34_repair_fault_${randomUUID().slice(0, 6)}`; const URLF = `${BASE}/${DBF}`;
    restorePost(DBF);
    const preF = await stateOf(URLF);
    const planF = cli(["plan"], URLF);
    const faultResults = [];
    for (const fp of FAULT_POINTS) {
      const fr = cli(["apply", "--i-am-authorized", "--plan-hash", planF.json.planHash, "--target-fingerprint", planF.json.targetFingerprint], URLF, { RCL_REPAIR_FAULT: fp });
      const after = await stateOf(URLF);
      faultResults.push({ point: fp, code: fr.code, error: fr.json?.error, rolledBack: sameState(preF, after) });
    }
    const finalF = cli(["apply", "--i-am-authorized", "--plan-hash", planF.json.planHash, "--target-fingerprint", planF.json.targetFingerprint], URLF);
    record(18, "每个故障注入点（5处）均FAULT_INJECTED且完整回滚；随后正常apply成功",
      faultResults.every((x) => x.code === 7 && x.error === "FAULT_INJECTED" && x.rolledBack) && finalF.code === 0 && finalF.json?.applied === true && (await stateOf(URLF)).ledger.length === 18,
      { faultResults, finalApplied: finalF.json?.applied });

    // ── #19 repair后dump在第三个全新实例恢复40表/20 sequence一致 ─────────────
    const dumpBuf = execFileSync("docker", ["exec", CONTAINER, "pg_dump", "-U", "postgres", "-Fc", DB], { maxBuffer: 512 * 1024 * 1024 });
    const dumpPath = join(outDir, "post-repair-drill.dump");
    writeFileSync(dumpPath, dumpBuf);
    const DBR = `task34_repair_restore_${randomUUID().slice(0, 6)}`; const URLR = `${BASE}/${DBR}`;
    createDb(DBR); restoreDump(DBR, dumpPath);
    const rec = runTsxInline(`import { drizzle } from "drizzle-orm/node-postgres";
      import pg from "pg";
      import { reconcileDatabases, listSequences, listBaseTables } from "@/lib/case-governance/reconcile";
      const src = drizzle(new pg.Pool({ connectionString: ${JSON.stringify(URL)} }));
      const dst = drizzle(new pg.Pool({ connectionString: ${JSON.stringify(URLR)} }));
      const tableMis = (await reconcileDatabases(src, dst)).mismatches;
      const [sSrc, sDst] = [await listSequences(src), await listSequences(dst)];
      const key = (s) => s.schema + "." + s.name;
      const dstKeyed = new Map(sDst.map((s) => [key(s), s]));
      const seqMis = [];
      for (const s of sSrc) { const d = dstKeyed.get(key(s)); if (!d) seqMis.push("missing " + key(s)); else if (d.lastValue !== s.lastValue || d.isCalled !== s.isCalled) seqMis.push("diff " + key(s)); }
      const tables = (await listBaseTables(src)).length;
      console.log(JSON.stringify({ tables, sequences: sSrc.length, mismatches: [...tableMis, ...seqMis] }));
      process.exit(0);`, URL).trim().split("\n").pop();
    const recJ = JSON.parse(rec);
    record(19, "repair后完整dump在第三个全新实例恢复：40表/20 sequence/零mismatch", recJ.tables === 40 && recJ.sequences === 20 && recJ.mismatches.length === 0, { ...recJ, dumpSha256: sha256File(dumpPath) });
    rmSync(dumpPath, { force: true });

    meta.finishedAt = new Date().toISOString();
    const report = { title: "任务34 repair-forward执行器隔离演练报告（WI-20260907-04）", ...meta, trustedArchiveDir: TRUSTED_DIR, scenarios: results, allPassed: results.every((r) => r.ok), total: results.length };
    writeFileSync(join(outDir, "repair-executor-test-report.json"), JSON.stringify(report, null, 2));
    console.log(`[drill] 报告：${join(outDir, "repair-executor-test-report.json")} allPassed=${report.allPassed}`);
  } finally {
    for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
    spawnSync("docker", ["rm", "-f", CONTAINER], { encoding: "utf-8" });
    console.log("[drill] 隔离容器已清理（永久可信归档未触碰）");
  }
}

main().catch((err) => {
  console.error("[drill] failed:", err);
  const outDir = OUT_DIR;
  if (outDir) {
    try { mkdirSync(outDir, { recursive: true }); writeFileSync(join(outDir, "repair-executor-test-report.json"), JSON.stringify({ title: "任务34 repair-forward执行器隔离演练报告（失败）", ...meta, scenarios: results, allPassed: false, failure: String(err?.message ?? err) }, null, 2)); } catch { /* ignore */ }
  }
  process.exit(1);
});
