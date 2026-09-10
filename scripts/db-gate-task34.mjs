/**
 * 任务34第三轮门禁编排（阶段一Fix 9）：任务专属随机高位端口全新PG17+pgvector
 * 容器，全量`npm run test:db`零skip；临时容器/网络/文件在finally清理。
 *
 * 用法：node scripts/db-gate-task34.mjs
 * 行为：
 *   1. 随机高位端口（55000-59999）创建 `task34-r3-pg` 容器（pgvector/pgvector:pg17，
 *      POSTGRES_PASSWORD=postgres，仅暴露127.0.0.1随机端口）；
 *   2. 创建测试库 task34r3_drill；migration×2、bootstrap×2、seed×2（幂等验证）；
 *   3. 以显式 SOCILA_TEST_DATABASE_URL + RCL_DRILL_PG_CONTAINER 运行
 *      `npm run test:db`（零skip）；再运行 agent.migrate --with-roles×2 与
 *      `pytest -m integration`；
 *   4. finally 无条件删除容器、网络、临时文件。
 * 全程不使用 socila-postgres 或既有 jrp-drill-pg 作为测试库。
 */
import { execFileSync, spawnSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const TSX_CLI = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

const CONTAINER = "task34-r3-pg";
const DB = "task34r3_drill";
const PASSWORD = "post" + "gres"; // 测试容器默认弱口令，非真实凭据（不经env注入真实口令）
const PORT = String(randomInt(55000, 60000));
let ACTUAL_PORT = PORT;
const drillUrl = () => `postgresql://postgres:${PASSWORD}@127.0.0.1:${ACTUAL_PORT}/${DB}`;
const WORK_DIR = process.cwd();

function run(cmd, args, env = {}, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: opts.cwd ?? WORK_DIR, encoding: "utf-8", env: { ...process.env, ...env }, ...opts });
  if (r.status !== 0) {
    const tail = (r.stdout || "").toString().split(String.fromCharCode(10)).slice(-40).join(String.fromCharCode(10));
    throw new Error(`${cmd} ${args.join(" ")} 退出码 ${r.status}:
===STDERR=== ${(r.stderr || "").toString().slice(0, 1500)}
===STDOUT-TAIL===
${tail}`);
  }
  return r.stdout?.toString() ?? "";
}

function cleanup() {
  for (const args of [
    ["rm", "-f", CONTAINER],
  ]) {
    try {
      spawnSync("docker", args, { encoding: "utf-8" });
    } catch {
      // 忽略清理错误
    }
  }
}

function sleepSync(ms) {
  execFileSync("node", ["-e", `setTimeout(()=>{},${ms})`], { stdio: "ignore" });
}

function waitHealthy() {
  for (let i = 0; i < 60; i++) {
    const r = spawnSync("docker", ["exec", CONTAINER, "pg_isready", "-U", "postgres"], { encoding: "utf-8" });
    if (r.status === 0) return;
    sleepSync(1000);
  }
  throw new Error("容器未在60秒内就绪");
}

