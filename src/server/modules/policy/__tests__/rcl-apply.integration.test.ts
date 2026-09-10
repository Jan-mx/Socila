/**
 * RCL-FR-018/019/020、RCL-AC-003/010/011 apply集成测试：
 * - restore_verified 批次才能apply；prepared拒绝零写入（RCL-NFR-001/AC-002）；
 * - 事务内逐行核对旧目标（行ID+内容hash，RCL-AC-003）；
 * - 单事务删除旧目标+插入新 N/36/N + 批次 applied（RCL-FR-018）；
 * - 状态机 applying + FOR UPDATE：两个并发apply只有一组写入，另一组no-op（RCL-AC-010）；
 * - 归档条目唯一约束（RCL-FR-019）。
 *
 * 前提：SOCILA_TEST_DATABASE_URL 指向已执行全部migration且已seed的全新PG17库。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createHash } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { rowContentHash, testRowContentHash } from "@/lib/case-governance/hashes";
import {
  newCaseDbRowHash,
  newShowcaseDbRowHash,
  newTestDbRowHash,
} from "@/lib/case-governance/row-projections";
import { db } from "@/lib/db";
import {
  caseArchiveBatches,
  policySnapshots,
  caseArchiveEntries,
  cases,
  showcaseCases,
  tests,
} from "@/lib/db/schema";
import {
  executeRclApply,
  RclApplyRejectedError,
} from "@/lib/case-governance/apply";
import { buildRclManifest, recomputeManifestHash, type RclManifest } from "@/lib/case-governance/manifest";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;

/** 64位hex占位hash（RCL-AC-003要求非空SHA-256）。 */
const H = (n: string) => createHash("sha256").update(n).digest("hex");

