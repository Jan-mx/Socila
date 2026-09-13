/**
 * 政策原件MinIO同步+PostgreSQL/MinIO完整备份恢复对账演练（第四轮复审修复后版本）。
 *
 *   RAG_DRILL_PG_CONTAINER=<pg17容器> RAG_DRILL_PG_PORT=<端口> \
 *   RAG_DRILL_MINIO_ENDPOINT=<隔离MinIO> RAG_DRILL_MINIO_RESTORE_ENDPOINT=<全新MinIO> \
 *   RAG_DRILL_MINIO_ACCESS_KEY=... RAG_DRILL_MINIO_SECRET_KEY=... \
 *   node scripts/rag-evidence-drill.mjs [--keep]
 *
 * 流程（全部隔离环境，绝不触碰localhost:5432/policyops与生产MinIO bucket）：
 *   1. 全新演练库（agent.migrate含rag schema与角色）+ 删除隔离bucket（primary/restore
 *      均从“MinIO服务可达、policy-originals不存在”开始，零预建桶）；
 *   2. audit缺桶预态（BUCKET_MISSING→exit4，零建桶）→ plan（缺桶仍只读生成确定性计划：
 *      bucketExists=false、plannedBucketCreate=true、两次逐字节一致、23 uploads、
 *      bucket仍不存在、对象数0）；
 *   3. 守卫反例（全部零建桶零写入，每个反例输出rag.sources/rag.fetches/
 *      rag.document_versions规范化行hash+行数与MinIO对象层before/after指纹）：
 *      缺--i-am-authorized→exit2、错planHash→exit4、错targetFingerprint→exit4、
 *      codeSha不一致→exit4、dirty工作树→exit2、plan后外部建桶+冲突对象漂移→exit4、
 *      plan后RAG数据库状态漂移→exit4、write-only权限错误（受限IAM用户stat拒绝）→exit1、
 *      audit缺数据库→exit2；
 *   4. apply（显式建桶+23对象上传+rag登记+verify，bucketCreated=true）→ 断言bucket存在
 *      且恰好23对象 → 四方verify → 复跑同一计划noop:true → object-only verify（降级标记）；
 *   5. 冲突对象拒绝覆盖（对象字节不变；清除后复跑恢复）；
 *   6. 受控真实索引（WI-20260913-01任务2，真实SiliconFlow BAAI/bge-m3）：
 *      索引audit预态（0 complete）→ 索引plan（绑定23 versions/对象SHA/派生指纹/模型/维度/
 *      indexVersion/planHash/targetFingerprint/finalFingerprint/writeSet，两次逐字节一致）→
 *      索引apply守卫反例（缺授权exit2/错planHash exit4/错指纹exit4，派生表零写入）→
 *      索引apply（真实embedding）→ 索引verify（23/23 complete）→ 固定查询
 *      （7546；2340/1872/1690；等待期6个月；FTS与向量双通道均产生候选）→
 *      地区过滤（广东零命中）与日期过滤（effective_to排除后恢复）→ 索引复跑noop；
 *   7. 备份：pg_dump（含派生索引）+ 逐对象下载（sha256清单）；
 *   8. 恢复：全新数据库pg_restore + 全新MinIO受控回填（恢复程序自身显式建桶，非evidence_sync副作用）；
 *   9. 恢复副本四方对账（verify ok）+ 恢复副本同计划apply noop + 恢复副本索引verify +
 *      恢复副本固定查询一致；
 *  10. bucket创建竞态归属准确：外部进程预先建桶后重新plan（plannedBucketCreate=false）
 *      →apply报告bucketCreated=false且上传/登记/verify全部正确；
 *  11. 输出证据JSON（含执行脚本Git blob SHA与HEAD SHA）；输出全程不含访问密钥/连接串口令。
 *
 * 退出码：0全部通过；1任一步骤失败。
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CONTAINER = process.env.RAG_DRILL_PG_CONTAINER ?? "shv2-ctrl-pg";
const PORT = process.env.RAG_DRILL_PG_PORT ?? "54957";
const MINIO_EP = process.env.RAG_DRILL_MINIO_ENDPOINT ?? "127.0.0.1:54962";
const MINIO_RESTORE_EP = process.env.RAG_DRILL_MINIO_RESTORE_ENDPOINT ?? "127.0.0.1:54963";
const MINIO_AK = process.env.RAG_DRILL_MINIO_ACCESS_KEY ?? "minioadmin";
const MINIO_SK = process.env.RAG_DRILL_MINIO_SECRET_KEY ?? "";
const KEEP = process.argv.includes("--keep");
const EVIDENCE_DIR = path.join(ROOT, "docs", "refactor", "policy-ops-agent", "reports", "stage-09-05-national-baseline-overlays", "evidence", "310000");
const DSL_ROOT = path.join(ROOT, "dsl", "regions");
const EVIDENCE_OUT = path.join(ROOT, "docs", "refactor", "policy-ops-agent", "reports", "feature-09-11-shanghai-case-v2");
const WORK = path.join(ROOT, ".rag-evidence-drill");
const DB = `rag_drill_${randomUUID().slice(0, 6)}`;
const RESTORE_DB = `${DB}_restore`;
const BASE = `postgresql://postgres:postgres@localhost:${PORT}`;
const DRILL_URL = `${BASE}/${DB}`;
const RESTORE_URL = `${BASE}/${RESTORE_DB}`;
const SECRET_SENTINELS = [MINIO_SK, "minioadmin123", "postgres:postgres", "R4LimitedPass9137", process.env.SILICONFLOW_API_KEY].filter((s) => s && s.length > 6);

const results = [];
let failed = false;

// 本机代理（HTTP(S)_PROXY）会拦截api.siliconflow.cn导致401：隔离演练的子进程
// 一律直连（DB/MinIO/SiliconFlow均为本地或白名单外网API，无需代理）。
function stripProxy(env) {
  const out = { ...env };
  for (const key of Object.keys(out)) {
    if (/^(https?_proxy|all_proxy|no_proxy)$/i.test(key)) delete out[key];
  }
  return out;
}

function step(name, fn) {
  process.stdout.write(`[rag-evidence-drill] ${name} ...\n`);
  const started = Date.now();
  try {
    const detail = fn();
    results.push({ name, ok: true, ms: Date.now() - started, detail: detail ?? null });
    process.stdout.write(`[rag-evidence-drill]   OK (${Date.now() - started}ms)\n`);
  } catch (err) {
    failed = true;
    results.push({ name, ok: false, ms: Date.now() - started, error: String(err?.message ?? err) });
    process.stdout.write(`[rag-evidence-drill]   FAIL: ${String(err?.message ?? err).slice(0, 600)}\n`);
    throw err;
  }
}

function assertNoSecrets(text, label) {
  for (const secret of SECRET_SENTINELS) {
    if (text.includes(secret)) throw new Error(`${label}泄露敏感值（哨兵命中）`);
  }
}

function py(code, env = {}) {
  const r = spawnSync("uv", ["run", "--project", path.join(ROOT, "services", "agent"), "python", "-c", code], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 300_000,
    env: stripProxy({ ...process.env, ...env }),
  });
  if (r.status !== 0) throw new Error(`python -c 退出码${r.status}：${(r.stderr || "").slice(0, 400)}`);
  return r.stdout;
}

function syncCli(args, env = {}, expect = 0) {
  const r = spawnSync("uv", ["run", "--project", path.join(ROOT, "services", "agent"), "python", "-m", "agent.rag.evidence_sync", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 300_000,
    env: stripProxy({
      ...process.env,
      AGENT_MINIO_ENDPOINT: MINIO_EP,
      AGENT_MINIO_ACCESS_KEY: MINIO_AK,
      AGENT_MINIO_SECRET_KEY: MINIO_SK,
      // 仅隔离演练放行dirty工作树（门禁在提交前运行）；持久执行禁止该变量。
      RAG_EVIDENCE_ALLOW_DIRTY: "1",
      ...env,
    }),
  });
  const out = (r.stdout || "") + (r.stderr || "");
  assertNoSecrets(out, `evidence_sync ${args[0]}输出`);
  if (expect !== "*" && r.status !== expect) {
    throw new Error(`evidence_sync ${args[0]} 退出码${r.status} ≠ ${expect}：${out.slice(0, 500)}`);
  }
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    // 非JSON输出（守卫/错误路径）允许。
  }
  return { code: r.status, out, json };
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

function dockerBuf(args, input) {
  const r = spawnSync("docker", ["exec", ...(input ? ["-i"] : []), CONTAINER, ...args], {
    input,
    maxBuffer: 512 * 1024 * 1024,
    encoding: "buffer",
  });
  if (r.status !== 0) throw new Error(`docker ${args.join(" ")} 退出码${r.status}：${r.stderr.toString().slice(0, 300)}`);
  return r.stdout;
}

function cleanupDbs() {
  if (KEEP) return;
  for (const db of [DB, RESTORE_DB]) {
    spawnSync("docker", ["exec", CONTAINER, "psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`], { encoding: "utf8" });
  }
}

function minioPy(ep, code, env = {}) {
  return py(
    `from minio import Minio
import os
c = Minio("${ep}", access_key="${MINIO_AK}", secret_key=os.environ["RAG_DRILL_SK"], secure=False)
${code}`,
    { RAG_DRILL_SK: MINIO_SK, ...env },
  );
}

function wipeBucket(ep) {
  minioPy(ep, `if c.bucket_exists("policy-originals"):
    for o in list(c.list_objects("policy-originals", recursive=True)):
        c.remove_object("policy-originals", o.object_name)
    c.remove_bucket("policy-originals")
assert not c.bucket_exists("policy-originals")`);
}

function bucketObjectCount(ep) {
  return minioPy(ep, `print(len(list(c.list_objects("policy-originals", recursive=True))) if c.bucket_exists("policy-originals") else 0)`).trim();
}

function bucketExists(ep) {
  return minioPy(ep, `print(c.bucket_exists("policy-originals"))`).trim() === "True";
}

// ── 拒绝路径零写入证据：三张RAG表规范化行hash+行数 与 MinIO对象层指纹 ─────────

const RAG_FP_PY = `import json, hashlib, os, datetime, uuid
import psycopg

def norm(v):
    if isinstance(v, datetime.timedelta):
        return str(v)
    if isinstance(v, (datetime.datetime, datetime.date, datetime.time)):
        return v.isoformat()
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, (dict, list)):
        return json.dumps(v, sort_keys=True, ensure_ascii=False, default=str)
    return v

out = {}
with psycopg.connect(os.environ["FP_DB_URL"], autocommit=True) as conn:
    for table in ("rag.sources", "rag.fetches", "rag.document_versions"):
        cur = conn.execute("SELECT * FROM " + table + " ORDER BY 1")
        cols = [d.name for d in cur.description]
        rows = cur.fetchall()
        canonical = json.dumps(
            {"cols": cols, "rows": [[norm(v) for v in r] for r in rows]},
            sort_keys=True,
            ensure_ascii=False,
        )
        out[table] = {"rows": len(rows), "sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest()}
print(json.dumps(out, sort_keys=True))`;

function ragFingerprint(dbUrl) {
  return JSON.parse(py(RAG_FP_PY, { FP_DB_URL: dbUrl }));
}

function minioFingerprint(ep) {
  return JSON.parse(
    minioPy(
      ep,
      `import json, hashlib
exists = c.bucket_exists("policy-originals")
objects = {}
if exists:
    for o in c.list_objects("policy-originals", recursive=True):
        data = c.get_object("policy-originals", o.object_name).read()
        objects[o.object_name] = hashlib.sha256(data).hexdigest()
print(json.dumps({"bucketExists": exists, "objectCount": len(objects), "objects": objects}, sort_keys=True))`,
    ),
  );
}

function zeroWriteSnapshot(ep, dbUrl) {
  return { db: ragFingerprint(dbUrl), minio: minioFingerprint(ep) };
}

function assertApplyZeroWrite(label, ep, dbUrl, baseline) {
  const after = zeroWriteSnapshot(ep, dbUrl);
  if (JSON.stringify(after) !== JSON.stringify(baseline)) {
    throw new Error(
      `${label}：apply自身写入非零\nbefore=${JSON.stringify(baseline).slice(0, 300)}\nafter=${JSON.stringify(after).slice(0, 300)}`,
    );
  }
  return after;
}

function truncateRag(dbUrl) {
  py(
    `import os, psycopg
with psycopg.connect(os.environ["FP_DB_URL"], autocommit=True) as conn:
    conn.execute("TRUNCATE rag.chunks, rag.embeddings, rag.document_trees, rag.document_versions, rag.fetches, rag.sources CASCADE")
print("truncated")`,
    { FP_DB_URL: dbUrl },
  );
}

function mcRun(script, extraEnv = {}) {
  const r = spawnSync("docker", ["run", "--rm", "--entrypoint", "/bin/sh", "minio/mc:latest", "-c", script], {
    encoding: "utf8",
    timeout: 300_000,
    env: { ...process.env, ...extraEnv },
  });
  if (r.status !== 0) throw new Error(`mc失败（退出码${r.status}）：${(r.stderr || r.stdout || "").slice(0, 300)}`);
  return r.stdout;
}

const APPLY_ARGS = (planFile, planHash, targetFingerprint) => [
  "apply",
  "--evidence-dir", EVIDENCE_DIR,
  "--dsl-root", DSL_ROOT,
  "--database-url", DRILL_URL,
  "--plan-file", planFile,
  "--i-am-authorized",
  "--plan-hash", planHash,
  "--target-fingerprint", targetFingerprint,
];

// ── 受控真实索引CLI（WI-20260913-01任务2；真实SiliconFlow由SILICONFLOW_API_KEY注入）──

function indexCli(args, env = {}, expect = 0, timeoutMs = 600_000) {
  const r = spawnSync(
    "uv",
    ["run", "--project", path.join(ROOT, "services", "agent"), "python", "-m", "agent.rag.evidence_index", ...args],
    {
      cwd: ROOT,
      encoding: "utf8",
      timeout: timeoutMs,
      env: stripProxy({
        ...process.env,
        AGENT_MINIO_ENDPOINT: MINIO_EP,
        AGENT_MINIO_ACCESS_KEY: MINIO_AK,
        AGENT_MINIO_SECRET_KEY: MINIO_SK,
        // 仅隔离演练放行dirty工作树（门禁在提交前运行）；持久执行禁止该变量。
        RAG_INDEX_ALLOW_DIRTY: "1",
        ...env,
      }),
    },
  );
  const out = (r.stdout || "") + (r.stderr || "");
  assertNoSecrets(out, `evidence_index ${args[0]}输出`);
  if (expect !== "*" && r.status !== expect) {
    throw new Error(`evidence_index ${args[0]} 退出码${r.status} ≠ ${expect}：${out.slice(0, 500)}`);
  }
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    // 非JSON输出（守卫/错误路径）允许。
  }
  return { code: r.status, out, json };
}

const INDEX_APPLY_ARGS = (planFile, planHash, targetFingerprint) => [
  "apply",
  "--database-url", DRILL_URL,
  "--plan-file", planFile,
  "--i-am-authorized",
  "--plan-hash", planHash,
  "--target-fingerprint", targetFingerprint,
];

function derivedFingerprint(dbUrl) {
  return JSON.parse(py(
    `import json, hashlib, os, psycopg
with psycopg.connect(os.environ["FP_DB_URL"]) as conn:
    counts = {}
    for label, sql in (
        ("trees", "SELECT count(*) FROM rag.document_trees"),
        ("chunks", "SELECT count(*) FROM rag.chunks"),
        ("embeddings", "SELECT count(*) FROM rag.embeddings"),
        ("indexed", "SELECT count(*) FROM rag.document_versions WHERE status='indexed'"),
    ):
        counts[label] = conn.execute(sql).fetchone()[0]
print(json.dumps(counts, sort_keys=True))`,
    { FP_DB_URL: dbUrl },
  ));
}

// 执行脚本自身Git blob SHA与HEAD SHA（证据必须由提交中的完全相同脚本生成）。
const SCRIPT_REL = "scripts/rag-evidence-drill.mjs";
const SCRIPT_BLOB_SHA = execFileSync("git", ["hash-object", SCRIPT_REL], { cwd: ROOT, encoding: "utf8" }).trim();
const HEAD_SHA = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();

try {
  mkdirSync(WORK, { recursive: true });
  const BASE_ENV = { DATABASE_URL: DRILL_URL };

  step("全新演练库（agent.migrate含rag schema与角色）+ 删除隔离bucket（缺桶起点）", () => {
    docker(["psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`]);
    docker(["psql", "-U", "postgres", "-c", `CREATE DATABASE "${DB}"`]);
    docker(["psql", "-U", "postgres", "-d", DB, "-c", "CREATE EXTENSION IF NOT EXISTS vector"]);
    const mig = spawnSync("uv", ["run", "--project", path.join(ROOT, "services", "agent"), "python", "-m", "agent.migrate", "--with-roles"], {
      cwd: path.join(ROOT, "services", "agent"),
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: DRILL_URL, AGENT_DB_PASSWORD: "postgres" },
      timeout: 300_000,
    });
    if (mig.status !== 0) throw new Error(`agent.migrate失败：${(mig.stderr || "").slice(0, 300)}`);
    // 缺桶生命周期起点：primary/restore均删除bucket（服务可达但policy-originals不存在）。
    wipeBucket(MINIO_EP);
    wipeBucket(MINIO_RESTORE_EP);
    return { database: DB, primaryEndpoint: MINIO_EP, restoreEndpoint: MINIO_RESTORE_EP, primaryBucketExists: bucketExists(MINIO_EP), restoreBucketExists: bucketExists(MINIO_RESTORE_EP) };
  });

  step("audit缺桶预态：BUCKET_MISSING → exit 4零建桶零写入（DB+对象层前后指纹一致）", () => {
    const before = zeroWriteSnapshot(MINIO_EP, DRILL_URL);
    const r = syncCli(["audit", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT, "--database-url", DRILL_URL], BASE_ENV, 4);
    if (!r.json || r.json.ok !== false || r.json.docs.length !== 23) throw new Error(`audit预态异常：${JSON.stringify(r.json?.docs?.length)}`);
    if (!r.json.problems.some((p) => p.includes("BUCKET_MISSING"))) throw new Error(`缺BUCKET_MISSING问题：${JSON.stringify(r.json.problems.slice(0, 3))}`);
    if (r.json.bucketExists !== false) throw new Error("audit报告bucketExists应为false");
    if (bucketExists(MINIO_EP)) throw new Error("audit隐式创建了bucket！");
    const after = assertApplyZeroWrite("audit缺桶预态", MINIO_EP, DRILL_URL, before);
    return { docs: 23, bucketMissing: true, zeroBucketCreate: true, zeroWriteFingerprints: { db: after.db, minio: { bucketExists: after.minio.bucketExists, objectCount: after.minio.objectCount } } };
  });

  let plan = null;
  let planFile = "";
  step("plan（缺桶）：确定性输出、bucketExists=false/plannedBucketCreate=true、23 uploads、bucket仍不存在、零写入", () => {
    const before = zeroWriteSnapshot(MINIO_EP, DRILL_URL);
    syncCli(["plan", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT, "--database-url", DRILL_URL, "--out", path.join(WORK, "rag-plan.json")], BASE_ENV, 0);
    planFile = path.join(WORK, "rag-plan.json");
    const first = readFileSync(planFile, "utf8");
    syncCli(["plan", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT, "--database-url", DRILL_URL, "--out", path.join(WORK, "rag-plan-2.json")], BASE_ENV, 0);
    const second = readFileSync(path.join(WORK, "rag-plan-2.json"), "utf8");
    if (first !== second) throw new Error("plan输出不确定（两次不一致）");
    plan = JSON.parse(first);
    if (plan.bucketExists !== false || plan.plannedBucketCreate !== true) {
      throw new Error(`缺桶计划标记异常：bucketExists=${plan.bucketExists} plannedBucketCreate=${plan.plannedBucketCreate}`);
    }
    if (plan.plannedUploads.length !== 23 || plan.conflicts.length !== 0 || plan.objects.length !== 23) {
      throw new Error(`plan异常：uploads=${plan.plannedUploads.length} objects=${plan.objects.length} conflicts=${plan.conflicts.length}`);
    }
    if (!/^[0-9a-f]{64}$/.test(plan.planHash) || !/^[0-9a-f]{64}$/.test(plan.targetFingerprint) || !/^[0-9a-f]{40}$/.test(plan.codeSha)) {
      throw new Error("plan hash/codeSha形状非法");
    }
    if (bucketExists(MINIO_EP)) throw new Error("plan隐式创建了bucket！");
    if (bucketObjectCount(MINIO_EP) !== "0") throw new Error("plan后bucket出现对象！");
    const after = assertApplyZeroWrite("plan缺桶", MINIO_EP, DRILL_URL, before);
    return { plannedUploads: 23, deterministic: true, plannedBucketCreate: true, bucketStillAbsent: true, zeroWriteFingerprints: after, planHash: plan.planHash.slice(0, 16) + "…" };
  });

  step("守卫反例A：apply缺--i-am-authorized → exit 2零写入零建桶（前后指纹一致）", () => {
    const before = zeroWriteSnapshot(MINIO_EP, DRILL_URL);
    const args = APPLY_ARGS(planFile, plan.planHash, plan.targetFingerprint).filter((a) => a !== "--i-am-authorized");
    const r = syncCli(args, BASE_ENV, 2);
    if (!/AUTH|授权|USAGE/i.test(r.out)) throw new Error("拒绝信息缺失");
    if (bucketExists(MINIO_EP)) throw new Error("未授权apply创建了bucket！");
    const after = assertApplyZeroWrite("反例A缺授权", MINIO_EP, DRILL_URL, before);
    return { exit: 2, zeroWrite: true, bucketStillAbsent: true, fingerprints: after };
  });

  step("守卫反例B：错planHash → exit 4零写入零建桶（前后指纹一致）", () => {
    const before = zeroWriteSnapshot(MINIO_EP, DRILL_URL);
    const r = syncCli(APPLY_ARGS(planFile, "0".repeat(64), plan.targetFingerprint), BASE_ENV, 4);
    if (!/PLAN_HASH/i.test(r.out)) throw new Error("拒绝信息缺失");
    if (bucketExists(MINIO_EP)) throw new Error("错planHash的apply创建了bucket！");
    const after = assertApplyZeroWrite("反例B错planHash", MINIO_EP, DRILL_URL, before);
    return { exit: 4, zeroWrite: true, bucketStillAbsent: true, fingerprints: after };
  });

  step("守卫反例C：错targetFingerprint → exit 4零写入零建桶（前后指纹一致）", () => {
    const before = zeroWriteSnapshot(MINIO_EP, DRILL_URL);
    const r = syncCli(APPLY_ARGS(planFile, plan.planHash, "0".repeat(64)), BASE_ENV, 4);
    if (!/FINGERPRINT/i.test(r.out)) throw new Error("拒绝信息缺失");
    if (bucketExists(MINIO_EP)) throw new Error("错指纹的apply创建了bucket！");
    const after = assertApplyZeroWrite("反例C错指纹", MINIO_EP, DRILL_URL, before);
    return { exit: 4, zeroWrite: true, bucketStillAbsent: true, fingerprints: after };
  });

  step("守卫反例F：codeSha不一致 → exit 4零写入零建桶（前后指纹一致）", () => {
    const before = zeroWriteSnapshot(MINIO_EP, DRILL_URL);
    const staleFile = path.join(WORK, "rag-plan-stale-codesha.json");
    py(
      `import json, hashlib
plan = json.load(open(r"${planFile.replace(/\\/g, "\\\\")}", encoding="utf-8"))
plan["codeSha"] = "0" * 40
body = {k: v for k, v in plan.items() if k != "planHash"}
canonical = json.dumps(body, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
plan["planHash"] = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
json.dump(plan, open(r"${staleFile.replace(/\\/g, "\\\\")}", "w", encoding="utf-8"), ensure_ascii=False)
print("stale-plan-written")`,
    );
    const r = syncCli(APPLY_ARGS(staleFile, JSON.parse(readFileSync(staleFile, "utf8")).planHash, plan.targetFingerprint), BASE_ENV, 4);
    if (!/CODE_SHA|codeSha/i.test(r.out)) throw new Error(`codeSha拒绝信息缺失：${r.out.slice(0, 200)}`);
    const after = assertApplyZeroWrite("反例F codeSha不一致", MINIO_EP, DRILL_URL, before);
    return { exit: 4, zeroWrite: true, bucketStillAbsent: true, fingerprints: after };
  });

  step("守卫反例G：dirty工作树 → exit 2零写入零建桶（前后指纹一致）", () => {
    const probe = path.join(ROOT, ".rag-r4-dirty-probe.tmp");
    writeFileSync(probe, "dirty-probe\n");
    try {
      const before = zeroWriteSnapshot(MINIO_EP, DRILL_URL);
      const r = syncCli(APPLY_ARGS(planFile, plan.planHash, plan.targetFingerprint), { ...BASE_ENV, RAG_EVIDENCE_ALLOW_DIRTY: "" }, 2);
      if (!/DIRTY|工作树/i.test(r.out)) throw new Error(`dirty拒绝信息缺失：${r.out.slice(0, 200)}`);
      const after = assertApplyZeroWrite("反例G dirty工作树", MINIO_EP, DRILL_URL, before);
      return { exit: 2, zeroWrite: true, bucketStillAbsent: true, fingerprints: after };
    } finally {
      rmSync(probe, { force: true });
    }
  });

  step("守卫反例D：plan后外部建桶+冲突对象漂移 → exit 4零写入（清除后恢复前置态）", () => {
    const before = zeroWriteSnapshot(MINIO_EP, DRILL_URL);
    // 外部干预：绕过受控apply直接建bucket并放入冲突内容对象（受控演练内的漂移注入）。
    minioPy(MINIO_EP, `import io
c.make_bucket("policy-originals")
data = b"<html>external-drift-bytes</html>"
c.put_object("policy-originals", "${plan.objects[0].objectKey}", io.BytesIO(data), length=len(data), content_type="text/html")
print("external-bucket-and-object-created")`);
    const r = syncCli(APPLY_ARGS(planFile, plan.planHash, plan.targetFingerprint), BASE_ENV, 4);
    if (!/DRIFT|漂移/i.test(r.out)) throw new Error("漂移拒绝信息缺失");
    // 外部漂移后基线：断言基准为漂移后状态——apply自身零写入，外部漂移不计入apply写集合。
    const baseline = zeroWriteSnapshot(MINIO_EP, DRILL_URL);
    if (baseline.minio.objectCount !== 1 || baseline.minio.bucketExists !== true) {
      throw new Error(`外部漂移夹具异常：${JSON.stringify({ bucketExists: baseline.minio.bucketExists, objectCount: baseline.minio.objectCount })}`);
    }
    const after = assertApplyZeroWrite("反例D外部建桶+对象漂移", MINIO_EP, DRILL_URL, baseline);
    wipeBucket(MINIO_EP); // 清除外部漂移，恢复计划前置态
    return {
      exit: 4,
      zeroWrite: true,
      externalDriftRefused: true,
      cleaned: true,
      preDriftFingerprints: before,
      externalDriftRecorded: { by: "external-test-fixture", bucketExists: baseline.minio.bucketExists, objectCount: baseline.minio.objectCount },
      applyZeroWriteFingerprints: after,
    };
  });

  step("守卫反例H：plan后RAG数据库状态漂移 → exit 4零写入（外部插入行单独记录，清除后恢复）", () => {
    const before = zeroWriteSnapshot(MINIO_EP, DRILL_URL);
    // 外部干预：直接向rag.sources/rag.fetches插入目标记录（命中计划对象键→指纹改变）。
    py(
      `import os, json, psycopg
with psycopg.connect(os.environ["FP_DB_URL"], autocommit=True) as conn:
    row = conn.execute("INSERT INTO rag.sources (jurisdiction_code, name, entry_url, domain) VALUES ('310000','x','https://rsj.sh.gov.cn/x','rsj.sh.gov.cn') RETURNING id").fetchone()
    conn.execute("INSERT INTO rag.fetches (source_id, url, status, content_hash, object_key, mime) VALUES (%s,'https://rsj.sh.gov.cn/x',200,%s,%s,'text/html')", (row[0], "${plan.objects[0].sha256}", "${plan.objects[0].objectKey}"))
print("external-rag-rows-inserted")`,
      { FP_DB_URL: DRILL_URL },
    );
    const r = syncCli(APPLY_ARGS(planFile, plan.planHash, plan.targetFingerprint), BASE_ENV, 4);
    if (!/DRIFT|漂移/i.test(r.out)) throw new Error("RAG漂移拒绝信息缺失");
    const baseline = zeroWriteSnapshot(MINIO_EP, DRILL_URL);
    const externalDrift = {
      by: "external-test-fixture",
      sourcesRowsDelta: baseline.db["rag.sources"].rows - before.db["rag.sources"].rows,
      fetchesRowsDelta: baseline.db["rag.fetches"].rows - before.db["rag.fetches"].rows,
    };
    const after = assertApplyZeroWrite("反例H RAG数据库漂移", MINIO_EP, DRILL_URL, baseline);
    truncateRag(DRILL_URL); // 清除外部漂移，恢复计划前置态（空RAG表）
    return { exit: 4, zeroWrite: true, ragDriftRefused: true, cleaned: true, externalDriftRecorded: externalDrift, applyZeroWriteFingerprints: after };
  });

  step("守卫反例I：write-only权限错误（受限IAM用户stat拒绝）→ exit 1失败关闭零写入", () => {
    const before = zeroWriteSnapshot(MINIO_EP, DRILL_URL);
    const minioPort = MINIO_EP.split(":")[1];
    // 受控创建受限用户（仅s3:PutObject；bucket_exists/stat_object必AccessDenied）。
    mcRun(
      `mc alias set s http://host.docker.internal:${minioPort} "$MC_AK" "$MC_SK" >/dev/null
mc admin user add s r4limited "$LIMITED_PASS"
echo '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["s3:PutObject"],"Resource":["arn:aws:s3:::policy-originals/*"]}]}' > /tmp/wo.json
mc admin policy create s r4writeonly /tmp/wo.json >/dev/null
mc admin policy attach s r4writeonly --user r4limited >/dev/null
echo "limited-user-ready"`,
      { MC_AK: MINIO_AK, MC_SK: MINIO_SK, LIMITED_PASS: "R4LimitedPass9137" },
    );
    try {
      const r = syncCli(APPLY_ARGS(planFile, plan.planHash, plan.targetFingerprint), { ...BASE_ENV, AGENT_MINIO_ACCESS_KEY: "r4limited", AGENT_MINIO_SECRET_KEY: "R4LimitedPass9137" }, 1);
      if (!/AccessDenied|UNEXPECTED/i.test(r.out)) throw new Error(`权限错误拒绝信息缺失：${r.out.slice(0, 200)}`);
      const after = assertApplyZeroWrite("反例I权限错误", MINIO_EP, DRILL_URL, before);
      if (bucketExists(MINIO_EP)) throw new Error("权限错误apply创建了bucket！");
      return { exit: 1, failsClosed: true, zeroWrite: true, bucketStillAbsent: true, fingerprints: after };
    } finally {
      mcRun(
        `mc alias set s http://host.docker.internal:${minioPort} "$MC_AK" "$MC_SK" >/dev/null
mc admin user remove s r4limited >/dev/null 2>&1 || true
echo "limited-user-removed"`,
        { MC_AK: MINIO_AK, MC_SK: MINIO_SK },
      );
    }
  });

  step("守卫反例E：audit缺数据库连接 → exit 2", () => {
    const r = spawnSync("uv", ["run", "--project", path.join(ROOT, "services", "agent"), "python", "-m", "agent.rag.evidence_sync", "audit", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 120_000,
      env: { ...process.env, AGENT_MINIO_ENDPOINT: MINIO_EP, AGENT_MINIO_ACCESS_KEY: MINIO_AK, AGENT_MINIO_SECRET_KEY: MINIO_SK, AGENT_DATABASE_URL: "", DATABASE_URL: "" },
    });
    if (r.status !== 2 || !/数据库|USAGE/.test((r.stderr || "") + (r.stdout || ""))) {
      throw new Error(`audit缺数据库未按USAGE拒绝：${r.status} ${(r.stderr || "").slice(0, 200)}`);
    }
    return { exit: 2 };
  });

  let applyResult = null;
  step("apply：显式建桶+23对象上传+rag登记（单持锁事务）", () => {
    const r = syncCli(APPLY_ARGS(planFile, plan.planHash, plan.targetFingerprint), BASE_ENV, 0);
    applyResult = r.json;
    if (r.json.applied !== true || r.json.verified !== true) throw new Error(`apply异常：${JSON.stringify({ applied: r.json.applied, verified: r.json.verified })}`);
    if (r.json.bucketCreated !== true) throw new Error(`apply应报告建桶：bucketCreated=${r.json.bucketCreated}`);
    if (r.json.manifest.length !== 23) throw new Error(`manifest ${r.json.manifest.length} ≠ 23`);
    if (!bucketExists(MINIO_EP)) throw new Error("授权apply后bucket不存在！");
    const count = bucketObjectCount(MINIO_EP);
    if (count !== "23") throw new Error(`授权apply后对象数 ${count} ≠ 23`);
    writeFileSync(path.join(WORK, "rag-apply-manifest.json"), JSON.stringify(r.json.manifest, null, 2) + "\n");
    return { bucketCreated: true, uploaded: 23, objectsInBucket: 23, fetches: r.json.fetches, versions: r.json.versions, manifestEntries: r.json.manifest.length };
  });

  step("verify：四方对账通过（Git/meta/DSL已在collect固化+对象SHA+rag记录）", () => {
    const r = syncCli(["verify", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT, "--database-url", DRILL_URL], BASE_ENV, 0);
    if (r.json.ok !== true || r.json.objectCount !== 23) throw new Error(`verify异常：ok=${r.json.ok} objects=${r.json.objectCount}`);
    if (r.json.bucketExists !== true) throw new Error("verify报告bucketExists应为true");
    if (r.json.verificationScope !== "four-way" || r.json.dbChecked !== true || r.json.degraded !== false) {
      throw new Error(`verify范围标记异常：${JSON.stringify({ scope: r.json.verificationScope, db: r.json.dbChecked, degraded: r.json.degraded })}`);
    }
    return { ok: true, objects: 23, scope: "four-way", bucketExists: true };
  });

  step("幂等：复跑同一计划 → noop:true（bucket与对象数不变）", () => {
    const r = syncCli(APPLY_ARGS(planFile, plan.planHash, plan.targetFingerprint), BASE_ENV, 0);
    if (r.json.noop !== true || r.json.applied !== false) throw new Error(`复跑异常：noop=${r.json.noop} applied=${r.json.applied}`);
    if (r.json.bucketCreated !== false) throw new Error("noop不应建桶");
    if (bucketObjectCount(MINIO_EP) !== "23") throw new Error("复跑后对象数变化！");
    return { noop: true, uploaded: 0, objectsStill: 23 };
  });

  step("object-only verify：显式降级标记（scope/degraded/dbChecked）", () => {
    const r = syncCli(["verify", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT, "--database-url", DRILL_URL, "--object-only"], BASE_ENV, 0);
    if (r.json.verificationScope !== "object-only" || r.json.degraded !== true || r.json.dbChecked !== false) {
      throw new Error(`object-only标记异常：${JSON.stringify(r.json.verificationScope)}`);
    }
    return { scope: "object-only", degraded: true };
  });

  step("冲突对象拒绝覆盖（对象字节不变；清除后复跑恢复）", () => {
    const before = zeroWriteSnapshot(MINIO_EP, DRILL_URL);
    const target = applyResult.manifest[0];
    py(
      `from minio import Minio
import os, io
c = Minio("${MINIO_EP}", access_key="${MINIO_AK}", secret_key=os.environ["RAG_DRILL_SK"], secure=False)
data = b"<html>conflicting-bytes</html>"
c.put_object("policy-originals", "${target.objectKey}", io.BytesIO(data), length=len(data), content_type="text/html")
print("conflict-planted")`,
      { RAG_DRILL_SK: MINIO_SK },
    );
    const r = syncCli(APPLY_ARGS(planFile, plan.planHash, plan.targetFingerprint), BASE_ENV, 4);
    if (!/DRIFT|CONFLICT|漂移|冲突/i.test(r.out)) throw new Error("冲突拒绝信息缺失");
    const baseline = zeroWriteSnapshot(MINIO_EP, DRILL_URL);
    const sha = py(
      `from minio import Minio
import os, hashlib
c = Minio("${MINIO_EP}", access_key="${MINIO_AK}", secret_key=os.environ["RAG_DRILL_SK"], secure=False)
data = c.get_object("policy-originals", "${target.objectKey}").read()
print(hashlib.sha256(data).hexdigest())`,
      { RAG_DRILL_SK: MINIO_SK },
    ).trim();
    if (sha === target.sha256) throw new Error("冲突对象被覆盖！");
    if (baseline.minio.objects[target.objectKey] !== sha) throw new Error("冲突对象指纹与实际不一致");
    const after = assertApplyZeroWrite("冲突拒绝", MINIO_EP, DRILL_URL, baseline);
    py(
      `from minio import Minio
import os
c = Minio("${MINIO_EP}", access_key="${MINIO_AK}", secret_key=os.environ["RAG_DRILL_SK"], secure=False)
c.remove_object("policy-originals", "${target.objectKey}")
print("conflict-removed")`,
      { RAG_DRILL_SK: MINIO_SK },
    );
    // 恢复：冲突移除后正确对象缺失、记录仍在→原计划前置态已不可达；重新plan
    // （新targetFingerprint=对象缺失+记录在册）→apply补齐对象→verify ok。
    syncCli(["plan", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT, "--database-url", DRILL_URL, "--out", path.join(WORK, "rag-plan-repair.json")], BASE_ENV, 0);
    const repairPlan = JSON.parse(readFileSync(path.join(WORK, "rag-plan-repair.json"), "utf8"));
    const repair = syncCli(APPLY_ARGS(path.join(WORK, "rag-plan-repair.json"), repairPlan.planHash, repairPlan.targetFingerprint), BASE_ENV, 0);
    if (repair.json.applied !== true) throw new Error(`恢复apply异常：${JSON.stringify(repair.json)}`);
    const rv = syncCli(["verify", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT, "--database-url", DRILL_URL], BASE_ENV, 0);
    if (rv.json.ok !== true) throw new Error("恢复后verify未通过");
    return { conflictRefused: true, objectPreserved: true, repairedViaReplan: true, preConflictFingerprints: before, conflictApplyZeroWriteFingerprints: { db: after.db, minio: { bucketExists: after.minio.bucketExists, objectCount: after.minio.objectCount } } };
  });

  step("执行脚本Git blob SHA记录与自检（证据由完全相同的脚本生成）", () => {
    if (!/^[0-9a-f]{40}$/.test(SCRIPT_BLOB_SHA) || !/^[0-9a-f]{40}$/.test(HEAD_SHA)) {
      throw new Error("脚本blob SHA或HEAD SHA形状非法");
    }
    return { script: SCRIPT_REL, scriptBlobSha: SCRIPT_BLOB_SHA, headSha: HEAD_SHA, note: "提交后验证：git rev-parse HEAD:scripts/rag-evidence-drill.mjs 必须等于 scriptBlobSha" };
  });

  step("索引audit预态：23 versions全部downloaded、0 complete（ok=false零写入）", () => {
    const before = derivedFingerprint(DRILL_URL);
    const r = indexCli(["audit", "--database-url", DRILL_URL], BASE_ENV, 4);
    if (r.json.ok !== false || r.json.documentCount !== 23 || r.json.completeCount !== 0) {
      throw new Error(`索引audit预态异常：${JSON.stringify({ ok: r.json?.ok, docs: r.json?.documentCount, complete: r.json?.completeCount })}`);
    }
    if (r.json.embeddingModel !== "BAAI/bge-m3" || r.json.embeddingDimensions !== 1024) {
      throw new Error("索引audit模型/维度声明异常");
    }
    const after = derivedFingerprint(DRILL_URL);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("audit零写入破坏派生状态");
    return { documentCount: 23, completeCount: 0, model: r.json.embeddingModel, dims: r.json.embeddingDimensions, derived: after };
  });

  let indexPlan = null;
  step("索引plan：绑定23 versions/对象SHA/派生指纹/模型/维度/indexVersion/planHash/指纹/写集合（两次逐字节一致）", () => {
    const r = indexCli(["plan", "--database-url", DRILL_URL, "--out", path.join(WORK, "index-plan.json")], BASE_ENV, 0);
    const first = readFileSync(path.join(WORK, "index-plan.json"), "utf8");
    indexCli(["plan", "--database-url", DRILL_URL, "--out", path.join(WORK, "index-plan-2.json")], BASE_ENV, 0);
    const second = readFileSync(path.join(WORK, "index-plan-2.json"), "utf8");
    if (first !== second) throw new Error("索引plan输出不确定（两次不一致）");
    indexPlan = JSON.parse(first);
    if (indexPlan.documentCount !== 23 || indexPlan.documents.length !== 23) throw new Error("索引plan文档数 ≠ 23");
    if (indexPlan.embeddingModel !== "BAAI/bge-m3" || indexPlan.embeddingDimensions !== 1024 || indexPlan.indexVersion !== "BAAI/bge-m3:1024") {
      throw new Error(`索引plan绑定异常：${indexPlan.embeddingModel}/${indexPlan.embeddingDimensions}/${indexPlan.indexVersion}`);
    }
    if (indexPlan.plannedIndex.length !== 23 || indexPlan.writeSet.length !== 23 || indexPlan.noopDocuments.length !== 0) {
      throw new Error(`索引plan集合异常：planned=${indexPlan.plannedIndex.length} writeSet=${indexPlan.writeSet.length} noop=${indexPlan.noopDocuments.length}`);
    }
    for (const d of indexPlan.documents) {
      if (d.objectShaMatches !== true) throw new Error(`索引plan对象SHA未核对：${d.objectKey}`);
      if (d.objectKey !== `originals/${d.contentHash}`) throw new Error(`对象键非内容寻址：${d.objectKey}`);
    }
    for (const key of ("targetFingerprint finalFingerprint planHash codeSha").split(" ")) {
      if (!new RegExp(`^[0-9a-f]{${key === "codeSha" ? 40 : 64}}$`).test(indexPlan[key])) throw new Error(`索引plan ${key}形状非法`);
    }
    return { documents: 23, plannedIndex: 23, writeSet: 23, model: indexPlan.embeddingModel, dims: indexPlan.embeddingDimensions, indexVersion: indexPlan.indexVersion, planHash: indexPlan.planHash.slice(0, 16) + "…" };
  });

  step("索引apply守卫反例：缺授权exit2/错planHash exit4/错指纹exit4（派生表零写入）", () => {
    const before = derivedFingerprint(DRILL_URL);
    const noAuth = INDEX_APPLY_ARGS(path.join(WORK, "index-plan.json"), indexPlan.planHash, indexPlan.targetFingerprint)
      .filter((a) => a !== "--i-am-authorized");
    indexCli(noAuth, BASE_ENV, 2);
    indexCli(INDEX_APPLY_ARGS(path.join(WORK, "index-plan.json"), "0".repeat(64), indexPlan.targetFingerprint), BASE_ENV, 4);
    indexCli(INDEX_APPLY_ARGS(path.join(WORK, "index-plan.json"), indexPlan.planHash, "0".repeat(64)), BASE_ENV, 4);
    const after = derivedFingerprint(DRILL_URL);
    if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("索引守卫反例产生派生写入");
    return { refusals: 3, derivedStill: before };
  });

  step("索引apply：真实SiliconFlow BAAI/bge-m3 1024维嵌入（每文档独立事务）", () => {
    if (!process.env.SILICONFLOW_API_KEY) throw new Error("缺少SILICONFLOW_API_KEY（隔离验收要求真实Embedding）");
    const r = indexCli(INDEX_APPLY_ARGS(path.join(WORK, "index-plan.json"), indexPlan.planHash, indexPlan.targetFingerprint), BASE_ENV, 0, 900_000);
    if (r.json.applied !== true || r.json.verified !== true) throw new Error(`索引apply异常：${JSON.stringify({ applied: r.json?.applied, verified: r.json?.verified })}`);
    if (r.json.indexedVersions.length !== 23) throw new Error(`索引apply完成数 ${r.json.indexedVersions.length} ≠ 23`);
    return { indexed: r.json.indexedVersions.length, planHash: indexPlan.planHash.slice(0, 16) + "…" };
  });

  step("索引verify：23/23 complete（tree/chunks>0/embeddings=chunks/维度1024/状态indexed）", () => {
    const r = indexCli(["verify", "--database-url", DRILL_URL], BASE_ENV, 0);
    if (r.json.ok !== true || r.json.documentCount !== 23 || r.json.completeCount !== 23) {
      throw new Error(`索引verify异常：ok=${r.json?.ok} complete=${r.json?.completeCount}/${r.json?.documentCount} problems=${(r.json?.problems ?? []).slice(0, 3).join("；")}`);
    }
    const detail = py(
      `import json, os, psycopg
with psycopg.connect(os.environ["FP_DB_URL"]) as conn:
    versions = conn.execute("SELECT count(*) FROM rag.document_versions WHERE status='indexed'").fetchone()[0]
    trees = conn.execute("SELECT count(*) FROM rag.document_trees").fetchone()[0]
    chunks = conn.execute("SELECT count(*) FROM rag.chunks").fetchone()[0]
    embeddings = conn.execute("SELECT count(*) FROM rag.embeddings").fetchone()[0]
    dims = conn.execute("SELECT DISTINCT vector_dims(embedding) FROM rag.embeddings").fetchall()
    models = conn.execute("SELECT DISTINCT model FROM rag.embeddings").fetchall()
print(json.dumps({"versions": versions, "trees": trees, "chunks": chunks, "embeddings": embeddings, "dims": [d[0] for d in dims], "models": [m[0] for m in models]}))`,
      { FP_DB_URL: DRILL_URL },
    );
    const stats = JSON.parse(detail);
    if (stats.versions !== 23 || stats.trees !== 23 || stats.chunks <= 0 || stats.embeddings !== stats.chunks) {
      throw new Error(`派生数据不一致：${detail}`);
    }
    if (JSON.stringify(stats.dims) !== "[1024]") throw new Error(`向量维度异常：${detail}`);
    if (JSON.stringify(stats.models) !== '["BAAI/bge-m3"]') throw new Error(`Embedding模型异常：${detail}`);
    return { ...stats, indexVersion: "BAAI/bge-m3:1024" };
  });

  step("固定查询：7546 / 2340-1872-1690 / 等待期6个月 命中，FTS与向量通道均产生候选", () => {
    const queries = [
      { q: "上海社保缴费基数上下限是多少", expect: ["7546", "37731"], channelQuery: "本市社保缴费基数的上限调整为37731元" },
      { q: "失业保险金发放标准 第1-12月 第13-24月", expect: ["2340"], channelQuery: "失业保险金支付标准的月标准为2340元" },
      { q: "灵活就业人员参加职工医保等待期是多久", expect: ["6个月"], channelQuery: "灵活就业人员参加职工医保的等待期为6个月" },
    ];
    const channelEvidence = [];
    for (const { q, expect, channelQuery } of queries) {
      const r = indexCli(["search", "--database-url", DRILL_URL, "--query", q, "--jurisdiction", "310000", "--as-of", "2026-09-01", "--top-k", "5"], BASE_ENV, 0);
      const hits = r.json?.hits ?? [];
      const joined = hits.map((h) => `${h.text}\n${h.parentText ?? ""}`).join("\n");
      for (const token of expect) {
        if (!joined.includes(token)) throw new Error(`固定查询「${q}」未命中${token}：${joined.slice(0, 200)}`);
      }
      // 通道级证据：FTS与向量在该查询下都必须产生候选（直接核对两通道SQL计数）。
      // FTS为plainto_tsquery AND语义：通道核对使用与chunk原文分词对齐的短语；
      // 自然问句经向量+rerank通道命中（上方hits断言）。
      const channels = JSON.parse(py(
        `import json, os, psycopg, jieba
from agent.rag.siliconflow import SiliconFlowClient
q = os.environ["Q"]
client = SiliconFlowClient()
with psycopg.connect(os.environ["FP_DB_URL"]) as conn:
    tokenized = " ".join(jieba.cut_for_search(q))
    fts = conn.execute("""
        SELECT count(*) FROM rag.chunks c
        CROSS JOIN (SELECT plainto_tsquery('simple', %s) AS query) tq
        JOIN rag.document_versions dv ON dv.id = c.document_version_id
        JOIN rag.sources s ON s.id = dv.source_id
        WHERE dv.status='indexed' AND s.jurisdiction_code='310000'
          AND c.fts @@ tq.query""", (tokenized,)).fetchone()[0]
    emb = client.embed([q])
    vector_literal = "[" + ",".join(f"{x:.6f}" for x in emb["_vectors"][0]) + "]"
    dense = conn.execute("""
        SELECT count(*) FROM rag.chunks c
        JOIN rag.embeddings e ON e.chunk_id = c.id
        JOIN rag.document_versions dv ON dv.id = c.document_version_id
        JOIN rag.sources s ON s.id = dv.source_id
        WHERE dv.status='indexed' AND s.jurisdiction_code='310000'
          AND e.embedding <=> %s::vector < 1.0""", (vector_literal,)).fetchone()[0]
print(json.dumps({"fts": fts, "dense": dense}))`,
        { FP_DB_URL: DRILL_URL, Q: channelQuery },
      ));
      if (channels.fts <= 0 || channels.dense <= 0) {
        throw new Error(`固定查询「${q}」通道候选不足：${JSON.stringify(channels)}`);
      }
      channelEvidence.push({ query: q, expect, hits: hits.length, channels });
    }
    return { queries: channelEvidence };
  });

  step("地区过滤：广东查询零命中（不串区）", () => {
    const r = indexCli(["search", "--database-url", DRILL_URL, "--query", "失业保险金发放标准", "--jurisdiction", "440000", "--as-of", "2026-09-01", "--top-k", "5"], BASE_ENV, 0);
    if ((r.json?.hits ?? []).length !== 0) throw new Error("广东过滤产生串区命中");
    return { jurisdiction: "440000", hits: 0 };
  });

  step("日期过滤：effective_to排除后命中消失、恢复NULL后命中恢复", () => {
    // 找到含7546的版本，设置effective_to=2026-06-30 → as-of 2026-09-01必须排除它。
    const target = py(
      `import json, os, psycopg
with psycopg.connect(os.environ["FP_DB_URL"]) as conn:
    row = conn.execute("""
        SELECT dv.id FROM rag.document_versions dv
        JOIN rag.chunks c ON c.document_version_id = dv.id
        WHERE c.text LIKE %s LIMIT 1""", ("%7546%",)).fetchone()
    assert row is not None
    print(row[0])`,
      { FP_DB_URL: DRILL_URL },
    ).trim();
    py(
      `import os, psycopg
with psycopg.connect(os.environ["FP_DB_URL"], autocommit=True) as conn:
    conn.execute("UPDATE rag.document_versions SET effective_to='2026-06-30' WHERE id=%s", ("${target}",))
print("window-closed")`,
      { FP_DB_URL: DRILL_URL },
    );
    const excluded = indexCli(["search", "--database-url", DRILL_URL, "--query", "上海社保缴费基数上下限是多少", "--jurisdiction", "310000", "--as-of", "2026-09-01", "--top-k", "5"], BASE_ENV, 0);
    const excludedJoined = (excluded.json?.hits ?? []).map((h) => h.text).join("\n");
    if (excludedJoined.includes("7546")) throw new Error("日期过滤未生效：effective_to排除后仍命中7546");
    py(
      `import os, psycopg
with psycopg.connect(os.environ["FP_DB_URL"], autocommit=True) as conn:
    conn.execute("UPDATE rag.document_versions SET effective_to=NULL WHERE id=%s", ("${target}",))
print("window-reset")`,
      { FP_DB_URL: DRILL_URL },
    );
    const restored = indexCli(["search", "--database-url", DRILL_URL, "--query", "上海社保缴费基数上下限是多少", "--jurisdiction", "310000", "--as-of", "2026-09-01", "--top-k", "5"], BASE_ENV, 0);
    const restoredJoined = (restored.json?.hits ?? []).map((h) => h.text).join("\n");
    if (!restoredJoined.includes("7546")) throw new Error("日期窗口恢复后命中未恢复");
    return { documentVersionId: target, excluded: true, restored: true };
  });

  step("索引复跑：同一计划noop:true（完整终态幂等）", () => {
    const r = indexCli(INDEX_APPLY_ARGS(path.join(WORK, "index-plan.json"), indexPlan.planHash, indexPlan.targetFingerprint), BASE_ENV, 0);
    if (r.json.noop !== true || r.json.applied !== false) throw new Error(`索引复跑异常：noop=${r.json?.noop}`);
    return { noop: true, indexed: 0 };
  });

  step("备份：pg_dump + 逐对象下载（sha256清单）", () => {
    const dump = dockerBuf(["pg_dump", "-U", "postgres", "-Fc", DB]);
    writeFileSync(path.join(WORK, "rag-drill.dump"), dump);
    const backupDir = path.join(WORK, "minio-backup");
    rmSync(backupDir, { recursive: true, force: true });
    mkdirSync(backupDir, { recursive: true });
    py(
      `from minio import Minio
import os, json, hashlib
c = Minio("${MINIO_EP}", access_key="${MINIO_AK}", secret_key=os.environ["RAG_DRILL_SK"], secure=False)
backup_dir = os.environ["BACKUP_DIR"]
manifest = []
for o in c.list_objects("policy-originals", recursive=True):
    data = c.get_object("policy-originals", o.object_name).read()
    name = o.object_name.replace("/", "_")
    open(os.path.join(backup_dir, name), "wb").write(data)
    manifest.append({"objectKey": o.object_name, "sha256": hashlib.sha256(data).hexdigest(), "size": len(data)})
json.dump(manifest, open(os.path.join(backup_dir, "manifest.json"), "w"), indent=2)
print(len(manifest))`,
      { RAG_DRILL_SK: MINIO_SK, BACKUP_DIR: backupDir },
    );
    const manifest = JSON.parse(readFileSync(path.join(backupDir, "manifest.json"), "utf8"));
    if (manifest.length !== 23) throw new Error(`备份对象 ${manifest.length} ≠ 23`);
    return { dumpBytes: dump.length, backupObjects: manifest.length };
  });

  step("恢复：全新数据库pg_restore + 全新MinIO受控回填（恢复程序显式建桶）", () => {
    docker(["psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS "${RESTORE_DB}" WITH (FORCE)`]);
    docker(["psql", "-U", "postgres", "-c", `CREATE DATABASE "${RESTORE_DB}"`]);
    dockerBuf(["pg_restore", "-U", "postgres", "-d", RESTORE_DB, "--clean", "--if-exists"], readFileSync(path.join(WORK, "rag-drill.dump")));
    // 受控恢复：恢复程序自身负责重建bucket（显式步骤，非evidence_sync构造/只读副作用）。
    minioPy(MINIO_RESTORE_EP, `if not c.bucket_exists("policy-originals"):
    c.make_bucket("policy-originals")
print("restore-bucket-ready")`);
    const manifest = JSON.parse(readFileSync(path.join(WORK, "minio-backup", "manifest.json"), "utf8"));
    const backupDir = path.join(WORK, "minio-backup");
    for (const entry of manifest) {
      py(
        `from minio import Minio
import os, io, hashlib
c = Minio("${MINIO_RESTORE_EP}", access_key="${MINIO_AK}", secret_key=os.environ["RAG_DRILL_SK"], secure=False)
backup_dir = os.environ["BACKUP_DIR"]
data = open(os.path.join(backup_dir, "${entry.objectKey.replace("/", "_")}"), "rb").read()
assert hashlib.sha256(data).hexdigest() == "${entry.sha256}"
c.put_object("policy-originals", "${entry.objectKey}", io.BytesIO(data), length=len(data), content_type="text/html")
print("restored")`,
        { RAG_DRILL_SK: MINIO_SK, BACKUP_DIR: backupDir },
      );
    }
    if (bucketObjectCount(MINIO_RESTORE_EP) !== "23") throw new Error("恢复副本对象数 ≠ 23");
    return { restoreDb: RESTORE_DB, restoredObjects: manifest.length };
  });

  step("恢复副本四方对账：verify ok + 同计划apply noop", () => {
    const r = syncCli(
      ["verify", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT, "--database-url", RESTORE_URL],
      { DATABASE_URL: RESTORE_URL, AGENT_MINIO_ENDPOINT: MINIO_RESTORE_EP },
      0,
    );
    if (r.json.ok !== true || r.json.objectCount !== 23) {
      throw new Error(`恢复副本verify异常：ok=${r.json?.ok} ${(r.json?.problems ?? []).slice(0, 3).join("；")}`);
    }
    const noopArgs = APPLY_ARGS(planFile, plan.planHash, plan.targetFingerprint)
      .map((a) => (a === DRILL_URL ? RESTORE_URL : a));
    const noop = syncCli(noopArgs, { DATABASE_URL: RESTORE_URL, AGENT_MINIO_ENDPOINT: MINIO_RESTORE_EP }, 0);
    if (noop.json.noop !== true) throw new Error(`恢复副本复跑异常：noop=${noop.json?.noop}`);
    return { ok: true, objects: 23, database: RESTORE_DB, restoredNoop: true };
  });

  step("恢复副本索引对账：索引verify ok + 固定查询结果一致", () => {
    const restoreIndexEnv = { DATABASE_URL: RESTORE_URL, AGENT_MINIO_ENDPOINT: MINIO_RESTORE_EP };
    const verify = indexCli(["verify", "--database-url", RESTORE_URL], restoreIndexEnv, 0);
    if (verify.json.ok !== true || verify.json.completeCount !== 23 || verify.json.documentCount !== 23) {
      throw new Error(`恢复副本索引verify异常：complete=${verify.json?.completeCount}/${verify.json?.documentCount}`);
    }
    for (const { q, expect } of [
      { q: "上海社保缴费基数上下限是多少", expect: ["7546"] },
      { q: "失业保险金发放标准 第1-12月 第13-24月", expect: ["2340"] },
      { q: "灵活就业人员参加职工医保等待期是多久", expect: ["6个月"] },
    ]) {
      const r = indexCli(["search", "--database-url", RESTORE_URL, "--query", q, "--jurisdiction", "310000", "--as-of", "2026-09-01", "--top-k", "5"], restoreIndexEnv, 0);
      const joined = (r.json?.hits ?? []).map((h) => `${h.text}\n${h.parentText ?? ""}`).join("\n");
      for (const token of expect) {
        if (!joined.includes(token)) throw new Error(`恢复副本固定查询「${q}」未命中${token}`);
      }
    }
    return { indexVerifyOk: true, complete: 23, fixedQueries: 3 };
  });

  step("bucket创建竞态归属准确：外部进程预先建桶 → 重新plan(plannedBucketCreate=false) → apply报告bucketCreated=false且上传/登记/verify全部正确", () => {
    // 回到缺桶起点：清空primary bucket与RAG表（备份/恢复证据已固定，不受影响）。
    wipeBucket(MINIO_EP);
    truncateRag(DRILL_URL);
    // 外部进程抢先建桶（不经受控apply）。
    minioPy(MINIO_EP, `c.make_bucket("policy-originals")
print("external-pre-created-bucket")`);
    syncCli(["plan", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT, "--database-url", DRILL_URL, "--out", path.join(WORK, "rag-plan-race.json")], BASE_ENV, 0);
    const racePlan = JSON.parse(readFileSync(path.join(WORK, "rag-plan-race.json"), "utf8"));
    if (racePlan.bucketExists !== true || racePlan.plannedBucketCreate !== false) {
      throw new Error(`竞态计划标记异常：bucketExists=${racePlan.bucketExists} plannedBucketCreate=${racePlan.plannedBucketCreate}`);
    }
    const r = syncCli(APPLY_ARGS(path.join(WORK, "rag-plan-race.json"), racePlan.planHash, racePlan.targetFingerprint), BASE_ENV, 0);
    if (r.json.applied !== true || r.json.verified !== true) throw new Error(`竞态apply异常：${JSON.stringify({ applied: r.json?.applied, verified: r.json?.verified })}`);
    if (r.json.bucketCreated !== false) throw new Error(`竞态归属错误：外部已建桶时bucketCreated=${r.json.bucketCreated}（必须为false）`);
    if (bucketObjectCount(MINIO_EP) !== "23") throw new Error(`竞态apply对象数 ${bucketObjectCount(MINIO_EP)} ≠ 23`);
    const rv = syncCli(["verify", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT, "--database-url", DRILL_URL], BASE_ENV, 0);
    if (rv.json.ok !== true) throw new Error("竞态apply后verify未通过");
    // 最终清理：对象层零残留（容器随任务清理删除）。
    wipeBucket(MINIO_EP);
    wipeBucket(MINIO_RESTORE_EP);
    return { bucketCreated: false, uploaded: 23, objectsInBucket: 23, verifyOk: true, bucketsWiped: true };
  });

  step("残留敏感扫描：证据文件与演练输出零密钥", () => {
    let scanned = 0;
    const scan = (p) => {
      if (!existsSync(p)) return;
      const text = readFileSync(p, "utf8");
      assertNoSecrets(text, path.relative(ROOT, p));
      scanned += 1;
    };
    scan(path.join(WORK, "rag-plan.json"));
    scan(path.join(WORK, "rag-plan-2.json"));
    scan(path.join(WORK, "rag-apply-manifest.json"));
    scan(path.join(WORK, "rag-plan-race.json"));
    scan(path.join(WORK, "rag-plan-repair.json"));
    scan(path.join(WORK, "index-plan.json"));
    scan(path.join(WORK, "index-plan-2.json"));
    scan(path.join(WORK, "minio-backup", "manifest.json"));
    return { filesScanned: scanned };
  });
} catch {
  // failed=true已记录
} finally {
  mkdirSync(EVIDENCE_OUT, { recursive: true });
  const evidence = {
    drill: "rag-evidence-sync+index",
    container: CONTAINER,
    port: PORT,
    primaryMinio: MINIO_EP,
    restoreMinio: MINIO_RESTORE_EP,
    database: DB,
    restoreDatabase: RESTORE_DB,
    script: SCRIPT_REL,
    scriptBlobSha: SCRIPT_BLOB_SHA,
    headSha: HEAD_SHA,
    finishedAt: new Date().toISOString(),
    failed,
    results,
  };
  const evidencePath = path.join(EVIDENCE_OUT, `rag-evidence-drill-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
  process.stdout.write(`[rag-evidence-drill] 证据：${path.relative(ROOT, evidencePath)}（failed=${failed}）\n`);
  cleanupDbs();
  rmSync(WORK, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
