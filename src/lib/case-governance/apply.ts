/**
 * CLG-FR-015/AC-009/010/013/014 受控治理apply：
 * - 门禁：批次必须restore_verified、manifestHash必须与批次一致、未applied；
 * - 单事务：回填治理字段 → 写入归档索引 → 删除399/81 → 标记批次applied；
 *   任一步失败整体回滚（CLG-NFR-006，不留半治理状态）；
 * - 重复apply被拒绝（幂等no-op语义）；
 * - 全部校验在事务内重新执行（防audit后变化）。
 */
import { eq, inArray, not, sql } from "drizzle-orm";
import { normalizeSourceCaseUid } from "@/lib/import/excel-import";

function normalizeSourceUid(value: string): string {
  return normalizeSourceCaseUid(value);
}
import type { DbClient } from "@/lib/db";
import { caseArchiveBatches, cases, showcaseCases } from "@/lib/db/schema";
import { assertRestoreVerified } from "./archive";
import { rowContentHash } from "./hashes";

export interface GovernanceApplyInput {
  db: DbClient;
  manifestHash: string;
  batchId: string;
  curatedShowcaseUids: string[];
  snapshotId: string | null;
  actor: string;
  /** 批次必须restore_verified才允许apply（CLG-NFR-001）。 */
  requireRestoreVerified?: boolean;
  curator?: string;
  /** 测试故障注入钩子：在指定步骤抛错（验证事务回滚）。 */
  failurePoint?: (step: string) => void;
  /** 回归测试来源链回填（CLG-FR-004）：tests.name -> 归一化source_case_uid。
   *  历史库（持久库）tests未持久化来源UID时由调用方从工作簿构建；
   *  已回填的库传空Map即可（幂等跳过）。 */
  regressionSourceUids?: Map<string, string>;
}

export interface GovernanceApplyResult {
  deletedCases: number;
  deletedShowcases: number;
}

export interface ApplyGateResult {
  allowed: boolean;
  reason?: string;
}

export async function isGovernanceApplyAllowed(
  db: DbClient,
  opts: { manifestHash: string; requireRestoreVerified?: boolean },
): Promise<ApplyGateResult> {
  const batches = await db
    .select()
    .from(caseArchiveBatches)
    .where(eq(caseArchiveBatches.manifestHash, opts.manifestHash))
    .limit(1);
  if (batches.length === 0) {
    return { allowed: false, reason: `manifest ${opts.manifestHash} 无归档批次` };
  }
  const batch = batches[0];
  if (opts.requireRestoreVerified && batch.status !== "restore_verified") {
    return { allowed: false, reason: `批次状态「${batch.status}」未达到restore_verified` };
  }
  if (batch.status === "applied") {
    return { allowed: false, reason: "批次已applied，重复apply拒绝（幂等no-op）" };
  }
  return { allowed: true };
}

export async function isGovernanceApplied(
  db: DbClient,
): Promise<{ applied: boolean }> {
  const rows = await db
    .select({ status: caseArchiveBatches.status })
    .from(caseArchiveBatches)
    .where(eq(caseArchiveBatches.status, "applied"))
    .limit(1);
  return { applied: rows.length > 0 };
}

