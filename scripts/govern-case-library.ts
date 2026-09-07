/**
 * CLG-FR-014 案例治理受控执行器（五种模式）：
 *
 *   npx tsx scripts/govern-case-library.ts audit
 *   npx tsx scripts/govern-case-library.ts prepare-archive
 *   npx tsx scripts/govern-case-library.ts verify-archive <manifestHash>
 *   npx tsx scripts/govern-case-library.ts apply <manifestHash> --i-am-authorized
 *   npx tsx scripts/govern-case-library.ts verify <manifestHash>
 *
 * - 默认只执行只读audit（CLG-FR-014）；apply必须携带授权参数与manifest哈希；
 * - DATABASE_URL必须进程显式设置且仅限本机（assertLocalDatabaseUrl，禁止dotenv回退）；
 * - apply只允许restore_verified批次，恢复验证通过前禁止删除（CLG-NFR-001）；
 * - 评分输出逐项原因（CLG-FR-006）；策展不满足全部覆盖约束时拒绝生成可执行manifest；
 * - verify-archive需要TARGET_DATABASE_URL指向全新PG17+pgvector恢复库做真实恢复对账；
 * - 归档写入 backup/case-library/<UTC时间戳>/（Git忽略，不进入镜像或提交）。
 */
import "../src/lib/env/load-environment";
import { assertLocalDatabaseUrl } from "../src/lib/db/guard";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { db } from "@/lib/db";
import { cases, showcaseCases, policySnapshots, caseArchiveBatches } from "@/lib/db/schema";
import { scoreShowcaseCandidate, type ShowcaseCandidateRecord } from "@/lib/case-governance/scoring";
import { checkEligibility } from "@/lib/case-governance/eligibility";
import { curateShowcase } from "@/lib/case-governance/curation";
import { buildGovernanceManifest, assertFixedTargetCounts } from "@/lib/case-governance/manifest";
import { normalizeCaseUid } from "@/lib/case-governance/source-chain";
import { snapshotMembersToReplayInput, compareReplayToExpected, type SnapshotReplayEnv } from "@/lib/case-governance/replay";
import { orchestrateInMemory } from "@/lib/engine/orchestrator";
import { executeGovernanceApply, isGovernanceApplyAllowed } from "@/lib/case-governance/apply";
import { reconcileDatabases } from "@/lib/case-governance/reconcile";
import { buildArchiveFileManifest } from "@/lib/case-governance/archive";
import * as XLSX from "xlsx";

const DATABASE_URL = assertLocalDatabaseUrl();
const AS_OF = "2026-09-07";
const ALGORITHM_VERSION = "CLG-CURATION-1.0";
const ACTOR = process.env.GOVERNANCE_ACTOR ?? "local-admin";

interface AuditOutput {
  sourceCounts: Record<string, unknown>;
  eligibleCount: number;
  curatedUids: string[];
  manifestHash: string;
  retainedCounts: Record<string, number>;
  deletedCounts: Record<string, number>;
  violations: string[];
  snapshotId: string | null;
}

async function loadShanghaiSnapshot(): Promise<{ snapshotId: string | null; replayEnv: SnapshotReplayEnv }> {
  const snap = await db
    .select({ id: policySnapshots.id })
    .from(policySnapshots)
    .where(sql`jurisdiction_code = '310000'`)
    .orderBy(sql`created_at desc`)
    .limit(1);
  if (snap.length === 0) return { snapshotId: null, replayEnv: { rules: [], params: {} } };
  const members = await db.execute(sql`
    select entity_type, business_key, payload from policy_snapshot_members
    where snapshot_id = ${snap[0].id}`);
  return {
    snapshotId: snap[0].id,
    replayEnv: snapshotMembersToReplayInput(
      members.rows as Array<{ entity_type: string; payload: unknown }>,
    ),
  };
}

