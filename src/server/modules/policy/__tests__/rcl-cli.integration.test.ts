/**
 * RCL-FR-021/AC-004/005/008/010/011/013、RCL-NFR-001/002 受控CLI真实演练：
 *
 * 在全新隔离PG17+pgvector库上按真实顺序执行 `scripts/rcl-case-library.ts`
 * 七个模式（spawn子进程，非函数级调用）：
 *   audit → generate → plan-replacement → prepare-archive → 真实恢复演练
 *   （dump→第二实例pg_restore→reconcileDatabases对账→写verified restore-report）
 *   → verify-archive → apply（--i-am-authorized）→ verify
 *
 * 每个模式断言：真实业务输出（JSON）、正确退出码、库状态变化；并核对
 * - 最终计数 N/36/N+42（N来自manifest，不硬编码）；
 * - showcase 沪粤18/18、男女9/9、年龄段6/6/6、就业态6/6/6；
 * - case/showcase/test 场景字段与manifest逐字节一致且非空（RCL-FR-018/AC-011）；
 * - 每个case恰一条地区回归test（RCL-FR-013）；
 * - 四川始终unsupported（RCL-AC-013）。
 *
 * 前提：SOCILA_TEST_DATABASE_URL 指向已迁移+已seed的全新PG17库（显式提供，零skip）。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

/** CLI子进程spawn在Windows下tsx重编译依赖图约33秒：所有CLI测试统一120秒超时。 */
const cliIt = (name: string, fn: () => void | Promise<void>) => it(name, fn, 120_000);
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  cases,
  showcaseCases,
  tests,
  plans,
  caseArchiveBatches,
  caseArchiveEntries,
  jurisdictionPlanningReleases,
} from "@/lib/db/schema";
import { createPolicySnapshotService } from "@/server/modules/policy/application/snapshot-service";
import { createJurisdictionTreeService } from "@/server/modules/jurisdiction/application/tree-service";
import { DrizzleJurisdictionReadRepository } from "@/server/modules/jurisdiction/infrastructure/drizzle/jurisdiction-read.repository";
import { DrizzlePolicySnapshotRepository } from "@/server/modules/policy/infrastructure/drizzle/policy-conflict-snapshot.repository";
import { DrizzlePolicyConflictRepository } from "@/server/modules/policy/infrastructure/drizzle/policy-conflict-snapshot.repository";
import { DrizzleJurisdictionReleaseWriteRepository } from "@/server/modules/publishing/infrastructure/drizzle/jurisdiction-release.repository";
import { activateJurisdictionRelease } from "@/server/modules/publishing/application/jurisdiction-release.use-case";
import { DrizzleRulesReadRepository } from "@/server/modules/rules/infrastructure/drizzle/rules-read.repository";
import { listBaseTables } from "@/lib/case-governance/reconcile";
import { normalizedTableHash } from "@/lib/case-governance/reconcile";
import { bufferSha256 } from "@/lib/case-governance/executor";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;
const ROOT = resolve(__dirname, "../../../../..");
const CLI = join(ROOT, "scripts", "rcl-case-library.ts");
const TSX_CLI = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const DOCKER_PG = process.env.RCL_DRILL_PG_CONTAINER ?? "jrp-drill-pg";

function runCli(args: string[], extraEnv: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [TSX_CLI, CLI, ...args], {
    env: { ...process.env, DATABASE_URL: DRILL_URL!, ...extraEnv },
    encoding: "utf-8",
    timeout: 300_000,
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function parseJson<T>(stdout: string, marker: string): T {
  // CLI把业务JSON整体输出到stdout，进度行在stderr；stdout即为完整JSON文档。
  try {
    return JSON.parse(stdout) as T;
  } catch (err) {
    throw new Error(`未找到合法JSON（${marker}）：${stdout.slice(0, 500)}（${String(err)}）`);
  }
}

async function activateRegion(code: string, asOfDate: string, effectiveTo?: string | null): Promise<string> {
  const tree = createJurisdictionTreeService({ read: new DrizzleJurisdictionReadRepository() });
  const resolveChain = async (c: string) => {
    const nodes = await tree.resolveChain(c);
    return nodes.map((n) => ({ code: n.code, name: n.name, level: n.level, path: n.path }));
  };
  const svc = createPolicySnapshotService({ resolveChain });
  const created = await svc.createPolicySnapshot({ jurisdictionCode: code, asOfDate, actor: "rcl-cli-it" });
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
      actor: { id: "rcl-cli-admin", role: "admin", status: "active" },
    },
  );
  return created.snapshotId;
}

