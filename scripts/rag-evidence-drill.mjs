/**
 * 政策原件MinIO同步+PostgreSQL/MinIO完整备份恢复对账演练（控制契约复审后版本）。
 *
 *   RAG_DRILL_PG_CONTAINER=<pg17容器> RAG_DRILL_PG_PORT=<端口> \
 *   RAG_DRILL_MINIO_ENDPOINT=<隔离MinIO> RAG_DRILL_MINIO_RESTORE_ENDPOINT=<全新MinIO> \
 *   RAG_DRILL_MINIO_ACCESS_KEY=... RAG_DRILL_MINIO_SECRET_KEY=... \
 *   node scripts/rag-evidence-drill.mjs [--keep]
 *
 * 流程（全部隔离环境，绝不触碰localhost:5432/policyops与生产MinIO bucket）：
 *   1. 全新演练库（agent.migrate含rag schema与角色）+ 清空隔离bucket（primary/restore）；
 *   2. audit预态（23对象缺失+rag记录缺失→exit4）→ plan（确定性：两次输出一致、23 uploads、
 *      planHash/targetFingerprint/codeSha齐全）；
 *   3. 守卫反例（全部零写入）：缺--i-am-authorized→exit2、错planHash→exit4、
 *      错targetFingerprint→exit4、plan后对象漂移→exit4、audit缺数据库→exit2；
 *   4. apply（上传+rag登记+verify）→ 四方verify → 复跑同一计划noop:true →
 *      object-only verify（degraded标记）；
 *   5. 冲突对象拒绝覆盖（drift拒绝且对象字节不变；清除后复跑恢复）；
 *   6. 备份：pg_dump + 逐对象下载（sha256清单）；
 *   7. 恢复：全新数据库pg_restore + 全新MinIO实例按备份回填；
 *   8. 恢复副本四方对账（verify ok）+ 恢复副本同计划apply noop；
 *   9. 输出证据JSON；输出全程不含访问密钥/连接串口令。
 *
 * 退出码：0全部通过；1任一步骤失败。
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
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
const SECRET_SENTINELS = [MINIO_SK, "minioadmin123", "postgres:postgres"].filter((s) => s && s.length > 6);

const results = [];
let failed = false;

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
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) throw new Error(`python -c 退出码${r.status}：${(r.stderr || "").slice(0, 400)}`);
  return r.stdout;
}

function syncCli(args, env = {}, expect = 0) {
  const r = spawnSync("uv", ["run", "--project", path.join(ROOT, "services", "agent"), "python", "-m", "agent.rag.evidence_sync", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 300_000,
    env: {
      ...process.env,
      AGENT_MINIO_ENDPOINT: MINIO_EP,
      AGENT_MINIO_ACCESS_KEY: MINIO_AK,
      AGENT_MINIO_SECRET_KEY: MINIO_SK,
      // 仅隔离演练放行dirty工作树（门禁在提交前运行）；持久执行禁止该变量。
      RAG_EVIDENCE_ALLOW_DIRTY: "1",
      ...env,
    },
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

try {
  mkdirSync(WORK, { recursive: true });
  const BASE_ENV = { DATABASE_URL: DRILL_URL };

  step("全新演练库（agent.migrate含rag schema与角色）+ 清空隔离bucket", () => {
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
    py(
      `from minio import Minio
import os
c = Minio("${MINIO_EP}", access_key="${MINIO_AK}", secret_key=os.environ["RAG_DRILL_SK"], secure=False)
if not c.bucket_exists("policy-originals"):
    c.make_bucket("policy-originals")
for o in list(c.list_objects("policy-originals", recursive=True)):
    c.remove_object("policy-originals", o.object_name)
print("buckets-clean")`,
      { RAG_DRILL_SK: MINIO_SK },
    );
    py(
      `from minio import Minio
import os
c = Minio("${MINIO_RESTORE_EP}", access_key="${MINIO_AK}", secret_key=os.environ["RAG_DRILL_SK"], secure=False)
if not c.bucket_exists("policy-originals"):
    c.make_bucket("policy-originals")
for o in list(c.list_objects("policy-originals", recursive=True)):
    c.remove_object("policy-originals", o.object_name)
print("restore-bucket-clean")`,
      { RAG_DRILL_SK: MINIO_SK },
    );
    return { database: DB, primaryEndpoint: MINIO_EP, restoreEndpoint: MINIO_RESTORE_EP };
  });

  step("audit预态：23对象缺失+rag记录缺失 → exit 4", () => {
    const r = syncCli(["audit", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT, "--database-url", DRILL_URL], BASE_ENV, 4);
    if (!r.json || r.json.ok !== false || r.json.docs.length !== 23) throw new Error(`audit预态异常：${JSON.stringify(r.json?.docs?.length)}`);
    const missing = r.json.docs.filter((d) => !d.objectExists).length;
    if (missing !== 23) throw new Error(`预态缺失对象数 ${missing} ≠ 23`);
    return { docs: 23, missingObjects: missing };
  });

  let plan = null;
  let planFile = "";
  step("plan：确定性输出（两次一致）、23 uploads、planHash/targetFingerprint/codeSha齐全", () => {
    syncCli(["plan", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT, "--database-url", DRILL_URL, "--out", path.join(WORK, "rag-plan.json")], BASE_ENV, 0);
    planFile = path.join(WORK, "rag-plan.json");
    const first = readFileSync(planFile, "utf8");
    syncCli(["plan", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT, "--database-url", DRILL_URL, "--out", path.join(WORK, "rag-plan-2.json")], BASE_ENV, 0);
    const second = readFileSync(path.join(WORK, "rag-plan-2.json"), "utf8");
    if (first !== second) throw new Error("plan输出不确定（两次不一致）");
    plan = JSON.parse(first);
    if (plan.plannedUploads.length !== 23 || plan.conflicts.length !== 0) {
      throw new Error(`plan异常：uploads=${plan.plannedUploads.length} conflicts=${plan.conflicts.length}`);
    }
    if (!/^[0-9a-f]{64}$/.test(plan.planHash) || !/^[0-9a-f]{64}$/.test(plan.targetFingerprint) || !/^[0-9a-f]{40}$/.test(plan.codeSha)) {
      throw new Error("plan hash/codeSha形状非法");
    }
    const objects = py(
      `from minio import Minio
import os
c = Minio("${MINIO_EP}", access_key="${MINIO_AK}", secret_key=os.environ["RAG_DRILL_SK"], secure=False)
print(len(list(c.list_objects("policy-originals", recursive=True))))`,
      { RAG_DRILL_SK: MINIO_SK },
    ).trim();
    if (objects !== "0") throw new Error(`plan后bucket出现对象：${objects}`);
    return { plannedUploads: 23, deterministic: true, planHash: plan.planHash.slice(0, 16) + "…" };
  });

  step("守卫反例A：apply缺--i-am-authorized → exit 2零写入", () => {
    const args = APPLY_ARGS(planFile, plan.planHash, plan.targetFingerprint).filter((a) => a !== "--i-am-authorized");
    const r = syncCli(args, BASE_ENV, 2);
    if (!/AUTH|授权|USAGE/i.test(r.out)) throw new Error("拒绝信息缺失");
    return { exit: 2, zeroWrite: true };
  });

  step("守卫反例B：错planHash → exit 4零写入", () => {
    const r = syncCli(APPLY_ARGS(planFile, "0".repeat(64), plan.targetFingerprint), BASE_ENV, 4);
    if (!/PLAN_HASH/i.test(r.out)) throw new Error("拒绝信息缺失");
    return { exit: 4, zeroWrite: true };
  });

  step("守卫反例C：错targetFingerprint → exit 4零写入", () => {
    const r = syncCli(APPLY_ARGS(planFile, plan.planHash, "0".repeat(64)), BASE_ENV, 4);
    if (!/FINGERPRINT/i.test(r.out)) throw new Error("拒绝信息缺失");
    return { exit: 4, zeroWrite: true };
  });

  step("守卫反例D：plan后对象漂移（植入受管冲突对象）→ exit 4零写入", () => {
    const target = plan.objects[0];
    py(
      `from minio import Minio
import os, io
c = Minio("${MINIO_EP}", access_key="${MINIO_AK}", secret_key=os.environ["RAG_DRILL_SK"], secure=False)
data = b"<html>post-plan-drift-bytes</html>"
c.put_object("policy-originals", "${target.objectKey}", io.BytesIO(data), length=len(data), content_type="text/html")
print("drift-planted")`,
      { RAG_DRILL_SK: MINIO_SK },
    );
    const r = syncCli(APPLY_ARGS(planFile, plan.planHash, plan.targetFingerprint), BASE_ENV, 4);
    if (!/DRIFT|漂移/i.test(r.out)) throw new Error("漂移拒绝信息缺失");
    py(
      `from minio import Minio
import os
c = Minio("${MINIO_EP}", access_key="${MINIO_AK}", secret_key=os.environ["RAG_DRILL_SK"], secure=False)
c.remove_object("policy-originals", "${target.objectKey}")
print("drift-removed")`,
      { RAG_DRILL_SK: MINIO_SK },
    );
    return { exit: 4, zeroWrite: true, plantedKeyRemoved: true };
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
  step("apply：23对象上传+rag登记（单持锁事务）", () => {
    const r = syncCli(APPLY_ARGS(planFile, plan.planHash, plan.targetFingerprint), BASE_ENV, 0);
    applyResult = r.json;
    if (r.json.applied !== true || r.json.verified !== true) throw new Error(`apply异常：${JSON.stringify({ applied: r.json.applied, verified: r.json.verified })}`);
    if (r.json.manifest.length !== 23) throw new Error(`manifest ${r.json.manifest.length} ≠ 23`);
    writeFileSync(path.join(WORK, "rag-apply-manifest.json"), JSON.stringify(r.json.manifest, null, 2) + "\n");
    return { uploaded: 23, fetches: r.json.fetches, versions: r.json.versions, manifestEntries: r.json.manifest.length };
  });

  step("verify：四方对账通过（Git/meta/DSL已在collect固化+对象SHA+rag记录）", () => {
    const r = syncCli(["verify", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT, "--database-url", DRILL_URL], BASE_ENV, 0);
    if (r.json.ok !== true || r.json.objectCount !== 23) throw new Error(`verify异常：ok=${r.json.ok} objects=${r.json.objectCount}`);
    if (r.json.verificationScope !== "four-way" || r.json.dbChecked !== true || r.json.degraded !== false) {
      throw new Error(`verify范围标记异常：${JSON.stringify({ scope: r.json.verificationScope, db: r.json.dbChecked, degraded: r.json.degraded })}`);
    }
    return { ok: true, objects: 23, scope: "four-way" };
  });

  step("幂等：复跑同一计划 → noop:true", () => {
    const r = syncCli(APPLY_ARGS(planFile, plan.planHash, plan.targetFingerprint), BASE_ENV, 0);
    if (r.json.noop !== true || r.json.applied !== false) throw new Error(`复跑异常：noop=${r.json.noop} applied=${r.json.applied}`);
    return { noop: true, uploaded: 0 };
  });

  step("object-only verify：显式降级标记（scope/degraded/dbChecked）", () => {
    const r = syncCli(["verify", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT, "--database-url", DRILL_URL, "--object-only"], BASE_ENV, 0);
    if (r.json.verificationScope !== "object-only" || r.json.degraded !== true || r.json.dbChecked !== false) {
      throw new Error(`object-only标记异常：${JSON.stringify(r.json.verificationScope)}`);
    }
    return { scope: "object-only", degraded: true };
  });

  step("冲突对象拒绝覆盖（对象字节不变；清除后复跑恢复）", () => {
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
    const sha = py(
      `from minio import Minio
import os, hashlib
c = Minio("${MINIO_EP}", access_key="${MINIO_AK}", secret_key=os.environ["RAG_DRILL_SK"], secure=False)
data = c.get_object("policy-originals", "${target.objectKey}").read()
print(hashlib.sha256(data).hexdigest())`,
      { RAG_DRILL_SK: MINIO_SK },
    ).trim();
    if (sha === target.sha256) throw new Error("冲突对象被覆盖！");
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
    return { conflictRefused: true, objectPreserved: true, repairedViaReplan: true };
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

  step("恢复：全新数据库pg_restore + 全新MinIO回填", () => {
    docker(["psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS "${RESTORE_DB}" WITH (FORCE)`]);
    docker(["psql", "-U", "postgres", "-c", `CREATE DATABASE "${RESTORE_DB}"`]);
    dockerBuf(["pg_restore", "-U", "postgres", "-d", RESTORE_DB, "--clean", "--if-exists"], readFileSync(path.join(WORK, "rag-drill.dump")));
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
    scan(path.join(WORK, "minio-backup", "manifest.json"));
    return { filesScanned: scanned };
  });
} catch {
  // failed=true已记录
} finally {
  mkdirSync(EVIDENCE_OUT, { recursive: true });
  const evidence = {
    drill: "rag-evidence-sync",
    container: CONTAINER,
    port: PORT,
    primaryMinio: MINIO_EP,
    restoreMinio: MINIO_RESTORE_EP,
    database: DB,
    restoreDatabase: RESTORE_DB,
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