async function runAudit(): Promise<AuditOutput> {
  // CLG-FR-001：只读基线核对，任一关键数量变化即停止
  const counts = await db.execute(sql`
    select
      (select count(*)::int from cases) cases,
      (select count(*)::int from cases where is_regression) regression,
      (select count(*)::int from showcase_cases) showcase,
      (select count(*)::int from tests) tests,
      (select count(*)::int from tests where source='regression') regression_tests`);
  const c = counts.rows[0] as Record<string, number>;
  if (c.cases !== 851 || c.regression !== 451 || c.showcase !== 117 || c.tests !== 528 || c.regression_tests !== 500) {
    throw new Error(
      `CLG-FR-001基线偏离：当前${c.cases}/${c.regression}/${c.showcase}/${c.tests}/${c.regression_tests}，期望851/451/117/528/500；停止并请求用户决策`,
    );
  }
  const dup = await db.execute(sql`
    select count(*)::int as n from (select case_uid from cases group by case_uid having count(*)>1) d`);
  if (Number(dup.rows[0].n) > 0) throw new Error("cases存在重复UID，停止");

  const { snapshotId, replayEnv } = await loadShanghaiSnapshot();
  if (!snapshotId) {
    throw new Error("310000候选快照不存在：36条展示案例必须绑定任务2上海候选快照（CLG-FR-003）");
  }

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
    scored.push({ ...record, qualityScore: score.total, eligible: gate.eligible });
  }
  const eligible = scored.filter((s) => s.eligible);
  const report = curateShowcase(eligible);

  const manifest = buildGovernanceManifest({
    algorithmVersion: ALGORITHM_VERSION,
    caseUids: (await db.select({ caseUid: cases.caseUid }).from(cases)).map((r) => r.caseUid ?? ""),
    regressionCaseUids: new Set(
      (await db.select({ caseUid: cases.caseUid }).from(cases).where(sql`is_regression`)).map((r) => r.caseUid ?? ""),
    ),
    showcaseRows: showRows.map((r) => ({ caseUid: r.caseUid ?? "", sourceCaseUid: normalizeCaseUid(r.caseUid ?? "") })),
    curatedShowcaseUids: report.selected,
    testCount: 528,
    regressionTestCount: 500,
    exampleTestCount: 28,
  });

  return {
    sourceCounts: manifest.sourceCounts,
    eligibleCount: eligible.length,
    curatedUids: report.selected,
    manifestHash: manifest.manifestHash,
    retainedCounts: manifest.retainedCounts,
    deletedCounts: manifest.deletedCounts,
    violations: report.violations,
    snapshotId,
  };
}

function runReplay(replayEnv: SnapshotReplayEnv, input: Record<string, unknown>, asOfDate: string) {
  const { rules: ruleDefs, params: flatParams } = replayEnv;
  if (ruleDefs.length === 0 || Object.keys(flatParams).length === 0) return { plan: {}, calc: {}, user: {} };
  const result = orchestrateInMemory(ruleDefs, flatParams, input, asOfDate);
  return { plan: result.plan, calc: result.calc, user: result.user };
}

/** 回归测试来源链映射（CLG-FR-004）：工作簿test_id -> 归一化source_case_uid。 */
function loadRegressionSourceUids(): Map<string, string> {
  const workbookPath = path.join(process.cwd(), "data", "runnable_testdata_from_cases_v5.xlsx");
  if (!existsSync(workbookPath)) return new Map();
  const wb = XLSX.read(readFileSync(workbookPath), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null }) as Array<{
    test_id?: string;
    name?: string;
    source_case_uid?: string;
  }>;
  const map = new Map<string, string>();
  for (const r of rows) {
    const name = String(r.test_id ?? r.name ?? "");
    if (name && r.source_case_uid) {
      map.set(name, String(r.source_case_uid).replace(/-\d{2}$/, ""));
    }
  }
  return map;
}

async function cmdAudit(): Promise<void> {
  const audit = await runAudit();
  process.stdout.write(`${JSON.stringify({ mode: "audit", ...audit }, null, 2)}\n`);
  if (audit.violations.length === 0) {
    assertFixedTargetCounts(audit.retainedCounts.cases, audit.retainedCounts.showcaseCases, audit.retainedCounts.tests);
    process.stdout.write(
      `audit PASS：保留${audit.retainedCounts.cases}/${audit.retainedCounts.showcaseCases}/${audit.retainedCounts.tests}，删除${audit.deletedCounts.cases}/${audit.deletedCounts.showcaseCases}，manifestHash=${audit.manifestHash}\n`,
    );
  } else {
    process.stdout.write(`audit FAIL：策展不满足覆盖约束（${audit.violations.join(", ")}），拒绝生成可执行manifest\n`);
    process.exitCode = 1;
  }
}

