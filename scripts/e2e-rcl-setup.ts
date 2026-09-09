/**
 * 任务4 Chromium E2E 前置数据准备（RCL-AC-008/011/012/013/015）：
 *
 * 在全新隔离 E2E 库（已 migration + bootstrap + seed）上经真实受控CLI完成
 * 沪粤快照激活与案例库替换演练：
 *   激活快照 → audit → generate → plan-replacement → prepare-archive（真实pg_dump）
 *   → 真实恢复演练（第二实例pg_restore+reconcile对账+verified restore-report
 *   +重算sha256sums）→ verify-archive → apply（--i-am-authorized）→ verify
 *
 * 使E2E能精确断言：公开36条、沪粤18/18、治理字段非空、管理过滤与权限。
 *
 * 用法：SOCILA_E2E_DATABASE_URL=<连接串> [RCL_DRILL_PG_CONTAINER=<容器>]
 *   npx tsx scripts/e2e-rcl-setup.ts
 * 输出：仓库根 .e2e-rcl-state.json（{batchId, manifestHash, counts}；跑完即删）。
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
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

const E2E_URL = process.env.SOCILA_E2E_DATABASE_URL;
if (!E2E_URL) {
  console.error("[e2e-rcl-setup] SOCILA_E2E_DATABASE_URL 未设置");
  process.exit(1);
}
process.env.DATABASE_URL = E2E_URL!;

const ROOT = resolve(process.cwd());
const CLI = join(ROOT, "scripts", "rcl-case-library.ts");
const TSX_CLI = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const DOCKER_PG = process.env.RCL_DRILL_PG_CONTAINER ?? "jrp-drill-pg";

function runCli(args: string[]): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [TSX_CLI, CLI, ...args], {
    env: { ...process.env, DATABASE_URL: E2E_URL! },
    encoding: "utf-8",
    timeout: 300_000,
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

async function activateRegion(code: string, asOfDate: string, effectiveTo?: string | null): Promise<void> {
  const tree = createJurisdictionTreeService({ read: new DrizzleJurisdictionReadRepository() });
  const resolveChain = async (c: string) => {
    const nodes = await tree.resolveChain(c);
    return nodes.map((n) => ({ code: n.code, name: n.name, level: n.level, path: n.path }));
  };
  const svc = createPolicySnapshotService({ resolveChain });
  const created = await svc.createPolicySnapshot({ jurisdictionCode: code, asOfDate, actor: "e2e-rcl-setup" });
  const releaseWrite = new DrizzleJurisdictionReleaseWriteRepository();
  await activateJurisdictionRelease(
    {
      requireAdmin: async () => ({ ok: true }),
      getSnapshot: async (snapshotId) => {
        const snap = await new DrizzlePolicySnapshotRepository().getSnapshot(snapshotId);
        if (!snap) return null;
        return {
          snapshot: {
            id: snap.snapshot.id,
            jurisdictionCode: snap.snapshot.jurisdictionCode,
            contentHash: snap.snapshot.contentHash,
            asOfDate: snap.snapshot.asOfDate,
          },
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
      actor: { id: "e2e-rcl-admin", role: "admin", status: "active" },
    },
  );
}

async function main() {
  // 0) 恢复seed baseline（幂等）：上一轮演练可能已完成替换（851→RPC新行），
  //    重跑seed把851/117/528基线还原，保证plan-replacement的旧目标集合确定。
  const seed = spawnSync(process.execPath, [TSX_CLI, join(ROOT, "src", "lib", "db", "seed", "index.ts")], {
    env: { ...process.env, DATABASE_URL: E2E_URL! },
    encoding: "utf-8",
    timeout: 300_000,
  });
  if (seed.status !== 0) {
    throw new Error(`seed恢复失败：${seed.stderr?.slice(0, 300)}`);
  }

  // 1) 状态清理与快照激活。
  await db.delete(jurisdictionPlanningReleases);
  await db.delete(plans).where(eq(plans.ownerUserId, "e2e-rcl-user"));
  await db.delete(caseArchiveEntries);
  await db.delete(caseArchiveBatches);
  await db.delete(tests).where(sql`name like 'RPCT-%'`);
  await db.delete(cases).where(sql`case_uid like 'RPC-%'`);
  await db.delete(showcaseCases).where(sql`case_uid like 'RPC-%'`);
  await activateRegion("310000", "2026-09-01");
  await activateRegion("440000", "2026-09-01", "2029-12-31");
  await activateRegion("440000", "2030-01-01");

  // 2) 受控CLI七模式真实演练。
  const storageDir = join(tmpdir(), `rcl-e2e-${Date.now().toString(36)}`);
  mkdirSync(storageDir, { recursive: true });

  const run = (args: string[], expectCode: number, label: string): string => {
    const r = runCli(args);
    if (r.code !== expectCode) {
      throw new Error(`[e2e-rcl-setup] ${label} 退出码 ${r.code}≠${expectCode}：${r.stderr.slice(0, 500)}`);
    }
    return r.stdout;
  };

  run(["generate", "--storage", storageDir], 0, "generate");
  run(["plan-replacement", "--storage", storageDir], 0, "plan-replacement");
  const prepareOut = run(["prepare-archive", "--storage", storageDir, "--pgdump-docker", DOCKER_PG], 0, "prepare-archive");
  const prepared = JSON.parse(prepareOut) as { batchId: string };

  // 3) 真实恢复演练：dump → 第二实例 pg_restore → reconcile 对账 → verified restore-report。
  const restoreDbName = `rcl_e2e_restore_${randomUUID().slice(0, 8)}`;
  const drop = spawnSync("docker", ["exec", DOCKER_PG, "psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS "${restoreDbName}" WITH (FORCE)`], { encoding: "utf-8" });
  if (drop.status !== 0) throw new Error(`drop restore db失败：${drop.stderr?.slice(0, 300)}`);
  const create = spawnSync("docker", ["exec", DOCKER_PG, "psql", "-U", "postgres", "-c", `CREATE DATABASE "${restoreDbName}"`], { encoding: "utf-8" });
  if (create.status !== 0) throw new Error(`create restore db失败：${create.stderr?.slice(0, 300)}`);

  const dumpFile = join(storageDir, "policyops-fc.dump");
  const restore = spawnSync("docker", ["exec", "-i", DOCKER_PG, "pg_restore", "-U", "postgres", "-d", restoreDbName, "--clean", "--if-exists"], {
    input: readFileSync(dumpFile),
    maxBuffer: 512 * 1024 * 1024,
    encoding: "buffer",
  });
  if (restore.status !== 0) throw new Error(`pg_restore失败：${restore.stderr?.toString().slice(0, 500)}`);

  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { default: pg } = await import("pg");
  const restoreUrl = new URL(E2E_URL!);
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
  const vectorVersion = (vectorRes.rows[0] as { extversion?: string } | undefined)?.extversion ?? null;
  const dumpBuf = readFileSync(dumpFile);
  const report = {
    status: "verified" as const,
    sourceDump: { fileName: "policyops-fc.dump", sha256: createHash("sha256").update(dumpBuf).digest("hex") },
    environment: {
      postgresVersion: pgVersion,
      pgvectorVersion: vectorVersion,
      restoredDatabaseUrl: restoreUrl.toString().replace(/:[^:@]+@/, ":***@"),
      restoredAt: new Date().toISOString(),
    },
    reconcile: { tableCount: tables.length, sequenceCount: 0, tables: [], sequences: [], mismatches },
    archiveFileHashes: {},
  };
  writeFileSync(join(storageDir, "restore-report.json"), JSON.stringify(report, null, 2));
  // 重算sha256sums.txt（restore-report已最终化，最后生成且不自包含）。
  const finalFiles = ["policyops-fc.dump", "cases.dump", "showcase_cases.dump", "tests.dump", "selection-report.json", "manifest.json", "restore-report.json"];
  const entries = finalFiles.map((f) => `${createHash("sha256").update(readFileSync(join(storageDir, f))).digest("hex")}  ${f}`);
  writeFileSync(join(storageDir, "sha256sums.txt"), entries.join("\n") + "\n");

  // 4) verify-archive → apply → verify。
  run(["verify-archive", "--storage", storageDir, "--batch-id", prepared.batchId], 0, "verify-archive");
  const applyOut = run(["apply", "--storage", storageDir, "--batch-id", prepared.batchId, "--i-am-authorized"], 0, "apply");
  const applied = JSON.parse(applyOut) as { insertedCases: number; insertedShowcases: number; insertedTests: number };
  const verifyOut = run(["verify", "--storage", storageDir], 0, "verify");
  const verified = JSON.parse(verifyOut) as { ok: boolean; counts: { cases: number; showcase: number; tests: number } };
  if (!verified.ok) throw new Error("verify 未通过");

  writeFileSync(
    resolve(ROOT, ".e2e-rcl-state.json"),
    JSON.stringify(
      { batchId: prepared.batchId, applied, counts: verified.counts, storageDir },
      null,
      2,
    ),
  );

  // 任务3 spec 的 state（JRP-AC-009 跨地区停用需要沪粤 releaseId）：从库读取。
  const shRel = await new DrizzleJurisdictionReleaseWriteRepository().getByJurisdiction("310000");
  const gdRel = await new DrizzleJurisdictionReleaseWriteRepository().getByJurisdiction("440000");
  if (!shRel || !gdRel) throw new Error("沪粤release缺失");
  // 按2026-09-01 asOfDate取快照：task3的JRP-AC-009在2026区间上操作，
  // 用2030快照激活2026区间会撞 active_snapshot_id 唯一约束。
  const snapRows = await db.execute(sql`SELECT id, content_hash FROM "policy_snapshots" WHERE jurisdiction_code = '310000' AND as_of_date = '2026-09-01' ORDER BY created_at DESC LIMIT 1`);
  const gdSnapRows = await db.execute(sql`SELECT id, content_hash FROM "policy_snapshots" WHERE jurisdiction_code = '440000' AND as_of_date = '2026-09-01' ORDER BY created_at DESC LIMIT 1`);
  writeFileSync(
    resolve(ROOT, ".e2e-task3-state.json"),
    JSON.stringify(
      {
        sh: { snapshotId: String((snapRows.rows[0] as { id: string }).id), releaseId: shRel.id, jurisdictionCode: "310000" },
        gd: { snapshotId: String((gdSnapRows.rows[0] as { id: string }).id), releaseId: gdRel.id, jurisdictionCode: "440000" },
      },
      null,
      2,
    ),
  );
  console.log(
    `[e2e-rcl-setup] ok: batch=${prepared.batchId} counts=${JSON.stringify(verified.counts)}`,
  );
  rmSync(storageDir, { recursive: true, force: true });
  process.exit(0);
}

main().catch((err) => {
  console.error("[e2e-rcl-setup] failed:", err);
  process.exit(1);
});
