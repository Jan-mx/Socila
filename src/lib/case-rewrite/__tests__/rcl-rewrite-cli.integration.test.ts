/**
 * WI-20260911-03（SHV2-FR-019～023、AC-015～018）受控原位改写CLI真实演练：
 *
 * 前提：SOCILA_TEST_DATABASE_URL 指向已迁移（含0019）+已seed的全新PG17+pgvector库；
 * RCL_DRILL_PG_CONTAINER 提供pg_dump容器（与rcl-cli集成测试同约定）。
 *
 * 流程：清理并重建V1基线（seed→激活沪粤3区间→V1 CLI七模式替换为36/36/80）
 *   → generate-v2（真实快照）→ rewrite audit → 缺授权/错planHash/错targetFingerprint拒绝
 *   → 行漂移拒绝 → apply（108行原位升级、整数ID保留、1批次+108entries）
 *   → verify → 复跑noop → 篡改drift → before JSON状态重置 → 并发一执行一noop
 *   → 故障点注入回滚。
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, closeDatabase } from "@/lib/db";
import { buildVerifiedRestoreReport } from "@/lib/case-governance/reconcile";
import {
  jurisdictionPlanningReleases,
  caseArchiveBatches,
  caseArchiveEntries,
  caseRewriteBatches,
  caseRewriteEntries,
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

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;
const DOCKER_PG = process.env.RCL_DRILL_PG_CONTAINER ?? "jrp-drill-pg";
const TSX_CLI = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const RCL_CLI = join(process.cwd(), "scripts", "rcl-case-library.ts");
const REWRITE_CLI = join(process.cwd(), "scripts", "rcl-case-rewrite-v2.mjs");

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runCli(script: string, args: string[], extraEnv: Record<string, string> = {}): CliResult {
  const r = spawnSync(process.execPath, [TSX_CLI, script, ...args], {
    env: { ...process.env, DATABASE_URL: DRILL_URL!, ...extraEnv },
    encoding: "utf-8",
    timeout: 420_000,
  });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function parseOut<T>(r: CliResult, marker: string): T {
  try {
    return JSON.parse(r.stdout) as T;
  } catch {
    throw new Error(`[${marker}] stdout非JSON：${r.stdout.slice(0, 400)}｜stderr：${r.stderr.slice(0, 400)}`);
  }
}

async function activateRegion(code: string, asOfDate: string, effectiveTo?: string | null): Promise<void> {
  const tree = createJurisdictionTreeService({ read: new DrizzleJurisdictionReadRepository() });
  const resolveChain = async (c: string) => {
    const nodes = await tree.resolveChain(c);
    return nodes.map((n) => ({ code: n.code, name: n.name, level: n.level, path: n.path }));
  };
  const svc = createPolicySnapshotService({ resolveChain });
  const created = await svc.createPolicySnapshot({ jurisdictionCode: code, asOfDate, actor: "rewrite-it" });
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
      upsert: (data) => new DrizzleJurisdictionReleaseWriteRepository().upsertActiveRelease(data),
      now: () => new Date("2026-09-07T10:00:00.000Z"),
    },
    {
      jurisdictionCode: code,
      snapshotId: created.snapshotId,
      effectiveFrom: asOfDate,
      effectiveTo: effectiveTo ?? null,
      actor: { id: "rewrite-it-admin", role: "admin", status: "active" },
    },
  );
}

/** 用entries.before JSON把业务行恢复到V1（并清空审计批次），恢复后指纹与plan.targetFingerprint一致。 */
async function resetToV1FromEntries(planFile: string): Promise<void> {
  const plan = JSON.parse(readFileSync(planFile, "utf8")) as {
    entries: Array<{ entityType: string; entityId: number; before: Record<string, unknown> }>;
  };
  for (const e of plan.entries) {
    const table = e.entityType === "case" ? "cases" : e.entityType === "showcase_case" ? "showcase_cases" : "tests";
    const cols = Object.keys(e.before).filter((k) => k !== "id");
    const assignments = cols.map((c) => {
      const v = e.before[c];
      return sql`${sql.identifier(c)} = ${v !== null && typeof v === "object" ? JSON.stringify(v) : v as never}`;
    });
    await db.execute(sql`UPDATE ${sql.identifier(table)} SET ${sql.join(assignments, sql`, `)} WHERE id = ${e.entityId}`);
  }
  await db.delete(caseRewriteEntries);
  await db.delete(caseRewriteBatches);
}

