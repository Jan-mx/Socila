/**
 * 09-11独立审查问题一：政策原件MinIO同步+PostgreSQL/MinIO完整备份恢复对账演练。
 *
 *   RAG_DRILL_PG_CONTAINER=<pg17容器> RAG_DRILL_PG_PORT=<端口> \
 *   RAG_DRILL_MINIO_ENDPOINT=<隔离MinIO> RAG_DRILL_MINIO_RESTORE_ENDPOINT=<全新MinIO> \
 *   RAG_DRILL_MINIO_ACCESS_KEY=... RAG_DRILL_MINIO_SECRET_KEY=... \
 *   node scripts/rag-evidence-drill.mjs [--keep]
 *
 * 流程（全部隔离环境，绝不触碰localhost:5432/policyops与生产MinIO bucket）：
 *   1. 全新演练库（agent.migrate含rag schema）+ 清空隔离bucket（primary/restore）；
 *   2. audit预态（23对象缺失→exit4）→ plan（23 uploads）→ apply（上传+rag登记+verify）
 *      → 复跑apply幂等no-op → verify ok；
 *   3. 守卫反例：错bucket/远程endpoint/policyops库名/冲突对象 → 拒绝且零覆盖；
 *   4. 备份：pg_dump + 逐对象下载（sha256清单）；
 *   5. 恢复：全新数据库pg_restore + 全新MinIO实例按备份回填；
 *   6. 恢复副本四方对账（Git原件/meta/DSL evidence已在collect固化，此处核对
 *      MinIO对象SHA、rag.fetches/rag.document_versions记录与content_hash）；
 *   7. 输出证据JSON；输出全程不含访问密钥/连接串口令。
 *
 * 退出码：0全部通过；1任一步骤失败。
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CONTAINER = process.env.RAG_DRILL_PG_CONTAINER ?? "shv2-fix-pg";
const PORT = process.env.RAG_DRILL_PG_PORT ?? "54956";
const MINIO_EP = process.env.RAG_DRILL_MINIO_ENDPOINT ?? "127.0.0.1:54960";
const MINIO_RESTORE_EP = process.env.RAG_DRILL_MINIO_RESTORE_ENDPOINT ?? "127.0.0.1:54961";
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

try {
  mkdirSync(WORK, { recursive: true });
  const BASE_ENV = { DATABASE_URL: DRILL_URL };

  step("全新演练库（agent.migrate含rag schema）+ 清空隔离bucket", () => {
    docker(["psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`]);
    docker(["psql", "-U", "postgres", "-c", `CREATE DATABASE "${DB}"`]);
    docker(["psql", "-U", "postgres", "-d", DB, "-c", "CREATE EXTENSION IF NOT EXISTS vector"]);
    const mig = spawnSync("uv", ["run", "--project", path.join(ROOT, "services", "agent"), "python", "-m", "agent.migrate"], {
      cwd: path.join(ROOT, "services", "agent"),
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: DRILL_URL },
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
    return { docs: 23, missingObjects: missing, problems: r.json.problems.length };
  });

  step("plan：23 uploads且零冲突、零写入", () => {
    const r = syncCli(["plan", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT, "--database-url", DRILL_URL, "--out", path.join(WORK, "rag-plan.json")], BASE_ENV, 0);
    if (r.json.plannedUploads.length !== 23 || r.json.conflicts.length !== 0) {
      throw new Error(`plan异常：uploads=${r.json.plannedUploads.length} conflicts=${r.json.conflicts.length}`);
    }
    const objects = py(
      `from minio import Minio
import os
c = Minio("${MINIO_EP}", access_key="${MINIO_AK}", secret_key=os.environ["RAG_DRILL_SK"], secure=False)
print(len(list(c.list_objects("policy-originals", recursive=True))))`,
      { RAG_DRILL_SK: MINIO_SK },
    ).trim();
    if (objects !== "0") throw new Error(`plan后bucket出现对象：${objects}`);
    return { plannedUploads: 23, bucketObjectsAfterPlan: 0 };
  });

  let applyResult = null;
  step("apply：23对象上传+rag登记+verify通过", () => {
    const r = syncCli(["apply", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT, "--database-url", DRILL_URL], BASE_ENV, 0);
    applyResult = r.json;
    if (r.json.uploaded !== 23 || r.json.verified !== true) throw new Error(`apply异常：${JSON.stringify({ uploaded: r.json.uploaded, verified: r.json.verified })}`);
    if (r.json.manifest.length !== 23) throw new Error(`manifest ${r.json.manifest.length} ≠ 23`);
    writeFileSync(path.join(WORK, "rag-apply-manifest.json"), JSON.stringify(r.json.manifest, null, 2) + "\n");
    return { uploaded: 23, fetches: r.json.fetches, versions: r.json.versions, manifestEntries: r.json.manifest.length };
  });

  step("verify：23对象SHA与rag记录对账通过", () => {
    const r = syncCli(["verify", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT, "--database-url", DRILL_URL], BASE_ENV, 0);
    if (r.json.ok !== true || r.json.objectCount !== 23) throw new Error(`verify异常：ok=${r.json.ok} objects=${r.json.objectCount}`);
    return { ok: true, objects: 23 };
  });

  step("幂等：复跑apply uploaded=0/noop=23", () => {
    const r = syncCli(["apply", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT, "--database-url", DRILL_URL], BASE_ENV, 0);
    if (r.json.uploaded !== 0 || r.json.noopObjects !== 23) throw new Error(`幂等异常：uploaded=${r.json.uploaded} noop=${r.json.noopObjects}`);
    return { uploaded: 0, noopObjects: 23 };
  });

  step("守卫反例：错bucket/远程endpoint/policyops库名 → 拒绝", () => {
    const wrongBucket = syncCli(["audit", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT, "--bucket", "policyops"], {}, 2);
    if (!/bucket/i.test(wrongBucket.out)) throw new Error("错bucket拒绝信息缺失");
    const remote = spawnSync("uv", ["run", "--project", path.join(ROOT, "services", "agent"), "python", "-m", "agent.rag.evidence_sync", "audit", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, AGENT_MINIO_ENDPOINT: "minio.prod.example:9000", AGENT_MINIO_ACCESS_KEY: MINIO_AK, AGENT_MINIO_SECRET_KEY: MINIO_SK },
      timeout: 120_000,
    });
    if (remote.status !== 2 || !/REMOTE_ENDPOINT_REFUSED/.test(remote.stderr)) {
      throw new Error(`远程endpoint未默认拒绝：${remote.status} ${remote.stderr.slice(0, 200)}`);
    }
    const persistent = syncCli(["apply", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT, "--database-url", "postgresql://postgres:postgres@localhost:5432/policyops"], {}, 2);
    if (!/PERSISTENT_TARGET_REFUSED|policyops/i.test(persistent.out)) throw new Error("policyops库名未拒绝");
    return { wrongBucket: 2, remoteEndpoint: 2, persistentDb: 2 };
  });

  step("冲突对象拒绝覆盖（OBJECT_CONFLICT且零写入）", () => {
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
    const r = syncCli(["apply", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT, "--database-url", DRILL_URL], BASE_ENV, 4);
    if (!/OBJECT_CONFLICT|冲突/.test(r.out)) throw new Error("冲突拒绝信息缺失");
    const sha = py(
      `from minio import Minio
import os, hashlib
c = Minio("${MINIO_EP}", access_key="${MINIO_AK}", secret_key=os.environ["RAG_DRILL_SK"], secure=False)
data = c.get_object("policy-originals", "${target.objectKey}").read()
print(hashlib.sha256(data).hexdigest())`,
      { RAG_DRILL_SK: MINIO_SK },
    ).trim();
    if (sha === target.sha256) throw new Error("冲突对象被覆盖！");
    // 还原：删除冲突对象并重新apply补齐。
    py(
      `from minio import Minio
import os
c = Minio("${MINIO_EP}", access_key="${MINIO_AK}", secret_key=os.environ["RAG_DRILL_SK"], secure=False)
c.remove_object("policy-originals", "${target.objectKey}")
print("conflict-removed")`,
      { RAG_DRILL_SK: MINIO_SK },
    );
    syncCli(["apply", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT, "--database-url", DRILL_URL], BASE_ENV, 0);
    return { conflictRefused: true, objectPreserved: true, repaired: true };
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

  step("恢复副本四方对账：verify（恢复DB+恢复MinIO）ok", () => {
    const r = syncCli(
      ["verify", "--evidence-dir", EVIDENCE_DIR, "--dsl-root", DSL_ROOT, "--database-url", RESTORE_URL],
      { DATABASE_URL: RESTORE_URL, AGENT_MINIO_ENDPOINT: MINIO_RESTORE_EP },
      0,
    );
    if (r.json.ok !== true || r.json.objectCount !== 23) {
      throw new Error(`恢复副本verify异常：ok=${r.json?.ok} ${(r.json?.problems ?? []).slice(0, 3).join("；")}`);
    }
    return { ok: true, objects: 23, database: RESTORE_DB };
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
