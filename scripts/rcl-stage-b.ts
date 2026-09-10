/**
 * WI-20260907-04 阶段B：持久库受控替换（用户明确授权后执行）。
 *
 * 用法：RCL_STAGE_B_URL=<持久库URL> npx tsx scripts/rcl-stage-b.ts
 *
 * 流程（全部在授权持久库上）：
 *   audit → generate → plan-replacement → 删除非当前DSL的旧示例（保留42条）
 *   → prepare-archive（真实pg_dump）→ 真实恢复演练（第二实例pg_restore+全表对账
 *   +verified restore-report+重算sha256sums）→ verify-archive → apply（--i-am-authorized）
 *   → verify（N/36/N+42）→ 幂等复跑验证。
 *
 * 输出：stdout JSON（audit、manifestHash、oldTargets、snapshot、counts、幂等no-op）。
 * manifest存档到 Git忽略的 backup/case-library/rcl-stage-b-<ts>/。
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { buildVerifiedRestoreReport } from "@/lib/case-governance/reconcile";
import type { RclManifest } from "@/lib/case-governance/manifest";

const DB_URL = process.env.RCL_STAGE_B_URL;
if (!DB_URL) {
  console.error("[rcl-stage-b] RCL_STAGE_B_URL 未设置");
  process.exit(1);
}
process.env.DATABASE_URL = DB_URL;

const ROOT = resolve(process.cwd());
const CLI = join(ROOT, "scripts", "rcl-case-library.ts");
const TSX_CLI = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const DOCKER_PERSISTENT = process.env.RCL_PERSISTENT_PG_CONTAINER ?? "socila-postgres";
const DOCKER_DRILL = process.env.RCL_DRILL_PG_CONTAINER ?? "jrp-drill-pg";

function runCli(args: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [TSX_CLI, CLI, ...args], {
    env: { ...process.env, DATABASE_URL: DB_URL },
    encoding: "utf-8",
    timeout: 300_000,
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
function runCliExpectOk(args: string[], label: string): string {
  const r = runCli(args);
  if (r.code !== 0) throw new Error(`[rcl-stage-b] ${label} 退出码 ${r.code}：${r.stderr.slice(0, 600)}`);
  return r.stdout;
}

async function main() {
  const storageDir = join(tmpdir(), `rcl-stage-b-${randomUUID().slice(0, 8)}`);
  mkdirSync(storageDir, { recursive: true });

  const auditOut = JSON.parse(runCliExpectOk(["audit"], "audit")) as { counts: { cases: number; showcase: number; tests: number }; targetFingerprint: string };
  runCliExpectOk(["generate", "--storage", storageDir], "generate");
  // RCL-FR-018（第三轮复审）：42条DSL example的保留/更新/新增/删除集合进入
  // manifest，由apply在**同一事务**内同步；禁止在plan-replacement之后或事务外
  // 修改example（旧stage-b在apply事务外删除7条示例的缺陷已移除）。
  runCliExpectOk(["plan-replacement", "--storage", storageDir], "plan-replacement");

  // prepare-archive（真实pg_dump，容器stdout直出）。
  const prepareOut = JSON.parse(runCliExpectOk(["prepare-archive", "--storage", storageDir, "--pgdump-docker", DOCKER_PERSISTENT], "prepare-archive")) as { batchId: string };

  // 真实恢复演练（第二实例 pg_restore + 全表/sequence 对账）。
  const restoreDbName = `rcl_stage_b_restore_${randomUUID().slice(0, 8)}`;
  for (const cmd of [
    ["exec", DOCKER_DRILL, "psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS "${restoreDbName}" WITH (FORCE)`],
    ["exec", DOCKER_DRILL, "psql", "-U", "postgres", "-c", `CREATE DATABASE "${restoreDbName}"`],
  ]) {
    const r = spawnSync("docker", cmd, { encoding: "utf-8" });
    if (r.status !== 0) throw new Error(`恢复目标库操作失败: ${r.stderr?.slice(0, 200)}`);
  }
  const dumpFile = join(storageDir, "policyops-fc.dump");
  const restore = spawnSync("docker", ["exec", "-i", DOCKER_DRILL, "pg_restore", "-U", "postgres", "-d", restoreDbName, "--clean", "--if-exists"], {
    input: readFileSync(dumpFile), maxBuffer: 512 * 1024 * 1024, encoding: "buffer",
  });
  if (restore.status !== 0) throw new Error(`pg_restore失败：${restore.stderr?.toString().slice(0, 400)}`);

  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { default: pg } = await import("pg");
  const restoreUrl = new URL(DB_URL!);
  restoreUrl.hostname = "localhost";
  // RCL第三轮复审：恢复演练目标端口从环境解析（不得硬编码5439）。
  restoreUrl.port = process.env.RCL_DRILL_PG_PORT ?? restoreUrl.port;
  restoreUrl.hostname = "localhost";
  restoreUrl.password = process.env.RCL_DRILL_PG_PASSWORD ?? "postgres";
  restoreUrl.username = "postgres";
  restoreUrl.pathname = `/${restoreDbName}`;
  const pool = new pg.Pool({ connectionString: restoreUrl.toString() });
  const restoredDb = drizzle(pool);
  // RCL-FR-004/AC-004（第三轮复审）：恢复报告必须包含全部表与真实sequence明细，
  // 由同一实现（buildVerifiedRestoreReport）生成，禁止手工空明细verified。
  const report = await buildVerifiedRestoreReport({
    source: db,
    restored: restoredDb as never,
    dumpFilePath: dumpFile,
    restoredDatabaseUrl: restoreUrl.toString().replace(/:[^:@]+@/, ":***@"),
    archiveDir: storageDir,
  });
  await pool.end();
  if (report.reconcile.mismatches.length > 0) throw new Error(`恢复对账不一致：${report.reconcile.mismatches.join(", ")}`);
  writeFileSync(join(storageDir, "restore-report.json"), JSON.stringify(report, null, 2));
  const finalFiles = ["policyops-fc.dump", "cases.dump", "showcase_cases.dump", "tests.dump", "selection-report.json", "manifest.json", "restore-report.json"];
  writeFileSync(join(storageDir, "sha256sums.txt"), finalFiles.map((f) => `${createHash("sha256").update(readFileSync(join(storageDir, f))).digest("hex")}  ${f}`).join("\n") + "\n");

  runCliExpectOk(["verify-archive", "--storage", storageDir, "--batch-id", prepareOut.batchId], "verify-archive");

  // apply + 幂等复跑。
  const applyOut = JSON.parse(runCliExpectOk(["apply", "--storage", storageDir, "--batch-id", prepareOut.batchId, "--i-am-authorized"], "apply")) as { deletedCases: number; deletedShowcases: number; deletedTests: number; insertedCases: number; insertedShowcases: number; insertedTests: number; noop: boolean };
  const applyAgain = JSON.parse(runCliExpectOk(["apply", "--storage", storageDir, "--batch-id", prepareOut.batchId, "--i-am-authorized"], "apply-again")) as { noop: boolean };
  const verifyOut = JSON.parse(runCliExpectOk(["verify", "--storage", storageDir], "verify")) as { ok: boolean; counts: { cases: number; showcase: number; tests: number } };
  if (!verifyOut.ok) throw new Error("verify 未通过");

  const manifest = JSON.parse(readFileSync(join(storageDir, "manifest.json"), "utf-8")) as RclManifest;
  const reportDir = join("F:/Socila/backup/case-library", `rcl-stage-b-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`);
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(join(reportDir, "manifest-replacement.json"), JSON.stringify(manifest, null, 2));

  const rel = await db.execute(sql`SELECT id, jurisdiction_code, status, left(active_snapshot_id::text, 8) AS snap, effective_from, effective_to FROM "jurisdiction_planning_releases" ORDER BY id`);
  console.log(JSON.stringify({
    reportDir,
    audit: auditOut,
    exampleSyncInApplyTransaction: true,
    archive: { manifestHash: manifest.manifestHash.slice(0, 24) + "…", oldTargets: { cases: manifest.oldTargets.cases.length, showcase: manifest.oldTargets.showcase.length, tests: manifest.oldTargets.tests.length }, batchId: prepareOut.batchId, restoreVerifiedTableCount: report.reconcile.tableCount },
    apply: applyOut,
    applyAgainNoop: applyAgain.noop,
    verify: verifyOut,
    releases: rel.rows,
    replacement: { manifestHash: manifest.manifestHash, newCases: manifest.newCases.length, newShowcase: manifest.newShowcase.length, newTests: manifest.newTests.length, exampleTests: manifest.exampleTests.length, counts: manifest.counts },
  }, null, 2));
  rmSync(storageDir, { recursive: true, force: true });
  process.exit(0);
}

main().catch((err) => {
  console.error("[rcl-stage-b] failed:", err);
  process.exit(1);
});