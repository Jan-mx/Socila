/**
 * RCL-FR-018/019/020、RCL-AC-010/011 受控替换apply：
 * - 门禁：批次必须restore_verified；manifestHash必须与批次一致；manifest正文
 *   重算hash必须与声明hash一致（RCL第三轮复审：三方一致fail-closed）；未applied；
 * - 状态机：restore_verified → applying → applied（条件更新，0行必须失败）；
 *   批次行 `FOR UPDATE` 锁定，`applying` 状态与归档条目唯一约束共同裁决并发
 *   （RCL-AC-010：两个并发apply只有一组写入，另一组确定性no-op）；
 * - 单事务：逐行核对旧目标（manifest绑定行ID+内容hash，RCL-AC-003）→ 42条
 *   DSL example原子同步（保留/更新/新增/删除，RCL-FR-018）→ 删除旧
 *   452/36/500 → 插入新 N/36/N → 落库行hash核对 → 标记applied；任一步失败
 *   整体回滚（example同步失败同样全部回滚）；
 * - 旧regression test按完整业务行重算hash（RCL-FR-002，第三轮复审：修改
 *   name/jurisdictionCode/ruleId/input/paramsOverride/expected/source/
 *   sourceCaseUid任一字段均拒绝，不能只比较sourceCaseUid）；
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
import { rowContentHash, testRowContentHash, CASE_INFRA_COLUMNS, SHOWCASE_INFRA_COLUMNS } from "./hashes";
import {
  assertManifestContentHashes,
  recomputeManifestHash,
  type RclManifest,
} from "./manifest";

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
  /** RCL第三轮复审（Fix 8）：落库新行的实际DB ID/UID/重算hash（与manifest逐项一致）。 */
  verifiedRows: {
    cases: Array<{ dbId: number; uid: string; hash: string }>;
    showcase: Array<{ dbId: number; uid: string; hash: string }>;
    tests: Array<{ dbId: number; uid: string; hash: string }>;
  };
}

export class RclApplyRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RclApplyRejectedError";
  }
}

const EMPTY_VERIFIED_ROWS = { cases: [], showcase: [], tests: [] };

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
      ? rowContentHash(row as Record<string, unknown>, CASE_INFRA_COLUMNS)
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
      ? rowContentHash(row as Record<string, unknown>, SHOWCASE_INFRA_COLUMNS)
      : "";
    if (!row || rowHash !== target.contentHash) {
      throw new RclApplyRejectedError(
        `旧showcase行 ${target.rowId} 内容hash漂移（RCL-AC-003）：manifest=${target.contentHash.slice(0, 16)} 重算=${rowHash.slice(0, 16)}`,
      );
    }
  }

  // tests：读取完整业务行并重算hash（RCL第三轮复审P0修复——不能只比较sourceCaseUid）。
  const testIds = oldTests.map((r) => r.rowId);
  const testRows = testIds.length
    ? (await tx.execute(sql`SELECT * FROM "tests" WHERE id IN (${sql.join(testIds, sql.raw(", "))})`)).rows
    : [];
  if (testRows.length !== oldTests.length) {
    throw new RclApplyRejectedError(
      `旧tests目标行数不符：manifest ${oldTests.length}，实际 ${testRows.length}（RCL-AC-003）`,
    );
  }
  for (const target of oldTests) {
    const row = testRows.find((r) => Number((r as { id: number }).id) === target.rowId);
    const rowHash = row ? testRowContentHash(row as Record<string, unknown>) : "";
    if (!row || rowHash !== target.contentHash) {
      throw new RclApplyRejectedError(
        `旧test行 ${target.rowId} 内容hash漂移（RCL-AC-003）：manifest=${target.contentHash.slice(0, 16)} 重算=${rowHash.slice(0, 16)}`,
      );
    }
  }
}

