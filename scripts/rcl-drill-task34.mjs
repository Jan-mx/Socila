/**
 * 任务34第三轮阶段二：pre dump恢复隔离实例 + 修复后CLI完整演练。
 *
 * 用法：
 *   node scripts/rcl-drill-task34.mjs <pre-dump路径> [--skip-prep]
 *
 * 流程（全部在任务专属隔离PG17+pgvector容器/库上，不触碰持久policyops）：
 *   1. 在任务容器创建 task34r3_pre 库，pg_restore pre dump；
 *   2. 核对pre基线：452 cases / 36 showcase / 500 regression + 28 example；
 *   3. 应用组合migration（0000→0018，幂等两次）；bootstrap×2；seed不执行
 *      （pre基线已有数据）；激活沪粤2026/2030非重叠快照区间；
 *   4. 修复后CLI完整流程：audit → generate → plan-replacement →
 *      prepare-archive（真实pg_dump）→ 真实恢复演练（第二库pg_restore +
 *      buildVerifiedRestoreReport全表/sequence对账）→ verify-archive →
 *      apply（--i-am-authorized）→ verify；apply复跑no-op；
 *   5. 断言最终 36 cases / 36 showcase / 42 example / 36 regression；
 *      manifest声明exampleTestCount=42、counts.tests=78；
 *      旧500 regression归档hash全部非空64位hex；
 *      restore-report含全部表与真实sequence明细。
 *   6. 篡改fail-closed抽查：篡改归档后verify-archive必须拒绝。
 *
 * 只读持久边界：本脚本不连接localhost:5432/policyops。
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";

const PRE_DUMP = process.argv[2];
const DRILL_CONTAINER = process.env.RCL_DRILL_PG_CONTAINER ?? "task34-r3-pg";
const DRILL_PORT = process.env.RCL_DRILL_PG_PORT ?? "5432";
const DRILL_PASSWORD = process.env.RCL_DRILL_PG_PASSWORD ?? "post" + "gres";
const BASE = `postgresql://postgres:${DRILL_PASSWORD}@127.0.0.1:${DRILL_PORT}`;
const PRE_DB = `task34r3_pre_${randomUUID().slice(0, 6)}`;
const RESTORE_DB = `task34r3_drill_restore_${randomUUID().slice(0, 6)}`;
const WORK_DIR = resolve(process.cwd());
const ROOT = WORK_DIR;
const TSX_CLI = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const CLI = join(ROOT, "scripts", "rcl-case-library.ts");

if (!PRE_DUMP) {
  console.error("用法：node scripts/rcl-drill-task34.mjs <pre-dump路径>");
  process.exit(1);
}
const PRE_URL = `${BASE}/${PRE_DB}`;

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
function psql(db, sqlText) {
  return run("docker", ["exec", DRILL_CONTAINER, "psql", "-U", "postgres", "-d", db, "-t", "-A", "-c", sqlText]);
}
function cli(args, dbUrl) {
  const r = spawnSync(process.execPath, [TSX_CLI, CLI, ...args], {
    env: { ...process.env, DATABASE_URL: dbUrl, RCL_DRILL_PG_CONTAINER: DRILL_CONTAINER },
    encoding: "utf-8",
    timeout: 600_000,
  });
  if (r.status !== 0) {
    throw new Error(`CLI ${args.join(" ")} 退出码 ${r.status}: ${(r.stderr || "").toString().slice(0, 1500)}`);
  }
  return r.stdout ?? "";
}

function activateRegion(url, code, asOfDate, effectiveTo) {
  // 经CLI侧createSnapshot+activate：用tsx内联脚本调用既有用例。
  const script = `
    import { db } from "@/lib/db";
    import { createPolicySnapshotService } from "@/server/modules/policy/application/snapshot-service";
    import { createJurisdictionTreeService } from "@/server/modules/jurisdiction/application/tree-service";
    import { DrizzleJurisdictionReadRepository } from "@/server/modules/jurisdiction/infrastructure/drizzle/jurisdiction-read.repository";
    import { DrizzlePolicySnapshotRepository } from "@/server/modules/policy/infrastructure/drizzle/policy-conflict-snapshot.repository";
    import { DrizzlePolicyConflictRepository } from "@/server/modules/policy/infrastructure/drizzle/policy-conflict-snapshot.repository";
    import { DrizzleJurisdictionReleaseWriteRepository } from "@/server/modules/publishing/infrastructure/drizzle/jurisdiction-release.repository";
    import { activateJurisdictionRelease } from "@/server/modules/publishing/application/jurisdiction-release.use-case";
    import { DrizzleRulesReadRepository } from "@/server/modules/rules/infrastructure/drizzle/rules-read.repository";
    const tree = createJurisdictionTreeService({ read: new DrizzleJurisdictionReadRepository() });
    const resolveChain = async (c) => (await tree.resolveChain(c)).map((n) => ({ code: n.code, name: n.name, level: n.level, path: n.path }));
    const svc = createPolicySnapshotService({ resolveChain });
    const created = await svc.createPolicySnapshot({ jurisdictionCode: ${JSON.stringify(code)}, asOfDate: ${JSON.stringify(asOfDate)}, actor: "rcl-drill-task34" });
    const releaseWrite = new DrizzleJurisdictionReleaseWriteRepository();
    await activateJurisdictionRelease(
      {
        requireAdmin: async () => ({ ok: true }),
        getSnapshot: async (snapshotId) => {
          const snap = await new DrizzlePolicySnapshotRepository().getSnapshot(snapshotId);
          if (!snap) return null;
          return {
            snapshot: { id: snap.snapshot.id, jurisdictionCode: snap.snapshot.jurisdictionCode, contentHash: snap.snapshot.contentHash, asOfDate: snap.snapshot.asOfDate },
            members: snap.members.map((m) => ({ entityType: m.entityType, businessKey: m.businessKey, payload: m.payload, provenance: m.provenance })),
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
      { jurisdictionCode: ${JSON.stringify(code)}, snapshotId: created.snapshotId, effectiveFrom: ${JSON.stringify(asOfDate)}, effectiveTo: ${effectiveTo === null ? "null" : JSON.stringify(effectiveTo)}, actor: { id: "rcl-drill-admin", role: "admin", status: "active" } },
    );
    console.log("activated", ${JSON.stringify(code)}, ${JSON.stringify(asOfDate)}, created.snapshotId);
    await db.$client.end?.();
    process.exit(0);
  `;
  // 临时脚本必须为.mts（ESM）且位于repo内：tsx对repo外CJS文件不支持顶层await。
  const f = join(ROOT, "scripts", ".tmp-rcl-drill-activate.mts");
  writeFileSync(f, script);
  try {
    run(process.execPath, [TSX_CLI, f], { DATABASE_URL: url });
  } finally {
    rmSync(f, { force: true });
  }
}

function main() {
  const storageDir = mkdtempSync(join(tmpdir(), "task34-r3-drill-"));
  try {
    // 1) 恢复pre dump到全新隔离库。
    console.log(`[drill] 恢复 pre dump → ${PRE_DB}`);
    docker("exec", DRILL_CONTAINER, "psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS "${PRE_DB}" WITH (FORCE)`);
    docker("exec", DRILL_CONTAINER, "psql", "-U", "postgres", "-c", `CREATE DATABASE "${PRE_DB}"`);
    docker("exec", DRILL_CONTAINER, "psql", "-U", "postgres", "-d", PRE_DB, "-c", "CREATE EXTENSION IF NOT EXISTS vector");
    docker("exec", DRILL_CONTAINER, "psql", "-U", "postgres", "-d", PRE_DB, "-c", "CREATE EXTENSION IF NOT EXISTS btree_gist");
    // pre dump含agent_app角色的GRANT：恢复前先创建角色（幂等，口令与drill一致）。
    docker("exec", DRILL_CONTAINER, "psql", "-U", "postgres", "-d", PRE_DB, "-c", `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_app') THEN CREATE ROLE agent_app LOGIN PASSWORD '${DRILL_PASSWORD}'; END IF; END $$;`);
    const restore = spawnSync("docker", ["exec", "-i", DRILL_CONTAINER, "pg_restore", "-U", "postgres", "-d", PRE_DB, "--clean", "--if-exists"], {
      input: readFileSync(PRE_DUMP), maxBuffer: 1024 * 1024 * 1024, encoding: "buffer",
    });
    if (restore.status !== 0) throw new Error(`pg_restore pre dump失败：${restore.stderr?.toString().slice(0, 400)}`);
    console.log(`[drill] pre dump SHA-256: ${createHash("sha256").update(readFileSync(PRE_DUMP)).digest("hex")}`);

    // 2) 核对pre基线（452/36/500+28）。
    const casesN = psql(PRE_DB, 'SELECT count(*) FROM "cases"').trim();
    const showN = psql(PRE_DB, 'SELECT count(*) FROM "showcase_cases"').trim();
    const regN = psql(PRE_DB, "SELECT count(*) FROM \"tests\" WHERE source = 'regression'").trim();
    const exN = psql(PRE_DB, "SELECT count(*) FROM \"tests\" WHERE source = 'example'").trim();
    console.log(`[drill] pre基线: cases=${casesN} showcase=${showN} regression=${regN} example=${exN}`);
    if (casesN !== "452" || showN !== "36" || regN !== "500" || exN !== "28") {
      throw new Error(`pre基线计数不符：${casesN}/${showN}/${regN}/${exN}`);
    }

    // 3) 补齐0017/0018并登记账本；migrator幂等复跑验证；bootstrap×2。
    // pre dump的账本created_at是WI-04修复前的未来时间戳（0016=1800000000000），
    // drizzle migrator按账本max created_at与journal when比较，0017/0018会被跳过；
    // 隔离库内手动应用0017/0018（幂等SQL）并登记账本（hash+when）。
    for (const [file, when] of [
      ["drizzle/0017_jurisdiction_snapshot_schedules.sql", "1788796800000"],
      ["drizzle/0018_case_library_rebuild.sql", "1788796860000"],
    ]) {
      const sqlText = readFileSync(join(ROOT, file), "utf-8");
      const hash = createHash("sha256").update(sqlText).digest("hex");
      docker("exec", "-i", DRILL_CONTAINER, "psql", "-U", "postgres", "-d", PRE_DB, "-c", sqlText);
      docker("exec", DRILL_CONTAINER, "psql", "-U", "postgres", "-d", PRE_DB, "-c",
        `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('${hash}', ${when})`);
    }
    // migrator幂等复跑：0017/0018的when < 账本max（1800000000000）→ 不重放。
    run("node", ["scripts/run-migrations.mjs"], { DATABASE_URL: PRE_URL });
    run("node", ["scripts/run-migrations.mjs"], { DATABASE_URL: PRE_URL });
    run("node", ["scripts/bootstrap-admin.mjs"], {
      DATABASE_URL: PRE_URL,
      ADMIN_USERNAME: "jan",
      ADMIN_PASSWORD_HASH: "$2b$12$YFb9CDK0.XzKfvyrq6bC2Ov5yjmZWuw1qHErXd3AV.V3o4MNTNcp.",
    });
    run("node", ["scripts/bootstrap-admin.mjs"], {
      DATABASE_URL: PRE_URL,
      ADMIN_USERNAME: "jan",
      ADMIN_PASSWORD_HASH: "$2b$12$YFb9CDK0.XzKfvyrq6bC2Ov5yjmZWuw1qHErXd3AV.V3o4MNTNcp.",
    });

    // 3.5) 激活前清理pre库遗留的发布区间与plan（与stage-a一致：pre库含
    //      WI-04历史release行，upsert会被既有行/约束影响）。
    docker("exec", DRILL_CONTAINER, "psql", "-U", "postgres", "-d", PRE_DB, "-c", "DELETE FROM jurisdiction_planning_releases");
    docker("exec", DRILL_CONTAINER, "psql", "-U", "postgres", "-d", PRE_DB, "-c", "DELETE FROM plans WHERE owner_user_id = 'rcl-drill-task34'");

    // 3.6) 同步42条DSL示例（seedMisc幂等：仅upsert规则集与示例tests，
    //      不重跑Excel导入，不触碰pre库cases/regression）——激活门禁的
    //      黄金测试需要地区DSL示例（pre库只有旧28条）。
    const seedScript = `
      import { discoverRegionDsl } from "@/lib/dsl/region-manifest";
      import { seedMisc } from "@/lib/db/seed/seed-misc";
      for (const region of discoverRegionDsl()) {
        await seedMisc(region);
      }
      console.log("seedMisc done");
      process.exit(0);
    `;
    const sf = join(ROOT, "scripts", ".tmp-rcl-drill-seedmisc.mts");
    writeFileSync(sf, seedScript);
    try {
      run(process.execPath, [TSX_CLI, sf], { DATABASE_URL: PRE_URL });
    } finally {
      rmSync(sf, { force: true });
    }

    // 4) 激活沪粤快照区间。
    activateRegion(PRE_URL, "310000", "2026-09-01", null);
    activateRegion(PRE_URL, "440000", "2026-09-01", "2029-12-31");
    activateRegion(PRE_URL, "440000", "2030-01-01", null);

    // 5) 修复后CLI完整流程。
    const auditOut = JSON.parse(cli(["audit"], PRE_URL));
    console.log(`[drill] audit: ${JSON.stringify(auditOut.counts)}`);
    cli(["generate", "--storage", storageDir], PRE_URL);
    const planOut = JSON.parse(cli(["plan-replacement", "--storage", storageDir], PRE_URL));
    console.log(`[drill] plan: manifestHash=${planOut.manifestHash} oldTests=${planOut.oldTargets.tests}`);
    const prepareOut = JSON.parse(cli(["prepare-archive", "--storage", storageDir, "--pgdump-docker", DRILL_CONTAINER], PRE_URL));
    console.log(`[drill] prepare: batchId=${prepareOut.batchId}`);

    // 6) 真实恢复演练：第二库恢复 + 真实报告 + 重算sha256sums。
    docker("exec", DRILL_CONTAINER, "psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS "${RESTORE_DB}" WITH (FORCE)`);
    docker("exec", DRILL_CONTAINER, "psql", "-U", "postgres", "-c", `CREATE DATABASE "${RESTORE_DB}"`);
    const dumpFile = join(storageDir, "policyops-fc.dump");
    const rest = spawnSync("docker", ["exec", "-i", DRILL_CONTAINER, "pg_restore", "-U", "postgres", "-d", RESTORE_DB, "--clean", "--if-exists"], {
      input: readFileSync(dumpFile), maxBuffer: 1024 * 1024 * 1024, encoding: "buffer",
    });
    if (rest.status !== 0) throw new Error(`pg_restore演练失败：${rest.stderr?.toString().slice(0, 400)}`);
    // 通过tsx内联调用buildVerifiedRestoreReport生成真实报告。
    const reportScript = `
      import { readFileSync, writeFileSync } from "node:fs";
      import { db } from "@/lib/db";
      import { drizzle } from "drizzle-orm/node-postgres";
      import pg from "pg";
      import { buildVerifiedRestoreReport } from "@/lib/case-governance/reconcile";
      const restoreUrl = new URL(${JSON.stringify(BASE)});
      restoreUrl.pathname = "/" + ${JSON.stringify(RESTORE_DB)};
      const pool = new pg.Pool({ connectionString: restoreUrl.toString() });
      const restoredDb = drizzle(pool);
      const report = await buildVerifiedRestoreReport({
        source: db,
        restored: restoredDb,
        dumpFilePath: ${JSON.stringify(dumpFile)},
        restoredDatabaseUrl: restoreUrl.toString().replace(/:[^:@]+@/, ":***@"),
        archiveDir: ${JSON.stringify(storageDir)},
      });
      await pool.end();
      if (report.reconcile.mismatches.length > 0) throw new Error("恢复对账不一致: " + report.reconcile.mismatches.join("; "));
      writeFileSync(${JSON.stringify(join(storageDir, "restore-report.json"))}, JSON.stringify(report, null, 2));
      console.log("restore-report verified", report.reconcile.tableCount, "tables", report.reconcile.sequenceCount, "sequences");
      process.exit(0);
    `;
    const rf = join(ROOT, "scripts", ".tmp-rcl-drill-report.mts");
    writeFileSync(rf, reportScript);
    try {
      run(process.execPath, [TSX_CLI, rf], { DATABASE_URL: PRE_URL });
    } finally {
      rmSync(rf, { force: true });
    }

    // 重算sha256sums（最后生成，含verified restore-report）。
    const finalFiles = ["policyops-fc.dump", "cases.dump", "showcase_cases.dump", "tests.dump", "selection-report.json", "manifest.json", "restore-report.json"];
    writeFileSync(join(storageDir, "sha256sums.txt"), finalFiles.map((f) => `${createHash("sha256").update(readFileSync(join(storageDir, f))).digest("hex")}  ${f}`).join("\n") + "\n");

    // 7) verify-archive → apply → verify → 复跑no-op。
    cli(["verify-archive", "--storage", storageDir, "--batch-id", prepareOut.batchId], PRE_URL);
    const applyOut = JSON.parse(cli(["apply", "--storage", storageDir, "--batch-id", prepareOut.batchId, "--i-am-authorized"], PRE_URL));
    console.log(`[drill] apply: deleted=${applyOut.deletedCases}/${applyOut.deletedShowcases}/${applyOut.deletedTests} inserted=${applyOut.insertedCases}/${applyOut.insertedShowcases}/${applyOut.insertedTests}`);
    const applyAgain = JSON.parse(cli(["apply", "--storage", storageDir, "--batch-id", prepareOut.batchId, "--i-am-authorized"], PRE_URL));
    if (!applyAgain.noop) throw new Error("apply复跑不是no-op");
    const verifyOut = JSON.parse(cli(["verify", "--storage", storageDir], PRE_URL));
    if (!verifyOut.ok) throw new Error(`verify失败: ${verifyOut.mismatches.join("; ")}`);
    console.log(`[drill] verify: ${JSON.stringify(verifyOut.counts)}`);

    // 8) 最终断言：36/36/42/36；manifest exampleTestCount=42 counts.tests=78。
    const manifest = JSON.parse(readFileSync(join(storageDir, "manifest.json"), "utf-8"));
    if (manifest.exampleTestCount !== 42) throw new Error(`exampleTestCount=${manifest.exampleTestCount} ≠ 42`);
    if (manifest.counts.tests !== 78) throw new Error(`counts.tests=${manifest.counts.tests} ≠ 78`);
    const cN = psql(PRE_DB, 'SELECT count(*) FROM "cases"').trim();
    const sN = psql(PRE_DB, 'SELECT count(*) FROM "showcase_cases"').trim();
    const rN = psql(PRE_DB, "SELECT count(*) FROM \"tests\" WHERE source = 'regression'").trim();
    const eN = psql(PRE_DB, "SELECT count(*) FROM \"tests\" WHERE source = 'example'").trim();
    console.log(`[drill] 最终: cases=${cN} showcase=${sN} regression=${rN} example=${eN}`);
    if (cN !== "36" || sN !== "36" || rN !== "36" || eN !== "42") throw new Error(`最终计数不符 ${cN}/${sN}/${rN}/${eN}`);

    // 9) 旧500 regression归档hash全部非空64位hex。
    const badHashes = psql(PRE_DB, `SELECT count(*) FROM "case_archive_entries" e JOIN "case_archive_batches" b ON b.id = e.archive_batch_id WHERE b.id = '${prepareOut.batchId}' AND e.entity_type = 'test' AND (e.content_hash IS NULL OR e.content_hash !~ '^[0-9a-f]{64}$')`).trim();
    if (badHashes !== "0") throw new Error(`旧regression归档hash非空检查失败：${badHashes}条非法`);

    // 10) 篡改fail-closed：篡改manifest.json后verify-archive必须拒绝。
    const tamperedDir = mkdtempSync(join(tmpdir(), "task34-r3-tamper-"));
    try {
      for (const f of finalFiles) {
        const buf = readFileSync(join(storageDir, f));
        writeFileSync(join(tamperedDir, f), buf);
      }
      writeFileSync(join(tamperedDir, "sha256sums.txt"), readFileSync(join(storageDir, "sha256sums.txt")));
      writeFileSync(join(tamperedDir, "manifest.json"), "TAMPERED");
      const r = spawnSync(process.execPath, [TSX_CLI, CLI, "verify-archive", "--storage", tamperedDir, "--batch-id", prepareOut.batchId], {
        env: { ...process.env, DATABASE_URL: PRE_URL },
        encoding: "utf-8", timeout: 300_000,
      });
      if (r.status === 0) throw new Error("篡改归档后verify-archive仍通过（必须fail-closed）");
      console.log("[drill] 篡改fail-closed通过");
    } finally {
      rmSync(tamperedDir, { recursive: true, force: true });
    }

    console.log("[drill] 阶段二演练全部通过");
  } finally {
    rmSync(storageDir, { recursive: true, force: true });
    for (const db of [PRE_DB, RESTORE_DB]) {
      try {
        docker("exec", DRILL_CONTAINER, "psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS "${db}" WITH (FORCE)`);
      } catch {
        // 忽略
      }
    }
  }
}

main();