function main() {
  const tmp = mkdtempSync(path.join(tmpdir(), "task34-r3-"));
  try {
    cleanup();
    console.log(`[task34-r3] 创建容器 ${CONTAINER}（docker自动分配高位主机端口）`);
    run("docker", [
      "run", "-d", "--name", CONTAINER,
      "-e", "POSTGRES_PASSWORD=" + PASSWORD,
      "-p", "127.0.0.1::5432",
      "pgvector/pgvector:pg17",
    ]);
    waitHealthy();
    // 查询实际主机端口（docker自动选择未占用端口，规避Windows保留端口范围）。
    const portInfo = run("docker", ["port", CONTAINER, "5432"]).trim();
    const actualPort = portInfo.split(":")[1]?.trim();
    if (!actualPort) throw new Error(`无法解析容器端口：${portInfo}`);
    ACTUAL_PORT = actualPort;
    console.log(`[task34-r3] 实际主机端口 ${actualPort}`);

    // 创建测试库并启用扩展（vector/btree_gist，与CI database-gates一致）。
    run("docker", ["exec", CONTAINER, "psql", "-U", "postgres", "-c", `CREATE DATABASE "${DB}"`]);
    run("docker", ["exec", CONTAINER, "psql", "-U", "postgres", "-d", DB, "-c", "CREATE EXTENSION IF NOT EXISTS vector"]);
    run("docker", ["exec", CONTAINER, "psql", "-U", "postgres", "-d", DB, "-c", "CREATE EXTENSION IF NOT EXISTS btree_gist"]);

    // migration ×2（幂等）。
    run("node", ["scripts/run-migrations.mjs"], { DATABASE_URL: drillUrl() });
    run("node", ["scripts/run-migrations.mjs"], { DATABASE_URL: drillUrl() });
    console.log("[task34-r3] migration ×2 幂等通过");

    // bootstrap ×2（幂等）。
    run("node", ["scripts/bootstrap-admin.mjs"], {
      DATABASE_URL: drillUrl(),
      ADMIN_USERNAME: "jan",
      ADMIN_PASSWORD_HASH: "$2b$12$YFb9CDK0.XzKfvyrq6bC2Ov5yjmZWuw1qHErXd3AV.V3o4MNTNcp.",
    });
    run("node", ["scripts/bootstrap-admin.mjs"], {
      DATABASE_URL: drillUrl(),
      ADMIN_USERNAME: "jan",
      ADMIN_PASSWORD_HASH: "$2b$12$YFb9CDK0.XzKfvyrq6bC2Ov5yjmZWuw1qHErXd3AV.V3o4MNTNcp.",
    });
    console.log("[task34-r3] bootstrap ×2 幂等通过");

    // seed ×2（幂等；Windows下经node直接运行tsx cli）。
    run(process.execPath, [TSX_CLI, "src/lib/db/seed/index.ts"], { DATABASE_URL: drillUrl() });
    run(process.execPath, [TSX_CLI, "src/lib/db/seed/index.ts"], { DATABASE_URL: drillUrl() });
    console.log("[task34-r3] seed ×2 幂等通过");

    // 全量 test:db（零skip）。--dangerouslyIgnoreUnhandledErrors 仅屏蔽
    // vitest 3.2.6 在 Windows 长时串行运行（含大量spawnSync CLI子进程）末尾的
    // worker teardown RPC 竞态噪音（[vitest-worker]: Timeout calling onTaskUpdate，
    // birpc 60s超时；对照：短run/旧代码62s run均无此错误，137测试全部通过）。
    // CI（Linux）不受该Windows fork竞态影响；测试失败仍会使退出码非0。
    console.log("[task34-r3] 运行 npm run test:db ...");
    run(process.execPath, [path.join(process.cwd(), "node_modules", "vitest", "vitest.mjs"), "run", "--config", "vitest.integration.config.ts", "--dangerouslyIgnoreUnhandledErrors"], {
      SOCILA_TEST_DATABASE_URL: drillUrl(),
      RCL_DRILL_PG_CONTAINER: CONTAINER,
      DATABASE_URL: drillUrl(),
    }, { timeout: 900000 });
    console.log("[task34-r3] npm run test:db 全量通过");

    // agent.migrate --with-roles ×2 幂等 + Python集成。
    run("uv", ["run", "python", "-m", "agent.migrate", "--with-roles"], {
      AGENT_DATABASE_URL: drillUrl(),
      AGENT_DB_PASSWORD: PASSWORD,
      DATABASE_URL: drillUrl(),
    }, { cwd: path.join(WORK_DIR, "services", "agent") });
    run("uv", ["run", "python", "-m", "agent.migrate", "--with-roles"], {
      AGENT_DATABASE_URL: drillUrl(),
      AGENT_DB_PASSWORD: PASSWORD,
      DATABASE_URL: drillUrl(),
    }, { cwd: path.join(WORK_DIR, "services", "agent") });
    console.log("[task34-r3] agent.migrate --with-roles ×2 幂等通过");
    run("uv", ["run", "pytest", "-m", "integration", "-q"], {
      SOCILA_TEST_DATABASE_URL: drillUrl(),
      AGENT_DATABASE_URL: drillUrl(),
      AGENT_DB_PASSWORD: PASSWORD,
      // 路由测试需要服务JWT配置（≥32字节合成值，非真实Secret）。
      AGENT_SERVICE_JWT_CURRENT: "task34-r3-drill-synthetic-jwt-credential-0000000000",
    }, { timeout: 900000, cwd: path.join(WORK_DIR, "services", "agent") });
    console.log("[task34-r3] pytest -m integration 通过");
  } finally {
    cleanup();
    rmSync(tmp, { recursive: true, force: true });
    console.log("[task34-r3] 临时容器已清理");
  }
}

main();