/**
 * 42条DSL example原子同步（RCL-FR-018/AC-011，第三轮复审）：
 * retained保持不动（重算hash核对）；updated更新为DSL目标内容（重算旧hash核对）；
 * added插入缺失目标；deleted删除非DSL集合（重算hash核对）。全部与旧案例删除、
 * 新案例插入位于同一个apply事务；任一失败整体回滚。
 */
async function syncExamples(
  tx: DbClient,
  manifest: RclManifest,
): Promise<{ deleted: number; updated: number; added: number }> {
  const { retained, updated, added, deleted } = manifest.exampleSync;

  // retained：逐行重算hash必须与manifest一致。
  const retainedIds = retained.map((r) => r.rowId);
  if (retainedIds.length > 0) {
    const rows = (await tx.execute(sql`SELECT * FROM "tests" WHERE id IN (${sql.join(retainedIds, sql.raw(", "))})`)).rows;
    if (rows.length !== retainedIds.length) {
      throw new RclApplyRejectedError("example保留集合行数不符（RCL-FR-018）");
    }
    for (const target of retained) {
      const row = rows.find((r) => Number((r as { id: number }).id) === target.rowId);
      const hash = row ? testRowContentHash(row as Record<string, unknown>) : "";
      if (!row || hash !== target.contentHash) {
        throw new RclApplyRejectedError(`example保留行 ${target.rowId} 内容hash漂移（RCL-FR-018）`);
      }
    }
  }

  // updated：旧hash核对后更新为DSL目标内容。
  for (const u of updated) {
    const rows = (await tx.execute(sql`SELECT * FROM "tests" WHERE id = ${u.rowId}`)).rows;
    if (rows.length !== 1) {
      throw new RclApplyRejectedError(`example更新行 ${u.rowId} 缺失（RCL-FR-018）`);
    }
    const hash = testRowContentHash(rows[0] as Record<string, unknown>);
    if (hash !== u.contentHash) {
      throw new RclApplyRejectedError(`example更新行 ${u.rowId} 内容hash漂移（RCL-FR-018）：manifest=${u.contentHash.slice(0, 12)} 重算=${hash.slice(0, 12)}`);
    }
    // updated集合自身携带完整目标内容（RCL-FR-018）。
    await tx.execute(sql`
      UPDATE "tests" SET name = ${u.name}, jurisdiction_code = ${u.jurisdictionCode},
        rule_id = ${u.ruleId}, input = ${JSON.stringify(u.input)}::jsonb,
        params_override = ${u.paramsOverride === null ? null : JSON.stringify(u.paramsOverride)}::jsonb,
        expected = ${JSON.stringify(u.expected)}::jsonb, source = 'example',
        updated_at = now()
      WHERE id = ${u.rowId}`);
  }

  // added：插入缺失的DSL目标。
  for (const a of added) {
    const dup = (await tx.execute(sql`SELECT id FROM "tests" WHERE name = ${a.name} AND jurisdiction_code = ${a.jurisdictionCode}`)).rows;
    if (dup.length > 0) {
      throw new RclApplyRejectedError(`example新增目标已存在：${a.name}（RCL-FR-018）`);
    }
    await tx.execute(sql`
      INSERT INTO "tests" (name, jurisdiction_code, rule_id, input, params_override, expected, source)
      VALUES (${a.name}, ${a.jurisdictionCode}, ${a.ruleId}, ${JSON.stringify(a.input)}::jsonb,
              ${a.paramsOverride === null ? null : JSON.stringify(a.paramsOverride)}::jsonb,
              ${JSON.stringify(a.expected)}::jsonb, 'example')`);
  }

  // deleted：重算hash核对后删除。
  for (const d of deleted) {
    const rows = (await tx.execute(sql`SELECT * FROM "tests" WHERE id = ${d.rowId}`)).rows;
    if (rows.length !== 1) {
      throw new RclApplyRejectedError(`example删除行 ${d.rowId} 缺失（RCL-FR-018）`);
    }
    const hash = testRowContentHash(rows[0] as Record<string, unknown>);
    if (hash !== d.contentHash) {
      throw new RclApplyRejectedError(`example删除行 ${d.rowId} 内容hash漂移（RCL-FR-018）`);
    }
    await tx.execute(sql`DELETE FROM "tests" WHERE id = ${d.rowId}`);
  }

  return { deleted: deleted.length, updated: updated.length, added: added.length };
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
 * 落库新行hash核对（RCL第三轮复审Fix 8）：插入后按稳定UID读取全部新
 * cases/showcase/regression tests，重算完整数据库行hash并与manifest逐项比较；
 * 返回实际数据库ID/UID/hash。任一新行漂移 → 抛错回滚（零写入）。
 */
async function verifyNewRowHashes(
  tx: DbClient,
  manifest: RclManifest,
): Promise<RclApplyResult["verifiedRows"]> {
  const result: RclApplyResult["verifiedRows"] = { cases: [], showcase: [], tests: [] };

  if (manifest.newCases.length > 0) {
    const uids = manifest.newCases.map((c) => c.uid!).filter(Boolean);
    const rows = uids.length
      ? (await tx.execute(sql`SELECT * FROM "cases" WHERE case_uid IN (${sql.join(uids, sql.raw(", "))}) ORDER BY id`)).rows
      : [];
    if (rows.length !== manifest.newCases.length) {
      throw new RclApplyRejectedError(`落库新cases行数不符：${rows.length} ≠ ${manifest.newCases.length}（Fix 8）`);
    }
    for (const c of manifest.newCases) {
      const row = rows.find((r) => (r as { case_uid: string | null }).case_uid === c.uid);
      const hash = row ? rowContentHash(row as Record<string, unknown>, CASE_INFRA_COLUMNS) : "";
      if (!row || hash !== c.contentHash) {
        throw new RclApplyRejectedError(
          `落库新case ${c.uid} 内容hash漂移（Fix 8）：manifest=${c.contentHash.slice(0, 16)} 重算=${hash.slice(0, 16)}`,
        );
      }
      result.cases.push({ dbId: Number((row as { id: number }).id), uid: c.uid!, hash });
    }
  }

  if (manifest.newShowcase.length > 0) {
    const uids = manifest.newShowcase.map((s) => s.uid!).filter(Boolean);
    const rows = uids.length
      ? (await tx.execute(sql`SELECT * FROM "showcase_cases" WHERE case_uid IN (${sql.join(uids, sql.raw(", "))}) ORDER BY id`)).rows
      : [];
    if (rows.length !== manifest.newShowcase.length) {
      throw new RclApplyRejectedError(`落库新showcase行数不符：${rows.length} ≠ ${manifest.newShowcase.length}（Fix 8）`);
    }
    for (const s of manifest.newShowcase) {
      const row = rows.find((r) => (r as { case_uid: string | null }).case_uid === s.uid);
      const hash = row ? rowContentHash(row as Record<string, unknown>, SHOWCASE_INFRA_COLUMNS) : "";
      if (!row || hash !== s.contentHash) {
        throw new RclApplyRejectedError(
          `落库新showcase ${s.uid} 内容hash漂移（Fix 8）：manifest=${s.contentHash.slice(0, 16)} 重算=${hash.slice(0, 16)}`,
        );
      }
      result.showcase.push({ dbId: Number((row as { id: number }).id), uid: s.uid!, hash });
    }
  }

  if (manifest.newTests.length > 0) {
    const names = manifest.newTests.map((t) => t.uid!).filter(Boolean);
    const rows = names.length
      ? (await tx.execute(sql`SELECT * FROM "tests" WHERE name IN (${sql.join(names, sql.raw(", "))}) AND source = 'regression' ORDER BY id`)).rows
      : [];
    if (rows.length !== manifest.newTests.length) {
      throw new RclApplyRejectedError(`落库新tests行数不符：${rows.length} ≠ ${manifest.newTests.length}（Fix 8）`);
    }
    for (const t of manifest.newTests) {
      const row = rows.find((r) => (r as { name: string }).name === t.uid);
      const hash = row ? testRowContentHash(row as Record<string, unknown>) : "";
      if (!row || hash !== t.contentHash) {
        throw new RclApplyRejectedError(
          `落库新test ${t.uid} 内容hash漂移（Fix 8）：manifest=${t.contentHash.slice(0, 16)} 重算=${hash.slice(0, 16)}`,
        );
      }
      result.tests.push({ dbId: Number((row as { id: number }).id), uid: t.uid!, hash });
    }
  }

  return result;
}

/**
 * 最终状态核对（WI-20260907-03第四轮复审）：applied幂等重验与Fix 8共用。
 * 对manifest声明的最终状态逐项核对：
 * - 全表计数（cases/showcase/tests）=== manifest.counts（任一最终行缺失/增加即漂移）；
 * - cases/showcase/regression tests按稳定UID/name重算完整行hash逐项比较；
 * - example精确42条（manifest.exampleTests集合）且逐行hash一致，库中不允许
 *   存在目标集合之外的example行。
 * 返回mismatches（空数组=完全一致）与落库行的实际DB ID/UID/hash。
 */
async function checkFinalState(
  tx: DbClient,
  manifest: RclManifest,
): Promise<{ mismatches: string[]; verifiedRows: RclApplyResult["verifiedRows"] }> {
  const mismatches: string[] = [];
  const verifiedRows: RclApplyResult["verifiedRows"] = { cases: [], showcase: [], tests: [] };

  const countTable = async (table: string): Promise<number> => {
    const r = await tx.execute(sql.raw(`SELECT count(*)::int AS n FROM ${table}`));
    return Number((r.rows[0] as { n: number }).n ?? 0);
  };
  const caseN = await countTable('"cases"');
  const showN = await countTable('"showcase_cases"');
  const testN = await countTable('"tests"');
  if (caseN !== manifest.counts.cases) mismatches.push(`最终cases ${caseN} ≠ manifest ${manifest.counts.cases}`);
  if (showN !== manifest.counts.showcase) mismatches.push(`最终showcase ${showN} ≠ manifest ${manifest.counts.showcase}`);
  if (testN !== manifest.counts.tests) mismatches.push(`最终tests ${testN} ≠ manifest ${manifest.counts.tests}`);

  if (manifest.newCases.length > 0) {
    const uids = manifest.newCases.map((c) => c.uid!).filter(Boolean);
    const rows = uids.length
      ? (await tx.execute(sql`SELECT * FROM "cases" WHERE case_uid IN (${sql.join(uids, sql.raw(", "))}) ORDER BY id`)).rows
      : [];
    if (rows.length !== manifest.newCases.length) {
      mismatches.push(`最终cases行数 ${rows.length} ≠ manifest ${manifest.newCases.length}`);
    }
    for (const c of manifest.newCases) {
      const row = rows.find((r) => (r as { case_uid: string | null }).case_uid === c.uid);
      if (!row) {
        mismatches.push(`最终case ${c.uid} 缺失`);
        continue;
      }
      const hash = rowContentHash(row as Record<string, unknown>, CASE_INFRA_COLUMNS);
      if (hash !== c.contentHash) {
        mismatches.push(`最终case ${c.uid} hash漂移`);
      } else {
        verifiedRows.cases.push({ dbId: Number((row as { id: number }).id), uid: c.uid!, hash });
      }
    }
  }

  if (manifest.newShowcase.length > 0) {
    const uids = manifest.newShowcase.map((s) => s.uid!).filter(Boolean);
    const rows = uids.length
      ? (await tx.execute(sql`SELECT * FROM "showcase_cases" WHERE case_uid IN (${sql.join(uids, sql.raw(", "))}) ORDER BY id`)).rows
      : [];
    if (rows.length !== manifest.newShowcase.length) {
      mismatches.push(`最终showcase行数 ${rows.length} ≠ manifest ${manifest.newShowcase.length}`);
    }
    for (const s of manifest.newShowcase) {
      const row = rows.find((r) => (r as { case_uid: string | null }).case_uid === s.uid);
      if (!row) {
        mismatches.push(`最终showcase ${s.uid} 缺失`);
        continue;
      }
      const hash = rowContentHash(row as Record<string, unknown>, SHOWCASE_INFRA_COLUMNS);
      if (hash !== s.contentHash) {
        mismatches.push(`最终showcase ${s.uid} hash漂移`);
      } else {
        verifiedRows.showcase.push({ dbId: Number((row as { id: number }).id), uid: s.uid!, hash });
      }
    }
  }

  if (manifest.newTests.length > 0) {
    const names = manifest.newTests.map((t) => t.uid!).filter(Boolean);
    const rows = names.length
      ? (await tx.execute(sql`SELECT * FROM "tests" WHERE name IN (${sql.join(names, sql.raw(", "))}) AND source = 'regression' ORDER BY id`)).rows
      : [];
    if (rows.length !== manifest.newTests.length) {
      mismatches.push(`最终regression行数 ${rows.length} ≠ manifest ${manifest.newTests.length}`);
    }
    for (const t of manifest.newTests) {
      const row = rows.find((r) => (r as { name: string }).name === t.uid);
      if (!row) {
        mismatches.push(`最终test ${t.uid} 缺失`);
        continue;
      }
      const hash = testRowContentHash(row as Record<string, unknown>);
      if (hash !== t.contentHash) {
        mismatches.push(`最终test ${t.uid} hash漂移`);
      } else {
        verifiedRows.tests.push({ dbId: Number((row as { id: number }).id), uid: t.uid!, hash });
      }
    }
  }

  // example：最终库中example行必须与manifest.exampleTests目标集合逐一对应。
  const exampleRows = (await tx.execute(sql`SELECT * FROM "tests" WHERE source = 'example' ORDER BY id`)).rows;
  if (exampleRows.length !== manifest.exampleTests.length) {
    mismatches.push(`最终example ${exampleRows.length} ≠ manifest目标 ${manifest.exampleTests.length}`);
  }
  for (const t of manifest.exampleTests) {
    const row = exampleRows.find(
      (r) =>
        String((r as { name: string }).name) === t.uid &&
        String((r as { jurisdiction_code: string | null }).jurisdiction_code ?? "") === String(t.jurisdictionCode ?? ""),
    );
    if (!row) {
      mismatches.push(`最终example ${t.uid} 缺失`);
      continue;
    }
    const hash = testRowContentHash(row as Record<string, unknown>);
    if (hash !== t.contentHash) mismatches.push(`最终example ${t.uid} hash漂移`);
  }
  for (const row of exampleRows) {
    const found = manifest.exampleTests.some(
      (t) =>
        t.uid === String((row as { name: string }).name) &&
        String(t.jurisdictionCode ?? "") === String((row as { jurisdiction_code: string | null }).jurisdiction_code ?? ""),
    );
    if (!found) mismatches.push(`最终example ${String((row as { name: string }).name)} 不在manifest目标集合`);
  }

  return { mismatches, verifiedRows };
}

/**
 * 受控替换apply（RCL-FR-018/019/020）：
 * 状态条件更新 restore_verified→applying→applied；FOR UPDATE + 唯一约束并发裁决。
 */
export async function executeRclApply(input: RclApplyInput): Promise<RclApplyResult> {
  return input.db.transaction(async (tx) => {
    // 0) manifest自校验（RCL第三轮复审）：正文重算hash必须与声明hash一致。
    if (recomputeManifestHash(input.manifest) !== input.manifest.manifestHash) {
      throw new RclApplyRejectedError(
        "manifest正文与声明manifestHash不一致（RCL-FR-005 fail-closed）",
      );
    }
    // 行绑定hash完整性（旧test必须64位非空SHA-256，RCL-FR-002）。
    assertManifestContentHashes(input.manifest);

    // 1) 行锁 + 状态机：restore_verified → applying。
    const batch = await lockBatch(tx, input.batchId);
    if (batch.manifestHash !== input.manifest.manifestHash) {
      throw new RclApplyRejectedError(
        `manifest哈希不匹配：批次=${batch.manifestHash}，输入=${input.manifest.manifestHash}`,
      );
    }
    if (batch.status === "applied") {
      // WI-20260907-03第四轮复审：applied不得直接noop——必须先重验manifest正文
      // hash、批次hash、最终N/36/N+42、42条example与cases/showcase/regression
      // 逐行hash；完全一致才返回noop。任一最终行缺失/增加/漂移返回稳定错误，
      // 且不得再次删除或插入（零写入）。
      const { mismatches, verifiedRows } = await checkFinalState(tx, input.manifest);
      if (mismatches.length > 0) {
        throw new RclApplyRejectedError(
          `批次已applied但最终状态漂移（RCL-NFR-006 fail-closed，零写入）：${mismatches.slice(0, 10).join("；")}`,
        );
      }
      return {
        deletedCases: 0,
        deletedShowcases: 0,
        deletedTests: 0,
        insertedCases: 0,
        insertedShowcases: 0,
        insertedTests: 0,
        noop: true,
        verifiedRows,
      };
    }
    assertRestoreVerified(batch);
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
        verifiedRows: EMPTY_VERIFIED_ROWS,
      };
    }

    input.failurePoint?.("after-applying");

    // 2) 逐行核对旧目标（RCL-AC-003；旧test按完整业务行重算hash）。
    await verifyOldTargets(tx, input.manifest);
    input.failurePoint?.("after-verify-old");

    // 2.5) 完整场景字段校验（RCL-FR-018/AC-011 fail-closed）。
    assertCompleteScenarioFields(input.manifest);
    input.failurePoint?.("after-verify-scenario-fields");

    // 2.6) 42条DSL example原子同步（与旧案例删除、新案例插入同一事务）。
    await syncExamples(tx, input.manifest);
    input.failurePoint?.("after-example-sync");

    // 3) 删除旧目标（精确行ID）。
    const deleted = await deleteOldTargets(tx, input.manifest);
    input.failurePoint?.("after-delete-old");

    // 4) 插入新 N/36/N。
    const insertedCases = await insertNewCases(tx, input.manifest);
    const insertedShowcases = await insertNewShowcases(tx, input.manifest);
    const insertedTests = await insertNewTests(tx, input.manifest);
    input.failurePoint?.("after-insert-new");

    // 4.5) 落库新行hash核对（Fix 8）：逐项比较，任一漂移整体回滚。
    const verifiedRows = await verifyNewRowHashes(tx, input.manifest);
    input.failurePoint?.("after-verify-new-hashes");

    // 5) 归档条目唯一约束兜底（RCL-FR-019）：旧行删除前已写入归档索引，
    //    唯一约束保证同批次同实体只一条（此处校验批次条目已存在）。
    const entryCount = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(caseArchiveEntries)
      .where(eq(caseArchiveEntries.archiveBatchId, input.batchId));
    if (Number(entryCount[0]?.n ?? 0) === 0) {
      throw new RclApplyRejectedError("归档条目缺失：apply前必须先写入归档索引");
    }

    // 6) 批次 → applied（条件更新；0行必须失败，RCL第三轮复审）。
    const toApplied = await tx
      .update(caseArchiveBatches)
      .set({ status: "applied" })
      .where(and(eq(caseArchiveBatches.id, input.batchId), eq(caseArchiveBatches.status, "applying")))
      .returning({ id: caseArchiveBatches.id });
    if (toApplied.length === 0) {
      throw new RclApplyRejectedError("批次状态更新失败（applying→applied返回0行）");
    }

    return {
      deletedCases: deleted.cases,
      deletedShowcases: deleted.showcase,
      deletedTests: deleted.tests,
      insertedCases,
      insertedShowcases,
      insertedTests,
      noop: false,
      verifiedRows,
    };
  });
}

export { assertRestoreVerified };
