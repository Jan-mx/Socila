/**
 * WI-20260907-04 repair-forward执行器核心（可审计、确定性、单事务、幂等）。
 *
 * 目标持久事实（第五轮只读审计，绑定代码提交1fe702b及后续修复提交）：
 * - 迁移账本21条，ID 18/19/20为0012/0013/0014的CRLF重复登记 → 精确条件删除；
 * - prepared批次91d60c5f…（manifest c86fcc26…）→ rolled_back（保留其历史entries）；
 * - 新增确定性可信归档批次c8a7c104-8b8b-53f5-9bfd-1c8a8a6be141（restore_verified）
 *   及来自永久可信归档manifest的988条真实entries（452 case+36 showcase_case+500 test）；
 * - 36/36/78、10 snapshots、5 releases及全部业务表零变化。
 *
 * 单事务：账本删除、批次转换、新批次与988条entries在同一REPEATABLE READ事务内，
 * 事务开始即获取任务专属pg_advisory_xact_lock；事务内重算targetFingerprint、
 * FOR UPDATE锁定并核对账本目标行与prepared批次、核对attestation（cases/showcase/
 * tests/snapshots/releases）与可信归档（目录/SHA/manifest/restore报告）；任一不一致
 * 立即回滚。第二次执行：全部已完成→noop；部分完成或不一致→REPAIR_STATE_DRIFT，
 * 禁止补写。
 *
 * 位置说明：本模块是WI-20260907-04持久库repair工具（跨迁移账本/归档批次，并只读attestation
 * 发布记录），不属于RCL案例治理域，故独立于src/lib/case-governance（RCL-AC-015契约要求
 * 案例治理模块不触碰发布表）。
 * 本模块不连接persistent库的写路径：调用方（scripts/rcl-repair-forward-task34.mjs）
 * 必须以显式DATABASE_URL、--i-am-authorized、--plan-hash、--target-fingerprint运行apply。
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import type { Client } from "pg";
import {
  canonicalJson,
  sha256hex,
  rowContentHash,
  testRowContentHash,
  CASE_INFRA_COLUMNS,
  SHOWCASE_INFRA_COLUMNS,
} from "@/lib/case-governance/hashes";
import { recomputeManifestHash, type RclManifest } from "@/lib/case-governance/manifest";
import { verifySha256SumsFile, validateRestoreReport, SHA_LIST_FILES } from "@/lib/case-governance/archive";

// ─── 绑定常量（来自第五轮只读审计与可信归档；任一漂移即拒绝） ─────────────────

export const REPAIR_ALGORITHM_VERSION = "RCL-REPAIR-FORWARD-1.0";

export const TRUSTED_ARCHIVE = {
  manifestHash: "da0ea94d4e8ce07b06dd50d2cdd4780110c256705fd7f024c83f5e4378cb32ef",
  dumpSha256: "0e3c3d8b984bd992508d7a8fc4a32d162a96bf76634392cdbb6b0e1bc4264c11",
  dir: "F:/Socila/backup/case-library/task34-r4-trusted-old-2026-09-10T06-59-14",
} as const;

/** 确定性批次ID派生输入前缀。 */
export const TRUSTED_BATCH_ID_INPUT_PREFIX = "task34-r4-trusted-archive:";

export interface LedgerRowValue {
  id: number;
  hash: string;
  createdAt: string;
}

/** 0012/0013/0014的CRLF重复登记（完整旧值；删除条件必须逐值匹配）。 */
export const DUP_LEDGER_ROWS: readonly LedgerRowValue[] = [
  { id: 18, hash: "00e5abd2967bb93fa7b072edb71c800582ce4d51d87106967766332529c24fdf", createdAt: "1788818400000" },
  { id: 19, hash: "781fe578fc346e3307de6bdd45392f6a9d4b3b6653e71e5cf2c3520605a4fe33", createdAt: "1788904800000" },
  { id: 20, hash: "1a037fe1649c14ddeac1c33ab7f3cda98d5ddabb338e6e0897675f0dc27e1585", createdAt: "1788991200000" },
];

/** 修复后必须保留的账本ID（不补17、不重排）。 */
export const KEPT_LEDGER_IDS: readonly number[] = [...Array.from({ length: 16 }, (_, i) => i + 1), 21, 22];

export const PREPARED_BATCH = {
  id: "91d60c5f-d979-4843-a43f-20daf4fa8945",
  manifestHash: "c86fcc26c0456be43a9c9dd581657229082edf3ed9eaf68d2edf2d4e90339d55",
} as const;

export const TRUSTED_BATCH_CREATED_BY = "task34-repair-forward";
export const TRUSTED_ENTRY_ARCHIVE_REASON =
  "task34-repair-forward：pre dump重建的旧452/36/500可信归档（WI-20260907-04，manifest da0ea94d…）";

/** 任务专属advisory锁键（sha256("task34-repair-forward")前8字节，有符号bigint）。 */
export const ADVISORY_LOCK_KEY = (() => {
  const h = createHash("sha256").update("task34-repair-forward", "utf8").digest();
  return h.readBigInt64BE(0).toString();
})();

const SHA256_HEX = /^[0-9a-f]{64}$/;
const EXPECTED_COUNTS = { cases: 36, showcase: 36, tests: 78, exampleTests: 42, regressionTests: 36, snapshots: 10, releases: 5 } as const;
const TRUSTED_SOURCE_COUNTS = { cases: 452, showcaseCases: 36, regressionTests: 500, historicalExampleTests: 28 } as const;

export class RepairForwardError extends Error {
  readonly code: string;
  readonly details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(`${code}: ${message}`);
    this.name = "RepairForwardError";
    this.code = code;
    this.details = details;
  }
}

// ─── 确定性批次ID ──────────────────────────────────────────────────────────

/**
 * 确定性UUID：sha256(TRUSTED_BATCH_ID_INPUT_PREFIX + manifestHash)前16字节，
 * 设置版本位5与RFC 4122变体位。禁止运行时随机UUID。
 */
