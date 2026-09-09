/**
 * RCL-FR-018/019/020、RCL-AC-010/011 受控替换apply：
 * - 门禁：批次必须restore_verified；manifestHash必须与批次一致；未applied；
 * - 状态机：restore_verified → applying → applied（条件更新）；
 *   批次行 `FOR UPDATE` 锁定，`applying` 状态与归档条目唯一约束共同裁决并发
 *   （RCL-AC-010：两个并发apply只有一组写入，另一组确定性no-op）；
 * - 单事务：逐行核对旧目标（manifest绑定行ID+内容hash，RCL-AC-003）→ 删除旧
 *   452/36/500 → 插入新 N/36/N → 同步42条DSL示例 → 标记applied；任一步失败整体回滚；
 * - 全部校验在事务内重新执行（防audit后变化）。
 */
import { eq, inArray, and, sql } from "drizzle-orm";
import type { DbClient } from "@/lib/db";
import {
  caseArchiveBatches,
  caseArchiveEntries,
  cases,
  showcaseCases,
  tests,
} from "@/lib/db/schema";
import { assertRestoreVerified } from "./archive";
import { rowContentHash } from "./hashes";
import type { RclManifest } from "./manifest";

export interface RclApplyInput {
  db: DbClient;
  manifest: RclManifest;
  batchId: string;
  actor: string;
  curator?: string;
  /** 测试故障注入钩子。 */
  failurePoint?: (step: string) => void;
}

export interface RclApplyResult {
  deletedCases: number;
  deletedShowcases: number;
  deletedTests: number;
  insertedCases: number;
  insertedShowcases: number;
  insertedTests: number;
  /** 第二次并发调用返回 no-op（已由另一组应用）。 */
  noop: boolean;
}

export class RclApplyRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RclApplyRejectedError";
  }
}

/** 读取并锁定批次行（FOR UPDATE，RCL-FR-019）。 */
async function lockBatch(
  tx: DbClient,
  batchId: string,
): Promise<typeof caseArchiveBatches.$inferSelect> {
  const rows = await tx
    .select()
    .from(caseArchiveBatches)
    .where(eq(caseArchiveBatches.id, batchId))
    .for("update");
  if (rows.length === 0) {
    throw new RclApplyRejectedError(`归档批次 ${batchId} 不存在`);
  }
  return rows[0];
}

/** 事务内逐行核对旧目标（manifest绑定行ID+规范化内容hash，RCL-AC-003）。 */
async function verifyOldTargets(
  tx: DbClient,
  manifest: RclManifest,
): Promise<void> {
  const { cases: oldCases, showcase: oldShowcase, tests: oldTests } = manifest.oldTargets;

  // cases：按行内容重算规范化hash与manifest绑定hash比较（库中content_hash列
  // 可能为空，行内容哈希才是内容绑定的权威，RCL-FR-002/AC-003）。
  // 读取路径必须与 plan-replacement 一致（原生SQL：snake_case+pg字符串日期），
  // 否则行对象序列化差异会造成误判漂移（2026-09-09修复）。
  const caseIds = oldCases.map((r) => r.rowId);
  const caseRows = caseIds.length
    ? (await tx.execute(sql`SELECT * FROM "cases" WHERE id IN (${sql.join(caseIds, sql.raw(", "))})`)).rows
    : [];
  if (caseRows.length !== oldCases.length) {
    throw new RclApplyRejectedError(
      `旧cases目标行数不符：manifest ${oldCases.length}，实际 ${caseRows.length}（RCL-AC-003）`,
    );
  }
  for (const target of oldCases) {
    const row = caseRows.find((r) => Number((r as { id: number }).id) === target.rowId);
    const rowHash = row
      ? rowContentHash(row as Record<string, unknown>, ["id", "created_at", "updated_at", "governed_at", "post_date"])
      : "";
    if (!row || rowHash !== target.contentHash) {
      throw new RclApplyRejectedError(
        `旧case行 ${target.rowId} 内容hash漂移（RCL-AC-003）：manifest=${target.contentHash.slice(0, 16)} 重算=${rowHash.slice(0, 16)}`,
      );
    }
  }

  const showIds = oldShowcase.map((r) => r.rowId);
  const showRows = showIds.length
    ? (await tx.execute(sql`SELECT * FROM "showcase_cases" WHERE id IN (${sql.join(showIds, sql.raw(", "))})`)).rows
    : [];
  if (showRows.length !== oldShowcase.length) {
    throw new RclApplyRejectedError(
      `旧showcase目标行数不符：manifest ${oldShowcase.length}，实际 ${showRows.length}（RCL-AC-003）`,
    );
  }
  for (const target of oldShowcase) {
    const row = showRows.find((r) => Number((r as { id: number }).id) === target.rowId);
    const rowHash = row
      ? rowContentHash(row as Record<string, unknown>, ["id", "created_at", "updated_at", "curated_at"])
      : "";
    if (!row || rowHash !== target.contentHash) {
      throw new RclApplyRejectedError(
        `旧showcase行 ${target.rowId} 内容hash漂移（RCL-AC-003）：manifest=${target.contentHash.slice(0, 16)} 重算=${rowHash.slice(0, 16)}`,
      );
    }
  }

  const testRows = await tx
    .select({ id: tests.id, name: tests.name, sourceCaseUid: tests.sourceCaseUid })
    .from(tests)
    .where(
      inArray(
        tests.id,
        oldTests.map((r) => r.rowId),
      ),
    );
  if (testRows.length !== oldTests.length) {
    throw new RclApplyRejectedError(
      `旧tests目标行数不符：manifest ${oldTests.length}，实际 ${testRows.length}（RCL-AC-003）`,
    );
  }
  for (const target of oldTests) {
    const row = testRows.find((r) => r.id === target.rowId);
    if (!row || row.sourceCaseUid !== target.uid) {
      throw new RclApplyRejectedError(
        `旧test行 ${target.rowId} 来源漂移（RCL-AC-003）`,
      );
    }
  }
}