const APPLY_ARGS = (planFile: string, planHash: string, targetFingerprint: string, generated: string) => [
  "apply",
  "--generated", generated,
  "--plan-file", planFile,
  "--i-am-authorized",
  "--plan-hash", planHash,
  "--target-fingerprint", targetFingerprint,
];

const DIRTY_ENV = { RCL_REWRITE_ALLOW_DIRTY: "1" };

describe.sequential("受控原位改写CLI真实演练（WI-20260911-03）", () => {
  let storageDir: string;
  let generated: string;
  let planFile: string;
  let planHash = "";
  let targetFingerprint = "";
  let finalFingerprint = "";
  let caseIdsBefore: number[] = [];

  beforeAll(async () => {
    if (!DRILL_URL) {
      throw new Error("SOCILA_TEST_DATABASE_URL 未设置：改写演练需要已迁移（含0019）+已seed的全新PG17库");
    }
    process.env.DATABASE_URL = DRILL_URL;
    storageDir = mkdtempSync(join(tmpdir(), "rcl-rewrite-"));

    // ── 状态清理与V1基线重建（与rcl-cli集成测试同流程）───────────────────
    await db.delete(caseRewriteEntries);
    await db.delete(caseRewriteBatches);
    await db.delete(caseArchiveEntries);
    await db.delete(caseArchiveBatches);
    await db.delete(jurisdictionPlanningReleases);
    await db.delete(plans).where(eq(plans.ownerUserId, "rcl-cli-user"));
    await db.delete(tests).where(sql`name like 'RPCT-%'`);
    const seed = spawnSync(process.execPath, [TSX_CLI, join(process.cwd(), "src", "lib", "db", "seed", "index.ts")], {
      env: { ...process.env, DATABASE_URL: DRILL_URL! },
      encoding: "utf-8",
      timeout: 300_000,
    });
    expect(seed.status, seed.stderr?.slice(0, 400)).toBe(0);
    await activateRegion("310000", "2026-09-01");
    await activateRegion("440000", "2026-09-01", "2029-12-31");
    await activateRegion("440000", "2030-01-01");

    const run = (args: string[], label: string): string => {
      const r = runCli(RCL_CLI, args);
      if (r.code !== 0) {
        throw new Error(`V1基线 ${label} 退出码${r.code}：${r.stderr.slice(0, 400)}｜stdout：${r.stdout.slice(0, 600)}`);
      }
      return r.stdout;
    };
    run(["generate", "--storage", storageDir], "generate");
    run(["plan-replacement", "--storage", storageDir], "plan-replacement");
    const prepareOut = run(["prepare-archive", "--storage", storageDir, "--pgdump-docker", DOCKER_PG], "prepare-archive");
    const prepared = JSON.parse(prepareOut) as { batchId: string };

    // 真实恢复演练（verify-archive前置，与e2e-rcl-setup同流程）：第二实例pg_restore
    // → buildVerifiedRestoreReport写verified报告 → 重算sha256sums。
    const { randomUUID } = await import("node:crypto");
    const restoreDbName = `rcl_rewrite_restore_${randomUUID().slice(0, 8)}`;
    const docker = (args: string[], input?: Buffer): Buffer =>
      spawnSync("docker", ["exec", input ? "-i" : "", DOCKER_PG, ...args].filter(Boolean), {
        input,
        maxBuffer: 512 * 1024 * 1024,
        encoding: "buffer",
      }).stdout;
    docker(["psql", "-U", "postgres", "-c", `DROP DATABASE IF EXISTS "${restoreDbName}" WITH (FORCE)`]);
    docker(["psql", "-U", "postgres", "-c", `CREATE DATABASE "${restoreDbName}"`]);
    const dumpFile = join(storageDir, "policyops-fc.dump");
    docker(["pg_restore", "-U", "postgres", "-d", restoreDbName, "--clean", "--if-exists"], readFileSync(dumpFile));
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { default: pg } = await import("pg");
    const restoreUrl = new URL(DRILL_URL!);
    restoreUrl.pathname = `/${restoreDbName}`;
    const pool = new pg.Pool({ connectionString: restoreUrl.toString() });
    const report = await buildVerifiedRestoreReport({
      source: db,
      restored: drizzle(pool) as never,
      dumpFilePath: dumpFile,
      restoredDatabaseUrl: restoreUrl.toString().replace(/:[^:@]+@/, ":***@"),
      archiveDir: storageDir,
    });
    await pool.end();
    if (report.reconcile.mismatches.length > 0) {
      throw new Error(`恢复对账不一致：${report.reconcile.mismatches.slice(0, 5).join(", ")}`);
    }
    writeFileSync(join(storageDir, "restore-report.json"), JSON.stringify(report, null, 2));
    const finalFiles = ["policyops-fc.dump", "cases.dump", "showcase_cases.dump", "tests.dump", "selection-report.json", "manifest.json", "restore-report.json"];
    writeFileSync(
      join(storageDir, "sha256sums.txt"),
      finalFiles.map((f) => `${createHash("sha256").update(readFileSync(join(storageDir, f))).digest("hex")}  ${f}`).join("\n") + "\n",
    );

    run(["verify-archive", "--storage", storageDir, "--batch-id", prepared.batchId], "verify-archive");
    run(["apply", "--storage", storageDir, "--batch-id", prepared.batchId, "--i-am-authorized"], "apply");
    const vr = parseOut<{ ok: boolean }>(runCli(RCL_CLI, ["verify", "--storage", storageDir]), "v1-verify");
    expect(vr.ok).toBe(true);

    // ── V2生成与改写计划 ────────────────────────────────────────────────
    run(["generate-v2", "--storage", storageDir], "generate-v2");
    generated = join(storageDir, "generated-scenarios-v2.json");

    const audit = parseOut<{ state: string; sourceFingerprint: string; mismatches: string[]; existingBatches: unknown[]; allV1: boolean; counts: { cases: number; showcases: number; regressionTests: number; exampleTests: number } }>(
      runCli(REWRITE_CLI, ["audit", "--generated", generated], DIRTY_ENV),
      "rewrite-audit",
    );
    expect(audit.mismatches, JSON.stringify(audit.mismatches)).toEqual([]);
    expect(audit.allV1).toBe(true);
    expect(audit.state, JSON.stringify({ mismatches: audit.mismatches, batches: audit.existingBatches })).toBe("pending");
    expect(audit.counts).toMatchObject({ cases: 36, showcases: 36, regressionTests: 36, exampleTests: 44 });
    targetFingerprint = audit.sourceFingerprint;

    const planOut = parseOut<{ planHash: string; targetFingerprint: string; finalFingerprint: string; entries: number }>(
      runCli(REWRITE_CLI, ["plan", "--generated", generated, "--out", storageDir], DIRTY_ENV),
      "rewrite-plan",
    );
    expect(planOut.entries).toBe(108);
    expect(planOut.targetFingerprint).toBe(targetFingerprint);
    planHash = planOut.planHash;
    finalFingerprint = planOut.finalFingerprint;
    planFile = join(storageDir, "rewrite-plan-v2.json");

    caseIdsBefore = (await db.select({ id: cases.id }).from(cases).orderBy(cases.id)).map((r) => r.id);
  }, 900_000);

  afterAll(async () => {
    if (!process.env.RCL_REWRITE_KEEP_STORAGE) {
      rmSync(storageDir, { recursive: true, force: true });
    }
    await db.delete(caseRewriteEntries);
    await db.delete(caseRewriteBatches);
    await db.delete(caseArchiveEntries);
    await db.delete(caseArchiveBatches);
    await db.delete(tests).where(sql`name like 'RPCT-%'`);
    await db.delete(cases).where(sql`case_uid like 'RPC-%'`);
    await db.delete(showcaseCases).where(sql`case_uid like 'RPC-%'`);
    await db.delete(jurisdictionPlanningReleases);
    await closeDatabase();
  });

  it("apply缺授权/错planHash/错targetFingerprint → 零写入拒绝", async () => {
    const batchesBefore = (await db.select({ n: sql<number>`count(*)` }).from(caseRewriteBatches))[0].n;
    const noAuth = runCli(REWRITE_CLI, APPLY_ARGS(planFile, planHash, targetFingerprint, generated).filter((a) => a !== "--i-am-authorized"), DIRTY_ENV);
    expect(noAuth.code).toBe(2);
    const badHash = runCli(REWRITE_CLI, APPLY_ARGS(planFile, "0".repeat(64), targetFingerprint, generated), DIRTY_ENV);
    expect(badHash.code).toBe(3);
    const badFp = runCli(REWRITE_CLI, APPLY_ARGS(planFile, planHash, "0".repeat(64), generated), DIRTY_ENV);
    expect(badFp.code).toBe(4);
    const batchesAfter = (await db.select({ n: sql<number>`count(*)` }).from(caseRewriteBatches))[0].n;
    expect(batchesAfter).toBe(batchesBefore);
    const v1Left = (await db.select({ n: sql<number>`count(*)` }).from(cases).where(eq(cases.generatorVersion, "RCL-GEN-1.0")))[0].n;
    expect(Number(v1Left)).toBe(36);
  });

  it("行漂移（apply前篡改任一case）→ 指纹失配拒绝且零写入；恢复后apply成功", async () => {
    const target = (await db.select({ id: cases.id, scenarioKey: cases.scenarioKey, caseText: cases.caseText }).from(cases).orderBy(cases.id))[5];
    await db.update(cases).set({ caseText: (target.caseText ?? "") + "drift" }).where(eq(cases.id, target.id));
    const drift = runCli(REWRITE_CLI, APPLY_ARGS(planFile, planHash, targetFingerprint, generated), DIRTY_ENV);
    expect(drift.code).toBe(4);
    expect(await countBatches()).toBe(0);
    await db.update(cases).set({ caseText: target.caseText }).where(eq(cases.id, target.id));

    const apply = runCli(REWRITE_CLI, APPLY_ARGS(planFile, planHash, targetFingerprint, generated), DIRTY_ENV);
    expect(apply.code, JSON.stringify({ stderr: apply.stderr.slice(0, 800), stdout: apply.stdout.slice(0, 800) })).toBe(0);
    const out = parseOut<{ applied: boolean; noop: boolean; entries: number }>(apply, "apply");
    expect(out.applied).toBe(true);
    expect(out.noop).toBe(false);
    expect(out.entries).toBe(108);

    // 108行原位升级：整数ID保留、V2 UID、case_text非空、transcript NULL。
    const caseIdsAfter = (await db.select({ id: cases.id }).from(cases).orderBy(cases.id)).map((r) => r.id);
    expect(caseIdsAfter).toEqual(caseIdsBefore);
    const v2Cases = await db.select().from(cases);
    expect(v2Cases).toHaveLength(36);
    for (const c of v2Cases) {
      expect(c.caseUid!.endsWith("-V2")).toBe(true);
      expect(c.generatorVersion).toBe("RCL-GEN-2.0");
      expect((c.caseText ?? "").length).toBeGreaterThan(200);
      expect(c.transcriptText).toBeNull();
    }
    const v2Showcases = await db.select().from(showcaseCases);
    expect(v2Showcases).toHaveLength(36);
    for (const s of v2Showcases) {
      expect(s.userMessage).not.toBe("确定性模板生成的政策案例（无真实用户数据）");
      expect(s.aiResponse).not.toBe("由修复后的快照规划器计算期望");
      expect(s.generatorVersion).toBe("RCL-GEN-2.0");
    }
    const regression = await db.select().from(tests).where(eq(tests.source, "regression"));
    expect(regression).toHaveLength(36);
    for (const t of regression) {
      expect(t.name!.endsWith("-V2")).toBe(true);
      expect(t.lastRunResult).toBeNull();
      expect(t.lastRunAt).toBeNull();
    }
    // 计数与examples不变。
    const counts = await db.execute(sql`SELECT
      (SELECT count(*)::int FROM cases) AS cases,
      (SELECT count(*)::int FROM showcase_cases) AS showcases,
      (SELECT count(*)::int FROM tests) AS tests,
      (SELECT count(*)::int FROM tests WHERE source = 'example') AS examples`);
    const row = counts.rows[0] as Record<string, number>;
    expect(row).toMatchObject({ cases: 36, showcases: 36, tests: 80, examples: 44 });
    // 恰好1个批次+108条entries，before/after完整。
    const batches = await db.select().from(caseRewriteBatches);
    expect(batches).toHaveLength(1);
    expect(batches[0].planHash).toBe(planHash);
    expect(batches[0].status).toBe("applied");
    expect(batches[0].targetGeneratorVersion).toBe("RCL-GEN-2.0");
    const entries = await db.select().from(caseRewriteEntries);
    expect(entries).toHaveLength(108);
    for (const e of entries) {
      expect(e.before).toBeTruthy();
      expect(e.after).toBeTruthy();
      expect(e.newUid!.endsWith("-V2")).toBe(true);
    }
    const byType = { case: 0, showcase_case: 0, test: 0 };
    for (const e of entries) byType[e.entityType as keyof typeof byType] += 1;
    expect(byType).toEqual({ case: 36, showcase_case: 36, test: 36 });
  });

  it("verify：最终状态、批次与entries审计一致 → ok", () => {
    const r = runCli(REWRITE_CLI, ["verify", "--generated", generated, "--plan-file", planFile], DIRTY_ENV);
    expect(r.code, r.stderr.slice(0, 400)).toBe(0);
    const out = parseOut<{ ok: boolean; problems: string[] }>(r, "verify");
    expect(out.ok).toBe(true);
    expect(out.problems).toEqual([]);
  });

  it("复跑同一计划 → noop:true且不新增批次/entries", async () => {
    const before = await countBatchesWithEntries();
    const r = runCli(REWRITE_CLI, APPLY_ARGS(planFile, planHash, targetFingerprint, generated), DIRTY_ENV);
    expect(r.code, r.stderr.slice(0, 400)).toBe(0);
    const out = parseOut<{ noop: boolean; applied: boolean }>(r, "noop");
    expect(out.noop).toBe(true);
    expect(out.applied).toBe(false);
    const after = await countBatchesWithEntries();
    expect(after.batches).toBe(before.batches);
    expect(after.entries).toBe(before.entries);
  });

  it("applied状态下行被篡改 → 复跑返回稳定state drift（零写入）；从entries.after恢复后复跑noop", async () => {
    const victim = (await db.select().from(caseRewriteEntries).where(eq(caseRewriteEntries.entityType, "case")).limit(1))[0];
    const after = victim.after as Record<string, unknown>;
    const originalCaseText = String(after.case_text);
    await db.execute(sql`UPDATE cases SET case_text = case_text || 'x' WHERE id = ${victim.entityId}`);
    const drift = runCli(REWRITE_CLI, APPLY_ARGS(planFile, planHash, targetFingerprint, generated), DIRTY_ENV);
    expect(drift.code).toBe(5);
    const restored = await db.execute(sql`SELECT case_text FROM cases WHERE id = ${victim.entityId}`);
    await db.execute(
      sql`UPDATE cases SET case_text = ${originalCaseText} WHERE id = ${victim.entityId}`,
    );
    void restored;
    const rerun = runCli(REWRITE_CLI, APPLY_ARGS(planFile, planHash, targetFingerprint, generated), DIRTY_ENV);
    expect(rerun.code).toBe(0);
    expect(parseOut<{ noop: boolean }>(rerun, "rerun").noop).toBe(true);
  });

  it("并发两个相同apply（重置到V1后）：一方applied、另一方noop", { timeout: 600_000 }, async () => {
    await resetToV1FromEntries(planFile);
    const fp = parseOut<{ sourceFingerprint: string }>(
      runCli(REWRITE_CLI, ["audit", "--generated", generated], DIRTY_ENV),
      "audit-2",
    );
    expect(fp.sourceFingerprint).toBe(targetFingerprint);
    const env = { ...process.env, DATABASE_URL: DRILL_URL!, ...DIRTY_ENV };
    const args = [TSX_CLI, REWRITE_CLI, ...APPLY_ARGS(planFile, planHash, targetFingerprint, generated)];
    // 真正并行：同时spawn两个apply，advisory lock裁决一方执行、另一方noop。
    const { spawn } = await import("node:child_process");
    const run = () =>
      new Promise<{ code: number; out: string; err: string }>((resolve) => {
        const p = spawn(process.execPath, args, { env });
        let out = "";
        let err = "";
        p.stdout.on("data", (d) => (out += String(d)));
        p.stderr.on("data", (d) => (err += String(d)));
        p.on("close", (code) => resolve({ code: code ?? -1, out, err }));
      });
    const results = await Promise.all([run(), run()]);
    const applied = results.filter((r) => r.code === 0 && /"applied":\s*true/.test(r.out));
    const noop = results.filter((r) => r.code === 0 && /"noop":\s*true/.test(r.out));
    expect(applied, JSON.stringify(results.map((r) => ({ code: r.code, out: r.out.slice(0, 200), err: r.err.slice(0, 200) })))).toHaveLength(1);
    expect(noop).toHaveLength(1);
  });

  it("故障点注入：事务内失败整体回滚（无批次、业务行保持V1、指纹不变）", { timeout: 600_000 }, async () => {
    await resetToV1FromEntries(planFile);
    const inject = runCli(REWRITE_CLI, APPLY_ARGS(planFile, planHash, targetFingerprint, generated), {
      ...DIRTY_ENV,
      RCL_REWRITE_INJECT_FAILURE_AT: "after_updates",
    });
    expect(inject.code).not.toBe(0);
    expect(await countBatches()).toBe(0);
    const v1Left = (await db.select({ n: sql<number>`count(*)` }).from(cases).where(eq(cases.generatorVersion, "RCL-GEN-1.0")))[0].n;
    expect(Number(v1Left)).toBe(36);
    const audit = parseOut<{ sourceFingerprint: string }>(
      runCli(REWRITE_CLI, ["audit", "--generated", generated], DIRTY_ENV),
      "audit-3",
    );
    expect(audit.sourceFingerprint).toBe(targetFingerprint);
    // 注入回滚后正常apply仍成功（幂等入口未被破坏）。
    const apply = runCli(REWRITE_CLI, APPLY_ARGS(planFile, planHash, targetFingerprint, generated), DIRTY_ENV);
    expect(apply.code, apply.stderr.slice(0, 400)).toBe(0);
    expect(parseOut<{ applied: boolean }>(apply, "apply-2").applied).toBe(true);
  });

  it("持久库名policyops默认拒绝（RCL_REWRITE_ALLOW_PERSISTENT未设置时零写入）", () => {
    const fakeUrl = "postgresql://postgres:postgres@localhost:5432/policyops";
    const r = spawnSync(process.execPath, [TSX_CLI, REWRITE_CLI, ...APPLY_ARGS(planFile, planHash, targetFingerprint, generated)], {
      env: { ...process.env, DATABASE_URL: fakeUrl, ...DIRTY_ENV },
      encoding: "utf-8",
      timeout: 120_000,
    });
    // 守卫在连接前触发：退出码2且未发生任何写入（目标库不可达也无妨）。
    expect(r.status, JSON.stringify({ stdout: (r.stdout ?? "").slice(0, 400), stderr: (r.stderr ?? "").slice(0, 400) })).toBe(2);
  });
});

async function countBatches(): Promise<number> {
  const rows = await db.select({ n: sql<number>`count(*)` }).from(caseRewriteBatches);
  return Number(rows[0].n);
}

async function countBatchesWithEntries(): Promise<{ batches: number; entries: number }> {
  const b = await countBatches();
  const e = await db.select({ n: sql<number>`count(*)` }).from(caseRewriteEntries);
  return { batches: b, entries: Number(e[0].n) };
}