export function deriveTrustedBatchId(manifestHash: string): string {
  const digest = createHash("sha256").update(`${TRUSTED_BATCH_ID_INPUT_PREFIX}${manifestHash}`, "utf8").digest();
  const b = Buffer.from(digest.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export const TRUSTED_BATCH_ID = deriveTrustedBatchId(TRUSTED_ARCHIVE.manifestHash);

// ─── 类型 ──────────────────────────────────────────────────────────────────

export interface TrustedManifestLike {
  manifestHash: string;
  oldTargets: {
    cases: Array<{ rowId: number; uid: string | null; contentHash: string }>;
    showcase: Array<{ rowId: number; uid: string | null; contentHash: string }>;
    tests: Array<{ rowId: number; uid: string | null; contentHash: string }>;
  };
  exampleSync: { retained: unknown[]; updated: unknown[]; added: unknown[]; deleted: unknown[] };
  exampleTests: unknown[];
}

export interface RepairEntry {
  archiveBatchId: string;
  entityType: "case" | "showcase_case" | "test";
  entityId: number;
  caseUid: string | null;
  contentHash: string;
  archiveReason: string;
}

export interface TrustedBatchRow {
  id: string;
  status: "restore_verified";
  sourceCounts: Record<string, number>;
  retainedCounts: Record<string, number>;
  deletedCounts: Record<string, number>;
  tableHashes: Record<string, string>;
  manifestHash: string;
  storagePath: string;
  createdBy: string;
}

export interface BusinessFingerprints {
  cases: string;
  showcaseCases: string;
  tests: string;
  policySnapshots: string;
  jurisdictionPlanningReleases: string;
}

export interface LiveCounts {
  cases: number;
  showcase: number;
  tests: number;
  exampleTests: number;
  regressionTests: number;
  snapshots: number;
  releases: number;
  archiveBatches: number;
}

export interface LiveBatchRow {
  id: string;
  status: string;
  manifestHash: string;
  storagePath: string;
  sourceCounts?: Record<string, unknown>;
  retainedCounts?: Record<string, unknown>;
  deletedCounts?: Record<string, unknown>;
  tableHashes?: Record<string, unknown>;
  createdBy?: string;
}

export interface LiveEntry {
  entityType: string;
  entityId: number;
  caseUid: string | null;
  contentHash: string;
}

export interface LiveRepairState {
  ledger: LedgerRowValue[];
  preparedBatch: LiveBatchRow | null;
  trustedBatch: LiveBatchRow | null;
  trustedEntries: LiveEntry[];
  counts: LiveCounts;
  targetFingerprint: string;
  businessFingerprints: BusinessFingerprints;
}

export interface TrustedArchiveFacts {
  manifestFileSha256: string;
  dumpSha256: string;
  restoreReport: { tableCount: number; sequenceCount: number };
}

export interface ExecutablePlan {
  algorithmVersion: string;
  codeSha: string;
  generatedAt: string;
  trustedArchive: {
    dir: string;
    manifestHash: string;
    dumpSha256: string;
    manifestFileSha256: string;
    restoreReport: { tableCount: number; sequenceCount: number };
  };
  attestationManifestHash: string;
  migrationLedgerFingerprint: string;
  targetFingerprint: string;
  businessFingerprints: BusinessFingerprints;
  counts: LiveCounts;
  ledgerDelete: LedgerRowValue[];
  ledgerKeep: LedgerRowValue[];
  preparedBatch: { id: string; status: "prepared"; manifestHash: string; storagePath: string };
  trustedBatch: TrustedBatchRow;
  entries: RepairEntry[];
  expectedFinalState: {
    ledgerCount: number;
    ledgerFingerprint: string;
    preparedBatchStatus: "rolled_back";
    trustedBatchId: string;
    trustedEntries: number;
    counts: LiveCounts;
  };
  planHash: string;
}

export type RepairMode = "audit" | "plan" | "apply" | "verify";

export interface RepairArgs {
  mode: RepairMode;
  authorized: boolean;
  planHash: string | null;
  targetFingerprint: string | null;
  out: string | null;
  trustedDir: string | null;
}

// ─── 参数守卫（禁止默认写入） ───────────────────────────────────────────────

export function parseRepairArgs(argv: string[]): RepairArgs {
  const mode = argv[0];
  if (!mode) {
    throw new RepairForwardError("USAGE", "缺少模式：audit | plan | apply --i-am-authorized --plan-hash <hash> --target-fingerprint <fp> | verify（无参数不执行任何操作）");
  }
  if (!["audit", "plan", "apply", "verify"].includes(mode)) {
    throw new RepairForwardError("USAGE", `未知模式 ${mode}（只允许 audit | plan | apply | verify）`);
  }
  const flag = (name: string): string | null => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
  };
  const args: RepairArgs = {
    mode: mode as RepairMode,
    authorized: argv.includes("--i-am-authorized"),
    planHash: flag("--plan-hash"),
    targetFingerprint: flag("--target-fingerprint"),
    out: flag("--out"),
    trustedDir: flag("--trusted-dir"),
  };
  if (args.mode === "apply") {
    if (!args.authorized) throw new RepairForwardError("AUTHORIZATION_REQUIRED", "apply需要显式 --i-am-authorized（RCL-NFR-003）");
    if (!args.planHash || !SHA256_HEX.test(args.planHash)) throw new RepairForwardError("PLAN_HASH_REQUIRED", "apply需要 --plan-hash <64位hex>");
    if (!args.targetFingerprint || !/^[0-9a-f]{32}$/.test(args.targetFingerprint)) {
      throw new RepairForwardError("TARGET_FINGERPRINT_REQUIRED", "apply需要 --target-fingerprint <32位hex>");
    }
  }
  return args;
}

// ─── 可信归档：988条entries与批次行 ────────────────────────────────────────

/** 从可信归档manifest逐条构建988条真实entries（禁止VALUES...占位）。 */
export function buildTrustedEntries(manifest: TrustedManifestLike, batchId: string = TRUSTED_BATCH_ID): RepairEntry[] {
  const { cases, showcase, tests } = manifest.oldTargets;
  if (cases.length !== TRUSTED_SOURCE_COUNTS.cases || showcase.length !== TRUSTED_SOURCE_COUNTS.showcaseCases || tests.length !== TRUSTED_SOURCE_COUNTS.regressionTests) {
    throw new RepairForwardError(
      "TRUSTED_ARCHIVE_MISMATCH",
      `可信归档manifest计数 ${cases.length}/${showcase.length}/${tests.length} ≠ 452/36/500`,
    );
  }
  const entries: RepairEntry[] = [];
  const seen = new Set<string>();
  const push = (entityType: RepairEntry["entityType"], rows: TrustedManifestLike["oldTargets"]["cases"]) => {
    for (const r of rows) {
      if (typeof r.contentHash !== "string" || !SHA256_HEX.test(r.contentHash)) {
        throw new RepairForwardError("ENTRY_HASH_INVALID", `${entityType} rowId=${r.rowId} contentHash非64位小写hex`);
      }
      if (!Number.isInteger(r.rowId) || r.rowId <= 0) {
        throw new RepairForwardError("ENTRY_ID_INVALID", `${entityType} rowId非法：${String(r.rowId)}`);
      }
      const key = `${entityType}:${r.rowId}`;
      if (seen.has(key)) {
        throw new RepairForwardError("ENTRY_DUPLICATE", `同批次重复 entity_type+entity_id：${key}`);
      }
      seen.add(key);
      entries.push({
        archiveBatchId: batchId,
        entityType,
        entityId: r.rowId,
        caseUid: r.uid ?? null,
        contentHash: r.contentHash,
        archiveReason: TRUSTED_ENTRY_ARCHIVE_REASON,
      });
    }
  };
  push("case", cases);
  push("showcase_case", showcase);
  push("test", tests);
  if (entries.length !== 988) {
    throw new RepairForwardError("TRUSTED_ARCHIVE_MISMATCH", `entries ${entries.length} ≠ 988`);
  }
  return entries;
}

/** 历史example数（pre库28条）由manifest.exampleSync确定性派生：retained+updated+deleted。 */
export function historicalExampleCount(manifest: TrustedManifestLike): number {
  const es = manifest.exampleSync;
  return es.retained.length + es.updated.length + es.deleted.length;
}

export function buildTrustedBatchRow(input: {
  manifest: TrustedManifestLike;
  attestationManifestHash: string;
  migrationLedgerFingerprint: string;
  targetFingerprint: string;
  retained: { cases: number; showcaseCases: number; tests: number; exampleTests: number; regressionTests: number };
}): TrustedBatchRow {
  const historical = historicalExampleCount(input.manifest);
  if (historical !== TRUSTED_SOURCE_COUNTS.historicalExampleTests) {
    throw new RepairForwardError("TRUSTED_ARCHIVE_MISMATCH", `manifest.exampleSync派生历史example=${historical} ≠ 28`);
  }
  return {
    id: deriveTrustedBatchId(input.manifest.manifestHash),
    status: "restore_verified",
    sourceCounts: {
      cases: input.manifest.oldTargets.cases.length,
      showcaseCases: input.manifest.oldTargets.showcase.length,
      regressionTests: input.manifest.oldTargets.tests.length,
      historicalExampleTests: historical,
    },
    retainedCounts: { ...input.retained },
    deletedCounts: { cases: 0, showcaseCases: 0, tests: 0, exampleTests: 0, regressionTests: 0 },
    tableHashes: {
      trustedArchiveManifestHash: input.manifest.manifestHash,
      trustedArchiveDumpSha: TRUSTED_ARCHIVE.dumpSha256,
      attestationManifestHash: input.attestationManifestHash,
      migrationLedgerFingerprint: input.migrationLedgerFingerprint,
      targetFingerprint: input.targetFingerprint,
    },
    manifestHash: input.manifest.manifestHash,
    storagePath: TRUSTED_ARCHIVE.dir,
    createdBy: TRUSTED_BATCH_CREATED_BY,
  };
}

// ─── 账本删除语句（完整旧值条件） ────────────────────────────────────────────

export function buildLedgerDeleteStatement(rows: readonly LedgerRowValue[]): { text: string; values: Array<number | string> } {
  const values: Array<number | string> = [];
  const preds = rows.map((r) => {
    values.push(r.id, r.hash, r.createdAt);
    const n = values.length;
    return `(id = $${n - 2} AND hash = $${n - 1} AND created_at = $${n})`;
  });
  return {
    text: `DELETE FROM drizzle.__drizzle_migrations WHERE ${preds.join(" OR ")} RETURNING id`,
    values,
  };
}

// ─── 可执行计划 ─────────────────────────────────────────────────────────────

export function ledgerFingerprintOf(rows: readonly LedgerRowValue[]): string {
  return sha256hex(canonicalJson(rows.map((m) => ({ id: m.id, hash: m.hash, created_at: String(m.createdAt) }))));
}

export function buildExecutablePlan(input: {
  codeSha: string;
  manifest: TrustedManifestLike;
  live: LiveRepairState;
  attestationManifestHash: string;
  migrationLedgerFingerprint: string;
  trustedArchive: TrustedArchiveFacts;
  generatedAt?: string;
}): ExecutablePlan {
  const { live } = input;
  const dupIds = new Set(DUP_LEDGER_ROWS.map((r) => r.id));
  // ledgerDelete锚定绑定常量（必须删除的精确旧值）；ledgerKeep来自当前账本的非重复行。
  const ledgerDelete = DUP_LEDGER_ROWS.map((r) => ({ id: r.id, hash: r.hash, createdAt: r.createdAt }));
  const ledgerKeep = live.ledger.filter((r) => !dupIds.has(r.id)).map((r) => ({ id: r.id, hash: r.hash, createdAt: String(r.createdAt) }));
  const retained = {
    cases: live.counts.cases,
    showcaseCases: live.counts.showcase,
    tests: live.counts.tests,
    exampleTests: live.counts.exampleTests,
    regressionTests: live.counts.regressionTests,
  };
  const trustedBatch = buildTrustedBatchRow({
    manifest: input.manifest,
    attestationManifestHash: input.attestationManifestHash,
    migrationLedgerFingerprint: input.migrationLedgerFingerprint,
    targetFingerprint: live.targetFingerprint,
    retained,
  });
  const entries = buildTrustedEntries(input.manifest, trustedBatch.id);
  const prepared = live.preparedBatch;
  // manifest_hash锚定绑定常量c86fcc26…；storage_path取当前审计值（与审计一致即前置成立）。
  const preparedBatch = {
    id: PREPARED_BATCH.id,
    status: "prepared" as const,
    manifestHash: PREPARED_BATCH.manifestHash,
    storagePath: prepared?.storagePath ?? "",
  };
  const core = {
    algorithmVersion: REPAIR_ALGORITHM_VERSION,
    codeSha: input.codeSha,
    trustedArchive: {
      dir: TRUSTED_ARCHIVE.dir,
      manifestHash: input.manifest.manifestHash,
      dumpSha256: input.trustedArchive.dumpSha256,
      manifestFileSha256: input.trustedArchive.manifestFileSha256,
      restoreReport: input.trustedArchive.restoreReport,
    },
    attestationManifestHash: input.attestationManifestHash,
    migrationLedgerFingerprint: input.migrationLedgerFingerprint,
    targetFingerprint: live.targetFingerprint,
    businessFingerprints: live.businessFingerprints,
    counts: live.counts,
    ledgerDelete,
    ledgerKeep,
    preparedBatch,
    trustedBatch,
    entries,
    expectedFinalState: {
      ledgerCount: ledgerKeep.length,
      ledgerFingerprint: ledgerFingerprintOf(ledgerKeep),
      preparedBatchStatus: "rolled_back" as const,
      trustedBatchId: trustedBatch.id,
      trustedEntries: entries.length,
      counts: live.counts,
    },
  };
  return {
    ...core,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    planHash: sha256hex(canonicalJson(core)),
  };
}

// ─── 状态分类：pending / repaired / drift ───────────────────────────────────

export interface RepairStateClassification {
  state: "pending" | "repaired" | "drift";
  reasons: string[];
}

function sameLedgerRow(a: LedgerRowValue | undefined, b: LedgerRowValue): boolean {
  return a !== undefined && a.hash === b.hash && String(a.createdAt) === String(b.createdAt);
}

function entryKey(e: { entityType: string; entityId: number }): string {
  return `${e.entityType}:${e.entityId}`;
}

export function classifyRepairState(live: LiveRepairState, plan: ExecutablePlan): RepairStateClassification {
  const reasons: string[] = [];

  // 业务数据必须零变化（36/36/78、10 snapshots、5 releases、全部业务表hash），
  // 且与本执行器绑定的绝对预期一致（本执行器仅服务于该持久事实）。
  for (const k of ["cases", "showcase", "tests", "exampleTests", "regressionTests", "snapshots", "releases"] as const) {
    if (live.counts[k] !== plan.counts[k]) reasons.push(`计数 ${k} ${live.counts[k]} ≠ 计划 ${plan.counts[k]}`);
    if (live.counts[k] !== EXPECTED_COUNTS[k]) reasons.push(`计数 ${k} ${live.counts[k]} ≠ 绑定预期 ${EXPECTED_COUNTS[k]}`);
  }
  for (const k of Object.keys(plan.businessFingerprints) as Array<keyof BusinessFingerprints>) {
    if (live.businessFingerprints[k] !== plan.businessFingerprints[k]) reasons.push(`业务表指纹 ${k} 漂移`);
  }
  if (live.targetFingerprint !== plan.targetFingerprint) reasons.push("targetFingerprint漂移");

  // 保留行锚定常量：非重复行的id集合必须恰为1..16、21、22（不补17、不重排、无计划外行），
  // 且hash/created_at与计划记录的原值一致。
  const byId = new Map(live.ledger.map((r) => [r.id, r]));
  const dupIdSet = new Set(DUP_LEDGER_ROWS.map((d) => d.id));
  const liveKeptIds = live.ledger.map((r) => r.id).filter((id) => !dupIdSet.has(id));
  if (liveKeptIds.join(",") !== KEPT_LEDGER_IDS.join(",")) reasons.push(`保留账本id集合 [${liveKeptIds.join(",")}] ≠ 1..16,21,22`);
  if (plan.ledgerKeep.map((k) => k.id).join(",") !== KEPT_LEDGER_IDS.join(",")) reasons.push("计划ledgerKeep id集合 ≠ 1..16,21,22");
  for (const keep of plan.ledgerKeep) {
    if (!sameLedgerRow(byId.get(keep.id), keep)) reasons.push(`保留账本行 ${keep.id} 缺失或hash/created_at变化`);
  }
  if (byId.has(17)) reasons.push("账本出现ID 17（不得补写）");

  if (reasons.length > 0) return { state: "drift", reasons };

  // 三项写入各自的完成状态（重复行判定锚定常量DUP_LEDGER_ROWS）。
  const dupAllPresentExact = DUP_LEDGER_ROWS.every((d) => sameLedgerRow(byId.get(d.id), d));
  const dupAllAbsent = DUP_LEDGER_ROWS.every((d) => !byId.has(d.id));

  const pb = live.preparedBatch;
  const preparedPending = pb !== null && pb.status === "prepared" && pb.manifestHash === plan.preparedBatch.manifestHash && pb.storagePath === plan.preparedBatch.storagePath;
  const preparedDone = pb !== null && pb.status === "rolled_back" && pb.manifestHash === plan.preparedBatch.manifestHash && pb.storagePath === plan.preparedBatch.storagePath;

  const tb = live.trustedBatch;
  const trustedAbsent = tb === null && live.trustedEntries.length === 0;
  const trustedDone =
    tb !== null &&
    tb.status === "restore_verified" &&
    tb.manifestHash === plan.trustedBatch.manifestHash &&
    tb.storagePath === plan.trustedBatch.storagePath &&
    (tb.createdBy === undefined || tb.createdBy === plan.trustedBatch.createdBy) &&
    entriesMatch(live.trustedEntries, plan.entries);

  if (dupAllPresentExact && preparedPending && trustedAbsent && live.ledger.length === KEPT_LEDGER_IDS.length + 3) {
    return { state: "pending", reasons: [] };
  }
  if (dupAllAbsent && preparedDone && trustedDone && live.ledger.length === KEPT_LEDGER_IDS.length) {
    return { state: "repaired", reasons: [] };
  }
  if (!dupAllPresentExact && !dupAllAbsent) reasons.push("账本重复行18/19/20部分存在或旧值不同");
  else if (dupAllPresentExact) reasons.push("账本重复行仍存在");
  else reasons.push("账本重复行已删除");
  if (pb === null) reasons.push("prepared批次91d60c5f不存在");
  else if (!preparedPending && !preparedDone) reasons.push(`prepared批次状态/manifest/storagePath异常：${pb.status}`);
  else reasons.push(`prepared批次状态=${pb.status}`);
  if (tb === null && live.trustedEntries.length > 0) reasons.push("可信批次缺失但存在其entries");
  else if (tb !== null && !trustedDone) reasons.push("可信批次存在但状态/hash/entries不匹配");
  else if (tb === null) reasons.push("可信批次不存在");
  else reasons.push("可信批次已完整");
  return { state: "drift", reasons };
}

function entriesMatch(live: LiveEntry[], planned: RepairEntry[]): boolean {
  if (live.length !== planned.length) return false;
  const m = new Map(planned.map((e) => [entryKey(e), e]));
  for (const e of live) {
    const p = m.get(entryKey(e));
    if (!p) return false;
    if (p.contentHash !== e.contentHash || (p.caseUid ?? null) !== (e.caseUid ?? null)) return false;
  }
  return true;
}

// ─── 可信归档加载与校验（文件/SHA/manifest正文重算/restore报告/988条entries） ──

export interface TrustedArchiveLoaded {
  dir: string;
  manifest: RclManifest & TrustedManifestLike;
  entries: RepairEntry[];
  facts: TrustedArchiveFacts;
  fileHashes: Record<string, string>;
}

export function loadTrustedArchive(dir: string = TRUSTED_ARCHIVE.dir): TrustedArchiveLoaded {
  const storage = { read: (p: string) => readFileSync(p), exists: (p: string) => existsSync(p) };
  const required = [...SHA_LIST_FILES, "sha256sums.txt"];
  const missing = required.filter((f) => !existsSync(path.join(dir, f)));
  if (missing.length > 0) throw new RepairForwardError("TRUSTED_ARCHIVE_MISMATCH", `可信归档缺失文件：${missing.join("、")}`);
  const shaMismatches = verifySha256SumsFile(storage, dir);
  if (shaMismatches.length > 0) throw new RepairForwardError("TRUSTED_ARCHIVE_MISMATCH", `sha256sums校验失败：${shaMismatches.join("；")}`);

  const fileHashes: Record<string, string> = {};
  for (const f of SHA_LIST_FILES) fileHashes[f] = createHash("sha256").update(readFileSync(path.join(dir, f))).digest("hex");
  const dumpSha256 = fileHashes["policyops-fc.dump"];
  if (dumpSha256 !== TRUSTED_ARCHIVE.dumpSha256) {
    throw new RepairForwardError("TRUSTED_ARCHIVE_MISMATCH", `policyops-fc.dump SHA ${dumpSha256.slice(0, 16)}… ≠ 绑定值 ${TRUSTED_ARCHIVE.dumpSha256.slice(0, 16)}…`);
  }

  let manifest: RclManifest & TrustedManifestLike;
  try {
    manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")) as RclManifest & TrustedManifestLike;
  } catch {
    throw new RepairForwardError("TRUSTED_ARCHIVE_MISMATCH", "manifest.json无法解析");
  }
  if (manifest.manifestHash !== TRUSTED_ARCHIVE.manifestHash) {
    throw new RepairForwardError("TRUSTED_ARCHIVE_MISMATCH", `manifest声明hash ${String(manifest.manifestHash).slice(0, 16)}… ≠ 绑定值`);
  }
  // 988条entries格式先于正文重算校验（ENTRY_HASH_INVALID/ENTRY_DUPLICATE精确报错）。
  const entries = buildTrustedEntries(manifest);
  const recomputed = recomputeManifestHash(manifest);
  if (recomputed !== manifest.manifestHash) {
    throw new RepairForwardError("TRUSTED_ARCHIVE_MISMATCH", `manifest正文重算hash ${recomputed.slice(0, 16)}… ≠ 声明 ${manifest.manifestHash.slice(0, 16)}…`);
  }

  let restore: unknown;
  try {
    restore = JSON.parse(readFileSync(path.join(dir, "restore-report.json"), "utf8"));
  } catch {
    throw new RepairForwardError("TRUSTED_ARCHIVE_MISMATCH", "restore-report.json无法解析");
  }
  const restoreMismatches = validateRestoreReport(restore, { dumpSha256, fileHashes });
  if (restoreMismatches.length > 0) {
    throw new RepairForwardError("TRUSTED_ARCHIVE_MISMATCH", `restore-report校验失败：${restoreMismatches.join("；")}`);
  }
  const rec = (restore as { reconcile: { tableCount: number; sequenceCount: number } }).reconcile;
  if (rec.tableCount !== 40 || rec.sequenceCount !== 20) {
    throw new RepairForwardError("TRUSTED_ARCHIVE_MISMATCH", `restore-report ${rec.tableCount}表/${rec.sequenceCount} sequence ≠ 40/20`);
  }
  return {
    dir,
    manifest,
    entries,
    facts: { manifestFileSha256: fileHashes["manifest.json"], dumpSha256, restoreReport: { tableCount: rec.tableCount, sequenceCount: rec.sequenceCount } },
    fileHashes,
  };
}

// ─── 数据库读取（pg Client；事务内外均可） ──────────────────────────────────

type Row = Record<string, unknown>;
type Queryable = Pick<Client, "query">;

async function q(client: Queryable, text: string, values: unknown[] = []): Promise<Row[]> {
  const r = await client.query(text, values);
  return r.rows as Row[];
}

/**
 * 与drizzle node-postgres会话一致的类型解析：DATE/TIMESTAMP/TIMESTAMPTZ/INTERVAL
 * 及其数组返回原始字符串（不转Date）。scripts/rcl-audit-task34.mjs的attestation
 * 经drizzle `db.execute`读取，本模块必须同样解析才能得到相同的attestationManifestHash。
 */
const RAW_TEMPORAL_OIDS = new Set([1184, 1114, 1082, 1186, 1231, 1115, 1185, 1187, 1182]);
const DRIZZLE_COMPAT_TYPES = {
  getTypeParser: (typeId: number, format?: "text" | "binary") =>
    RAW_TEMPORAL_OIDS.has(typeId) ? (val: string) => val : (pg.types.getTypeParser as (id: number, f?: "text" | "binary") => (v: string) => unknown)(typeId, format),
};

async function qCompat(client: Queryable, text: string, values: unknown[] = []): Promise<Row[]> {
  const r = await client.query({ text, values, types: DRIZZLE_COMPAT_TYPES as never });
  return r.rows as Row[];
}

const FP_SQL = (table: string) =>
  `SELECT md5(coalesce(string_agg(to_jsonb(t)::text, '|' ORDER BY to_jsonb(t)::text COLLATE "C"), '')) AS h FROM ${table} t`;

/** 会话渲染确定性：业务表指纹用to_jsonb文本，时区/日期样式固定。 */
export async function setDeterministicSession(client: Queryable, local = false): Promise<void> {
  const kw = local ? "SET LOCAL" : "SET";
  await client.query(`${kw} TimeZone TO 'UTC'`);
  await client.query(`${kw} DateStyle TO 'ISO, YMD'`);
}

export async function readTargetFingerprint(client: Queryable): Promise<string> {
  const rows = await q(client, `
    SELECT md5(string_agg(to_jsonb(t)::text, '|' ORDER BY to_jsonb(t)::text COLLATE "C")) AS h
    FROM (
      SELECT id, case_uid, content_hash, quality_status FROM "cases"
      UNION ALL
      SELECT id, case_uid, content_hash, quality_status FROM "showcase_cases"
    ) t`);
  return String(rows[0]?.h ?? "");
}

export async function readLiveState(client: Queryable): Promise<LiveRepairState> {
  const ledger = (await q(client, `SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id`)).map((r) => ({
    id: Number(r.id), hash: String(r.hash), createdAt: String(r.created_at),
  }));
  const batchRow = (r: Row): LiveBatchRow => ({
    id: String(r.id), status: String(r.status), manifestHash: String(r.manifest_hash), storagePath: String(r.storage_path),
    sourceCounts: r.source_counts as Record<string, unknown>, retainedCounts: r.retained_counts as Record<string, unknown>,
    deletedCounts: r.deleted_counts as Record<string, unknown>, tableHashes: r.table_hashes as Record<string, unknown>, createdBy: String(r.created_by),
  });
  const prepared = await q(client, `SELECT id, status, manifest_hash, storage_path, source_counts, retained_counts, deleted_counts, table_hashes, created_by FROM case_archive_batches WHERE id = $1`, [PREPARED_BATCH.id]);
  const trusted = await q(client, `SELECT id, status, manifest_hash, storage_path, source_counts, retained_counts, deleted_counts, table_hashes, created_by FROM case_archive_batches WHERE id = $1`, [TRUSTED_BATCH_ID]);
  const trustedEntries = (await q(client, `SELECT entity_type, entity_id, case_uid, content_hash FROM case_archive_entries WHERE archive_batch_id = $1 ORDER BY entity_type, entity_id`, [TRUSTED_BATCH_ID])).map((r) => ({
    entityType: String(r.entity_type), entityId: Number(r.entity_id), caseUid: (r.case_uid as string | null) ?? null, contentHash: String(r.content_hash),
  }));
  const c = (await q(client, `
    SELECT
      (SELECT count(*)::int FROM cases) AS cases,
      (SELECT count(*)::int FROM showcase_cases) AS showcase,
      (SELECT count(*)::int FROM tests) AS tests,
      (SELECT count(*)::int FROM tests WHERE source='example') AS example_tests,
      (SELECT count(*)::int FROM tests WHERE source='regression') AS regression_tests,
      (SELECT count(*)::int FROM policy_snapshots) AS snapshots,
      (SELECT count(*)::int FROM jurisdiction_planning_releases) AS releases,
      (SELECT count(*)::int FROM case_archive_batches) AS archive_batches`))[0];
  const fp = async (table: string) => String((await q(client, FP_SQL(table)))[0].h);
  return {
    ledger,
    preparedBatch: prepared.length === 1 ? batchRow(prepared[0]) : null,
    trustedBatch: trusted.length === 1 ? batchRow(trusted[0]) : null,
    trustedEntries,
    counts: {
      cases: Number(c.cases), showcase: Number(c.showcase), tests: Number(c.tests), exampleTests: Number(c.example_tests),
      regressionTests: Number(c.regression_tests), snapshots: Number(c.snapshots), releases: Number(c.releases), archiveBatches: Number(c.archive_batches),
    },
    targetFingerprint: await readTargetFingerprint(client),
    businessFingerprints: {
      cases: await fp('"cases"'),
      showcaseCases: await fp('"showcase_cases"'),
      tests: await fp('"tests"'),
      policySnapshots: await fp('"policy_snapshots"'),
      jurisdictionPlanningReleases: await fp('"jurisdiction_planning_releases"'),
    },
  };
}

/** 当前attestation（与scripts/rcl-audit-task34.mjs RCL-ATTESTATION-2.0同构；同codeSha同数据→同hash）。 */
export async function buildAttestation(client: Queryable, codeSha: string): Promise<{ attestationManifestHash: string; core: Record<string, unknown> }> {
  const caseRows = await qCompat(client, `SELECT * FROM "cases" ORDER BY id`);
  const showRows = await qCompat(client, `SELECT * FROM "showcase_cases" ORDER BY id`);
  const regRows = await qCompat(client, `SELECT * FROM "tests" WHERE source = 'regression' ORDER BY id`);
  const exRows = await qCompat(client, `SELECT * FROM "tests" WHERE source = 'example' ORDER BY id`);
  const snapRows = await qCompat(client, `SELECT id, jurisdiction_code, as_of_date, content_hash FROM policy_snapshots ORDER BY created_at, id`);
  const relRows = await qCompat(client, `SELECT id, jurisdiction_code, status, effective_from, effective_to, active_snapshot_id FROM jurisdiction_planning_releases ORDER BY id`);
  const batchRows = await qCompat(client, `SELECT id, status, manifest_hash, storage_path FROM case_archive_batches ORDER BY created_at, id`);
  const targetFingerprint = await readTargetFingerprint(client);
  const core = {
    algorithmVersion: "RCL-ATTESTATION-2.0",
    codeSha,
    targetFingerprint,
    counts: { cases: caseRows.length, showcase: showRows.length, regressionTests: regRows.length, exampleTests: exRows.length },
    cases: caseRows.map((r) => ({ dbId: Number(r.id), uid: r.case_uid, hash: rowContentHash(r, CASE_INFRA_COLUMNS) })),
    showcase: showRows.map((r) => ({ dbId: Number(r.id), uid: r.case_uid, hash: rowContentHash(r, SHOWCASE_INFRA_COLUMNS) })),
    regressionTests: regRows.map((r) => ({ dbId: Number(r.id), uid: r.name, hash: testRowContentHash(r) })),
    exampleTests: exRows.map((r) => ({ dbId: Number(r.id), uid: r.name, jurisdictionCode: r.jurisdiction_code, hash: testRowContentHash(r) })),
    snapshots: snapRows.map((r) => ({ id: String(r.id), jurisdictionCode: r.jurisdiction_code, asOfDate: String(r.as_of_date), contentHash: String(r.content_hash) })),
    releases: relRows.map((r) => ({
      id: String(r.id), jurisdictionCode: r.jurisdiction_code, status: r.status,
      effectiveFrom: r.effective_from ? String(r.effective_from) : null, effectiveTo: r.effective_to ? String(r.effective_to) : null,
      activeSnapshotId: r.active_snapshot_id ? String(r.active_snapshot_id) : null,
    })),
    archiveBatches: batchRows.map((r) => ({ id: String(r.id), status: r.status, manifestHash: r.manifest_hash, storagePath: r.storage_path })),
  };
  return { attestationManifestHash: sha256hex(canonicalJson(core)), core };
}

// ─── audit / plan ───────────────────────────────────────────────────────────

export interface RepairAuditResult {
  mode: "audit";
  codeSha: string;
  state: RepairStateClassification;
  live: Omit<LiveRepairState, "trustedEntries"> & { trustedEntries: number };
  attestationManifestHash: string;
  migrationLedgerFingerprint: string;
  targetFingerprint: string;
  planHash: string;
  trustedArchive: ExecutablePlan["trustedArchive"] & { entries: number };
  trustedBatchId: string;
}

export async function buildPlanFromLive(client: Queryable, opts: { codeSha: string; trustedDir?: string; generatedAt?: string }): Promise<{ plan: ExecutablePlan; live: LiveRepairState; attestationManifestHash: string; loaded: TrustedArchiveLoaded }> {
  const loaded = loadTrustedArchive(opts.trustedDir ?? TRUSTED_ARCHIVE.dir);
  const live = await readLiveState(client);
  const { attestationManifestHash } = await buildAttestation(client, opts.codeSha);
  const plan = buildExecutablePlan({
    codeSha: opts.codeSha,
    manifest: loaded.manifest,
    live,
    attestationManifestHash,
    migrationLedgerFingerprint: ledgerFingerprintOf(live.ledger),
    trustedArchive: loaded.facts,
    generatedAt: opts.generatedAt,
  });
  return { plan, live, attestationManifestHash, loaded };
}

export async function runAudit(client: Queryable, opts: { codeSha: string; trustedDir?: string }): Promise<RepairAuditResult> {
  await setDeterministicSession(client);
  const { plan, live, attestationManifestHash } = await buildPlanFromLive(client, opts);
  const state = classifyRepairState(live, plan);
  return {
    mode: "audit",
    codeSha: opts.codeSha,
    state,
    live: { ...live, trustedEntries: live.trustedEntries.length },
    attestationManifestHash,
    migrationLedgerFingerprint: plan.migrationLedgerFingerprint,
    targetFingerprint: live.targetFingerprint,
    planHash: plan.planHash,
    trustedArchive: { ...plan.trustedArchive, entries: plan.entries.length },
    trustedBatchId: plan.trustedBatch.id,
  };
}

// ─── apply（单事务） ─────────────────────────────────────────────────────────

export type FaultPoint =
  | "after-ledger-delete"
  | "after-prepared-update"
  | "after-batch-insert"
  | "mid-entries"
  | "before-commit";

export const FAULT_POINTS: readonly FaultPoint[] = ["after-ledger-delete", "after-prepared-update", "after-batch-insert", "mid-entries", "before-commit"];

export interface RepairApplyResult {
  mode: "apply";
  noop: boolean;
  applied: boolean;
  codeSha: string;
  planHash: string;
  targetFingerprint: string;
  trustedBatchId: string;
  ledgerDeleted: number[];
  preparedBatchRolledBack: string | null;
  entriesInserted: number;
  attempts: number;
  finalState: { ledgerCount: number; ledgerFingerprint: string; trustedEntries: number; counts: LiveCounts };
}

export interface ApplyOptions {
  codeSha: string;
  planHash: string;
  targetFingerprint: string;
  trustedDir?: string;
  fault?: FaultPoint | null;
  maxAttempts?: number;
}

/** 单事务repair（REPEATABLE READ + 任务专属advisory xact lock；并发第二方经40001重试后noop）。 */
export async function runApply(client: Client, opts: ApplyOptions): Promise<RepairApplyResult> {
  const maxAttempts = opts.maxAttempts ?? 3;
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      return await applyOnce(client, opts, attempt);
    } catch (err) {
      const code = (err as { code?: string }).code;
      // 并发裁决：advisory锁等待期间快照已过期 → 序列化失败 → 全新事务重试（新快照识别noop）。
      if (code === "40001" && attempt < maxAttempts) {
        await client.query("ROLLBACK").catch(() => undefined);
        continue;
      }
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    }
  }
}