async function cmdPrepareArchive(): Promise<void> {
  const audit = await runAudit();
  if (audit.violations.length > 0) {
    throw new Error(`策展不满足全部覆盖约束（${audit.violations.join(", ")}），拒绝prepare-archive`);
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(process.cwd(), "backup", "case-library", ts);
  mkdirSync(dir, { recursive: true });

  // 归档批次（prepared）先落库再dump：恢复对账要求dump包含本批次记录
  await db.execute(sql`
    INSERT INTO case_archive_batches
      (id, status, source_counts, retained_counts, deleted_counts, table_hashes, manifest_hash, storage_path, created_by)
    VALUES (gen_random_uuid(), 'prepared',
      ${JSON.stringify(audit.sourceCounts)}::jsonb,
      ${JSON.stringify(audit.retainedCounts)}::jsonb,
      ${JSON.stringify(audit.deletedCounts)}::jsonb,
      '{}'::jsonb,
      ${audit.manifestHash},
      ${`backup/case-library/${ts}`},
      ${ACTOR})`);

  // 完整库dump + 案例三表dump（PG_DUMP_CMD可覆盖，如 docker exec <容器> pg_dump）
  const dumpCmd = process.env.PG_DUMP_CMD ?? "pg_dump";
  // 容器内执行pg_dump时用PG_DUMP_DATABASE_URL覆盖（如 docker exec <容器> pg_dump -U postgres）
  const dumpUrl = process.env.PG_DUMP_DATABASE_URL ?? DATABASE_URL;
  const runDump = (args: string[], outFile: string) => {
    // 直接捕获stdout写文件（避免bash重定向在Windows路径下的转义问题）
    const out = execFileSync("bash", ["-lc", `${dumpCmd} ${args.join(" ")}`], {
      env: process.env,
      encoding: "buffer",
      maxBuffer: 1024 * 1024 * 1024,
    });
    writeFileSync(outFile, out);
  };
  runDump(["-Fc", dumpUrl], path.join(dir, "policyops-fc.dump"));
  for (const table of ["cases", "showcase_cases", "tests"]) {
    runDump(["-Fc", "-t", table, dumpUrl], path.join(dir, `${table}.dump`));
  }

  const fileEntries = buildArchiveFileManifest({
    storagePath: `backup/case-library/${ts}`,
    tableDumpNames: ["cases", "showcase_cases", "tests"],
  });
  const manifestJson = {
    algorithmVersion: ALGORITHM_VERSION,
    audit: {
      sourceCounts: audit.sourceCounts,
      eligibleCount: audit.eligibleCount,
      curatedUids: audit.curatedUids,
      manifestHash: audit.manifestHash,
      retainedCounts: audit.retainedCounts,
      deletedCounts: audit.deletedCounts,
      snapshotId: audit.snapshotId,
    },
    files: fileEntries,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifestJson, null, 2));
  writeFileSync(path.join(dir, "sha256sums.txt"), `${fileEntries.map((e) => `${e.sha256}  ${e.fileName}`).join("\n")}\n`);
  writeFileSync(path.join(dir, "restore-report.json"), JSON.stringify({ status: "pending", reconciledAt: null, mismatches: [] }, null, 2));

  // 批次行保持dump时点不变（对账要求源库=恢复库逐行一致）；
  // table_hashes在verify-archive对账成功后从归档manifest.json回填。
  process.stdout.write(`prepare-archive PASS：${dir}
manifestHash=${audit.manifestHash}
`);
}

async function cmdVerifyArchive(manifestHash: string): Promise<void> {
  const targetUrl = process.env.TARGET_DATABASE_URL;
  if (!targetUrl) {
    throw new Error("verify-archive需要TARGET_DATABASE_URL指向全新PG17+pgvector恢复库（真实恢复对账）");
  }
  const batches = await db.select().from(caseArchiveBatches).where(sql`manifest_hash = ${manifestHash}`).limit(1);
  if (batches.length === 0) throw new Error(`manifest ${manifestHash} 无归档批次`);

  const pool = new pg.Pool({ connectionString: targetUrl, max: 1 });
  const restoredDb = drizzle({ client: pool });
  const reconcile = await reconcileDatabases(
    db,
    restoredDb as unknown as typeof db,
  );
  await pool.end();
  if (!reconcile.ok) {
    throw new Error(`恢复对账失败（${reconcile.mismatches.length}项）：${reconcile.mismatches.slice(0, 5).join("; ")}`);
  }
  // 对账成功后标记restore_verified并回填归档文件哈希（此时批次行不再变化）
  const storagePath = String(batches[0].storagePath);
  const manifestPath = path.join(process.cwd(), storagePath, "manifest.json");
  let tableHashes = "{}";
  if (existsSync(manifestPath)) {
    const archiveManifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
      files?: Array<{ fileName: string; sha256: string }>;
    };
    tableHashes = JSON.stringify(
      Object.fromEntries((archiveManifest.files ?? []).map((f) => [f.fileName, f.sha256])),
    );
  }
  await db.execute(sql`
    UPDATE case_archive_batches
    SET status='restore_verified', table_hashes=${tableHashes}::jsonb
    WHERE manifest_hash=${manifestHash}`);
  process.stdout.write(`verify-archive PASS：${reconcile.tableCount}张表对账一致，批次已标记restore_verified\n`);
}