/** 删除旧目标（精确行ID集合，单事务）。 */
async function deleteOldTargets(
  tx: DbClient,
  manifest: RclManifest,
): Promise<{ cases: number; showcase: number; tests: number }> {
  const caseIds = manifest.oldTargets.cases.map((r) => r.rowId);
  const showIds = manifest.oldTargets.showcase.map((r) => r.rowId);
  const testIds = manifest.oldTargets.tests.map((r) => r.rowId);

  const delCases = caseIds.length
    ? await tx.delete(cases).where(inArray(cases.id, caseIds)).returning({ id: cases.id })
    : [];
  const delShows = showIds.length
    ? await tx.delete(showcaseCases).where(inArray(showcaseCases.id, showIds)).returning({ id: showcaseCases.id })
    : [];
  const delTests = testIds.length
    ? await tx.delete(tests).where(inArray(tests.id, testIds)).returning({ id: tests.id })
    : [];
  return {
    cases: delCases.length,
    showcase: delShows.length,
    tests: delTests.length,
  };
}

/**
 * 完整场景字段校验（RCL-FR-018/AC-011）：apply 前必须确认 manifest 每个新行
 * 携带完整场景事实——scenarioKey/asOfDate/input/expected/assertions/coverage/
 * evidence 非空且断言可比。任何 null、空对象、空数组或摘要占位 → fail-closed。
 */