async function applyOnce(client: Client, opts: ApplyOptions, attempt: number): Promise<RepairApplyResult> {
  const loaded = loadTrustedArchive(opts.trustedDir ?? TRUSTED_ARCHIVE.dir);

  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  // 1) 任务专属advisory xact lock（事务结束自动释放）。
  await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [ADVISORY_LOCK_KEY]);
  await setDeterministicSession(client, true);

  // 2) 事务内重算targetFingerprint并核对显式授权参数。
  const live = await readLiveState(client);
  if (live.targetFingerprint !== opts.targetFingerprint) {
    throw new RepairForwardError("TARGET_FINGERPRINT_MISMATCH", `事务内targetFingerprint ${live.targetFingerprint} ≠ 授权参数 ${opts.targetFingerprint}`);
  }

  // 3) 事务内重建可执行计划并核对planHash（绑定codeSha/可信归档/attestation/988写集合）。
  const { attestationManifestHash } = await buildAttestation(client, opts.codeSha);
  const plan = buildExecutablePlan({
    codeSha: opts.codeSha,
    manifest: loaded.manifest,
    live,
    attestationManifestHash,
    migrationLedgerFingerprint: ledgerFingerprintOf(live.ledger),
    trustedArchive: loaded.facts,
  });

  // 4) 幂等/漂移裁决（在planHash核对之前：已修复状态下账本指纹已变化，planHash必然不同）。
  const classification = classifyRepairState(live, plan);
  if (classification.state === "repaired") {
    await client.query("ROLLBACK");
    return {
      mode: "apply", noop: true, applied: false, codeSha: opts.codeSha, planHash: opts.planHash,
      targetFingerprint: live.targetFingerprint, trustedBatchId: TRUSTED_BATCH_ID, ledgerDeleted: [], preparedBatchRolledBack: null,
      entriesInserted: 0, attempts: attempt,
      finalState: { ledgerCount: live.ledger.length, ledgerFingerprint: ledgerFingerprintOf(live.ledger), trustedEntries: live.trustedEntries.length, counts: live.counts },
    };
  }
  if (classification.state === "drift") {
    throw new RepairForwardError("REPAIR_STATE_DRIFT", `状态不一致，禁止补写或继续：${classification.reasons.join("；")}`, classification.reasons);
  }
  if (plan.planHash !== opts.planHash) {
    throw new RepairForwardError("PLAN_HASH_MISMATCH", `事务内重算planHash ${plan.planHash} ≠ 授权参数 ${opts.planHash}`);
  }

  // 5) FOR UPDATE锁定并核对账本目标行（完整旧值）。
  const lockedLedger = await q(client, `SELECT id, hash, created_at FROM drizzle.__drizzle_migrations WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE`, [DUP_LEDGER_ROWS.map((r) => r.id)]);
  if (lockedLedger.length !== 3 || !DUP_LEDGER_ROWS.every((exp, i) => Number(lockedLedger[i].id) === exp.id && String(lockedLedger[i].hash) === exp.hash && String(lockedLedger[i].created_at) === exp.createdAt)) {
    throw new RepairForwardError("LEDGER_PRECONDITION_MISMATCH", `账本目标行与旧值不符：${JSON.stringify(lockedLedger)}`);
  }
  // 6) FOR UPDATE锁定prepared批次。
  const lockedBatch = await q(client, `SELECT id, status, manifest_hash, storage_path FROM case_archive_batches WHERE id = $1 FOR UPDATE`, [PREPARED_BATCH.id]);
  if (lockedBatch.length !== 1 || lockedBatch[0].status !== "prepared" || lockedBatch[0].manifest_hash !== plan.preparedBatch.manifestHash || lockedBatch[0].storage_path !== plan.preparedBatch.storagePath) {
    throw new RepairForwardError("PREPARED_BATCH_PRECONDITION_MISMATCH", `prepared批次前置不符：${JSON.stringify(lockedBatch)}`);
  }
  // 可信批次必须不存在（否则为drift，已在分类中拒绝；此处防御性再核）。
  const existingTrusted = await q(client, `SELECT id FROM case_archive_batches WHERE id = $1 FOR UPDATE`, [TRUSTED_BATCH_ID]);
  if (existingTrusted.length !== 0) throw new RepairForwardError("REPAIR_STATE_DRIFT", "可信批次已存在但状态未被识别为repaired");

  // 7) 账本精确条件删除（RETURNING id恰好18/19/20）。
  const del = buildLedgerDeleteStatement(DUP_LEDGER_ROWS);
  const deleted = (await q(client, del.text, del.values)).map((r) => Number(r.id)).sort((a, b) => a - b);
  if (deleted.length !== 3 || deleted.join(",") !== "18,19,20") {
    throw new RepairForwardError("LEDGER_DELETE_MISMATCH", `账本删除返回 [${deleted.join(",")}]，必须恰好18、19、20`);
  }
  injectFault(opts.fault, "after-ledger-delete");

  // 8) prepared批次 → rolled_back（条件更新RETURNING恰好1行；不删除其历史entries）。
  const updated = await q(client, `UPDATE case_archive_batches SET status = 'rolled_back' WHERE id = $1 AND status = 'prepared' AND manifest_hash = $2 AND storage_path = $3 RETURNING id`, [PREPARED_BATCH.id, plan.preparedBatch.manifestHash, plan.preparedBatch.storagePath]);
  if (updated.length !== 1) throw new RepairForwardError("PREPARED_BATCH_UPDATE_MISMATCH", `prepared批次更新返回${updated.length}行，必须恰好1行`);
  injectFault(opts.fault, "after-prepared-update");

  // 9) 新增确定性可信归档批次（真实计数与table_hashes）。
  const tb = plan.trustedBatch;
  const inserted = await q(client, `
    INSERT INTO case_archive_batches (id, status, source_counts, retained_counts, deleted_counts, table_hashes, manifest_hash, storage_path, created_by)
    VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9) RETURNING id`,
    [tb.id, tb.status, JSON.stringify(tb.sourceCounts), JSON.stringify(tb.retainedCounts), JSON.stringify(tb.deletedCounts), JSON.stringify(tb.tableHashes), tb.manifestHash, tb.storagePath, tb.createdBy]);
  if (inserted.length !== 1 || String(inserted[0].id) !== tb.id) throw new RepairForwardError("TRUSTED_BATCH_INSERT_MISMATCH", "可信批次插入失败");
  injectFault(opts.fault, "after-batch-insert");

  // 10) 逐条插入988条真实entries（参数化多行INSERT分块；每块rowCount累加）。
  let insertedEntries = 0;
  const CHUNK = 200;
  for (let i = 0; i < plan.entries.length; i += CHUNK) {
    const chunk = plan.entries.slice(i, i + CHUNK);
    const values: unknown[] = [];
    const tuples = chunk.map((e) => {
      values.push(e.archiveBatchId, e.entityType, e.entityId, e.caseUid, e.contentHash, e.archiveReason);
      const n = values.length;
      return `($${n - 5}, $${n - 4}, $${n - 3}, $${n - 2}, $${n - 1}, $${n})`;
    });
    const r = await client.query(
      `INSERT INTO case_archive_entries (archive_batch_id, entity_type, entity_id, case_uid, content_hash, archive_reason) VALUES ${tuples.join(", ")}`,
      values,
    );
    insertedEntries += r.rowCount ?? 0;
    if (i === CHUNK * 2) injectFault(opts.fault, "mid-entries");
  }
  if (insertedEntries !== 988) throw new RepairForwardError("ENTRIES_INSERT_MISMATCH", `实际插入${insertedEntries}行，必须恰好988`);

  // 11) 事务内终态核对（账本18条原值、批次状态、988条逐项、业务零变化）。
  const after = await readLiveState(client);
  const finalClass = classifyRepairState(after, plan);
  if (finalClass.state !== "repaired") {
    throw new RepairForwardError("POST_STATE_MISMATCH", `事务内终态不满足repaired：${finalClass.reasons.join("；")}`);
  }
  if (after.ledger.length !== plan.expectedFinalState.ledgerCount || ledgerFingerprintOf(after.ledger) !== plan.expectedFinalState.ledgerFingerprint) {
    throw new RepairForwardError("POST_STATE_MISMATCH", "终态账本指纹与计划预期不符");
  }
  injectFault(opts.fault, "before-commit");

  await client.query("COMMIT");
  return {
    mode: "apply", noop: false, applied: true, codeSha: opts.codeSha, planHash: plan.planHash,
    targetFingerprint: live.targetFingerprint, trustedBatchId: tb.id, ledgerDeleted: deleted, preparedBatchRolledBack: PREPARED_BATCH.id,
    entriesInserted: insertedEntries, attempts: attempt,
    finalState: { ledgerCount: after.ledger.length, ledgerFingerprint: ledgerFingerprintOf(after.ledger), trustedEntries: after.trustedEntries.length, counts: after.counts },
  };
}

