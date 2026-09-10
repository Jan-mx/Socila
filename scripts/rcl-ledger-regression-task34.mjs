/**
 * 任务34第五轮：migration账本回归（独立入口）。
 *
 * 用法：
 *   node scripts/rcl-ledger-regression-task34.mjs <post-dump> [--out <证据目录>]
 *
 * 流程（全部在任务专属隔离PG17+pgvector容器/库上，不触碰持久policyops）：
 *   1. 启动隔离容器，pg_restore post dump到全新库；
 *   2. 运行migration账本回归（scripts/lib/task34-ledger-regression.mjs）：
 *      修复后journal首次migration no-op（账本21条）→ 事务删除ID 18/19/20 →
 *      migration×2均no-op（账本18条）→ 保留行hash/created_at不变 →
 *      ID 17不补写不重排 → 模拟0019（when>1788796860000）只应用一次 →
 *      工作树SQL均为LF且hash===Git blob；
 *   3. 输出结构化JSON证据（--out时写入目录）；
 *   4. finally清理容器与隔离库。
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { runLedgerMigrationRegression } from "./lib/task34-ledger-regression.mjs";

const POST_DUMP = process.argv[2];
const OUT_DIR = (() => {
  const i = process.argv.indexOf("--out");
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
})();
const CONTAINER = process.env.RCL_LEDGER_PG_CONTAINER ?? "task34-ledger-reg-pg";
const PASSWORD = "post" + "gres";
const WORK_DIR = resolve(process.cwd());
const DB = `task34_ledger_reg_${randomUUID().slice(0, 6)}`;

if (!POST_DUMP) {
  console.error("用法：node scripts/rcl-ledger-regression-task34.mjs <post-dump> [--out <证据目录>]");
  process.exit(1);
}

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
function sleepSync(ms) {
  spawnSync(process.execPath, ["-e", `setTimeout(()=>{},${ms})`], { stdio: "ignore" });
}

async function main() {
  const dumpSha = createHash("sha256").update(readFileSync(POST_DUMP)).digest("hex");
  spawnSync("docker", ["rm", "-f", CONTAINER], { encoding: "utf-8" });
  docker("run", "-d", "--name", CONTAINER, "-e", "POSTGRES_PASSWORD=" + PASSWORD, "-p", "127.0.0.1::5432", "pgvector/pgvector:pg17");
  try {
    for (let i = 0; i < 60; i++) {
      const r = spawnSync("docker", ["exec", CONTAINER, "pg_isready", "-U", "postgres"], { encoding: "utf-8" });
      if (r.status === 0) break;
      sleepSync(1000);
    }
    const portInfo = docker("port", CONTAINER, "5432").trim();
    const actualPort = portInfo.split(":")[1]?.trim();
    if (!actualPort) throw new Error(`端口解析失败：${portInfo}`);
    const url = `postgresql://postgres:${PASSWORD}@127.0.0.1:${actualPort}/${DB}`;
    console.log(`[ledger-regression] 容器端口 ${actualPort}`);

    docker("exec", CONTAINER, "psql", "-U", "postgres", "-c", `CREATE DATABASE "${DB}"`);
    docker("exec", CONTAINER, "psql", "-U", "postgres", "-d", DB, "-c", "CREATE EXTENSION IF NOT EXISTS vector");
    docker("exec", CONTAINER, "psql", "-U", "postgres", "-d", DB, "-c", "CREATE EXTENSION IF NOT EXISTS btree_gist");
    docker("exec", CONTAINER, "psql", "-U", "postgres", "-d", DB, "-c", `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='agent_app') THEN CREATE ROLE agent_app LOGIN PASSWORD '${PASSWORD}'; END IF; END $$;`);
    const rest = spawnSync("docker", ["exec", "-i", CONTAINER, "pg_restore", "-U", "postgres", "-d", DB, "--clean", "--if-exists"], {
      input: readFileSync(POST_DUMP), maxBuffer: 1024 * 1024 * 1024, encoding: "buffer",
    });
    if (rest.status !== 0) throw new Error(`post dump恢复失败：${rest.stderr?.toString().slice(0, 400)}`);
    console.log(`[ledger-regression] post dump恢复完成（SHA-256 ${dumpSha.slice(0, 16)}…）`);

    const summary = await runLedgerMigrationRegression({ url, workDir: WORK_DIR, drizzleFolder: "drizzle" });
    summary.postDump = { file: POST_DUMP, sha256: dumpSha };
    console.log("[ledger-regression] " + JSON.stringify(summary, null, 2));
    if (OUT_DIR) {
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(join(OUT_DIR, "ledger-regression.json"), JSON.stringify(summary, null, 2));
      console.log(`[ledger-regression] 证据写入 ${OUT_DIR}`);
    }
    console.log("[ledger-regression] 全部通过");
  } finally {
    try {
      docker("exec", CONTAINER, "psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    } catch { /* 忽略 */ }
    spawnSync("docker", ["rm", "-f", CONTAINER], { encoding: "utf-8" });
    console.log("[ledger-regression] 隔离容器与库已清理");
  }
}

main().catch((err) => {
  console.error("[ledger-regression] failed:", err);
  process.exit(1);
});
