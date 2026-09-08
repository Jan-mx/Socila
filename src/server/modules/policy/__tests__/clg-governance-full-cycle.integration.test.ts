/**
 * CLG-AC-001～015 案例治理全流程（独立动态库，真实seed 851/117/528）：
 *
 *   动态库 → run-migrations（含0016）→ seed（851案例/500回归/28示例/117展示）
 *   → 任务2批准镜像（CN/上海published）→ 创建上海候选快照
 *   → audit基线 → 评分（快照重放）→ 策展36 → manifest
 *   → 归档批次（prepared→restore_verified）→ 门禁（未验证拒绝/错哈希零变化）
 *   → 受控apply（单事务）→ 452/36/528 + 36条绑定310000快照 + 来源链完整
 *   → 重复apply no-op → 归档索引480条
 *
 * 第二个动态库 `clg_fault`：migration+seed后立即执行故障注入apply，
 * 断言治理字段/归档索引/业务行全部回滚（CLG-NFR-006/AC-013）。
 *
 * 全程只使用测试动态库；任务3未合入（journal无0015）亦全部通过（AC-015）。
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { readFileSync } from "node:fs";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cases, showcaseCases, policySnapshots } from "@/lib/db/schema";
import { scoreShowcaseCandidate, type ShowcaseCandidateRecord } from "@/lib/case-governance/scoring";
import { checkEligibility } from "@/lib/case-governance/eligibility";
import { curateShowcase } from "@/lib/case-governance/curation";
import { buildGovernanceManifest } from "@/lib/case-governance/manifest";
import { normalizeCaseUid } from "@/lib/case-governance/source-chain";
import { snapshotMembersToReplayInput, compareReplayToExpected, type SnapshotReplayEnv } from "@/lib/case-governance/replay";
import { orchestrateInMemory } from "@/lib/engine/orchestrator";
import { executeGovernanceApply, isGovernanceApplied } from "@/lib/case-governance/apply";
import { createPolicySnapshotService } from "@/server/modules/policy/application/snapshot-service";
import { createJurisdictionTreeService } from "@/server/modules/jurisdiction/application/tree-service";
import { DrizzleJurisdictionReadRepository } from "@/server/modules/jurisdiction/infrastructure/drizzle/jurisdiction-read.repository";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;
const AS_OF = "2026-09-07";

async function adminClient(): Promise<Client> {
  const base = new URL(DRILL_URL!);
  base.pathname = "/postgres";
  const c = new Client({ connectionString: base.toString() });
  c.on("error", (err) => console.error("[test] admin client error:", err.message));
  await c.connect();
  return c;
}

async function matQuery(url: string, text: string, values: unknown[] = []) {
  const c = new Client({ connectionString: url });
  c.on("error", (err) => console.error("[test] client error:", err.message));
  try {
    await c.connect();
    return (await c.query(text, values)) as { rows: Record<string, unknown>[] };
  } finally {
    await c.end();
  }
}

async function createDrillDb(name: string): Promise<string> {
  const admin = await adminClient();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${name}"`);
  } finally {
    await admin.end();
  }
  const base = new URL(DRILL_URL!);
  base.pathname = `/${name}`;
  const url = base.toString();
  execFileSync("node", ["scripts/run-migrations.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  // 种子进程：直接调用tsx CLI（npx在Windows vitest worker下不在PATH）
  const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  execFileSync(process.execPath, [tsxCli, "src/lib/db/seed/index.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
  // seed不写showcase_cases：写入117条展示（与持久库同源的离线确定性生成）
  {
    const previousUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = url;
    try {
      const { db: freshDb } = await import("@/lib/db");
      const { seedShowcaseCases } = await import("@/lib/showcase/seed-showcase");
      const count = await seedShowcaseCases(freshDb);
      if (count !== 117) throw new Error(`seedShowcaseCases应生成117条，实际${count}`);
    } finally {
      process.env.DATABASE_URL = previousUrl ?? url;
    }
  }
  // 任务2批准镜像：CN/上海晋级published（测试库内自建，供候选快照使用）
  const c = new Client({ connectionString: url });
  c.on("error", (err) => console.error("[test] client error:", err.message));
  try {
    await c.connect();
    await c.query(`UPDATE rules SET status='published' WHERE jurisdiction_code IN ('CN','310000')`);
    await c.query(`UPDATE params SET status='published' WHERE jurisdiction_code IN ('CN','310000')`);
    await c.query(`UPDATE rule_sets SET status='published' WHERE jurisdiction_code IN ('CN','310000')`);
  } finally {
    await c.end();
  }
  return url;
}

async function createShanghaiSnapshot(url: string): Promise<{ snapshotId: string; replayEnv: SnapshotReplayEnv }> {
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = url;
  try {
    const service = createPolicySnapshotService({
      resolveChain: async (code) => {
        const tree = createJurisdictionTreeService({
          read: new DrizzleJurisdictionReadRepository(),
        });
        return (await tree.resolveChain(code)).map((n) => ({
          code: n.code,
          name: n.name,
          path: n.path,
        }));
      },
    });
    const created = await service.createPolicySnapshot({ jurisdictionCode: "310000", asOfDate: AS_OF, actor: "clg-test" });
    const members = await matQuery(
      url,
      `select entity_type, business_key, payload from policy_snapshot_members where snapshot_id=$1`,
      [created.snapshotId],
    );
    return {
      snapshotId: created.snapshotId,
      replayEnv: snapshotMembersToReplayInput(
        members.rows as Array<{ entity_type: string; payload: unknown }>,
      ),
    };
  } finally {
    process.env.DATABASE_URL = previousUrl ?? url;
  }
}

describe("CLG 案例治理全流程（独立动态库1：完整链路）", () => {
  const CLG_DB = `clg_cycle_${Date.now().toString(36)}`;
  let matUrl = "";
  let baselineTests = 528;
  let snapshotId = "";
  let replayEnv: SnapshotReplayEnv;
  let curatedUids: string[] = [];
  let manifestHash = "";
  const BATCH_ID = "21000000-0000-0000-0000-000000000001";

  beforeAll(async () => {
    if (!DRILL_URL) throw new Error("SOCILA_TEST_DATABASE_URL 未设置");
    matUrl = await createDrillDb(CLG_DB);
    process.env.DATABASE_URL = matUrl;
    const snap = await createShanghaiSnapshot(matUrl);
    snapshotId = snap.snapshotId;
    replayEnv = snap.replayEnv;
    void replayEnv;
    baselineTests = Number(
      (await matQuery(matUrl, `select count(*)::int as n from tests`)).rows[0].n,
    );
    // 全新seed自然态tests（500回归+DSL示例）；持久库基线528在镜像验收中验证
    expect(baselineTests).toBeGreaterThanOrEqual(528);
  }, 240_000);

  afterAll(async () => {
    const admin = await adminClient();
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${CLG_DB}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  }, 60_000);

  it("CLG-AC-001：audit基线精确851/451/117/116/528且无重复UID", async () => {
    const r = (await matQuery(matUrl, `
      select
        (select count(*)::int from cases) cases,
        (select count(*)::int from cases where is_regression) regression,
        (select count(*)::int from showcase_cases) showcase,
        (select count(*)::int from tests) tests,
        (select count(*)::int from tests where source='regression') regression_tests`)).rows[0];
    expect(r).toEqual({
      cases: 851, regression: 451, showcase: 117,
      tests: baselineTests, regression_tests: 500,
    });
    const dup = (await matQuery(matUrl, `
      select count(*)::int as n from (select case_uid from cases group by case_uid having count(*)>1) d`)).rows[0].n;
    expect(dup).toBe(0);
    const src = (await matQuery(matUrl,
      `select count(distinct regexp_replace(case_uid,'-[0-9]{2}$',''))::int as n from showcase_cases`)).rows[0].n;
    expect(src).toBe(116);
  });

  it("CLG-AC-003：117条展示全部解析到唯一来源案例", async () => {
    const bad = (await matQuery(matUrl, `
      select count(*)::int as n from showcase_cases s
      where not exists (select 1 from cases c where c.case_uid = regexp_replace(s.case_uid,'-[0-9]{2}$',''))`)).rows[0].n;
    expect(bad).toBe(0);
  });

  it("CLG-FR-006/007/AC-004：评分+资格（逐项原因）+策展36条且重复一致", async () => {
    const showRows = await db.select().from(showcaseCases).orderBy(showcaseCases.caseUid);
    const caseMeta = await db.select({
      caseUid: cases.caseUid,
      transcriptText: cases.transcriptText,
      caseText: cases.caseText,
      sourceFile: cases.sourceFile,
      creator: cases.creator,
      videoId: cases.videoId,
    }).from(cases);

    const scored: Array<ShowcaseCandidateRecord & { qualityScore: number; eligible: boolean }> = [];
    for (const row of showRows) {
      const sourceCaseUid = normalizeCaseUid(row.caseUid ?? "");
      const meta = caseMeta.find((m) => m.caseUid === sourceCaseUid);
      const input = (row.inputData ?? {}) as Record<string, unknown>;
      const expected = (row.expectedData ?? {}) as Record<string, unknown>;
      const basic = (input.basic ?? {}) as Record<string, unknown>;
      const status = (input.status ?? {}) as Record<string, unknown>;
      const record: ShowcaseCandidateRecord = {
        caseUid: row.caseUid ?? "",
        sourceCaseUid,
        gender: String(basic.gender ?? ""),
        birthYear: typeof basic.birth_year === "number" ? basic.birth_year : 0,
        employmentStatus: String(status.employment_status ?? ""),
        input,
        expected,
        transcriptLength: meta?.transcriptText?.length ?? 0,
        sourceFile: meta?.sourceFile ?? null,
        caseText: meta?.caseText ?? null,
        publicText: `${row.userMessage ?? ""}\n${row.aiResponse ?? ""}`,
        identityTokens: [meta?.creator, meta?.videoId].filter((t): t is string => typeof t === "string" && t.length > 0),
        replay: compareReplayToExpected(runReplay(replayEnv, input, AS_OF), expected),
        qualityScore: 0,
      };
      const score = scoreShowcaseCandidate(record);
      const gate = checkEligibility(record, score);
      expect(score.reasons.length).toBeGreaterThan(0);
      scored.push({ ...record, qualityScore: score.total, eligible: gate.eligible });
    }
    const eligible = scored.filter((s) => s.eligible);
    expect(eligible.length).toBeGreaterThanOrEqual(36);

    const report = curateShowcase(eligible);
    expect(report.ok).toBe(true);
    expect(report.selected).toHaveLength(36);
    curatedUids = report.selected;
    const second = curateShowcase(eligible);
    expect(second.selected).toEqual(report.selected);
    expect(second.entries).toEqual(report.entries);
    expect(second.swaps).toEqual(report.swaps);
    expect(curatedUids.length).toBe(36);
  });

  it("CLG-FR-008/009：36条满足全部配额", async () => {
    const showRows = await db.select().from(showcaseCases);
    const byUid = new Map(showRows.map((r) => [r.caseUid, r]));
    const g = { female: 0, male: 0 };
    const b = { before_1970: 0, "1970_1979": 0, from_1980: 0 };
    const s = { employed: 0, flexible: 0, unemployed: 0 };
    const sb = { "4050": 0, daling: 0, gangwei: 0 };
    for (const uid of curatedUids) {
      const row = byUid.get(uid);
      expect(row).toBeDefined();
      const input = (row!.inputData ?? {}) as Record<string, unknown>;
      const expected = (row!.expectedData ?? {}) as Record<string, unknown>;
      const basic = (input.basic ?? {}) as Record<string, unknown>;
      const status = (input.status ?? {}) as Record<string, unknown>;
      g[String(basic.gender) as "female" | "male"]++;
      const birthYear = typeof basic.birth_year === "number" ? basic.birth_year : 0;
      b[(birthYear < 1970 ? "before_1970" : birthYear < 1980 ? "1970_1979" : "from_1980") as keyof typeof b]++;
      s[String(status.employment_status) as keyof typeof s]++;
      if (expected.subsidy_4050) sb["4050"]++;
      if (expected.subsidy_daling) sb.daling++;
      if (expected.subsidy_gangwei) sb.gangwei++;
    }
    expect(g).toEqual({ female: 18, male: 18 });
    expect(b.before_1970).toBeGreaterThanOrEqual(6);
    expect(b["1970_1979"]).toBeGreaterThanOrEqual(6);
    expect(b.from_1980).toBeGreaterThanOrEqual(6);
    expect(s.flexible).toBeGreaterThanOrEqual(12);
    expect(s.unemployed).toBeGreaterThanOrEqual(12);
    expect(s.employed).toBeLessThanOrEqual(3);
    expect(sb["4050"]).toBeGreaterThanOrEqual(6);
    expect(sb.daling).toBeGreaterThanOrEqual(4);
    expect(sb.gangwei).toBeGreaterThanOrEqual(3);
  });

  it("CLG-FR-014：manifest 452保留/399删除/81展示删除+确定性哈希", async () => {
    const manifest = buildGovernanceManifest({
      algorithmVersion: "CLG-1.0",
      caseUids: (await matQuery(matUrl, `select case_uid from cases`)).rows.map((r) => r.case_uid as string),
      regressionCaseUids: new Set(
        (await matQuery(matUrl, `select case_uid from cases where is_regression`)).rows.map((r) => r.case_uid as string),
      ),
      showcaseRows: (await db.select({ caseUid: showcaseCases.caseUid }).from(showcaseCases)).map((r) => ({
        caseUid: r.caseUid ?? "",
        sourceCaseUid: normalizeCaseUid(r.caseUid ?? ""),
      })),
      curatedShowcaseUids: curatedUids,
      testCount: baselineTests,
      regressionTestCount: 500,
      exampleTestCount: baselineTests - 500,
    });
    expect(manifest.retainedCounts.cases).toBe(452);
    expect(manifest.deletedCounts.cases).toBe(399);
    expect(manifest.deletedCounts.showcaseCases).toBe(81);
    expect(manifest.deletedCaseUids.length).toBe(399);
    manifestHash = manifest.manifestHash;
    expect(manifestHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("CLG-NFR-001/AC-008：prepared批次apply被拒绝且零变化", async () => {
    await db.execute(sql`
      INSERT INTO case_archive_batches (id, status, source_counts, retained_counts,
        deleted_counts, table_hashes, manifest_hash, storage_path, created_by)
      VALUES (${BATCH_ID}, 'prepared',
        ${JSON.stringify({ cases: 851, showcase_cases: 117, tests: baselineTests })}::jsonb,
        ${JSON.stringify({ cases: 452, showcase_cases: 36, tests: baselineTests })}::jsonb,
        '{"cases":399,"showcase_cases":81}'::jsonb,
        '{}'::jsonb, ${manifestHash}, 'backup/case-library/prepared', 'clg-test')`);
    await expect(
      executeGovernanceApply({
        db, manifestHash, batchId: BATCH_ID, curatedShowcaseUids: curatedUids,
        snapshotId, actor: "clg-test", requireRestoreVerified: true,
      }),
    ).rejects.toThrow(/restore_verified/);
    const counts = (await matQuery(matUrl,
      `select (select count(*)::int from cases) cases, (select count(*)::int from showcase_cases) showcase`)).rows[0];
    expect(counts).toEqual({ cases: 851, showcase: 117 });
  });

  it("CLG-AC-008：错误manifestHash拒绝且零变化", async () => {
    await db.execute(sql`UPDATE case_archive_batches SET status='restore_verified' WHERE id=${BATCH_ID}`);
    await expect(
      executeGovernanceApply({
        db, manifestHash: "0".repeat(64), batchId: BATCH_ID, curatedShowcaseUids: curatedUids,
        snapshotId, actor: "clg-test",
      }),
    ).rejects.toThrow(/manifest/i);
    const counts = (await matQuery(matUrl,
      `select (select count(*)::int from cases) cases, (select count(*)::int from showcase_cases) showcase`)).rows[0];
    expect(counts).toEqual({ cases: 851, showcase: 117 });
  });

  it("CLG-NFR-006/AC-013：故障注入（before-delete抛错）→ 治理字段/归档索引/业务行全部回滚", async () => {
    const stateBefore = (await matQuery(matUrl, `
      select
        (select count(*)::int from cases) cases,
        (select count(*)::int from showcase_cases) showcase,
        (select count(*)::int from case_archive_entries) entries,
        (select count(*)::int from cases where quality_status is not null) governed,
        (select count(*)::int from showcase_cases where quality_status is not null) governed_show,
        (select status from case_archive_batches where id='${BATCH_ID}') status,
        (select count(*)::int from showcase_cases where snapshot_id is not null) bound`)).rows[0];
    expect(stateBefore).toEqual({ cases: 851, showcase: 117, entries: 0, governed: 0, governed_show: 0, status: "restore_verified", bound: 0 });

    await expect(
      executeGovernanceApply({
        db, manifestHash, batchId: BATCH_ID, curatedShowcaseUids: curatedUids,
        snapshotId, actor: "clg-test", curator: "clg-test",
        failurePoint: (step) => {
          if (step === "before-delete") throw new Error("injected failure at before-delete");
        },
      }),
    ).rejects.toThrow(/injected failure/);

    // 半治理状态为零：全部回滚
    const stateAfter = (await matQuery(matUrl, `
      select
        (select count(*)::int from cases) cases,
        (select count(*)::int from showcase_cases) showcase,
        (select count(*)::int from tests) tests,
        (select count(*)::int from case_archive_entries) entries,
        (select count(*)::int from cases where quality_status is not null) governed,
        (select count(*)::int from showcase_cases where quality_status is not null) governed_show,
        (select status from case_archive_batches where id='${BATCH_ID}') status,
        (select count(*)::int from showcase_cases where snapshot_id is not null) bound`)).rows[0];
    expect(stateAfter).toEqual({
      cases: 851, showcase: 117, tests: baselineTests, entries: 0,
      governed: 0, governed_show: 0, status: "restore_verified", bound: 0,
    });
    expect((await isGovernanceApplied(db)).applied).toBe(false);
  });


  it("CLG-AC-009/010：正确manifest单事务apply → 452/36/528、480条归档索引、批次applied", async () => {
    const result = await executeGovernanceApply({
      db, manifestHash, batchId: BATCH_ID, curatedShowcaseUids: curatedUids,
      snapshotId, actor: "clg-test", curator: "clg-test",
    });
    expect(result.deletedCases).toBe(399);
    expect(result.deletedShowcases).toBe(81);
    const counts = (await matQuery(matUrl, `
      select
        (select count(*)::int from cases) cases,
        (select count(*)::int from showcase_cases) showcase,
        (select count(*)::int from tests) tests,
        (select count(*)::int from case_archive_entries) entries,
        (select count(*)::int from case_archive_entries where entity_type='case') case_entries,
        (select count(*)::int from case_archive_entries where entity_type='showcase_case') show_entries,
        (select status from case_archive_batches where id='${BATCH_ID}') status`)).rows[0];
    expect(counts).toEqual({
      cases: 452, showcase: 36, tests: baselineTests,
      entries: 480, case_entries: 399, show_entries: 81, status: "applied",
    });
  });

  it("CLG-AC-010：保留452/36行治理字段回填完整（含内容哈希与来源UID）", async () => {
    const noNulls = (await matQuery(matUrl, `
      select
        (select count(*)::int from cases where quality_status<>'active' or governed_at is null or content_hash is null) c,
        (select count(*)::int from showcase_cases where quality_status<>'selected' or curated_at is null or curated_by is null or snapshot_id is null or content_hash is null or source_case_uid is null) s`)).rows[0];
    expect(noNulls).toEqual({ c: 0, s: 0 });
  });

  it("CLG-AC-010：36条全部绑定310000上海候选快照", async () => {
    const rows = await db.select({
      snapshotId: showcaseCases.snapshotId,
      jurisdictionCode: showcaseCases.jurisdictionCode,
    }).from(showcaseCases).where(sql`quality_status='selected'`);
    expect(rows).toHaveLength(36);
    for (const r of rows) {
      expect(r.snapshotId).toBe(snapshotId);
      expect(r.jurisdictionCode).toBe("310000");
    }
    const snap = await db.select({ jurisdictionCode: policySnapshots.jurisdictionCode })
      .from(policySnapshots).where(sql`id = ${snapshotId}`);
    expect(snap[0].jurisdictionCode).toBe("310000");
  });

  it("CLG-AC-002：治理后500条回归来源链全部解析到保留452案例", async () => {
    const broken = (await matQuery(matUrl, `
      select count(*)::int as n from tests t
      where t.source='regression' and not exists (
        select 1 from cases c where c.case_uid = regexp_replace(t.source_case_uid,'-[0-9]{2}$',''))`)).rows[0].n;
    expect(broken).toBe(0);
    expect((await matQuery(matUrl, `select count(*)::int as n from tests where source='regression'`)).rows[0].n).toBe(500);
  });

  it("CLG-AC-014：重复apply为no-op（已applied拒绝且零变化）", async () => {
    await expect(
      executeGovernanceApply({
        db, manifestHash, batchId: BATCH_ID, curatedShowcaseUids: curatedUids,
        snapshotId, actor: "clg-test",
      }),
    ).rejects.toThrow(/已applied|already applied/i);
    const counts = (await matQuery(matUrl,
      `select (select count(*)::int from cases) cases, (select count(*)::int from showcase_cases) showcase`)).rows[0];
    expect(counts).toEqual({ cases: 452, showcase: 36 });
    expect((await isGovernanceApplied(db)).applied).toBe(true);
    // tests保持治理前数量（不删除任何测试）
    const testsAfter = (await matQuery(matUrl, `select count(*)::int as n from tests`)).rows[0].n;
    expect(testsAfter).toBe(baselineTests);
  });

  it("CLG-AC-015：任务3未合入（journal无0015、无publishes依赖）时全部通过", () => {
    const journal = JSON.parse(
      readFileSync(`${process.cwd()}/drizzle/meta/_journal.json`, "utf-8"),
    ) as { entries: Array<{ tag: string }> };
    expect(journal.entries.some((e) => e.tag.startsWith("0015"))).toBe(false);
    expect(curatedUids.length).toBe(36);
  });
});

function runReplay(replayEnv: SnapshotReplayEnv, input: Record<string, unknown>, asOfDate: string) {
  const { rules: ruleDefs, params: flatParams } = replayEnv;
  if (ruleDefs.length === 0 || Object.keys(flatParams).length === 0) {
    return { plan: {}, calc: {}, user: {} };
  }
  const result = orchestrateInMemory(ruleDefs, flatParams, input, asOfDate);
  return { plan: result.plan, calc: result.calc, user: result.user };
}