function injectFault(fault: FaultPoint | null | undefined, point: FaultPoint): void {
  if (fault === point) {
    throw new RepairForwardError("FAULT_INJECTED", `注入故障点 ${point}（隔离演练用，必须整体回滚）`);
  }
}

// ─── verify ─────────────────────────────────────────────────────────────────

export interface RepairVerifyResult {
  mode: "verify";
  ok: boolean;
  state: RepairStateClassification;
  ledgerCount: number;
  ledgerIds: number[];
  preparedBatchStatus: string | null;
  trustedBatch: LiveBatchRow | null;
  trustedEntries: number;
  counts: LiveCounts;
  targetFingerprint: string;
  businessFingerprints: BusinessFingerprints;
}

/**
 * verify：只读核对repair后状态。提供expectedPlan（plan模式输出的可执行写集合）时，
 * 以计划时的业务指纹/计数/保留账本原值为期望逐项核对；否则以当前业务数据为基线
 * 核对结构性终态（账本18条恰为1..16/21/22、批次rolled_back、可信批次+988 entries）。
 */
export async function runVerify(client: Queryable, opts: { codeSha: string; trustedDir?: string; expectedPlan?: ExecutablePlan | null }): Promise<RepairVerifyResult> {
  await setDeterministicSession(client);
  const live = await readLiveState(client);
  let plan: ExecutablePlan;
  if (opts.expectedPlan) {
    plan = opts.expectedPlan;
  } else {
    const loaded = loadTrustedArchive(opts.trustedDir ?? TRUSTED_ARCHIVE.dir);
    const { attestationManifestHash } = await buildAttestation(client, opts.codeSha);
    plan = buildExecutablePlan({
      codeSha: opts.codeSha,
      manifest: loaded.manifest,
      live,
      attestationManifestHash,
      migrationLedgerFingerprint: ledgerFingerprintOf(live.ledger),
      trustedArchive: loaded.facts,
    });
  }
  const state = classifyRepairState(live, plan);
  return {
    mode: "verify",
    ok: state.state === "repaired",
    state,
    ledgerCount: live.ledger.length,
    ledgerIds: live.ledger.map((r) => r.id),
    preparedBatchStatus: live.preparedBatch?.status ?? null,
    trustedBatch: live.trustedBatch,
    trustedEntries: live.trustedEntries.length,
    counts: live.counts,
    targetFingerprint: live.targetFingerprint,
    businessFingerprints: live.businessFingerprints,
  };
}