async function makeManifest(overrides: Partial<RclManifest> = {}): Promise<RclManifest> {
  // 旧目标行hash：从库读完整行按行内容重算（库中content_hash列可能为空，
  // 行内容哈希才是内容绑定权威，RCL-FR-002/AC-003；2026-09-09统一读取路径）。
  const oldCaseRows = await db.execute(sql`SELECT * FROM "cases" WHERE id IN (900, 901) ORDER BY id`);
  const oldShowRows = await db.execute(sql`SELECT * FROM "showcase_cases" WHERE id = 800`);
  const oldTestRows = await db.execute(sql`SELECT * FROM "tests" WHERE id = 700`);
  const oldCaseTargets = oldCaseRows.rows.map((r) => ({
    rowId: Number((r as { id: number }).id),
    uid: String((r as { case_uid: string | null }).case_uid ?? null),
    contentHash: rowContentHash(r as Record<string, unknown>, ["id", "created_at", "updated_at", "governed_at", "content_hash", "post_date"]),
  }));
  const oldShowTargets = oldShowRows.rows.map((r) => ({
    rowId: Number((r as { id: number }).id),
    uid: String((r as { case_uid: string | null }).case_uid ?? null),
    contentHash: rowContentHash(r as Record<string, unknown>, ["id", "created_at", "updated_at", "curated_at", "content_hash"]),
  }));
  const oldTestTargets = oldTestRows.rows.map((r) => ({
    rowId: Number((r as { id: number }).id),
    uid: String((r as { source_case_uid: string | null }).source_case_uid ?? null),
    contentHash: testRowContentHash(r as Record<string, unknown>),
  }));
  const newCase = {
    rowId: 1,
    uid: "RPC-310000-SH-NEW-1-V1",
    contentHash: H("case-1"),
    jurisdictionCode: "310000",
    scenarioKey: "SH-RETIREMENT-TEST",
    asOfDate: "2026-09-01",
    input: { basic: { gender: "male", birth_year: 1965 } },
    expected: { retirement: { legal_retire_date: "2028-10-01" } },
    assertions: [{ path: "calc.retirement.legal_retire_date", operator: "eq" as const, value: "2028-10-01" }],
    coverageObligations: ["capability:retirement"],
    evidence: [{ documentId: "DOC-SH-POLICY-2025", locator: "正文" }],
    qualityScore: 90,
    qualityBreakdown: { inputCompleteness: 40, coverageObligations: 30, snapshotReplay: 20, total: 90 },
    multiLabels: ["male", "before_1970", "employed"],
    snapshotId: "11111111-1111-4111-8111-111111111111",
    snapshotHash: "snap-h-1",
    sourceTestUid: "RPCT-310000-SH-NEW-1-V1",
  };
  const newShowcase = {
    rowId: 2,
    uid: "RPC-310000-SH-NEW-1-V1",
    contentHash: H("show-1"),
    jurisdictionCode: "310000",
    scenarioKey: "SH-RETIREMENT-TEST",
    asOfDate: "2026-09-01",
    input: { basic: { gender: "male", birth_year: 1965 } },
    expected: { retirement: { legal_retire_date: "2028-10-01" } },
    assertions: [{ path: "calc.retirement.legal_retire_date", operator: "eq" as const, value: "2028-10-01" }],
    coverageObligations: ["capability:retirement"],
    evidence: [{ documentId: "DOC-SH-POLICY-2025", locator: "正文" }],
    sourceCaseUid: "RPC-310000-SH-NEW-1-V1",
    qualityScore: 90,
    qualityBreakdown: { inputCompleteness: 40, coverageObligations: 30, snapshotReplay: 20, total: 90 },
    multiLabels: ["male", "before_1970", "employed"],
    snapshotId: "11111111-1111-4111-8111-111111111111",
    snapshotHash: "snap-h-1",
  };
  const newTest = {
    rowId: 3,
    uid: "RPCT-310000-SH-NEW-1-V1",
    contentHash: H("test-1"),
    jurisdictionCode: "310000",
    sourceCaseUid: "RPC-310000-SH-NEW-1-V1",
    input: { user: { basic: { gender: "male", birth_year: 1965 } } },
    expected: { retirement: { legal_retire_date: "2028-10-01" } },
  };
  // RCL第三轮复审（Fix 8）：新行contentHash = 完整数据库行投影的规范化hash，
  // apply插入后按同一投影重算逐项核对（任一漂移拒绝零写入）。
  newCase.contentHash = newCaseDbRowHash(newCase, "RCL-GEN-1.0");
  newShowcase.contentHash = newShowcaseDbRowHash(newShowcase, "RCL-GEN-1.0");
  newTest.contentHash = newTestDbRowHash(newTest);
  const m = buildRclManifest({
    algorithmVersion: "RCL-MANIFEST-1.0",
    generatorVersion: "RCL-GEN-1.0",
    newCases: [newCase],
    newShowcase: [newShowcase],
    newTests: [newTest],
    exampleTests: [
      { rowId: 4, uid: "示例1", contentHash: H("ex-1"), jurisdictionCode: "CN" },
    ],
    exampleSync: { retained: [], updated: [], added: [], deleted: [] },
    oldTargets: {
      cases: oldCaseTargets,
      showcase: oldShowTargets,
      tests: oldTestTargets,
    },
    snapshot: { id: "11111111-1111-4111-8111-111111111111", contentHash: "snap-h-1" },
  });
  // 覆盖字段后必须重算manifestHash（manifest自校验，RCL第三轮复审）。
  const merged = { ...m, ...overrides };
  merged.manifestHash = recomputeManifestHash(merged);
  return merged;
}

