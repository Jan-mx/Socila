/**
 * WI-20260911-03 隔离验收演练（SHV2-AC-014～021）：
 *
 *   RCL_REWRITE_DRILL_CONTAINER=<pg17+pgvector容器> \
 *   node scripts/rcl-rewrite-drill-v2.mjs [--keep]
 *
 * 流程（全部在任务专属容器的全新库上，绝不触碰 localhost:5432/policyops）：
 *   1. 创建全新演练库（启用vector/btree_gist）→ migration×2 → bootstrap → seed；
 *   2. e2e-rcl-setup（沪粤快照经七道门禁激活 + V1 CLI七模式替换为36/36/80，含真实恢复演练）；
 *   3. generate-v2（真实快照绑定）→ rewrite audit → plan →
 *      守卫反例（缺授权/错planHash/错targetFingerprint）→ apply → verify → 复跑noop；
 *   4. 0019重复执行幂等（migration×2）；
 *   5. post dump（pg_dump -Fc）→ 第三实例pg_restore → restore-reconcile全表+sequence对账；
 *   6. 输出证据JSON（rewrite-drill-evidence.json）并清理演练库（--keep保留）。
 *
 * 退出码：0全部通过；1任一步骤失败。
 */
import { spawnSync, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TSX_CLI = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const CONTAINER = process.env.RCL_REWRITE_DRILL_CONTAINER ?? "shv2-task2-pg";
const PORT = process.env.RCL_REWRITE_DRILL_PORT ?? "54955";
const KEEP = process.argv.includes("--keep");
const DB = `shv2_rewrite_drill_${randomUUID().slice(0, 6)}`;
const RESTORE_DB = `${DB}_restore`;
const BASE = `postgresql://postgres:postgres@localhost:${PORT}`;
const DRILL_URL = `${BASE}/${DB}`;
const RESTORE_URL = `${BASE}/${RESTORE_DB}`;
const STORAGE = path.join(ROOT, ".rewrite-drill-storage");
const EVIDENCE_DIR = path.join(ROOT, "docs", "refactor", "policy-ops-agent", "reports", "feature-09-11-shanghai-case-v2");

const results = [];
let failed = false;

function step(name, fn) {
  process.stdout.write(`[rewrite-drill] ${name} ...\n`);
  const started = Date.now();
  try {
    const detail = fn();
    results.push({ name, ok: true, ms: Date.now() - started, detail: detail ?? null });
    process.stdout.write(`[rewrite-drill]   OK (${Date.now() - started}ms)\n`);
  } catch (err) {
    failed = true;
    results.push({ name, ok: false, ms: Date.now() - started, error: String(err?.message ?? err) });
    process.stdout.write(`[rewrite-drill]   FAIL: ${String(err?.message ?? err).slice(0, 500)}\n`);
    throw err;
  }
}

function docker(args, input) {
  const r = spawnSync("docker", ["exec", ...(input ? ["-i"] : []), CONTAINER, ...args], {
    input,
    maxBuffer: 512 * 1024 * 1024,
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`docker ${args.join(" ")} 退出码${r.status}：${(r.stderr || "").slice(0, 300)}`);
  return r.stdout;
}

function run(cmd, args, env, label) {
  const r = spawnSync(cmd, args, { env: { ...process.env, ...env }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 900_000 });
  if (r.status !== 0) {
    throw new Error(`${label} 退出码${r.status}：${(r.stderr || "").slice(0, 400)}｜${(r.stdout || "").slice(0, 300)}`);
  }
  return r.stdout;
}

function parseJsonOut(text, label) {
  return JSON.parse(text) ?? (() => { throw new Error(`${label} 输出非JSON`); })();
}

function cleanupDbs() {
  if (KEEP) return;
  for (const db of [DB, RESTORE_DB]) {
    spawnSync("docker", ["exec", CONTAINER, "psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`], { encoding: "utf8" });
  }
}

try {
  mkdirSync(STORAGE, { recursive: true });
  step("创建全新演练库并启用vector/btree_gist", () => {
    docker(["psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`]);
    docker(["psql", "-U", "postgres", "-c", `CREATE DATABASE "${DB}"`]);
    docker(["psql", "-U", "postgres", "-d", DB, "-c", "CREATE EXTENSION IF NOT EXISTS vector"]);
    docker(["psql", "-U", "postgres", "-d", DB, "-c", "CREATE EXTENSION IF NOT EXISTS btree_gist"]);
  });

  step("migration×2 + bootstrap + seed", () => {
    const env = { DATABASE_URL: DRILL_URL };
    run(process.execPath, ["scripts/run-migrations.mjs"], env, "migration#1");
    run(process.execPath, ["scripts/run-migrations.mjs"], env, "migration#2");
    run(process.execPath, ["scripts/bootstrap-admin.mjs"], {
      ...env,
      ADMIN_USERNAME: "jan",
      ADMIN_PASSWORD_HASH: "$2b$12$YFb9CDK0.XzKfvyrq6bC2Ov5yjmZWuw1qHErXd3AV.V3o4MNTNcp.",
    }, "bootstrap");
    run(process.execPath, [TSX_CLI, path.join(ROOT, "src", "lib", "db", "seed", "index.ts")], env, "seed");
  });

  step("e2e-rcl-setup：沪粤快照激活+V1替换演练（36/36/80）", () => {
    run(process.execPath, [TSX_CLI, path.join(ROOT, "scripts", "e2e-rcl-setup.ts")], {
      SOCILA_E2E_DATABASE_URL: DRILL_URL,
      RCL_DRILL_PG_CONTAINER: CONTAINER,
    }, "e2e-rcl-setup");
    if (existsSync(path.join(ROOT, ".e2e-rcl-state.json"))) {
      rmSync(path.join(ROOT, ".e2e-rcl-state.json"), { force: true });
    }
    if (existsSync(path.join(ROOT, ".e2e-task3-state.json"))) {
      rmSync(path.join(ROOT, ".e2e-task3-state.json"), { force: true });
    }
  });

  let planHash = "";
  let targetFingerprint = "";
  let planFile = "";
  step("generate-v2 + rewrite audit/plan", () => {
    const genOut = run(process.execPath, [TSX_CLI, path.join(ROOT, "scripts", "rcl-case-library.ts"), "generate-v2", "--storage", STORAGE], { DATABASE_URL: DRILL_URL }, "generate-v2");
    const gen = parseJsonOut(genOut, "generate-v2");
    if (gen.scenarioCount !== 36 || gen.shanghai !== 18 || gen.guangdong !== 18) throw new Error(`generate-v2计数异常：${JSON.stringify(gen)}`);
    const generated = path.join(STORAGE, "generated-scenarios-v2.json");
    const auditOut = run(process.execPath, [TSX_CLI, path.join(ROOT, "scripts", "rcl-case-rewrite-v2.mjs"), "audit", "--generated", generated], { DATABASE_URL: DRILL_URL }, "rewrite-audit");
    const audit = parseJsonOut(auditOut, "rewrite-audit");
    if (audit.state !== "pending" || audit.allV1 !== true) throw new Error(`audit状态异常：${audit.state}/allV1=${audit.allV1}`);
    const planOut = run(process.execPath, [TSX_CLI, path.join(ROOT, "scripts", "rcl-case-rewrite-v2.mjs"), "plan", "--generated", generated, "--out", STORAGE], { DATABASE_URL: DRILL_URL }, "rewrite-plan");
    const plan = parseJsonOut(planOut, "rewrite-plan");
    if (plan.entries !== 108) throw new Error(`plan entries ${plan.entries} ≠ 108`);
    planHash = plan.planHash;
    targetFingerprint = plan.targetFingerprint;
    planFile = path.join(STORAGE, "rewrite-plan-v2.json");
  });

  step("守卫反例：缺授权/错planHash/错targetFingerprint → 零写入拒绝", () => {
    const generated = path.join(STORAGE, "generated-scenarios-v2.json");
    const base = [TSX_CLI, path.join(ROOT, "scripts", "rcl-case-rewrite-v2.mjs"), "apply", "--generated", generated, "--plan-file", planFile];
    const cases = [
      { label: "缺授权", args: [...base, "--plan-hash", planHash, "--target-fingerprint", targetFingerprint], drop: "--i-am-authorized", expect: 2 },
      { label: "错planHash", args: [...base, "--i-am-authorized", "--plan-hash", "0".repeat(64), "--target-fingerprint", targetFingerprint], expect: 3 },
      { label: "错targetFingerprint", args: [...base, "--i-am-authorized", "--plan-hash", planHash, "--target-fingerprint", "0".repeat(64)], expect: 4 },
    ];
    for (const c of cases) {
      const args = c.drop ? c.args.filter((a) => a !== c.drop) : c.args;
      const r = spawnSync(process.execPath, args, { env: { ...process.env, DATABASE_URL: DRILL_URL, RCL_REWRITE_ALLOW_DIRTY: "1" }, encoding: "utf8", timeout: 300_000 });
      if (r.status !== c.expect) throw new Error(`${c.label} 退出码${r.status} ≠ ${c.expect}：${(r.stderr || "").slice(0, 200)}`);
    }
  });

  step("apply：108行原位升级（单事务）", () => {
    const out = run(process.execPath, [TSX_CLI, path.join(ROOT, "scripts", "rcl-case-rewrite-v2.mjs"), "apply", "--generated", path.join(STORAGE, "generated-scenarios-v2.json"), "--plan-file", planFile, "--i-am-authorized", "--plan-hash", planHash, "--target-fingerprint", targetFingerprint], { DATABASE_URL: DRILL_URL, RCL_REWRITE_ALLOW_DIRTY: "1" }, "rewrite-apply");
    const result = parseJsonOut(out, "rewrite-apply");
    if (result.applied !== true || result.entries !== 108) throw new Error(`apply结果异常：${JSON.stringify(result)}`);
  });

  let verifyDetail = null;
  step("verify + 复跑noop", () => {
    const v = parseJsonOut(run(process.execPath, [TSX_CLI, path.join(ROOT, "scripts", "rcl-case-rewrite-v2.mjs"), "verify", "--generated", path.join(STORAGE, "generated-scenarios-v2.json"), "--plan-file", planFile], { DATABASE_URL: DRILL_URL }, "verify"), "verify");
    if (!v.ok) throw new Error(`verify失败：${v.problems.join("；")}`);
    verifyDetail = v.counts;
    const rerun = parseJsonOut(run(process.execPath, [TSX_CLI, path.join(ROOT, "scripts", "rcl-case-rewrite-v2.mjs"), "apply", "--generated", path.join(STORAGE, "generated-scenarios-v2.json"), "--plan-file", planFile, "--i-am-authorized", "--plan-hash", planHash, "--target-fingerprint", targetFingerprint], { DATABASE_URL: DRILL_URL, RCL_REWRITE_ALLOW_DIRTY: "1" }, "rerun"), "rerun");
    if (rerun.noop !== true) throw new Error("复跑未返回noop:true");
  });

  step("0019重复执行幂等（migration×2）", () => {
    const env = { DATABASE_URL: DRILL_URL };
    run(process.execPath, ["scripts/run-migrations.mjs"], env, "migration#3");
    run(process.execPath, ["scripts/run-migrations.mjs"], env, "migration#4");
  });

  step("post dump → 第三实例恢复 → 全表+sequence对账", () => {
    const dumpFile = path.join(STORAGE, "rewrite-post.dump");
    const url = new URL(DRILL_URL);
    const dump = spawnSync("docker", ["exec", CONTAINER, "pg_dump", "-U", url.username || "postgres", "-Fc", DB], { encoding: "buffer", maxBuffer: 512 * 1024 * 1024 });
    if (dump.status !== 0) throw new Error(`pg_dump失败：${dump.stderr.toString().slice(0, 300)}`);
    writeFileSync(dumpFile, dump.stdout);
    docker(["psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS "${RESTORE_DB}" WITH (FORCE)`]);
    docker(["psql", "-U", "postgres", "-c", `CREATE DATABASE "${RESTORE_DB}"`]);
    const restore = spawnSync("docker", ["exec", "-i", CONTAINER, "pg_restore", "-U", "postgres", "-d", RESTORE_DB, "--clean", "--if-exists"], {
      input: dump.stdout, maxBuffer: 512 * 1024 * 1024, encoding: "buffer",
    });
    if (restore.status !== 0) throw new Error(`pg_restore失败：${restore.stderr.toString().slice(0, 300)}`);
    const reconcile = run(process.execPath, [TSX_CLI, path.join(ROOT, "scripts", "restore-reconcile.ts")], {
      DATABASE_URL: DRILL_URL,
      TARGET_DATABASE_URL: RESTORE_URL,
    }, "restore-reconcile");
    if (!/0 mismatches|一致|"ok": true|exit 0/.test(reconcile) && !reconcile.includes("MATCH")) {
      // restore-reconcile不一致时退出码非0（run已抛错）；此处仅记录摘要。
    }
    // 完整dump恢复后业务content_hash仍一致：在恢复副本上重跑rewrite verify
    // （含业务content_hash列逐条核对——2026-09-12独立审查契约）。
    const restoredVerify = run(process.execPath, [TSX_CLI, path.join(ROOT, "scripts", "rcl-case-rewrite-v2.mjs"), "verify", "--generated", path.join(STORAGE, "generated-scenarios-v2.json"), "--plan-file", planFile], { DATABASE_URL: RESTORE_URL }, "restored-verify");
    const rv = parseJsonOut(restoredVerify, "restored-verify");
    if (!rv.ok) throw new Error(`恢复副本verify失败：${(rv.problems ?? []).join("；")}`);
    return { restoredVerify: "ok" };
  });

  step("最终计数与审计核对（36/36/80、1批次、108entries、业务hash一致）", () => {
    const out = docker(["psql", "-U", "postgres", "-d", DB, "-tAc",
      `SELECT (SELECT count(*) FROM cases)||'/'||(SELECT count(*) FROM showcase_cases)||'/'||(SELECT count(*) FROM tests)||'/'||
       (SELECT count(*) FROM case_rewrite_batches)||'/'||(SELECT count(*) FROM case_rewrite_entries)||'/'||
       (SELECT count(*) FROM cases WHERE generator_version='RCL-GEN-2.0' AND case_text IS NOT NULL AND transcript_text IS NULL)||'/'||
       (SELECT count(*) FROM cases c JOIN case_rewrite_entries e ON e.entity_type='case' AND e.entity_id=c.id WHERE c.content_hash IS DISTINCT FROM e.new_content_hash)||'/'||
       (SELECT count(*) FROM showcase_cases s JOIN case_rewrite_entries e ON e.entity_type='showcase_case' AND e.entity_id=s.id WHERE s.content_hash IS DISTINCT FROM e.new_content_hash)||'/'||
       (SELECT count(*) FROM cases WHERE content_hash IS NOT NULL)||'/'||
       (SELECT count(*) FROM showcase_cases WHERE content_hash IS NOT NULL)`]);
    const [casesN, showcasesN, testsN, batches, entries, v2clean, caseHashDrift, scHashDrift, caseHashSet, scHashSet] = out.trim().split("/");
    const counts = `${casesN}/${showcasesN}/${testsN}`;
    if (counts !== "36/36/80") throw new Error(`最终计数 ${counts} ≠ 36/36/80`);
    if (batches !== "1" || entries !== "108") throw new Error(`审计 ${batches}批次/${entries}entries ≠ 1/108`);
    if (v2clean !== "36") throw new Error(`V2干净case ${v2clean} ≠ 36`);
    if (caseHashDrift !== "0" || scHashDrift !== "0") throw new Error(`业务content_hash与审计不一致：case漂移${caseHashDrift}/showcase漂移${scHashDrift}`);
    if (caseHashSet !== "36" || scHashSet !== "36") throw new Error(`业务content_hash未全部写入：case ${caseHashSet}/showcase ${scHashSet} ≠ 36/36`);
    return { counts, batches, entries, v2clean, businessHashDrift: `${caseHashDrift}/${scHashDrift}`, businessHashSet: `${caseHashSet}/${scHashSet}` };
  });
} catch {
  // failed=true已记录
} finally {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const evidence = {
    drill: "rcl-case-rewrite-v2",
    container: CONTAINER,
    port: PORT,
    database: DB,
    restoreDatabase: RESTORE_DB,
    finishedAt: new Date().toISOString(),
    failed,
    results,
  };
  const evidencePath = path.join(EVIDENCE_DIR, `rewrite-drill-evidence-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
  process.stdout.write(`[rewrite-drill] 证据：${path.relative(ROOT, evidencePath)}（failed=${failed}）\n`);
  cleanupDbs();
  rmSync(STORAGE, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
