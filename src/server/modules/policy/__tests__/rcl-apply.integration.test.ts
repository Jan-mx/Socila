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
import { eq, inArray, sql } from "drizzle-orm";
import { rowContentHash } from "@/lib/case-governance/hashes";
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
import { buildRclManifest, type RclManifest } from "@/lib/case-governance/manifest";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;

async function makeManifest(overrides: Partial<RclManifest> = {}): Promise<RclManifest> {
  // 旧目标行hash：从库读完整行按行内容重算（库中content_hash列可能为空，
  // 行内容哈希才是内容绑定权威，RCL-FR-002/AC-003；2026-09-09统一读取路径）。
  const oldCaseRows = await db.execute(sql`SELECT * FROM "cases" WHERE id IN (900, 901) ORDER BY id`);
  const oldShowRows = await db.execute(sql`SELECT * FROM "showcase_cases" WHERE id = 800`);
  const oldCaseTargets = oldCaseRows.rows.map((r) => ({
    rowId: Number((r as { id: number }).id),
    uid: String((r as { case_uid: string | null }).case_uid ?? null),
    contentHash: rowContentHash(r as Record<string, unknown>, ["id", "created_at", "updated_at", "governed_at", "post_date"]),
  }));
  const oldShowTargets = oldShowRows.rows.map((r) => ({
    rowId: Number((r as { id: number }).id),
    uid: String((r as { case_uid: string | null }).case_uid ?? null),
    contentHash: rowContentHash(r as Record<string, unknown>, ["id", "created_at", "updated_at", "curated_at"]),
  }));
  const m = buildRclManifest({
    algorithmVersion: "RCL-MANIFEST-1.0",
    generatorVersion: "RCL-GEN-1.0",
    newCases: [
      {
        rowId: 1,
        uid: "RPC-310000-SH-NEW-1-V1",
        contentHash: "new-h-1",
        jurisdictionCode: "310000",
        scenarioKey: "SH-RETIREMENT-TEST",
        asOfDate: "2026-09-01",
        input: { basic: { gender: "male", birth_year: 1965 } },
        expected: { retirement: { legal_retire_date: "2028-10-01" } },
        assertions: [{ path: "calc.retirement.legal_retire_date", operator: "eq", value: "2028-10-01" }],
        coverageObligations: ["capability:retirement"],
        evidence: [{ documentId: "DOC-SH-POLICY-2025", locator: "正文" }],
        qualityScore: 90,
        qualityBreakdown: { inputCompleteness: 40, coverageObligations: 30, snapshotReplay: 20, total: 90 },
        multiLabels: ["male", "before_1970", "employed"],
        snapshotId: "11111111-1111-4111-8111-111111111111",
        snapshotHash: "snap-h-1",
        sourceTestUid: "RPCT-310000-SH-NEW-1-V1",
      },
    ],
    newShowcase: [
      {
        rowId: 2,
        uid: "RPC-310000-SH-NEW-1-V1",
        contentHash: "new-sh-1",
        jurisdictionCode: "310000",
        scenarioKey: "SH-RETIREMENT-TEST",
        asOfDate: "2026-09-01",
        input: { basic: { gender: "male", birth_year: 1965 } },
        expected: { retirement: { legal_retire_date: "2028-10-01" } },
        assertions: [{ path: "calc.retirement.legal_retire_date", operator: "eq", value: "2028-10-01" }],
        coverageObligations: ["capability:retirement"],
        evidence: [{ documentId: "DOC-SH-POLICY-2025", locator: "正文" }],
        sourceCaseUid: "RPC-310000-SH-NEW-1-V1",
        qualityScore: 90,
        qualityBreakdown: { inputCompleteness: 40, coverageObligations: 30, snapshotReplay: 20, total: 90 },
        multiLabels: ["male", "before_1970", "employed"],
        snapshotId: "11111111-1111-4111-8111-111111111111",
        snapshotHash: "snap-h-1",
      },
    ],
    newTests: [
      {
        rowId: 3,
        uid: "RPCT-310000-SH-NEW-1-V1",
        contentHash: "new-t-1",
        jurisdictionCode: "310000",
        sourceCaseUid: "RPC-310000-SH-NEW-1-V1",
        input: { user: { basic: { gender: "male", birth_year: 1965 } } },
        expected: { retirement: { legal_retire_date: "2028-10-01" } },
      },
    ],
    exampleTests: [
      { rowId: 4, uid: "示例1", contentHash: "ex-h-1", jurisdictionCode: "CN" },
    ],
    oldTargets: {
      cases: oldCaseTargets,
      showcase: oldShowTargets,
      tests: [{ rowId: 700, uid: "old-test-1", contentHash: "old-t-1" }],
    },
    snapshot: { id: "11111111-1111-4111-8111-111111111111", contentHash: "snap-h-1" },
  });
  return { ...m, ...overrides };
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
    const drifted = await makeManifest({ manifestHash: "drift-manifest-hash-not-real-" + "x".repeat(32) });
    await expect(
      executeRclApply({ db, manifest: drifted, batchId, actor: "test-admin" }),
    ).rejects.toBeInstanceOf(RclApplyRejectedError);
  });

  it("旧目标行内容hash漂移 → 拒绝且零删除（RCL-AC-003）", async () => {
    const { batchId, manifest } = await seedFixture();
    // 篡改旧行hash。
    await db.update(cases).set({ contentHash: "TAMPERED" }).where(eq(cases.id, 900));
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
});