export async function executeGovernanceApply(
  input: GovernanceApplyInput,
): Promise<GovernanceApplyResult> {
  return input.db.transaction(async (tx) => {
    // 门禁1：manifest哈希对应批次必须存在且restore_verified
    const batches = await tx
      .select()
      .from(caseArchiveBatches)
      .where(eq(caseArchiveBatches.id, input.batchId))
      .limit(1);
    if (batches.length === 0) {
      throw new Error(`归档批次 ${input.batchId} 不存在`);
    }
    const batch = batches[0];
    if (input.requireRestoreVerified) {
      assertRestoreVerified(batch);
    } else if (batch.status === "prepared") {
      throw new Error(
        `归档批次 ${input.batchId} 状态为prepared，恢复验证通过前禁止apply`,
      );
    }
    if (batch.status === "applied") {
      throw new Error(
        `归档批次 ${input.batchId} 已applied，重复apply拒绝（幂等no-op）`,
      );
    }
    if (batch.manifestHash !== input.manifestHash) {
      throw new Error(
        `manifest哈希不匹配：批次=${batch.manifestHash}，输入=${input.manifestHash}`,
      );
    }

    // 门禁2：当前库状态与归档批次记录的治理前基线一致（audit后变化必须停止）。
    // cases/showcase为固定基线851/117；tests以批次sourceCounts为准
    // （持久库528=500回归+28上海示例；全新seed含CN/GD/SC DSL示例，治理均不删除测试）。
    const counts = await tx.execute(sql`
      select
        (select count(*)::int from cases) cases,
        (select count(*)::int from showcase_cases) showcase,
        (select count(*)::int from tests) tests`);
    const row = counts.rows[0] as { cases: number; showcase: number; tests: number };
    const baselineTests = Number(
      (batch.sourceCounts as Record<string, unknown>).tests ?? 528,
    );
    if (
      Number(row.cases) !== 851 ||
      Number(row.showcase) !== 117 ||
      Number(row.tests) !== baselineTests
    ) {
      throw new Error(
        `治理前基线偏离851/117/${baselineTests}（当前${row.cases}/${row.showcase}/${row.tests}），audit后变化，apply停止`,
      );
    }

    input.failurePoint?.("validation");

    // 门禁3：删除集合完整性——451回归 + 117展示来源 = 452保留
    const keepResult = await tx.execute(sql`
      select case_uid from cases
      where is_regression or exists (
        select 1 from showcase_cases s
        where regexp_replace(s.case_uid, '-[0-9]{2}$', '') = cases.case_uid)`);
    const keptUids = new Set(
      keepResult.rows.map((r) => String((r as { case_uid: string }).case_uid)),
    );
    if (keptUids.size !== 452) {
      throw new Error(`保留案例集合为${keptUids.size}条，偏离固定452，apply停止`);
    }

    input.failurePoint?.("after-keep-check");

    // 回填治理字段：保留452条 active + 业务内容哈希（CLG-FR-002/005）
    const governedAt = new Date();
    const retainedRows = await tx
      .select()
      .from(cases)
      .where(inArray(cases.caseUid, Array.from(keptUids)));
    const caseHashes = new Map<string, string>();
    for (const row of retainedRows) {
      caseHashes.set(
        row.caseUid ?? "",
        rowContentHash(
          {
            case_uid: row.caseUid,
            creator: row.creator,
            post_date: row.postDate,
            video_id: row.videoId,
            topics: row.topics,
            case_text: row.caseText,
            transcript_text: row.transcriptText,
            tags: row.tags,
            is_regression: row.isRegression,
            source_file: row.sourceFile,
            jurisdiction_code: row.jurisdictionCode,
          },
          ["id", "created_at", "updated_at"],
        ),
      );
    }
    for (const [uid, hash] of caseHashes) {
      await tx
        .update(cases)
        .set({ contentHash: hash })
        .where(eq(cases.caseUid, uid));
    }
    await tx
      .update(cases)
      .set({
        jurisdictionCode: "310000",
        qualityStatus: "active",
        governanceReason: "回归或展示来源保留（CLG治理）",
        governedAt,
      })
      .where(inArray(cases.caseUid, Array.from(keptUids)));

    input.failurePoint?.("after-case-backfill");

    // 归档索引：写入399 + 81条（先索引后删除，保留原ID/哈希/原因）
    const deleteCandidates = await tx.execute(sql.raw(
      `select id, case_uid, content_hash from cases where case_uid not in (${Array.from(keptUids).map((u) => `'${u.replace(/'/g, "''")}'`).join(",")})`,
    ));
    const deleteShowcase = await tx
      .select({ id: showcaseCases.id, caseUid: showcaseCases.caseUid, contentHash: showcaseCases.contentHash })
      .from(showcaseCases)
      .where(not(inArray(showcaseCases.caseUid, input.curatedShowcaseUids)));
    for (const row of deleteCandidates.rows as Array<{ id: number; case_uid: string; content_hash: string | null }>) {
      await tx.execute(sql`
        INSERT INTO case_archive_entries
          (archive_batch_id, entity_type, entity_id, case_uid, content_hash, archive_reason)
        VALUES (${input.batchId}, 'case', ${row.id}, ${row.case_uid},
          ${row.content_hash ?? rowContentHash({ caseUid: row.case_uid }, [])},
          'CLG治理：无回归或展示保留理由（399条精确集合）')`);
    }
    for (const row of deleteShowcase) {
      await tx.execute(sql`
        INSERT INTO case_archive_entries
          (archive_batch_id, entity_type, entity_id, case_uid, content_hash, archive_reason)
        VALUES (${input.batchId}, 'showcase_case', ${row.id}, ${row.caseUid},
          ${row.contentHash ?? "pending"},
          'CLG治理：未入选36条展示（81条精确集合）')`);
    }

    input.failurePoint?.("after-archive-index");

    // 回填展示：36条 selected + 来源UID + 内容哈希 + 快照绑定（CLG-FR-003/005）
    const selectedShowcase = await tx
      .select()
      .from(showcaseCases)
      .where(inArray(showcaseCases.caseUid, input.curatedShowcaseUids));
    for (const row of selectedShowcase) {
      await tx
        .update(showcaseCases)
        .set({
          sourceCaseUid: normalizeSourceUid(row.caseUid ?? ""),
          contentHash: rowContentHash(
            {
              case_uid: row.caseUid,
              title: row.title,
              tags: row.tags,
              user_message: row.userMessage,
              ai_response: row.aiResponse,
              input_data: row.inputData,
              expected_data: row.expectedData,
              category: row.category,
              is_published: row.isPublished,
              sort_order: row.sortOrder,
              jurisdiction_code: row.jurisdictionCode,
              source_case_uid: normalizeSourceUid(row.caseUid ?? ""),
            },
            ["id", "created_at", "updated_at", "snapshot_id", "curated_at", "curated_by"],
          ),
        })
        .where(eq(showcaseCases.caseUid, row.caseUid ?? ""));
    }
    await tx
      .update(showcaseCases)
      .set({
        jurisdictionCode: "310000",
        qualityStatus: "selected",
        snapshotId: input.snapshotId,
        curatedAt: governedAt,
        curatedBy: input.curator ?? input.actor,
      })
      .where(inArray(showcaseCases.caseUid, input.curatedShowcaseUids));

    // 回归测试来源链回填（CLG-FR-004）：历史库tests未持久化source_case_uid时
    // 从工作簿映射回填（与excel-import同源归一化）；已回填库传空Map为no-op。
    if (input.regressionSourceUids && input.regressionSourceUids.size > 0) {
      for (const [name, sourceUid] of input.regressionSourceUids) {
        await tx.execute(sql`
          UPDATE tests SET source_case_uid = ${sourceUid}
          WHERE name = ${name} AND source = 'regression'`);
      }
    }

    input.failurePoint?.("before-delete");

    // 精确删除：81条展示 + 399条案例（单事务）
    const deletedShowcases = await tx
      .delete(showcaseCases)
      .where(not(inArray(showcaseCases.caseUid, input.curatedShowcaseUids)))
      .returning({ id: showcaseCases.id });
    const deletedCases = await tx
      .delete(cases)
      .where(not(inArray(cases.caseUid, Array.from(keptUids))))
      .returning({ id: cases.id });

    input.failurePoint?.("after-delete");

    // 批次状态 → applied
    await tx
      .update(caseArchiveBatches)
      .set({ status: "applied" })
      .where(eq(caseArchiveBatches.id, input.batchId));

    const finalCounts = await tx.execute(sql`
      select
        (select count(*)::int from cases) cases,
        (select count(*)::int from showcase_cases) showcase,
        (select count(*)::int from tests) tests`);
    const final = finalCounts.rows[0] as { cases: number; showcase: number; tests: number };
    // 最终固定目标：452/36 + tests保持治理前数量（不删除任何测试）
    if (
      Number(final.cases) !== 452 ||
      Number(final.showcase) !== 36 ||
      Number(final.tests) !== baselineTests
    ) {
      throw new Error(
        `治理后计数偏离452/36/${baselineTests}（当前${final.cases}/${final.showcase}/${final.tests}），apply中止`,
      );
    }

    return {
      deletedCases: deletedCases.length,
      deletedShowcases: deletedShowcases.length,
    };
  });
}