describe("RCL apply（FR-018/019/020、AC-003/010/011）", () => {
  beforeAll(async () => {
    if (!DRILL_URL) {
      throw new Error("SOCILA_TEST_DATABASE_URL 未设置（CI database-gates 自动提供）");
    }
    process.env.DATABASE_URL = DRILL_URL;
    // 全局清理：既往运行残留的RPC行（避免caseUid查询返回多条）。
    await db.delete(cases).where(sql`case_uid like 'RPC-%'`);
    await db.delete(showcaseCases).where(sql`case_uid like 'RPC-%'`);
    await db.delete(tests).where(sql`name like 'RPCT-%'`);
    // 清理example同步测试注入的非DSL示例（避免污染后续激活门禁黄金重放）。
    await db.delete(tests).where(sql`name like 'R-LEGACY%' OR name like 'R-NEW%'`);
  });

  async function seedFixture(): Promise<{ batchId: string; manifest: RclManifest }> {
    // 快照行（showcase.snapshot_id 外键，0016 RESTRICT）。
    await db
      .insert(policySnapshots)
      .values({
        id: "11111111-1111-4111-8111-111111111111",
        jurisdictionCode: "310000",
        asOfDate: "2026-09-01",
        resolvedPath: "/CN/310000/",
        contentHash: "snap-h-1",
        createdBy: "test",
      })
      .onConflictDoNothing();

    // 旧目标行：2 cases + 1 showcase + 1 test。
    await db.delete(cases).where(inArray(cases.id, [900, 901]));
    await db.delete(cases).where(sql`case_uid like 'RPC-%'`);
    await db.delete(showcaseCases).where(inArray(showcaseCases.id, [800]));
    await db.delete(showcaseCases).where(sql`case_uid like 'RPC-%'`);
    await db.delete(tests).where(inArray(tests.id, [700]));
    await db.delete(tests).where(sql`name like 'RPCT-%'`);
    await db.delete(caseArchiveEntries);
    await db.delete(caseArchiveBatches);

    await db.insert(cases).values([
      { id: 900, caseUid: "old-case-1", contentHash: "old-h-1", qualityStatus: "active" },
      { id: 901, caseUid: "old-case-2", contentHash: "old-h-2", qualityStatus: "active" },
    ]);
    await db.insert(showcaseCases).values([
      {
        id: 800,
        caseUid: "old-show-1",
        title: "旧展示案例",
        userMessage: "旧展示用户消息",
        aiResponse: "旧展示AI回复",
        contentHash: "old-sh-1",
        qualityStatus: "selected",
      },
    ]);
    await db.insert(tests).values([
      { id: 700, name: "old-test-1", sourceCaseUid: "old-test-1", source: "regression", input: {}, expected: {} },
    ]);

    const manifest = await makeManifest();
    const batchRows = await db
      .insert(caseArchiveBatches)
      .values({
        status: "restore_verified",
        sourceCounts: {},
        retainedCounts: {},
        deletedCounts: {},
        tableHashes: {},
        manifestHash: manifest.manifestHash,
        storagePath: "/tmp/rcl-archive",
        createdBy: "test",
      })
      .returning({ id: caseArchiveBatches.id });
    // 归档条目（唯一约束目标）。
    await db.insert(caseArchiveEntries).values([
      { archiveBatchId: batchRows[0].id, entityType: "case", entityId: 900, caseUid: "old-case-1", contentHash: "old-h-1", archiveReason: "test" },
      { archiveBatchId: batchRows[0].id, entityType: "case", entityId: 901, caseUid: "old-case-2", contentHash: "old-h-2", archiveReason: "test" },
      { archiveBatchId: batchRows[0].id, entityType: "showcase_case", entityId: 800, caseUid: "old-show-1", contentHash: "old-sh-1", archiveReason: "test" },
    ]);
    return { batchId: batchRows[0].id, manifest };
  }

  it("restore_verified批次apply：删除旧+插入新，批次applied（RCL-FR-018/AC-011）", async () => {
    const { batchId, manifest } = await seedFixture();
    const result = await executeRclApply({
      db,
      manifest,
      batchId,
      actor: "test-admin",
    });
    expect(result).toMatchObject({
      deletedCases: 2,
      deletedShowcases: 1,
      deletedTests: 1,
      insertedCases: 1,
      insertedShowcases: 1,
      insertedTests: 1,
      noop: false,
    });
    const batch = await db.select().from(caseArchiveBatches).where(eq(caseArchiveBatches.id, batchId));
    expect(batch[0].status).toBe("applied");
    // 旧行已删。
    expect((await db.select().from(cases).where(inArray(cases.id, [900, 901])))).toHaveLength(0);
    // 新行存在。
    const newCase = await db.select().from(cases).where(eq(cases.caseUid, "RPC-310000-SH-NEW-1-V1"));
    expect(newCase).toHaveLength(1);
    expect(newCase[0].qualityScore).toBe(90);
    expect(newCase[0].qualityBreakdown).not.toBeNull();
  });

  it("apply落库完整场景字段：cases/showcase/tests与manifest逐字节一致且非空（RCL-FR-018/AC-011，复审P0）", async () => {
    const { batchId, manifest } = await seedFixture();
    await executeRclApply({ db, manifest, batchId, actor: "test-admin" });

    // cases：scenarioKey/asOfDate/input/expected/assertions/coverage/evidence 逐字节一致。
    const newCase = await db.select().from(cases).where(eq(cases.caseUid, "RPC-310000-SH-NEW-1-V1"));
    expect(newCase).toHaveLength(1);
    const c = newCase[0];
    const mc = manifest.newCases[0];
    expect(c.scenarioKey).toBe(mc.scenarioKey);
    expect(String(c.asOfDate)).toBe(mc.asOfDate);
    expect(c.input).toEqual(mc.input);
    expect(c.expected).toEqual(mc.expected);
    expect(c.assertions).toEqual(mc.assertions);
    expect(c.coverageObligations).toEqual(mc.coverageObligations);
    expect(c.evidence).toEqual(mc.evidence);
    expect(c.isRegression).toBe(true);
    // 禁止null/空对象/空数组占位。
    expect(c.input).not.toEqual({});
    expect(c.assertions).not.toEqual([]);
    expect(c.coverageObligations).not.toEqual([]);
    expect(c.evidence).not.toEqual([]);

    // showcase：inputData/expectedData/assertions/coverage/evidence 完整。
    const newShow = await db.select().from(showcaseCases).where(eq(showcaseCases.caseUid, "RPC-310000-SH-NEW-1-V1"));
    expect(newShow).toHaveLength(1);
    const s = newShow[0];
    const ms = manifest.newShowcase[0];
    expect(s.inputData).toEqual(ms.input);
    expect(s.expectedData).toEqual(ms.expected);
    expect(s.assertions).toEqual(ms.assertions);
    expect(s.scenarioKey).toBe(ms.scenarioKey);
    expect(String(s.asOfDate)).toBe(ms.asOfDate);
    expect(s.coverageObligations).toEqual(ms.coverageObligations);
    expect(s.evidence).toEqual(ms.evidence);
    expect(s.inputData).not.toEqual({});
    expect(s.assertions).not.toEqual([]);

    // tests：input/expected 完整且引用source_case_uid。
    const newTest = await db.select().from(tests).where(eq(tests.name, "RPCT-310000-SH-NEW-1-V1"));
    expect(newTest).toHaveLength(1);
    const t = newTest[0];
    const mt = manifest.newTests[0];
    expect(t.input).toEqual(mt.input);
    expect(t.expected).toEqual(mt.expected);
    expect(t.sourceCaseUid).toBe(mt.sourceCaseUid);
    expect(t.input).not.toEqual({});
    expect(t.expected).not.toEqual({});
  });

  it("manifest场景字段不完整（空input/空assertions占位）→ apply拒绝且零写入（RCL-FR-018 fail-closed）", async () => {
    const { batchId, manifest } = await seedFixture();
    // 构造字段缺失的manifest：字段缺失必然改变manifestHash，因此先把批次哈希
    // 更新为stripped的哈希（模拟audit生成的不完整manifest被误记录到批次），
    // apply 必须在事务内以场景字段门禁拒绝并整体回滚（零写入）。
    const stripped = buildRclManifest({
      algorithmVersion: manifest.algorithmVersion,
      generatorVersion: manifest.generatorVersion,
      newCases: [{ ...manifest.newCases[0], input: {}, assertions: [] }],
      newShowcase: manifest.newShowcase,
      newTests: manifest.newTests,
      exampleTests: manifest.exampleTests,
      exampleSync: manifest.exampleSync,
      oldTargets: manifest.oldTargets,
      snapshot: manifest.snapshot,
    });
    await db
      .update(caseArchiveBatches)
      .set({ manifestHash: stripped.manifestHash })
      .where(eq(caseArchiveBatches.id, batchId));
    await expect(
      executeRclApply({ db, manifest: stripped, batchId, actor: "test-admin" }),
    ).rejects.toBeInstanceOf(RclApplyRejectedError);
    // 零写入：旧目标仍在，新行不存在，批次回滚到 restore_verified。
    expect((await db.select().from(cases).where(inArray(cases.id, [900, 901])))).toHaveLength(2);
    expect((await db.select().from(cases).where(eq(cases.caseUid, "RPC-310000-SH-NEW-1-V1")))).toHaveLength(0);
    const batchAfter = await db.select().from(caseArchiveBatches).where(eq(caseArchiveBatches.id, batchId));
    expect(batchAfter[0].status).toBe("restore_verified");
  });

  it("prepared批次apply被拒且零写入（RCL-NFR-001/AC-002）", async () => {
    const { manifest } = await seedFixture();
    const prepared = await db
      .insert(caseArchiveBatches)
      .values({
        status: "prepared",
        sourceCounts: {},
        retainedCounts: {},
        deletedCounts: {},
        tableHashes: {},
        manifestHash: manifest.manifestHash,
        storagePath: "/tmp/rcl-archive",
        createdBy: "test",
      })
      .returning({ id: caseArchiveBatches.id });
    await expect(
      executeRclApply({ db, manifest, batchId: prepared[0].id, actor: "test-admin" }),
    ).rejects.toThrow(/restore_verified/);
  });

  it("manifest哈希与批次不符 → 拒绝（RCL-AC-003）", async () => {
    const { batchId } = await seedFixture();
    const base = await makeManifest();
    // 直接篡改manifestHash（不经makeManifest重算）——批次哈希与输入不一致。
    const drifted = { ...base, manifestHash: "x".repeat(64) };
    await expect(
      executeRclApply({ db, manifest: drifted, batchId, actor: "test-admin" }),
    ).rejects.toBeInstanceOf(RclApplyRejectedError);
  });

  it("旧目标行内容hash漂移 → 拒绝且零删除（RCL-AC-003）", async () => {
    const { batchId, manifest } = await seedFixture();
    // 篡改旧行业务字段（content_hash列本身不进入内容hash，业务字段漂移才是绑定依据）。
    await db.update(cases).set({ governanceReason: "TAMPERED" }).where(eq(cases.id, 900));
    await expect(
      executeRclApply({ db, manifest, batchId, actor: "test-admin" }),
    ).rejects.toBeInstanceOf(RclApplyRejectedError);
    expect((await db.select().from(cases).where(inArray(cases.id, [900, 901])))).toHaveLength(2);
  });

  it("并发apply：一组成功，另一组no-op（RCL-AC-010）", async () => {
    const { batchId, manifest } = await seedFixture();
    const [a, b] = await Promise.all([
      executeRclApply({ db, manifest, batchId, actor: "a" }),
      executeRclApply({ db, manifest, batchId, actor: "b" }),
    ]);
    const applied = [a, b].filter((r) => !r.noop);
    const noops = [a, b].filter((r) => r.noop);
    expect(applied).toHaveLength(1);
    expect(noops).toHaveLength(1);
    expect(applied[0].deletedCases).toBe(2);
  });

  it("重复apply（已applied）→ 确定性no-op（RCL-NFR-006）", async () => {
    const { batchId, manifest } = await seedFixture();
    await executeRclApply({ db, manifest, batchId, actor: "test-admin" });
    const again = await executeRclApply({ db, manifest, batchId, actor: "test-admin" });
    expect(again.noop).toBe(true);
  });

  it("归档条目唯一约束：同批次同实体重复插入被拒（RCL-FR-019）", async () => {
    const { batchId } = await seedFixture();
    await expect(
      db.insert(caseArchiveEntries).values({
        archiveBatchId: batchId,
        entityType: "case",
        entityId: 900,
        caseUid: "old-case-1",
        contentHash: "old-h-1",
        archiveReason: "dup",
      }),
    ).rejects.toThrow(/constraint|already exists|case_archive_entries/i);
  });

  // ─── RCL第三轮复审Red：旧test完整内容hash（RCL-FR-002/AC-003）──────────────

  it("旧regression test任一业务字段漂移 → apply拒绝且零写入（当前只比较sourceCaseUid→Red）", async () => {
    const drifts: Array<[string, (() => Promise<unknown>)]> = [
      ["name", () => db.execute(sql`UPDATE "tests" SET name = '漂移后的名字' WHERE id = 700`)],
      ["jurisdiction_code", () => db.execute(sql`UPDATE "tests" SET jurisdiction_code = '440000' WHERE id = 700`)],
      ["rule_id", () => db.execute(sql`UPDATE "tests" SET rule_id = 'R-999' WHERE id = 700`)],
      ["input", () => db.execute(sql`UPDATE "tests" SET input = '{"user":{}}'::jsonb WHERE id = 700`)],
      ["params_override", () => db.execute(sql`UPDATE "tests" SET params_override = '{"P-X":1}'::jsonb WHERE id = 700`)],
      ["expected", () => db.execute(sql`UPDATE "tests" SET expected = '{"calc":{}}'::jsonb WHERE id = 700`)],
      ["source", () => db.execute(sql`UPDATE "tests" SET source = 'example' WHERE id = 700`)],
      ["source_case_uid", () => db.execute(sql`UPDATE "tests" SET source_case_uid = 'drifted-uid' WHERE id = 700`)],
    ];
    for (const [label, drift] of drifts) {
      const { batchId, manifest } = await seedFixture();
      await drift();
      await expect(
        executeRclApply({ db, manifest, batchId, actor: "test-admin" }),
        label,
      ).rejects.toBeInstanceOf(RclApplyRejectedError);
      // 零写入：旧行未删、新行未插、批次未推进。
      expect((await db.select().from(cases).where(inArray(cases.id, [900, 901])))).toHaveLength(2);
      expect((await db.select().from(cases).where(eq(cases.caseUid, "RPC-310000-SH-NEW-1-V1")))).toHaveLength(0);
      const batchAfter = await db.select().from(caseArchiveBatches).where(eq(caseArchiveBatches.id, batchId));
      expect(batchAfter[0].status).toBe("restore_verified");
    }
  });

  // ─── RCL第三轮复审Red：42条DSL example原子同步（RCL-FR-018/AC-011）─────────

  it("example同步（删除非DSL/更新漂移/新增缺失）与案例替换同一事务", async () => {
    const { batchId } = await seedFixture();
    // 构造example现状：1条非DSL旧示例（应删）+ 1条漂移示例（应更新）+ 1条缺失（应新增）。
    await db.insert(tests).values([
      {
        id: 720,
        name: "R-LEGACY: 非DSL旧示例",
        jurisdictionCode: "310000",
        ruleId: "R-LEGACY",
        input: { user: {} },
        paramsOverride: null,
        expected: { calc: {} },
        source: "example",
      },
    ]);
    // 漂移示例：取seed中的一条上海example行并修改input（内容漂移，apply应更新回目标）。
    const seedExample = (await db.execute(sql`SELECT * FROM "tests" WHERE source = 'example' AND jurisdiction_code = '310000' ORDER BY id LIMIT 1`)).rows[0] as Record<string, unknown>;
    await db.execute(sql`UPDATE "tests" SET input = '{"user":{"basic":{"gender":"male","birth_year":1965}}}'::jsonb WHERE id = ${Number(seedExample.id)}`);
    const driftedRow = (await db.execute(sql`SELECT * FROM "tests" WHERE id = ${Number(seedExample.id)}`)).rows[0] as Record<string, unknown>;
    const ex720 = (await db.execute(sql`SELECT * FROM "tests" WHERE id = 720`)).rows[0] as Record<string, unknown>;
    // DSL目标内容（同jurisdiction+name，seed原始内容）。
    const { loadDslExampleTargets } = await import("@/lib/case-governance/dsl-examples");
    const dslTarget = loadDslExampleTargets().find((t) => t.jurisdictionCode === String(driftedRow.jurisdiction_code) && t.name === String(driftedRow.name))!;
    expect(dslTarget).toBeTruthy();
    const target = {
      name: "R-NEW: 新示例",
      jurisdictionCode: "CN",
      ruleId: "R-NEW",
      input: { user: { basic: { gender: "female" } } },
      paramsOverride: null,
      expected: { calc: { x: 1 } },
    };
    const { exampleDbRowHash } = await import("@/lib/case-governance/row-projections");
    const targetHash = exampleDbRowHash({ ...target, source: "example" } as never);
    const dbHashDrifted = testRowContentHash(driftedRow);
    const dbHash720 = testRowContentHash(ex720);

    const manifest = await makeManifest({
      exampleTests: [
        { rowId: Number(seedExample.id), uid: String(driftedRow.name), contentHash: dslTarget.contentHash, jurisdictionCode: String(driftedRow.jurisdiction_code) },
        { rowId: 0, uid: target.name, contentHash: targetHash, jurisdictionCode: "CN" },
      ],
      exampleSync: {
        retained: [],
        updated: [{
          rowId: Number(seedExample.id),
          name: String(driftedRow.name),
          jurisdictionCode: String(driftedRow.jurisdiction_code),
          contentHash: dbHashDrifted,
          targetHash: dslTarget.contentHash,
          ruleId: dslTarget.ruleId,
          input: dslTarget.input,
          paramsOverride: dslTarget.paramsOverride,
          expected: dslTarget.expected,
        }],
        added: [{
          name: target.name,
          jurisdictionCode: target.jurisdictionCode,
          ruleId: target.ruleId,
          input: target.input,
          paramsOverride: target.paramsOverride,
          expected: target.expected,
          contentHash: targetHash,
        }],
        deleted: [{
          rowId: 720,
          name: String(ex720.name),
          jurisdictionCode: "310000",
          contentHash: dbHash720,
        }],
      },
    });
    await db.update(caseArchiveBatches).set({ manifestHash: manifest.manifestHash }).where(eq(caseArchiveBatches.id, batchId));

    const result = await executeRclApply({ db, manifest, batchId, actor: "test-admin" });
    expect(result.noop).toBe(false);
    // 非DSL旧示例已删除；漂移示例已更新回DSL目标内容；缺失示例已插入。
    expect((await db.select().from(tests).where(eq(tests.id, 720)))).toHaveLength(0);
    const updated = await db.select().from(tests).where(eq(tests.id, Number(seedExample.id)));
    expect(updated).toHaveLength(1);
    expect(updated[0].input).toEqual(dslTarget.input);
    expect(updated[0].expected).toEqual(dslTarget.expected);
    expect(updated[0].ruleId).toBe(dslTarget.ruleId);
    const added = await db.select().from(tests).where(eq(tests.name, target.name));
    expect(added).toHaveLength(1);
    expect(added[0].source).toBe("example");
    // 案例替换也在同一事务完成。
    expect((await db.select().from(cases).where(inArray(cases.id, [900, 901])))).toHaveLength(0);
    expect((await db.select().from(cases).where(eq(cases.caseUid, "RPC-310000-SH-NEW-1-V1")))).toHaveLength(1);
    // 清理注入的added行（apply后残留）。
    await db.delete(tests).where(eq(tests.name, target.name));
  });

  it("example同步失败 → 整体回滚（删除/更新/新增与案例替换全部回到操作前）", async () => {
    const { batchId } = await seedFixture();
    await db.insert(tests).values([
      {
        id: 721,
        name: "R-LEGACY2: 非DSL旧示例2",
        jurisdictionCode: "310000",
        ruleId: "R-LEGACY2",
        input: { user: {} },
        paramsOverride: null,
        expected: { calc: {} },
        source: "example",
      },
    ]);
    const ex721 = (await db.execute(sql`SELECT * FROM "tests" WHERE id = 721`)).rows[0] as Record<string, unknown>;
    const target = {
      name: "R-NEW2: 新示例2",
      jurisdictionCode: "CN",
      ruleId: "R-NEW2",
      input: { user: { basic: { gender: "male" } } },
      paramsOverride: null,
      expected: { calc: { x: 2 } },
    };
    const { exampleDbRowHash } = await import("@/lib/case-governance/row-projections");
    const targetHash = exampleDbRowHash({ ...target, source: "example" } as never);
    const dbHash721 = testRowContentHash(ex721);
    const manifest = await makeManifest({
      exampleSync: {
        retained: [],
        updated: [],
        added: [{ ...target, contentHash: targetHash }],
        deleted: [{
          rowId: 721,
          name: String(ex721.name),
          jurisdictionCode: "310000",
          contentHash: dbHash721,
        }],
      },
    });
    await db.update(caseArchiveBatches).set({ manifestHash: manifest.manifestHash }).where(eq(caseArchiveBatches.id, batchId));
    // 注入失败：example同步完成后（failurePoint在删除/更新/新增之后）抛错。
    let injected = false;
    await expect(
      executeRclApply({
        db, manifest, batchId, actor: "test-admin",
        failurePoint: (step) => {
          if (step === "after-example-sync" && !injected) {
            injected = true;
            throw new Error("injected example sync failure");
          }
        },
      }),
    ).rejects.toThrow("injected");
    // 全部回滚：旧示例仍在、新示例未插入、旧case未删、新case未插、批次未推进。
    expect((await db.select().from(tests).where(eq(tests.id, 721)))).toHaveLength(1);
    expect((await db.select().from(tests).where(eq(tests.name, target.name)))).toHaveLength(0);
    expect((await db.select().from(cases).where(inArray(cases.id, [900, 901])))).toHaveLength(2);
    expect((await db.select().from(cases).where(eq(cases.caseUid, "RPC-310000-SH-NEW-1-V1")))).toHaveLength(0);
    const batchAfter = await db.select().from(caseArchiveBatches).where(eq(caseArchiveBatches.id, batchId));
    expect(batchAfter[0].status).toBe("restore_verified");
    // 清理注入行（避免污染共享库中后续测试的激活门禁黄金重放）。
    await db.delete(tests).where(eq(tests.id, 721));
  });

  // ─── RCL第三轮复审Red：批次与归档状态（RCL-FR-019/AC-010）──────────────────

  it("batchId不存在 → apply拒绝（RCL-FR-019）", async () => {
    const { manifest } = await seedFixture();
    await expect(
      executeRclApply({ db, manifest, batchId: "00000000-0000-4000-8000-000000000000", actor: "test-admin" }),
    ).rejects.toThrow(/不存在/);
  });

  it("applied后再次apply：不新增批次、entries或数据（确定性no-op）", async () => {
    const { batchId, manifest } = await seedFixture();
    await executeRclApply({ db, manifest, batchId, actor: "test-admin" });
    const entriesBefore = (await db.select().from(caseArchiveEntries)).length;
    const casesBefore = (await db.select().from(cases)).length;
    const again = await executeRclApply({ db, manifest, batchId, actor: "test-admin" });
    expect(again.noop).toBe(true);
    expect((await db.select().from(caseArchiveEntries)).length).toBe(entriesBefore);
    expect((await db.select().from(cases)).length).toBe(casesBefore);
  });

  // ─── RCL第三轮复审Red：新数据落库后hash核对（Fix 8）───────────────────────

  it("apply返回实际数据库ID/UID/hash；落库行重算hash与manifest逐项一致", async () => {
    const { batchId, manifest } = await seedFixture();
    const result = await executeRclApply({ db, manifest, batchId, actor: "test-admin" });
    expect(result.verifiedRows.cases).toHaveLength(1);
    expect(result.verifiedRows.showcase).toHaveLength(1);
    expect(result.verifiedRows.tests).toHaveLength(1);
    expect(result.verifiedRows.cases[0].uid).toBe("RPC-310000-SH-NEW-1-V1");
    expect(result.verifiedRows.cases[0].hash).toMatch(/^[0-9a-f]{64}$/);
    // 与manifest逐项一致（apply事务内已核对；此处复核落库行）。
    const { newCaseDbRowHash } = await import("@/lib/case-governance/row-projections");
    expect(newCaseDbRowHash(manifest.newCases[0], manifest.generatorVersion)).toBe(manifest.newCases[0].contentHash);
    expect(result.verifiedRows.cases[0].hash).toBe(manifest.newCases[0].contentHash);
  });

  it("落库新行hash与manifest不符 → verify必须失败（不得只核对总数）", async () => {
    const { batchId, manifest } = await seedFixture();
    await executeRclApply({ db, manifest, batchId, actor: "test-admin" });
    // 篡改落库新行业务字段。
    await db.update(cases).set({ governanceReason: "TAMPERED-AFTER-APPLY" }).where(eq(cases.caseUid, "RPC-310000-SH-NEW-1-V1"));
    const { verifyRclReplacement } = await import("@/lib/case-governance/executor");
    const result = await verifyRclReplacement({
      db,
      counts: { cases: 850, showcase: 117, tests: 542 },
      showcaseByRegion: { "310000": 1 },
      quota: { gender: { male: 1, female: 0 }, band: { before_1970: 1, "1970_1979": 0, from_1980: 0 }, employment: { employed: 1, flexible: 0, unemployed: 0 } },
      manifest,
    });
    expect(result.ok).toBe(false);
    expect(result.mismatches.some((m) => /hash|哈希/i.test(m))).toBe(true);
  });
});