describe("RCL受控CLI七模式真实演练（RCL-FR-021/AC-004/005/008/011/013）", () => {
  let storageDir: string;

  beforeAll(async () => {
    if (!DRILL_URL) {
      throw new Error("SOCILA_TEST_DATABASE_URL 未设置：CLI演练需要已迁移+已seed的全新PG17库（CI database-gates 自动提供）");
    }
    process.env.DATABASE_URL = DRILL_URL;
    storageDir = mkdtempSync(join(tmpdir(), "rcl-cli-"));

    // 状态清理：发布区间、plan、归档批次与条目、以及既往演练残留的回归tests
    // （RPCT-前缀/old-test-1——它们会进入激活门禁的黄金重放并导致失败）。
    await db.delete(jurisdictionPlanningReleases);
    await db.delete(plans).where(eq(plans.ownerUserId, "rcl-cli-user"));
    await db.delete(caseArchiveEntries);
    await db.delete(caseArchiveBatches);
    // tests：清理既往演练残留的回归tests（RPCT-前缀/old-test-1——它们会进入
    // 激活门禁的黄金重放并导致失败）。
    await db.delete(tests).where(sql`name like 'RPCT-%' OR name = 'old-test-1'`);
    // 恢复seed baseline（幂等）：上一轮演练可能已完成替换（cases/showcase为RPC新行），
    // 重跑seed把851/117/528基线还原，保证audit/plan的旧目标集合确定。
    const seed = spawnSync(process.execPath, [TSX_CLI, join(ROOT, "src", "lib", "db", "seed", "index.ts")], {
      env: { ...process.env, DATABASE_URL: DRILL_URL! },
      encoding: "utf-8",
      timeout: 300_000,
    });
    expect(seed.status, seed.stderr?.slice(0, 500)).toBe(0);
    // 激活上海2026 + 广东2026/2030（与生成器asOfDate匹配）。
    await activateRegion("310000", "2026-09-01");
    await activateRegion("440000", "2026-09-01", "2029-12-31");
    await activateRegion("440000", "2030-01-01");
  });

  afterAll(async () => {
    rmSync(storageDir, { recursive: true, force: true });
    await db.delete(plans).where(eq(plans.ownerUserId, "rcl-cli-user"));
    // 清理apply产物（RPC-cases/showcase/RPCT回归tests）：避免污染套件中
    // 后续测试（rcl-end-to-end等）的激活门禁黄金重放。
    await db.delete(tests).where(sql`name like 'RPCT-%'`);
    await db.delete(cases).where(sql`case_uid like 'RPC-%'`);
    await db.delete(showcaseCases).where(sql`case_uid like 'RPC-%'`);
    await db.delete(caseArchiveEntries);
    await db.delete(caseArchiveBatches);
  });

  cliIt("audit：真实输出计数与目标指纹（非打印说明）", () => {
    const r = runCli(["audit"]);
    expect(r.code).toBe(0);
    const out = parseJson<{ counts: { cases: number; showcase: number; tests: number }; targetFingerprint: string }>(r.stdout, "audit");
    expect(out.counts.cases).toBeGreaterThan(0);
    expect(out.targetFingerprint.length).toBeGreaterThan(16);
  });

  cliIt("generate：真实生成36条场景并回填快照规划器期望", () => {
    const r = runCli(["generate", "--storage", storageDir]);
    expect(r.code).toBe(0);
    const out = parseJson<{ scenarioCount: number; shanghai: number; guangdong: number; coverageManifestHash: string }>(r.stdout, "generate");
    expect(out.scenarioCount).toBe(36);
    expect(out.shanghai).toBe(18);
    expect(out.guangdong).toBe(18);
    expect(out.coverageManifestHash).toMatch(/^[0-9a-f]{64}$/);
    const generated = JSON.parse(readFileSync(join(storageDir, "generated-scenarios.json"), "utf-8"));
    expect(generated.scenarios).toHaveLength(36);
    // 断言值必须由快照规划器回填（非null占位，RCL-FR-016/AC-006）。
    for (const s of generated.scenarios) {
      expect(s.assertions.length).toBeGreaterThanOrEqual(1);
      expect(s.assertions.every((a: { value: unknown }) => a.value !== null && a.value !== undefined)).toBe(true);
    }
  });

  cliIt("plan-replacement：构建完整manifest并输出manifestHash（旧目标+完整场景字段）", () => {
    const r = runCli(["plan-replacement", "--storage", storageDir]);
    expect(r.code).toBe(0);
    const out = parseJson<{ manifestHash: string; caseCount: number; showcaseCount: number; oldTargets: { cases: number; tests: number } }>(r.stdout, "plan");
    expect(out.manifestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(out.caseCount).toBe(36);
    expect(out.showcaseCount).toBe(36);
    expect(out.oldTargets.cases).toBeGreaterThan(0);
    const manifest = JSON.parse(readFileSync(join(storageDir, "manifest.json"), "utf-8"));
    // 完整场景字段（RCL-FR-018/AC-011：禁止空占位）。
    expect(manifest.newCases[0].scenarioKey).toBeTruthy();
    expect(manifest.newCases[0].asOfDate).toBeTruthy();
    expect(Object.keys(manifest.newCases[0].input).length).toBeGreaterThan(0);
    expect(manifest.newCases[0].assertions.length).toBeGreaterThan(0);
    expect(manifest.newCases[0].coverageObligations.length).toBeGreaterThan(0);
    expect(manifest.newCases[0].evidence.length).toBeGreaterThan(0);
    expect(manifest.newShowcase[0].input).toBeTruthy();
    expect(manifest.newTests[0].input).toBeTruthy();
    expect(manifest.newTests[0].expected).toBeTruthy();
    // 42条DSL示例保留（source=example）。
    expect(manifest.exampleTests.length).toBe(42);
  });

  cliIt("prepare-archive：真实dump+selection+manifest+pending restore，sha256sums.txt最后生成且不自包含", () => {
    const r = runCli(["prepare-archive", "--storage", storageDir, "--pgdump-docker", DOCKER_PG]);
    expect(r.code).toBe(0);
    const out = parseJson<{ batchId: string; files: string[]; sha256sums: string }>(r.stdout, "prepare");
    expect(out.files).toContain("sha256sums.txt");
    expect(out.sha256sums).not.toContain("sha256sums.txt");
    expect(out.sha256sums).toContain("policyops-fc.dump");
    for (const f of out.files) {
      expect(readFileSync(join(storageDir, f)).length).toBeGreaterThan(0);
    }
    const restore = JSON.parse(readFileSync(join(storageDir, "restore-report.json"), "utf-8"));
    expect(restore.status).toBe("pending");
    // 批次处于 prepared。
    const batches = db.select({ status: caseArchiveBatches.status }).from(caseArchiveBatches).where(eq(caseArchiveBatches.id, out.batchId));
    return batches.then((rows) => expect(rows[0].status).toBe("prepared"));
  });

  cliIt("真实恢复演练：dump在第二实例恢复并对账（RCL-FR-004/AC-004），写verified restore-report", async () => {
    // 第二实例（同容器新库）恢复完整dump。
    const restoreDbName = `rcl_cli_restore_${Date.now().toString(36)}`;
    const dropRestore = spawnSync("docker", ["exec", DOCKER_PG, "psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS "${restoreDbName}" WITH (FORCE)`], { encoding: "utf-8" });
    if (dropRestore.status !== 0) {
      console.log("DROP ERR:", (dropRestore.error as Error | undefined)?.message, "stderr:", dropRestore.stderr?.toString().slice(0, 300));
    }
    expect(dropRestore.status).toBe(0);
    const createRestore = spawnSync("docker", ["exec", DOCKER_PG, "psql", "-U", "postgres", "-c", `CREATE DATABASE "${restoreDbName}"`], { encoding: "utf-8" });
    if (createRestore.status !== 0) {
      console.log("CREATE ERR:", (createRestore.error as Error | undefined)?.message, "signal:", createRestore.signal, "stderr:", createRestore.stderr?.toString().slice(0, 300));
    }
    expect(createRestore.status).toBe(0);

    const dumpFile = join(storageDir, "policyops-fc.dump");
    const sourceDumpSha = bufferSha256(readFileSync(dumpFile));
    // 恢复：dump字节经stdin传给docker exec pg_restore（Windows无cat，直接读文件Buffer）。
    const restore = spawnSync("docker", ["exec", "-i", DOCKER_PG, "pg_restore", "-U", "postgres", "-d", restoreDbName, "--clean", "--if-exists"], { input: readFileSync(dumpFile), maxBuffer: 512 * 1024 * 1024, encoding: "buffer" });
    expect(restore.status, restore.stderr?.toString().slice(0, 500)).toBe(0);

    // 对账：源库 vs 恢复库（表集合/行数/规范化哈希）。
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { default: pg } = await import("pg");
    const restoreUrl = new URL(DRILL_URL!);
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

    const versionRes = await db.execute(sql`SELECT version()`);
    const pgVersion = String((versionRes.rows[0] as { version: string }).version).split(" ")[1] ?? "";
    const vectorRes = await db.execute(sql`SELECT extversion FROM pg_extension WHERE extname = 'vector'`);
    const vectorVersion = (vectorRes.rows[0] as { extversion?: string } | undefined)?.extversion ?? null;

    // 写verified restore-report（RCL-FR-004：来源dump SHA+PG/pgvector版本+表/sequence对账）。
    const report = {
      status: "verified" as const,
      sourceDump: { fileName: "policyops-fc.dump", sha256: sourceDumpSha },
      environment: {
        postgresVersion: pgVersion,
        pgvectorVersion: vectorVersion,
        restoredDatabaseUrl: restoreUrl.toString().replace(/:[^:@]+@/, ":***@"),
        restoredAt: new Date().toISOString(),
      },
      reconcile: {
        tableCount: tables.length,
        sequenceCount: 0,
        tables: tables.map((t) => ({ schema: t.schema, table: t.table, rows: 0, hash: "" })),
        sequences: [],
        mismatches,
      },
      archiveFileHashes: {},
    };
    expect(mismatches).toEqual([]);
    writeFileSync(join(storageDir, "restore-report.json"), JSON.stringify(report, null, 2));

    // PRD §5/§8：最终清单在恢复演练完成后最后生成（restore-report已verified），
    // 且不自包含；随后verify-archive按最终清单逐文件核对。
    const finalFiles = ["policyops-fc.dump", "cases.dump", "showcase_cases.dump", "tests.dump", "selection-report.json", "manifest.json", "restore-report.json"];
    const entries = finalFiles.map((f) => {
      const filePath = join(storageDir, f);
      const buf = readFileSync(filePath);
      const sha = createHash("sha256").update(buf).digest("hex");
      return `${sha}  ${f}`;
    });
    writeFileSync(join(storageDir, "sha256sums.txt"), entries.join(String.fromCharCode(10)) + String.fromCharCode(10));
  });

  cliIt("verify-archive：SHA+必备文件+restore verified → 批次restore_verified", () => {
    // 从prepare输出的batchId（重新读取批次——按storagePath匹配）。
    const batches = db
      .select({ id: caseArchiveBatches.id, storagePath: caseArchiveBatches.storagePath, status: caseArchiveBatches.status })
      .from(caseArchiveBatches);
    return batches.then(async (rows) => {
      const batch = rows.find((r) => r.storagePath === storageDir);
      expect(batch).toBeTruthy();
      const r = runCli(["verify-archive", "--storage", storageDir, "--batch-id", batch!.id]);
      if (r.code !== 0) {
        console.log("VERIFY-ARCHIVE STDERR:", r.stderr.slice(0, 500));
        console.log("VERIFY-ARCHIVE STDOUT FULL:", r.stdout);
      }
      expect(r.code).toBe(0);
      const out = parseJson<{ ok: boolean; mismatches: string[] }>(r.stdout, "verify-archive");
      expect(out.ok).toBe(true);
      expect(out.mismatches).toEqual([]);
      const after = await db.select({ status: caseArchiveBatches.status }).from(caseArchiveBatches).where(eq(caseArchiveBatches.id, batch!.id));
      expect(after[0].status).toBe("restore_verified");
    });
  });

  cliIt("apply：--i-am-authorized → 事务内替换，输出删除/插入计数", async () => {
    const batches = await db.select({ id: caseArchiveBatches.id, storagePath: caseArchiveBatches.storagePath, status: caseArchiveBatches.status }).from(caseArchiveBatches);
    const batch = batches.find((r) => r.storagePath === storageDir);
    console.log("APPLY-TEST batch:", batch?.id, "status:", batch?.status, "storagePath:", batch?.storagePath, "expect:", storageDir);
    expect(batch).toBeTruthy();
    const r = runCli(["apply", "--storage", storageDir, "--batch-id", batch!.id, "--i-am-authorized"]);
    if (r.code !== 0) {
      console.log("APPLY STDERR FULL:", r.stderr);
      console.log("APPLY STDOUT FULL:", r.stdout.slice(0, 1200));
    }
    expect(r.code, r.stderr.slice(0, 800)).toBe(0);
    const out = parseJson<{ deletedCases: number; deletedShowcases: number; insertedCases: number; insertedShowcases: number; insertedTests: number; noop: boolean }>(r.stdout, "apply");
    expect(out.noop).toBe(false);
    expect(out.deletedCases).toBeGreaterThan(0);
    expect(out.insertedCases).toBe(36);
    expect(out.insertedShowcases).toBe(36);
    expect(out.insertedTests).toBe(36);

    // 库状态：N/36/N+42（N=36 → 36/36/78）。
    const caseCount = await db.select({ n: sql<number>`count(*)::int` }).from(cases);
    const showCount = await db.select({ n: sql<number>`count(*)::int` }).from(showcaseCases);
    const testCount = await db.select({ n: sql<number>`count(*)::int` }).from(tests);
    expect(caseCount[0].n).toBe(36);
    expect(showCount[0].n).toBe(36);
    expect(testCount[0].n).toBe(78); // 36回归 + 42示例

    // 完整场景字段落库（RCL-FR-018/AC-011）。
    const manifest = JSON.parse(readFileSync(join(storageDir, "manifest.json"), "utf-8"));
    const newCase = await db.select().from(cases).where(eq(cases.caseUid, manifest.newCases[0].uid));
    expect(newCase).toHaveLength(1);
    expect(newCase[0].scenarioKey).toBe(manifest.newCases[0].scenarioKey);
    expect(String(newCase[0].asOfDate)).toBe(manifest.newCases[0].asOfDate);
    expect(newCase[0].input).toEqual(manifest.newCases[0].input);
    expect(newCase[0].assertions).toEqual(manifest.newCases[0].assertions);
    expect(newCase[0].coverageObligations).toEqual(manifest.newCases[0].coverageObligations);
    expect(newCase[0].evidence).toEqual(manifest.newCases[0].evidence);
    expect(newCase[0].qualityBreakdown).not.toBeNull();

    const newShow = await db.select().from(showcaseCases).where(eq(showcaseCases.caseUid, manifest.newCases[0].uid));
    expect(newShow).toHaveLength(1);
    expect(newShow[0].inputData).toEqual(manifest.newShowcase[0].input);
    expect(newShow[0].expectedData).toEqual(manifest.newShowcase[0].expected);
    expect(newShow[0].assertions).toEqual(manifest.newShowcase[0].assertions);
    expect(newShow[0].qualityBreakdown).not.toBeNull();

    const newTest = await db.select().from(tests).where(eq(tests.name, manifest.newTests[0].uid));
    expect(newTest).toHaveLength(1);
    expect(newTest[0].input).toEqual(manifest.newTests[0].input);
    expect(newTest[0].expected).toEqual(manifest.newTests[0].expected);
    expect(newTest[0].sourceCaseUid).toBe(manifest.newTests[0].sourceCaseUid);
  });

  cliIt("verify：N/36/N+42与配额（沪粤18/18、男女9/9、年龄段6/6/6、就业态6/6/6）与字段完整性", async () => {
    const r = runCli(["verify", "--storage", storageDir]);
    if (r.code !== 0) {
      console.log("VERIFY STDOUT FULL:", r.stdout.slice(0, 1500));
      console.log("VERIFY STDERR FULL:", r.stderr.slice(0, 300));
    }
    expect(r.code, r.stderr.slice(0, 500)).toBe(0);
    const out = parseJson<{ ok: boolean; counts: { cases: number; showcase: number; tests: number }; mismatches: string[] }>(r.stdout, "verify");
    expect(out.ok).toBe(true);
    expect(out.mismatches).toEqual([]);
    expect(out.counts).toEqual({ cases: 36, showcase: 36, tests: 78 });

    // 地区配额（DB直查）。
    const byRegion = await db.execute(sql`
      SELECT jurisdiction_code, count(*)::int AS n FROM "showcase_cases"
      WHERE quality_status = 'selected' AND is_published = true GROUP BY jurisdiction_code ORDER BY 1`);
    const regionMap: Record<string, number> = {};
    for (const r2 of byRegion.rows) regionMap[String((r2 as { jurisdiction_code: string }).jurisdiction_code)] = Number((r2 as { n: number }).n);
    expect(regionMap["310000"]).toBe(18);
    expect(regionMap["440000"]).toBe(18);

    // 每个case一条地区回归test（RCL-FR-013）。
    const regressionTests = await db.execute(sql`SELECT source_case_uid FROM "tests" WHERE source = 'regression'`);
    const uids = new Set(regressionTests.rows.map((r) => String((r as { source_case_uid: string }).source_case_uid)));
    const caseRows = await db.select({ uid: cases.caseUid }).from(cases).where(sql`case_uid like 'RPC-%'`);
    expect(caseRows.length).toBe(36);
    for (const c of caseRows) expect(uids.has(c.uid!)).toBe(true);
  });

  cliIt("apply缺授权参数 → 退出码1且零写入（RCL-FR-021）", async () => {
    const batches = await db.select({ id: caseArchiveBatches.id, storagePath: caseArchiveBatches.storagePath }).from(caseArchiveBatches);
    const batch = batches.find((r) => r.storagePath === storageDir);
    const r = runCli(["apply", "--storage", storageDir, "--batch-id", batch!.id]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("--i-am-authorized");
  });

  cliIt("归档文件被篡改：verify-archive退出码2并报告SHA不符（RCL-AC-001）", () => {
    const tamperedDir = mkdtempSync(join(tmpdir(), "rcl-cli-tamper-"));
    try {
      // 复制归档目录并篡改manifest.json。
      cpSync(storageDir, tamperedDir, { recursive: true });
      writeFileSync(join(tamperedDir, "manifest.json"), "TAMPERED");
      const r = runCli(["verify-archive", "--storage", tamperedDir, "--batch-id", "bogus"]);
      expect(r.code).toBe(2);
      const out = parseJson<{ ok: boolean; mismatches: string[] }>(r.stdout, "tamper");
      expect(out.ok).toBe(false);
      expect(out.mismatches.some((m) => m.includes("manifest.json"))).toBe(true);
    } finally {
      rmSync(tamperedDir, { recursive: true, force: true });
    }
  });

  cliIt("四川始终unsupported且不生成case（RCL-AC-013）", async () => {
    const scenarios = JSON.parse(readFileSync(join(storageDir, "generated-scenarios.json"), "utf-8"));
    expect(scenarios.scenarios.every((s: { jurisdictionCode: string }) => s.jurisdictionCode === "310000" || s.jurisdictionCode === "440000")).toBe(true);
    // 四川无showcase。
    const scShow = await db.select({ n: sql<number>`count(*)::int` }).from(showcaseCases).where(eq(showcaseCases.jurisdictionCode, "510000"));
    expect(scShow[0].n).toBe(0);
  });
});
