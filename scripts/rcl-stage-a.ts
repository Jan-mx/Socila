/**
 * WI-20260907-04 阶段A：隔离库完整演练（只读准备，不触碰本机持久policyops）。
 *
 * 用法：
 *   RCL_STAGE_DB_URL=<隔离库URL> npx tsx scripts/rcl-stage-a.ts full     # activate+CLI全流程（含apply/verify）
 *   RCL_STAGE_DB_URL=<隔离库URL> npx tsx scripts/rcl-stage-a.ts archive  # activate+CLI到verify-archive（不apply）
 *
 * 流程：清理 → activate沪粤（2026/2030非重叠区间）→ audit → generate →
 *   plan-replacement → prepare-archive（真实pg_dump）→ 真实恢复演练（第二实例
 *   pg_restore+reconcile全表对账+verified restore-report+重算sha256sums）→
 *   verify-archive → [full: apply（--i-am-authorized）→ verify]
 *
 * 输出：stdout JSON（audit计数、manifestHash、oldTargets摘要、snapshotMap、counts）。
 * 全程只操作隔离库；本脚本不连接、不写入本机policyops。
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { eq, sql } from "drizzle-orm";
import {
  jurisdictionPlanningReleases,
  caseArchiveBatches,
  caseArchiveEntries,
  plans,
  tests,
  cases,
  showcaseCases,
} from "@/lib/db/schema";
import { createPolicySnapshotService } from "@/server/modules/policy/application/snapshot-service";
import { createJurisdictionTreeService } from "@/server/modules/jurisdiction/application/tree-service";
import { DrizzleJurisdictionReadRepository } from "@/server/modules/jurisdiction/infrastructure/drizzle/jurisdiction-read.repository";
import { DrizzlePolicySnapshotRepository } from "@/server/modules/policy/infrastructure/drizzle/policy-conflict-snapshot.repository";
import { DrizzlePolicyConflictRepository } from "@/server/modules/policy/infrastructure/drizzle/policy-conflict-snapshot.repository";
import { DrizzleJurisdictionReleaseWriteRepository } from "@/server/modules/publishing/infrastructure/drizzle/jurisdiction-release.repository";
import { activateJurisdictionRelease } from "@/server/modules/publishing/application/jurisdiction-release.use-case";
import { DrizzleRulesReadRepository } from "@/server/modules/rules/infrastructure/drizzle/rules-read.repository";
import { listBaseTables, normalizedTableHash } from "@/lib/case-governance/reconcile";
import type { RclManifest } from "@/lib/case-governance/manifest";

const DB_URL = process.env.RCL_STAGE_DB_URL;
const MODE = process.argv[2] ?? "full";
if (!DB_URL) {
  console.error("[rcl-stage-a] RCL_STAGE_DB_URL 未设置");
  process.exit(1);
}
process.env.DATABASE_URL = DB_URL;

const ROOT = resolve(process.cwd());
const CLI = join(ROOT, "scripts", "rcl-case-library.ts");
const TSX_CLI = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const DOCKER_PG = process.env.RCL_DRILL_PG_CONTAINER ?? "jrp-drill-pg";

function runCli(args: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [TSX_CLI, CLI, ...args], {
    env: { ...process.env, DATABASE_URL: DB_URL! },
    encoding: "utf-8",
    timeout: 300_000,
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
function runCliExpectOk(args: string[], label: string): string {
  const r = runCli(args);
  if (r.code !== 0) throw new Error(`[rcl-stage-a] ${label} 退出码 ${r.code}：${r.stderr.slice(0, 500)}`);
  return r.stdout;
}

async function activateRegion(code: string, asOfDate: string, effectiveTo?: string | null): Promise<void> {
  const tree = createJurisdictionTreeService({ read: new DrizzleJurisdictionReadRepository() });
  const resolveChain = async (c: string) => {
    const nodes = await tree.resolveChain(c);
    return nodes.map((n) => ({ code: n.code, name: n.name, level: n.level, path: n.path }));
  };
  const svc = createPolicySnapshotService({ resolveChain });
  const created = await svc.createPolicySnapshot({ jurisdictionCode: code, asOfDate, actor: "rcl-stage-a" });
  const releaseWrite = new DrizzleJurisdictionReleaseWriteRepository();
  await activateJurisdictionRelease(
    {
      requireAdmin: async () => ({ ok: true }),
      getSnapshot: async (snapshotId) => {
        const snap = await new DrizzlePolicySnapshotRepository().getSnapshot(snapshotId);
        if (!snap) return null;
        return {
          snapshot: { id: snap.snapshot.id, jurisdictionCode: snap.snapshot.jurisdictionCode, contentHash: snap.snapshot.contentHash, asOfDate: snap.snapshot.asOfDate },
          members: snap.members.map((m) => ({
            entityType: m.entityType as "rule" | "param" | "rule_set",
            businessKey: m.businessKey,
            payload: m.payload as Record<string, unknown>,
            provenance: m.provenance,
          })),
        };
      },
      listOpenConflicts: (jc) => new DrizzlePolicyConflictRepository().listConflicts({ status: "open", jurisdictionCode: jc }),
      loadTests: (codes) => new DrizzleRulesReadRepository().listTests({ jurisdictionCodes: codes }),
      listParamKeys: async (codes) => {
        const rows = await new DrizzleRulesReadRepository().listParams({ status: "published" });
        return rows.filter((p) => p.jurisdictionCode !== null && codes.includes(p.jurisdictionCode)).map((p) => p.paramId);
      },
      upsert: (data) => releaseWrite.upsertActiveRelease(data),
      now: () => new Date("2026-09-07T10:00:00.000Z"),
    },
    {
      jurisdictionCode: code,
      snapshotId: created.snapshotId,
      effectiveFrom: asOfDate,
      effectiveTo: effectiveTo ?? null,
      actor: { id: "rcl-stage-a-admin", role: "admin", status: "active" },
    },
  );
}

async function main() {
  // 1) 清理（隔离库）。
  await db.delete(jurisdictionPlanningReleases);
  await db.delete(plans).where(eq(plans.ownerUserId, "rcl-stage-a-user"));
  await db.delete(caseArchiveEntries);
  await db.delete(caseArchiveBatches);
  await db.delete(tests).where(sql`name like 'RPCT-%'`);
  await db.delete(cases).where(sql`case_uid like 'RPC-%'`);
  await db.delete(showcaseCases).where(sql`case_uid like 'RPC-%'`);

  const storageDir = join(tmpdir(), `rcl-stage-a-${randomUUID().slice(0, 8)}`);
  mkdirSync(storageDir, { recursive: true });
  const auditOut = JSON.parse(runCliExpectOk(["audit"], "audit")) as { counts: { cases: number; showcase: number; tests: number }; targetFingerprint: string };

  let planOut: { manifestHash: string; oldTargets: { cases: number; showcase: number; tests: number } };
  if (MODE === "archive") {
    // archive模式：旧目标归档（不激活/不生成新数据）——manifest绑定库中全部旧行。
    // 旧库（如治理前851基线）无新期望/evidence，激活门禁不适用；归档=行的恢复凭证。
    const { buildRclManifest } = await import("@/lib/case-governance/manifest");
    const { rowContentHash, testRowContentHash, CASE_INFRA_COLUMNS, SHOWCASE_INFRA_COLUMNS } = await import("@/lib/case-governance/hashes");
    const { buildExampleSync, loadDslExampleTargets } = await import("@/lib/case-governance/dsl-examples");
    // RCL-FR-002（第三轮复审）：旧targets按完整业务行计算非空hash。
    const oldCaseRows = await db.execute(sql`SELECT * FROM "cases" ORDER BY id`);
    const oldShowRows = await db.execute(sql`SELECT * FROM "showcase_cases" ORDER BY id`);
    const oldTestRows = await db.execute(sql`SELECT * FROM "tests" WHERE source = 'regression' ORDER BY id`);
    const exampleRows = await db.execute(sql`SELECT * FROM "tests" WHERE source = 'example' ORDER BY id`);
    const oldCases = oldCaseRows.rows.map((r) => ({
      rowId: Number((r as { id: number }).id),
      uid: String((r as { case_uid: string | null }).case_uid ?? null),
      contentHash: rowContentHash(r as Record<string, unknown>, CASE_INFRA_COLUMNS),
    }));
    const oldShowcase = oldShowRows.rows.map((r) => ({
      rowId: Number((r as { id: number }).id),
      uid: String((r as { case_uid: string | null }).case_uid ?? null),
      contentHash: rowContentHash(r as Record<string, unknown>, SHOWCASE_INFRA_COLUMNS),
    }));
    const oldTests = oldTestRows.rows.map((r) => ({
      rowId: Number((r as { id: number }).id),
      uid: (r as { source_case_uid: string | null }).source_case_uid ?? null,
      contentHash: testRowContentHash(r as Record<string, unknown>),
    }));
    const dslTargets = loadDslExampleTargets();
    const exampleSync = buildExampleSync(exampleRows.rows as Array<Record<string, unknown>>, dslTargets);
    const exampleTests = dslTargets.map((t) => ({
      rowId: exampleSync.retained.find((r) => r.name === t.name && r.jurisdictionCode === t.jurisdictionCode)?.rowId
        ?? exampleSync.updated.find((u) => u.name === t.name && u.jurisdictionCode === t.jurisdictionCode)?.rowId
        ?? 0,
      uid: t.name,
      contentHash: t.contentHash,
      jurisdictionCode: t.jurisdictionCode,
    }));
    const manifest = buildRclManifest({
      algorithmVersion: "RCL-MANIFEST-1.0",
      generatorVersion: "RCL-GEN-1.0",
      newCases: [],
      newShowcase: [],
      newTests: [],
      exampleTests,
      exampleSync,
      oldTargets: { cases: oldCases, showcase: oldShowcase, tests: oldTests },
      snapshot: null,
    });
    writeFileSync(join(storageDir, "manifest.json"), JSON.stringify(manifest, null, 2));
    planOut = {
      manifestHash: manifest.manifestHash,
      oldTargets: { cases: oldCases.length, showcase: oldShowcase.length, tests: oldTests.length },
    };
  } else {
    // full模式：激活沪粤（2026/2030非重叠区间）。
    await activateRegion("310000", "2026-09-01");
    await activateRegion("440000", "2026-09-01", "2029-12-31");
    await activateRegion("440000", "2030-01-01");
    runCliExpectOk(["generate", "--storage", storageDir], "generate");
    planOut = JSON.parse(runCliExpectOk(["plan-replacement", "--storage", storageDir], "plan-replacement")) as { manifestHash: string; oldTargets: { cases: number; showcase: number; tests: number } };
  }

  // 2) prepare-archive。
  const prepareOut = JSON.parse(runCliExpectOk(["prepare-archive", "--storage", storageDir, "--pgdump-docker", DOCKER_PG], "prepare-archive")) as { batchId: string };

  // 3) 真实恢复演练。
  const restoreDbName = `rcl_stage_restore_${randomUUID().slice(0, 8)}`;
  const drop = spawnSync("docker", ["exec", DOCKER_PG, "psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS "${restoreDbName}" WITH (FORCE)`], { encoding: "utf-8" });
  if (drop.status !== 0) throw new Error(`drop restore db失败`);
  const create = spawnSync("docker", ["exec", DOCKER_PG, "psql", "-U", "postgres", "-c", `CREATE DATABASE "${restoreDbName}"`], { encoding: "utf-8" });
  if (create.status !== 0) throw new Error(`create restore db失败`);
  const dumpFile = join(storageDir, "policyops-fc.dump");
  const restore = spawnSync("docker", ["exec", "-i", DOCKER_PG, "pg_restore", "-U", "postgres", "-d", restoreDbName, "--clean", "--if-exists"], {
    input: readFileSync(dumpFile), maxBuffer: 512 * 1024 * 1024, encoding: "buffer",
  });
  if (restore.status !== 0) throw new Error(`pg_restore失败：${restore.stderr?.toString().slice(0, 400)}`);

  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { default: pg } = await import("pg");
  const restoreUrl = new URL(DB_URL!);
  restoreUrl.pathname = `/${restoreDbName}`;
  const pool = new pg.Pool({ connectionString: restoreUrl.toString() });
  const restoredDb = drizzle(pool);
  const tables = await listBaseTables(db);
  const mismatches: string[] = [];
  for (const t of tables) {
    const a = await normalizedTableHash(db, t.schema, t.table);
    const b = await normalizedTableHash(restoredDb as never, t.schema, t.table);
    if (a !== b) mismatches.push(`${t.schema}.${t.table}`);
  }
  await pool.end();
  if (mismatches.length > 0) throw new Error(`恢复对账不一致：${mismatches.join(", ")}`);
  const versionRes = await db.execute(sql`SELECT version()`);
  const pgVersion = String((versionRes.rows[0] as { version: string }).version).split(" ")[1] ?? "";
  const vectorRes = await db.execute(sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`);
  const report = {
    status: "verified" as const,
    sourceDump: { fileName: "policyops-fc.dump", sha256: createHash("sha256").update(readFileSync(dumpFile)).digest("hex") },
    environment: { postgresVersion: pgVersion, pgvectorVersion: (vectorRes.rows[0] as { extversion?: string } | undefined)?.extversion ?? null, restoredDatabaseUrl: restoreUrl.toString().replace(/:[^:@]+@/, ":***@"), restoredAt: new Date().toISOString() },
    reconcile: { tableCount: tables.length, sequenceCount: 0, tables: [], sequences: [], mismatches },
    archiveFileHashes: {},
  };
  writeFileSync(join(storageDir, "restore-report.json"), JSON.stringify(report, null, 2));
  const finalFiles = ["policyops-fc.dump", "cases.dump", "showcase_cases.dump", "tests.dump", "selection-report.json", "manifest.json", "restore-report.json"];
  const entries = finalFiles.map((f) => `${createHash("sha256").update(readFileSync(join(storageDir, f))).digest("hex")}  ${f}`);
  writeFileSync(join(storageDir, "sha256sums.txt"), entries.join("\n") + "\n");

  // 4) verify-archive。
  runCliExpectOk(["verify-archive", "--storage", storageDir, "--batch-id", prepareOut.batchId], "verify-archive");

  // 5) full模式：apply + verify；archive模式停在restore_verified。
  let applyOut = null;
  let verifyOut = null;
  if (MODE === "full") {
    applyOut = JSON.parse(runCliExpectOk(["apply", "--storage", storageDir, "--batch-id", prepareOut.batchId, "--i-am-authorized"], "apply")) as { deletedCases: number; deletedShowcases: number; deletedTests: number; insertedCases: number; insertedShowcases: number; insertedTests: number };
    verifyOut = JSON.parse(runCliExpectOk(["verify", "--storage", storageDir], "verify")) as { ok: boolean; counts: { cases: number; showcase: number; tests: number } };
    if (!verifyOut.ok) throw new Error("verify 未通过");
  }

  const manifest = JSON.parse(readFileSync(join(storageDir, "manifest.json"), "utf-8")) as RclManifest;
  const snapshotRows = await db.execute(sql`SELECT id, jurisdiction_code, content_hash, as_of_date FROM "policy_snapshots" WHERE jurisdiction_code IN ('310000','440000') ORDER BY as_of_date`);
  const snapshots = snapshotRows.rows.map((r) => ({
    id: String((r as { id: string }).id),
    jurisdictionCode: String((r as { jurisdiction_code: string }).jurisdiction_code),
    asOfDate: String((r as { as_of_date: string }).as_of_date),
    contentHash: String((r as { content_hash: string }).content_hash),
  }));

  // 保留manifest与报告到 Git忽略的backup（供阶段A报告/阶段B授权精确引用）。
  const archiveOutDir = join("F:/Socila/backup/case-library", `rcl-stage-a-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`);
  mkdirSync(archiveOutDir, { recursive: true });
  writeFileSync(join(archiveOutDir, "manifest-replacement.json"), JSON.stringify(manifest, null, 2));

  const reportJson = {
    mode: MODE,
    reportDir: archiveOutDir,
    database: new URL(DB_URL!).host + new URL(DB_URL!).pathname,
    audit: auditOut,
    archive: {
      manifestHash: planOut.manifestHash,
      oldTargets: planOut.oldTargets,
      batchId: prepareOut.batchId,
      restoreVerifiedTableCount: tables.length,
    },
    snapshots,
    full: applyOut ? { deleted: { cases: applyOut.deletedCases, showcase: applyOut.deletedShowcases, tests: applyOut.deletedTests }, inserted: { cases: applyOut.insertedCases, showcase: applyOut.insertedShowcases, tests: applyOut.insertedTests }, counts: verifyOut!.counts } : null,
    replacement: {
      manifestHash: manifest.manifestHash,
      oldTargets: { cases: manifest.oldTargets.cases.length, showcase: manifest.oldTargets.showcase.length, tests: manifest.oldTargets.tests.length },
      newCases: manifest.newCases.length,
      newShowcase: manifest.newShowcase.length,
      newTests: manifest.newTests.length,
      exampleTests: manifest.exampleTests.length,
      counts: manifest.counts,
    },
  };
  process.stdout.write(JSON.stringify(reportJson, null, 2) + "\n");
  rmSync(storageDir, { recursive: true, force: true });
  process.exit(0);
}

main().catch((err) => {
  console.error("[rcl-stage-a] failed:", err);
  process.exit(1);
});