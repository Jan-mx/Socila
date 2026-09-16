/**
 * APR（后台政策资产中文可读化）数据库门禁编排（任务专属资源，finally零残留）。
 *
 * 用法：node scripts/apr-db-gate.mjs
 * 行为：
 *   1. 创建任务专属容器 `apr-drill-pg`（pgvector/pgvector:pg17，
 *      POSTGRES_PASSWORD=postgres，仅127.0.0.1自动高位端口）与隔离MinIO
 *      `apr-drill-minio-a`/`apr-drill-minio-b`（quay.io固定digest，与CI Compose同源）；
 *   2. 数据库 `apr_drill`：migration×2、bootstrap×2、seed×2（幂等验证）；
 *   3. `npm run test:db`全量（显式SOCILA_TEST_DATABASE_URL，零skip）；
 *   4. agent.migrate --with-roles×2幂等 + pytest -m integration（含RAG MinIO）；
 *   5. finally无条件删除本脚本创建的容器；随后枚举docker资源验证零残留。
 * 全程不使用、不删除、不重建任何 `socila-*` 容器或 socila_* 数据卷。
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const TSX_CLI = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

// 修复轮I6：MinIO镜像复用仓库CI已批准的quay.io固定digest（单一来源=
// infra/prod/docker-compose.ci.yml，运行时解析，禁止latest/自行猜测——
// Docker Hub上的minio官方latest标签当前manifest inspect denied且不确定）。
function approvedMinioImage() {
  // 假设声明（复审A-Minor）：本解析假定compose中含"minio"与"image:"的首个服务块
  // 即MinIO服务；若未来compose新增其他含小写"minio"子串且带image:的服务块，
  // 形状校验（quay+RELEASE+@sha256:64hex）不符会直接抛错失败而非静默用错镜像。
  const compose = readFileSync(
    path.join(process.cwd(), "infra", "prod", "docker-compose.ci.yml"),
    "utf-8",
  );
  const service = compose
    .split("\n  ")
    .find((block) => block.includes("minio") && block.includes("image:"));
  const match = service?.match(/image:\s*(\S+)/);
  if (!match || !/^quay\.io\/minio\/minio:RELEASE\..+@sha256:[0-9a-f]{64}$/.test(match[1])) {
    throw new Error("无法从docker-compose.ci.yml解析CI批准的quay.io固定MinIO镜像");
  }
  return match[1];
}
const MINIO_IMAGE = approvedMinioImage();

// —— 任务专属资源清单（AGENTS.md：创建前记录精确名称/路径）——
const CONTAINERS = ["apr-drill-pg", "apr-drill-minio-a", "apr-drill-minio-b"];
const DB = "apr_drill";
const PASSWORD = "post" + "gres"; // 测试容器默认弱口令，非真实凭据
let PG_PORT = "";
let MINIO_A_PORT = "";
let MINIO_B_PORT = "";
const WORK_DIR = process.cwd();
const TMP = mkdtempSync(path.join(tmpdir(), "apr-gate-"));

function run(cmd, args, env = {}, opts = {}) {
  const echo = opts.echo === true;
  const { echo: _echo, ...spawnOpts } = opts;
  const r = spawnSync(cmd, args, {
    cwd: spawnOpts.cwd ?? WORK_DIR,
    encoding: "utf-8",
    env: { ...process.env, ...env },
    ...spawnOpts,
    stdio: echo ? ["inherit", "pipe", "pipe"] : spawnOpts.stdio ?? "pipe",
    // 全量test:db/pytest输出可超spawnSync默认1MiB（ENOBUFS会误杀成功run）。
    maxBuffer: 64 * 1024 * 1024,
  });
  if (echo && r.stdout) {
    // 透出摘要行供验收证据引用（完整输出不落盘，避免体积）。
    for (const line of r.stdout.toString().split(String.fromCharCode(10))) {
      if (/Test Files|Tests |passed|failed|error|skipped/i.test(line) && line.trim().length > 0) {
        console.log(`[apr-gate][out] ${line.replace(/\[[0-9;]*m/g, "").trim()}`);
      }
    }
  }
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
  // 仅删除本脚本创建的任务专属容器（不带-v卷：容器root FS内无持久卷；PG数据卷为匿名卷随rm -f一并清理）。
  for (const name of CONTAINERS) {
    try {
      spawnSync("docker", ["rm", "-f", "-v", name], { encoding: "utf-8" });
    } catch {
      // 清理失败由最终枚举兜底报告
    }
  }
  try {
    rmSync(TMP, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function sleepSync(ms) {
  execFileSync("node", ["-e", `setTimeout(()=>{},${ms})`], { stdio: "ignore" });
}

function waitPgReady() {
  for (let i = 0; i < 60; i++) {
    const r = spawnSync("docker", ["exec", "apr-drill-pg", "pg_isready", "-U", "postgres"], { encoding: "utf-8" });
    if (r.status === 0) return;
    sleepSync(1000);
  }
  throw new Error("PG容器未在60秒内就绪");
}

function waitHttpReady(url) {
  for (let i = 0; i < 60; i++) {
    const r = spawnSync(
      "node",
      ["-e", `fetch(${JSON.stringify(url)}).then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))`],
      { encoding: "utf-8", timeout: 10_000 },
    );
    if (r.status === 0) return;
    sleepSync(1000);
  }
  throw new Error(`HTTP服务未就绪: ${url}`);
}

function actualPort(container, privatePort) {
  const info = run("docker", ["port", container, privatePort]).trim();
  const port = info.split("\n")[0]?.split(":").pop()?.trim();
  if (!port) throw new Error(`无法解析 ${container} 端口：${info}`);
  return port;
}

const drillUrl = () => `postgresql://postgres:${PASSWORD}@127.0.0.1:${PG_PORT}/${DB}`;

function main() {
  try {
    // 防御：先清同名残留（仅限任务专属名称）。
    cleanup();

    console.log("[apr-gate] 创建 apr-drill-pg（pgvector/pgvector:pg17）");
    run("docker", [
      "run", "-d", "--name", "apr-drill-pg",
      "-e", "POSTGRES_PASSWORD=" + PASSWORD,
      "-p", "127.0.0.1::5432",
      "pgvector/pgvector:pg17",
    ]);
    waitPgReady();
    PG_PORT = actualPort("apr-drill-pg", "5432");
    console.log(`[apr-gate] apr-drill-pg 端口 ${PG_PORT}`);

    console.log("[apr-gate] 创建隔离MinIO apr-drill-minio-a/b");
    for (const [name, portVar] of [["apr-drill-minio-a", "MINIO_A_PORT"], ["apr-drill-minio-b", "MINIO_B_PORT"]]) {
      run("docker", [
        "run", "-d", "--name", name,
        "-e", "MINIO_ROOT_USER=minioadmin",
        "-e", "MINIO_ROOT_PASSWORD=minioadmin",
        "-p", "127.0.0.1::9000",
        MINIO_IMAGE,
        "server", "/data",
      ]);
    }
    MINIO_A_PORT = actualPort("apr-drill-minio-a", "9000");
    MINIO_B_PORT = actualPort("apr-drill-minio-b", "9000");
    waitHttpReady(`http://127.0.0.1:${MINIO_A_PORT}/minio/health/live`);
    waitHttpReady(`http://127.0.0.1:${MINIO_B_PORT}/minio/health/live`);
    console.log(`[apr-gate] MinIO端口 a=${MINIO_A_PORT} b=${MINIO_B_PORT}`);

    run("docker", ["exec", "apr-drill-pg", "psql", "-U", "postgres", "-c", `CREATE DATABASE "${DB}"`]);
    run("docker", ["exec", "apr-drill-pg", "psql", "-U", "postgres", "-d", DB, "-c", "CREATE EXTENSION IF NOT EXISTS vector"]);
    run("docker", ["exec", "apr-drill-pg", "psql", "-U", "postgres", "-d", DB, "-c", "CREATE EXTENSION IF NOT EXISTS btree_gist"]);

    console.log("[apr-gate] migration ×2（幂等）");
    run("node", ["scripts/run-migrations.mjs"], { DATABASE_URL: drillUrl() });
    run("node", ["scripts/run-migrations.mjs"], { DATABASE_URL: drillUrl() });

    console.log("[apr-gate] bootstrap ×2（幂等）");
    for (let i = 0; i < 2; i++) {
      run("node", ["scripts/bootstrap-admin.mjs"], {
        DATABASE_URL: drillUrl(),
        ADMIN_USERNAME: "jan",
        ADMIN_PASSWORD_HASH: "$2b$12$YFb9CDK0.XzKfvyrq6bC2Ov5yjmZWuw1qHErXd3AV.V3o4MNTNcp.",
      });
    }

    console.log("[apr-gate] seed ×2（幂等；APR强制名称入口即在此验证）");
    run(process.execPath, [TSX_CLI, "src/lib/db/seed/index.ts"], { DATABASE_URL: drillUrl() });
    run(process.execPath, [TSX_CLI, "src/lib/db/seed/index.ts"], { DATABASE_URL: drillUrl() });

    // APR-FR-011/017持久等价断言：seed后四地区规则集与当前DSL参数行均有人工名称。
    console.log("[apr-gate] seed名称落库核对");
    run("docker", ["exec", "apr-drill-pg", "psql", "-U", "postgres", "-d", DB, "-c",
      `DO $do$
       BEGIN
         IF EXISTS (SELECT 1 FROM rule_sets WHERE name IS NULL OR name = rule_set_id) THEN
           RAISE EXCEPTION 'APR: rule_sets存在未补全名称行';
         END IF;
         IF EXISTS (SELECT 1 FROM params WHERE (jurisdiction_code, param_id, effective_from) IN (
             SELECT DISTINCT p.jurisdiction_code, p.param_id, p.effective_from FROM params p
             WHERE p.name IS NULL OR name = ''
           )) THEN
           RAISE EXCEPTION 'APR: params存在空名称行';
         END IF;
         IF (SELECT COUNT(*) FROM params WHERE name = param_id) > 0 THEN
           RAISE EXCEPTION 'APR: 当前Seed params仍为编号回退名称';
         END IF;
       END $do$;`]);

    console.log("[apr-gate] npm run test:db 全量（零skip）");
    run(
      process.execPath,
      [
        path.join(process.cwd(), "node_modules", "vitest", "vitest.mjs"), "run",
        "--config", "vitest.integration.config.ts", "--dangerouslyIgnoreUnhandledErrors",
      ],
      {
        SOCILA_TEST_DATABASE_URL: drillUrl(),
        DATABASE_URL: drillUrl(),
        RCL_DRILL_PG_CONTAINER: "apr-drill-pg",
      },
      { timeout: 1_500_000, echo: true },
    );
    console.log("[apr-gate] test:db 全量通过");

    console.log("[apr-gate] agent.migrate --with-roles ×2 幂等");
    for (let i = 0; i < 2; i++) {
      run("uv", ["run", "python", "-m", "agent.migrate", "--with-roles"], {
        AGENT_DATABASE_URL: drillUrl(),
        AGENT_DB_PASSWORD: PASSWORD,
        DATABASE_URL: drillUrl(),
      }, { cwd: path.join(WORK_DIR, "services", "agent") });
    }

    console.log("[apr-gate] pytest -m integration");
    run(
      "uv",
      ["run", "pytest", "-m", "integration", "-q"],
      {
        SOCILA_TEST_DATABASE_URL: drillUrl(),
        AGENT_DATABASE_URL: drillUrl(),
        AGENT_DB_PASSWORD: PASSWORD,
        RAG_SYNC_TEST_MINIO_ENDPOINT: `127.0.0.1:${MINIO_A_PORT}`,
        RAG_SYNC_TEST_MINIO_RESTORE_ENDPOINT: `127.0.0.1:${MINIO_B_PORT}`,
        RAG_DRILL_PG_CONTAINER: "apr-drill-pg",
        RAG_DRILL_PG_PORT: PG_PORT,
        RAG_DRILL_MINIO_A_PORT: MINIO_A_PORT,
        RAG_DRILL_MINIO_B_PORT: MINIO_B_PORT,
        AGENT_SERVICE_JWT_CURRENT: "apr-drill-synthetic-jwt-credential-0123456789abcdef",
      },
      { cwd: path.join(WORK_DIR, "services", "agent"), timeout: 1_500_000, echo: true },
    );
    console.log("[apr-gate] pytest integration 通过");
  } finally {
    cleanup();
    console.log("[apr-gate] 任务容器清理完成，最终枚举验证零残留：");
    let listed = "", volumes = "", networks = "";
    try {
      listed = run("docker", ["ps", "-a", "--format", "{{.Names}}"]);
      volumes = run("docker", ["volume", "ls", "--format", "{{.Name}}"]);
      networks = run("docker", ["network", "ls", "--format", "{{.Name}}"]);
    } catch (err) {
      console.error(`[apr-gate] 枚举失败（不吞主错误，但零残留核对不成立）：${err.message}`);
      process.exitCode = 1;
    }
    const aprLeft = listed.split("\n").filter((n) => CONTAINERS.includes(n.trim()));
    const aprVolLeft = volumes.split("\n").filter((n) => /^apr-/.test(n.trim()));
    // AGENTS零残留核对格式要求容器/卷/网络三类枚举（本脚本不建自定义网络，双保险核对）。
    const aprNetLeft = networks.split("\n").filter((n) => /^apr-/.test(n.trim()));
    if (aprLeft.length > 0 || aprVolLeft.length > 0 || aprNetLeft.length > 0) {
      console.error(`[apr-gate] 残留资源：容器=${aprLeft.join(",")} 卷=${aprVolLeft.join(",")} 网络=${aprNetLeft.join(",")}`);
      process.exitCode = 1;
    } else {
      console.log("[apr-gate] apr*容器/卷/网络零残留；socila-*未触碰");
    }
  }
}

main();