function assertCompleteScenarioFields(manifest: RclManifest): void {
  const problems: string[] = [];
  for (const c of manifest.newCases) {
    if (!c.scenarioKey || !c.asOfDate) problems.push(`case ${c.uid}: scenarioKey/asOfDate 缺失`);
    if (!c.input || Object.keys(c.input).length === 0) problems.push(`case ${c.uid}: input 为空`);
    if (!c.expected || Object.keys(c.expected).length === 0) problems.push(`case ${c.uid}: expected 为空`);
    if (!c.assertions || c.assertions.length === 0) problems.push(`case ${c.uid}: assertions 为空`);
    if (!c.coverageObligations || c.coverageObligations.length === 0) problems.push(`case ${c.uid}: coverage 为空`);
    if (!c.evidence || c.evidence.length === 0) problems.push(`case ${c.uid}: evidence 为空`);
  }
  for (const s of manifest.newShowcase) {
    if (!s.scenarioKey || !s.asOfDate) problems.push(`showcase ${s.uid}: scenarioKey/asOfDate 缺失`);
    if (!s.input || Object.keys(s.input).length === 0) problems.push(`showcase ${s.uid}: input 为空`);
    if (!s.expected || Object.keys(s.expected).length === 0) problems.push(`showcase ${s.uid}: expected 为空`);
    if (!s.assertions || s.assertions.length === 0) problems.push(`showcase ${s.uid}: assertions 为空`);
    if (!s.coverageObligations || s.coverageObligations.length === 0) problems.push(`showcase ${s.uid}: coverage 为空`);
  }
  for (const t of manifest.newTests) {
    if (!t.input || Object.keys(t.input).length === 0) problems.push(`test ${t.uid}: input 为空`);
    if (!t.expected || Object.keys(t.expected).length === 0) problems.push(`test ${t.uid}: expected 为空`);
  }
  if (problems.length > 0) {
    throw new RclApplyRejectedError(
      `manifest 场景字段不完整（RCL-FR-018 fail-closed）：${problems.slice(0, 8).join("；")}`,
    );
  }
}

/** 插入新cases（N条：场景+input/expected/assertions+质量分解+多标签+快照绑定）。 */
async function insertNewCases(
  tx: DbClient,
  manifest: RclManifest,
): Promise<number> {
  if (manifest.newCases.length === 0) return 0;
  const rows = await tx
    .insert(cases)
    .values(
      manifest.newCases.map((c) => ({
        caseUid: c.uid ?? null,
        jurisdictionCode: c.jurisdictionCode,
        contentHash: c.contentHash,
        // RCL-FR-006/018/AC-011：完整场景事实逐字节落库（复审P0修复）。
        scenarioKey: c.scenarioKey,
        generatorVersion: manifest.generatorVersion,
        asOfDate: c.asOfDate,
        input: c.input,
        expected: c.expected,
        assertions: c.assertions as unknown[],
        snapshotHash: c.snapshotHash,
        coverageObligations: c.coverageObligations as unknown[],
        evidence: c.evidence as unknown[],
        qualityScore: c.qualityScore,
        qualityBreakdown: c.qualityBreakdown as Record<string, unknown>,
        multiLabels: c.multiLabels as unknown[],
        qualityStatus: "active" as const,
        governanceReason: "RCL确定性模板生成（无真实用户数据）",
        governedAt: new Date(),
        isRegression: true,
      })),
    )
    .returning({ id: cases.id });
  return rows.length;
}

/** 插入新showcase（36条：来源case、完整场景、断言、快照、质量分解、多标签）。 */
async function insertNewShowcases(
  tx: DbClient,
  manifest: RclManifest,
): Promise<number> {
  if (manifest.newShowcase.length === 0) return 0;
  const rows = await tx
    .insert(showcaseCases)
    .values(
      manifest.newShowcase.map((s) => ({
        caseUid: s.uid ?? null,
        title: `政策案例 ${s.uid ?? ""}`,
        tags: s.multiLabels as unknown[],
        userMessage: "确定性模板生成的政策案例（无真实用户数据）",
        aiResponse: "由修复后的快照规划器计算期望",
        // RCL-FR-006/018/AC-011：完整场景事实逐字节落库（复审P0修复）。
        inputData: s.input,
        expectedData: s.expected,
        jurisdictionCode: s.jurisdictionCode,
        scenarioKey: s.scenarioKey,
        generatorVersion: manifest.generatorVersion,
        asOfDate: s.asOfDate,
        snapshotHash: s.snapshotHash,
        coverageObligations: s.coverageObligations as unknown[],
        evidence: s.evidence as unknown[],
        assertions: s.assertions as unknown[],
        sourceCaseUid: s.sourceCaseUid,
        snapshotId: s.snapshotId ? (s.snapshotId as never) : undefined,
        qualityScore: s.qualityScore,
        qualityBreakdown: s.qualityBreakdown as Record<string, unknown>,
        multiLabels: s.multiLabels as unknown[],
        qualityStatus: "selected" as const,
        contentHash: s.contentHash,
        curatedAt: new Date(),
        curatedBy: "rcl-generator",
        isPublished: true,
      })),
    )
    .returning({ id: showcaseCases.id });
  return rows.length;
}