async function cmdApply(manifestHash: string, authorized: boolean): Promise<void> {
  if (!authorized) {
    throw new Error("apply需要显式授权参数 --i-am-authorized");
  }
  const gate = await isGovernanceApplyAllowed(db, { manifestHash, requireRestoreVerified: true });
  if (!gate.allowed) {
    throw new Error(`apply被拒绝：${gate.reason}`);
  }
  // 重新执行只读audit（确定性保证与prepare一致），校验manifest哈希未漂移
  const audit = await runAudit();
  if (audit.manifestHash !== manifestHash) {
    throw new Error(`manifest哈希漂移：prepare=${manifestHash}，当前audit=${audit.manifestHash}；重新prepare-archive后再apply`);
  }
  const batch = (await db.select().from(caseArchiveBatches).where(sql`manifest_hash = ${manifestHash}`).limit(1))[0];
  const result = await executeGovernanceApply({
    db,
    manifestHash,
    batchId: batch.id,
    curatedShowcaseUids: audit.curatedUids,
    snapshotId: audit.snapshotId,
    actor: ACTOR,
    curator: ACTOR,
    // 历史库tests来源链回填（幂等：已回填的库传空Map）
    regressionSourceUids: loadRegressionSourceUids(),
  });
  process.stdout.write(
    `apply PASS：删除${result.deletedCases}条cases、${result.deletedShowcases}条showcase_cases；452/36/528核验通过\n`,
  );
}

async function cmdVerify(manifestHash: string): Promise<void> {
  const counts = await db.execute(sql`
    select
      (select count(*)::int from cases) cases,
      (select count(*)::int from showcase_cases) showcase,
      (select count(*)::int from tests) tests`);
  const c = counts.rows[0] as Record<string, number>;
  assertFixedTargetCounts(Number(c.cases), Number(c.showcase), Number(c.tests));
  const broken = await db.execute(sql`
    select count(*)::int as n from tests t
    where t.source='regression' and not exists (
      select 1 from cases c where c.case_uid = regexp_replace(t.source_case_uid,'-[0-9]{2}$',''))`);
  if (Number(broken.rows[0].n) > 0) throw new Error(`回归来源链断裂：${broken.rows[0].n}条无法解析`);
  const selected = await db.execute(sql`select count(*)::int as n from showcase_cases where quality_status='selected'`);
  if (Number(selected.rows[0].n) !== 36) throw new Error(`selected展示案例=${selected.rows[0].n}≠36`);
  const batch = (await db.select().from(caseArchiveBatches).where(sql`manifest_hash = ${manifestHash}`).limit(1))[0];
  if (!batch || batch.status !== "applied") throw new Error(`批次未applied：${manifestHash}`);
  process.stdout.write(`verify PASS：452/36/528、来源链完整、批次applied\n`);
}

async function main() {
  const [mode, arg1] = process.argv.slice(2);
  if (!mode) {
    process.stderr.write("用法：govern-case-library.ts audit | prepare-archive | verify-archive <hash> | apply <hash> --i-am-authorized | verify <hash>\n");
    process.exit(1);
  }
  switch (mode) {
    case "audit":
      await cmdAudit();
      break;
    case "prepare-archive":
      await cmdPrepareArchive();
      break;
    case "verify-archive":
      if (!arg1) throw new Error("verify-archive需要manifestHash参数");
      await cmdVerifyArchive(arg1);
      break;
    case "apply":
      if (!arg1) throw new Error("apply需要manifestHash参数");
      await cmdApply(arg1, process.argv.includes("--i-am-authorized"));
      break;
    case "verify":
      if (!arg1) throw new Error("verify需要manifestHash参数");
      await cmdVerify(arg1);
      break;
    default:
      throw new Error(`未知模式：${mode}`);
  }
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