/** 插入新地区回归tests（N条，一对一source_case_uid，完整input/expected）。 */
async function insertNewTests(
  tx: DbClient,
  manifest: RclManifest,
): Promise<number> {
  if (manifest.newTests.length === 0) return 0;
  const rows = await tx
    .insert(tests)
    .values(
      manifest.newTests.map((t) => ({
        name: t.uid ?? "",
        jurisdictionCode: t.jurisdictionCode,
        input: t.input,
        expected: t.expected,
        ruleId: t.ruleId ?? null,
        source: "regression" as const,
        sourceCaseUid: t.sourceCaseUid,
      })),
    )
    .returning({ id: tests.id });
  return rows.length;
}

/**
 * 受控替换apply（RCL-FR-018/019/020）：
 * 状态条件更新 restore_verified→applying→applied；FOR UPDATE + 唯一约束并发裁决。
 */
export async function executeRclApply(input: RclApplyInput): Promise<RclApplyResult> {
  return input.db.transaction(async (tx) => {
    // 1) 行锁 + 状态机：restore_verified → applying。
    const batch = await lockBatch(tx, input.batchId);
    if (batch.status === "applied") {
      return {
        deletedCases: 0,
        deletedShowcases: 0,
        deletedTests: 0,
        insertedCases: 0,
        insertedShowcases: 0,
        insertedTests: 0,
        noop: true,
      };
    }
    assertRestoreVerified(batch);
    if (batch.manifestHash !== input.manifest.manifestHash) {
      throw new RclApplyRejectedError(
        `manifest哈希不匹配：批次=${batch.manifestHash}，输入=${input.manifest.manifestHash}`,
      );
    }
    const toApplying = await tx
      .update(caseArchiveBatches)
      .set({ status: "applying" })
      .where(
        and(
          eq(caseArchiveBatches.id, input.batchId),
          eq(caseArchiveBatches.status, "restore_verified"),
        ),
      )
      .returning({ id: caseArchiveBatches.id });
    if (toApplying.length === 0) {
      // 并发：另一组已推进状态 → 确定性no-op。
      return {
        deletedCases: 0,
        deletedShowcases: 0,
        deletedTests: 0,
        insertedCases: 0,
        insertedShowcases: 0,
        insertedTests: 0,
        noop: true,
      };
    }

    input.failurePoint?.("after-applying");

    // 2) 逐行核对旧目标（RCL-AC-003）。
    await verifyOldTargets(tx, input.manifest);
    input.failurePoint?.("after-verify-old");

    // 2.5) 完整场景字段校验（RCL-FR-018/AC-011 fail-closed）。
    assertCompleteScenarioFields(input.manifest);
    input.failurePoint?.("after-verify-scenario-fields");

    // 3) 删除旧目标（精确行ID）。
    const deleted = await deleteOldTargets(tx, input.manifest);
    input.failurePoint?.("after-delete-old");

    // 4) 插入新 N/36/N。
    const insertedCases = await insertNewCases(tx, input.manifest);
    const insertedShowcases = await insertNewShowcases(tx, input.manifest);
    const insertedTests = await insertNewTests(tx, input.manifest);
    input.failurePoint?.("after-insert-new");

    // 5) 归档条目唯一约束兜底（RCL-FR-019）：旧行删除前已写入归档索引，
    //    唯一约束保证同批次同实体只一条（此处校验批次条目已存在）。
    const entryCount = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(caseArchiveEntries)
      .where(eq(caseArchiveEntries.archiveBatchId, input.batchId));
    if (Number(entryCount[0]?.n ?? 0) === 0) {
      throw new RclApplyRejectedError("归档条目缺失：apply前必须先写入归档索引");
    }

    // 6) 批次 → applied。
    await tx
      .update(caseArchiveBatches)
      .set({ status: "applied" })
      .where(eq(caseArchiveBatches.id, input.batchId));

    return {
      deletedCases: deleted.cases,
      deletedShowcases: deleted.showcase,
      deletedTests: deleted.tests,
      insertedCases,
      insertedShowcases,
      insertedTests,
      noop: false,
    };
  });
}

export { assertRestoreVerified };