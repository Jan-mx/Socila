/**
 * RCL-FR-002/003/004/005、RCL-NFR-001 归档包与恢复门禁：
 * - 归档清单对**真实文件字节**计算SHA-256（修复旧实现`sha256(fileName)`的P0缺陷）；
 * - 归档包必须包含：完整库dump、三表dump、selection-report、manifest、
 *   restore-report、不自包含的sha256sums.txt（最后生成且不包含自身）；
 * - **SHA清单精确覆盖（第三轮复审）**：清单必须恰好覆盖7个必备文件各一次；
 *   文件名只能是安全basename；SHA必须是64位小写hex；清单不得包含自身；
 *   重复/额外/路径穿越/非法hash/必备文件缺清单行全部fail-closed；
 * - **restore-report真实验证（第三轮复审）**：仅`{"status":"verified"}`的空报告
 *   必须拒绝；sourceDump文件名/SHA、PG/pgvector版本、表/sequence明细（真实
 *   rows与64位规范化hash）、计数一致、mismatches为空、archiveFileHashes与实际
 *   文件SHA一致，任一不符不得进入restore_verified；
 * - **selection-report真实计算与验证（第三轮复审）**：violations不得硬编码为
 *   空；上海18/广东18、每地区男女9/9、三个年龄段各6、三种就业状态各6必须由
 *   生成后的showcase实际计算；verify-archive必须解析并验证selection-report，
 *   缺字段、计数或配额不符时不得进入restore_verified；
 * - assertRestoreVerified：未 restore_verified 的批次禁止apply。
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { sha256hex } from "./hashes";
import type { NewShowcaseRow } from "./manifest";
import type { CaseArchiveBatchStatus } from "./types";

export interface ArchiveFileEntry {
  fileName: string;
  path: string;
  sha256: string;
}

export interface BuildArchiveFileManifestInput {
  storagePath: string;
  tableDumpNames: string[];
  /** 测试注入：从路径读文件内容的函数（默认 readFileSync）。 */
  readFile?: (p: string) => Buffer;
}

/** 归档必备文件（RCL-FR-002：完整库dump、三表dump、selection、manifest、restore、sha清单）。 */
export const REQUIRED_ARCHIVE_FILES = [
  "policyops-fc.dump",
  "cases.dump",
  "showcase_cases.dump",
  "tests.dump",
  "selection-report.json",
  "manifest.json",
  "restore-report.json",
  "sha256sums.txt",
] as const;

/** SHA清单必须恰好覆盖的7个文件（RCL-FR-003，不含sha256sums.txt自身）。 */
export const SHA_LIST_FILES = [
  "policyops-fc.dump",
  "cases.dump",
  "showcase_cases.dump",
  "tests.dump",
  "selection-report.json",
  "manifest.json",
  "restore-report.json",
] as const;

/**
 * 对真实文件字节计算SHA-256（RCL-FR-003/AC-001）。
 * sha256sums.txt 本身不参与自身哈希：清单由调用方在其余文件全部写入后
 * 最后生成，且本函数对 sha256sums.txt 返回空（不自包含，RCL-FR-003）。
 */
export function fileContentSha256(
  filePath: string,
  readFile?: (p: string) => Buffer,
): string {
  const read = readFile ?? ((p: string) => readFileSync(p));
  const content = read(filePath);
  return createHash("sha256").update(content).digest("hex");
}

/** 生成不含自身的 sha256sums.txt 内容（RCL-FR-003：最后生成、不包含自身）。 */
export function buildSha256SumsContent(entries: ArchiveFileEntry[]): string {
  return (
    entries
      .filter((e) => e.fileName !== "sha256sums.txt")
      .map((e) => `${e.sha256}  ${e.fileName}`)
      .join("\n") + "\n"
  );
}

export function buildArchiveFileManifest(
  input: BuildArchiveFileManifestInput,
): ArchiveFileEntry[] {
  const read = input.readFile ?? ((p: string) => readFileSync(p));
  const names = [
    "policyops-fc.dump",
    ...input.tableDumpNames.map((t) => `${t}.dump`),
    "selection-report.json",
    "manifest.json",
    "restore-report.json",
    "sha256sums.txt",
  ];
  return names.map((fileName) => {
    const filePath = path.join(input.storagePath, fileName);
    if (fileName === "sha256sums.txt") {
      // sha256sums.txt 最后生成：内容由调用方经 buildSha256SumsContent 写出，
      // 这里不计算自身哈希（不自包含，RCL-FR-003）。
      return { fileName, path: filePath, sha256: "" };
    }
    if (!existsSync(filePath)) {
      throw new Error(`归档文件缺失：${filePath}（RCL-FR-005 fail-closed）`);
    }
    return {
      fileName,
      path: filePath,
      sha256: fileContentSha256(filePath, read),
    };
  });
}

/** 存储抽象（executor.RclStorage的结构子集；避免循环依赖）。 */
export interface ArchiveStorage {
  read(p: string): Buffer;
  exists(p: string): boolean;
}

const SAFE_BASENAME = /^[A-Za-z0-9._-]+$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

/**
 * SHA清单精确覆盖验证（RCL-FR-003/AC-001，第三轮复审）：
 * - 恰好覆盖7个必备文件各一次（重复/缺失/额外全部拒绝）；
 * - 文件名只能是安全basename（拒绝../、绝对路径、子目录）；
 * - hash必须是64位小写hex；
 * - 清单不得包含自身；
 * - 每个文件真实字节SHA与清单一致。
 * 返回mismatches（空数组=通过）。
 */
export function verifySha256SumsFile(
  storage: ArchiveStorage,
  dir: string,
): string[] {
  const mismatches: string[] = [];
  const sumsPath = path.join(dir, "sha256sums.txt");
  if (!storage.exists(sumsPath)) {
    return ["缺失必备文件：sha256sums.txt"];
  }
  const raw = String(storage.read(sumsPath));
  const lines = raw.trim().split("\n").filter(Boolean);

  const seen = new Map<string, number>();
  for (const line of lines) {
    const m = /^([0-9a-f]{64})  ([A-Za-z0-9._-]+)$/.exec(line.trim());
    if (!m) {
      // 行级诊断：区分hash格式非法与路径非法。
      const parts = line.split(/\s{2,}/);
      const hash = parts[0] ?? "";
      const fileName = parts[1] ?? "";
      if (!SHA256_HEX.test(hash)) {
        mismatches.push(`sha256sums.txt 行hash非法（须64位小写hex）：${line.slice(0, 80)}`);
      } else if (!fileName || !SAFE_BASENAME.test(fileName) || fileName.includes("..")) {
        mismatches.push(`sha256sums.txt 文件名非法（须安全basename）：${fileName || line.slice(0, 80)}`);
      } else {
        mismatches.push(`sha256sums.txt 行格式非法：${line.slice(0, 80)}`);
      }
      continue;
    }
    const [, hash, fileName] = m;
    if (fileName === "sha256sums.txt") {
      mismatches.push("sha256sums.txt 包含自身（必须不自包含，RCL-FR-003）");
      continue;
    }
    if (fileName.includes("..") || path.isAbsolute(fileName) || fileName.includes("/") || fileName.includes("\\")) {
      mismatches.push(`sha256sums.txt 路径穿越/非法路径：${fileName}`);
      continue;
    }
    seen.set(fileName, (seen.get(fileName) ?? 0) + 1);
    const filePath = path.join(dir, fileName);
    if (!storage.exists(filePath)) {
      mismatches.push(`清单文件缺失：${fileName}`);
      continue;
    }
    const actual = createHash("sha256").update(storage.read(filePath)).digest("hex");
    if (actual !== hash) {
      mismatches.push(`SHA不符：${fileName}`);
    }
  }

  // 重复条目。
  for (const [fileName, count] of seen) {
    if (count > 1) mismatches.push(`重复条目：${fileName}（${count}次）`);
  }
  // 精确覆盖：每个必备文件恰好一次；清单不得包含额外文件。
  for (const required of SHA_LIST_FILES) {
    const count = seen.get(required) ?? 0;
    if (count === 0) mismatches.push(`清单缺少必备文件：${required}（RCL-FR-003 精确覆盖）`);
  }
  for (const fileName of seen.keys()) {
    if (!(SHA_LIST_FILES as readonly string[]).includes(fileName)) {
      mismatches.push(`清单包含额外文件：${fileName}`);
    }
  }
  return mismatches;
}

/** 选择报告（RCL-FR-002/005）：策展输入、配额统计与最终36条选择。 */
export interface SelectionReport {
  status: "verified" | "pending";
  algorithmVersion: string;
  generatedAt: string;
  curatedUids: string[];
  sourceCounts: Record<string, number>;
  quotaStats: Record<string, number>;
  violations: string[];
}

export function buildSelectionReport(input: {
  algorithmVersion: string;
  curatedUids: string[];
  sourceCounts: Record<string, number>;
  quotaStats: Record<string, number>;
  violations: string[];
  nowIso?: string;
}): SelectionReport {
  return {
    status: input.violations.length === 0 ? "verified" : "pending",
    algorithmVersion: input.algorithmVersion,
    generatedAt: input.nowIso ?? new Date().toISOString(),
    curatedUids: [...input.curatedUids].sort(),
    sourceCounts: input.sourceCounts,
    quotaStats: input.quotaStats,
    violations: [...input.violations],
  };
}

const UID_RE = /^RPC-(310000|440000)-.+-V1$/;
const GENDER_LABELS = ["male", "female"];
const BAND_LABELS = ["before_1970", "1970_1979", "from_1980"];
const EMP_LABELS = ["employed", "flexible", "unemployed"];

/** 供selection计算的最小showcase行结构。 */
export interface SelectionShowcaseRow {
  uid?: string | null;
  jurisdictionCode: string;
  qualityStatus?: string | null;
  input: unknown;
  expected: unknown;
  assertions: unknown[];
  coverageObligations: unknown[];
  evidence: unknown[];
  multiLabels: unknown[];
}

/**
 * 从生成后的showcase实际计算selection报告（RCL-FR-005/AC-008，第三轮复审）：
 * - 上海18、广东18；每地区男女9/9、三个年龄段各6、三种就业状态各6；
 * - 校验场景UID（RPC-<310000|440000>-…-V1）、地区、质量状态（selected）与
 *   必填字段（input/expected/assertions/coverage/evidence非空）；
 * - status与violations必须由计算结果产生（CLI禁止硬编码violations=[]）。
 */
export function computeSelectionReport(
  showcases: Array<SelectionShowcaseRow>,
): SelectionReport {
  const violations: string[] = [];
  const sourceCounts: Record<string, number> = {};
  const quotaStats: Record<string, number> = {};
  const curatedUids: string[] = [];

  for (const s of showcases) {
    const code = s.jurisdictionCode;
    if (code !== "310000" && code !== "440000") {
      violations.push(`showcase ${s.uid ?? "?"} 地区非法：${code}`);
      continue;
    }
    if (!s.uid || !UID_RE.test(s.uid)) {
      violations.push(`showcase UID非法：${s.uid ?? "空"}（须RPC-<地区>-…-V1）`);
    }
    // manifest.newShowcase行在apply时才写入quality_status='selected'；
    // 策展计算时缺失视为selected（生成器只产出showcaseEligible场景）。
    if (s.qualityStatus != null && s.qualityStatus !== "selected") {
      violations.push(`showcase ${s.uid ?? code} 质量状态非selected：${s.qualityStatus}`);
    }
    const missing: string[] = [];
    if (!s.input || Object.keys(s.input as object).length === 0) missing.push("input");
    if (!s.expected || Object.keys(s.expected as object).length === 0) missing.push("expected");
    if (!s.assertions || s.assertions.length === 0) missing.push("assertions");
    if (!s.coverageObligations || s.coverageObligations.length === 0) missing.push("coverageObligations");
    if (!s.evidence || s.evidence.length === 0) missing.push("evidence");
    if (missing.length > 0) {
      violations.push(`showcase ${s.uid ?? code} 必填字段缺失：${missing.join("/")}`);
    }
    sourceCounts[code] = (sourceCounts[code] ?? 0) + 1;
    curatedUids.push(s.uid!);
    const labels = (s.multiLabels ?? []) as string[];
    const gender = labels.find((l) => GENDER_LABELS.includes(l));
    const band = labels.find((l) => BAND_LABELS.includes(l));
    const emp = labels.find((l) => EMP_LABELS.includes(l));
    if (gender) quotaStats[`${code}_${gender}`] = (quotaStats[`${code}_${gender}`] ?? 0) + 1;
    if (band) quotaStats[`${code}_${band}`] = (quotaStats[`${code}_${band}`] ?? 0) + 1;
    if (emp) quotaStats[`${code}_${emp}`] = (quotaStats[`${code}_${emp}`] ?? 0) + 1;
  }

  // 配额核对（每地区18、男女9/9、三年龄段各6、三就业态各6）。
  for (const code of ["310000", "440000"]) {
    const n = sourceCounts[code] ?? 0;
    if (n !== 18) violations.push(`地区${code} showcase ${n} ≠ 18（RCL-AC-008）`);
    for (const g of GENDER_LABELS) {
      if ((quotaStats[`${code}_${g}`] ?? 0) !== 9) {
        violations.push(`地区${code} ${g} ${quotaStats[`${code}_${g}`] ?? 0} ≠ 9`);
      }
    }
    for (const b of BAND_LABELS) {
      if ((quotaStats[`${code}_${b}`] ?? 0) !== 6) {
        violations.push(`地区${code} ${b} ${quotaStats[`${code}_${b}`] ?? 0} ≠ 6`);
      }
    }
    for (const e of EMP_LABELS) {
      if ((quotaStats[`${code}_${e}`] ?? 0) !== 6) {
        violations.push(`地区${code} ${e} ${quotaStats[`${code}_${e}`] ?? 0} ≠ 6`);
      }
    }
  }

  return buildSelectionReport({
    algorithmVersion: "RCL-GEN-1.0",
    curatedUids,
    sourceCounts,
    quotaStats,
    violations,
  });
}

/**
 * verify-archive对selection-report的解析验证（RCL-FR-005，第三轮复审）：
 * status必须verified、violations必须为空、sourceCounts与quotaStats必须与
 * manifest.newShowcase实际计算结果一致；缺字段、计数或配额不符 → mismatches，
 * 不得进入restore_verified。
 */
export function verifySelectionReport(
  report: unknown,
  manifest: { newShowcase: Array<NewShowcaseRow | SelectionShowcaseRow> },
): string[] {
  const mismatches: string[] = [];
  if (!report || typeof report !== "object") {
    return ["selection-report.json 无法解析"];
  }
  const r = report as Record<string, unknown>;
  if (r.status !== "verified") {
    mismatches.push(`selection-report 状态为 ${String(r.status ?? "缺失")}，必须 verified`);
  }
  const violations = Array.isArray(r.violations) ? (r.violations as unknown[]) : null;
  if (violations === null) {
    mismatches.push("selection-report 缺 violations 字段");
  } else if (violations.length > 0) {
    mismatches.push(`selection-report violations 非空：${violations.slice(0, 5).join("；")}`);
  }
  const sourceCounts = (r.sourceCounts ?? {}) as Record<string, number>;
  const quotaStats = (r.quotaStats ?? {}) as Record<string, number>;
  const curatedUids = Array.isArray(r.curatedUids) ? (r.curatedUids as string[]) : [];
  // 与manifest.newShowcase交叉核对（实际计算结果必须一致）。
  // 归档模式（newShowcase为空，如旧库851/117/500归档）只要求报告自身verified，
  // 不进行36条配额交叉核对。
  if (manifest.newShowcase.length > 0) {
    if (curatedUids.length !== 36) {
      mismatches.push(`selection-report curatedUids ${curatedUids.length} ≠ 36`);
    }
    for (const code of ["310000", "440000"]) {
      if ((sourceCounts[code] ?? 0) !== 18) {
        mismatches.push(`selection-report 地区${code} ${sourceCounts[code] ?? 0} ≠ 18`);
      }
    }

    const actual = computeSelectionReport(manifest.newShowcase as Array<SelectionShowcaseRow>);
    if (actual.status !== "verified") {
      mismatches.push(`manifest showcase 实际配额校验失败：${actual.violations.slice(0, 5).join("；")}`);
    }
    if (actual.sourceCounts["310000"] !== (sourceCounts["310000"] ?? 0)) {
      mismatches.push("selection-report sourceCounts 与manifest实际计算不一致");
    }
    const reportQuota = JSON.stringify(Object.entries(quotaStats).sort());
    const actualQuota = JSON.stringify(Object.entries(actual.quotaStats).sort());
    if (reportQuota !== actualQuota) {
      mismatches.push("selection-report quotaStats 与manifest实际计算不一致");
    }
  }
  return mismatches;
}

/** 恢复报告（RCL-FR-004/005）：来源dump SHA、PG/pgvector版本、表/sequence与规范化哈希。 */
export interface RestoreReport {
  status: "verified" | "pending";
  sourceDump: {
    fileName: string;
    sha256: string;
  };
  environment: {
    postgresVersion: string;
    pgvectorVersion: string | null;
    restoredDatabaseUrl: string;
    restoredAt: string;
  };
  reconcile: {
    tableCount: number;
    sequenceCount: number;
    tables: Array<{ schema: string; table: string; rows: number; hash: string }>;
    sequences: Array<{ schema: string; name: string; lastValue: number | null; isCalled: boolean }>;
    mismatches: string[];
  };
  archiveFileHashes: Record<string, string>;
}

export function buildPendingRestoreReport(input: {
  sourceDumpFileName: string;
  sourceDumpSha256: string;
  nowIso?: string;
}): RestoreReport {
  return {
    status: "pending",
    sourceDump: {
      fileName: input.sourceDumpFileName,
      sha256: input.sourceDumpSha256,
    },
    environment: {
      postgresVersion: "",
      pgvectorVersion: null,
      restoredDatabaseUrl: "",
      restoredAt: "",
    },
    reconcile: {
      tableCount: 0,
      sequenceCount: 0,
      tables: [],
      sequences: [],
      mismatches: [],
    },
    archiveFileHashes: {},
  };
}

export function writeRestoreReport(
  restoreReportPath: string,
  report: RestoreReport,
): void {
  writeFileSync(restoreReportPath, JSON.stringify(report, null, 2), "utf8");
}

/**
 * restore-report真实验证（RCL-FR-004/AC-004，第三轮复审）：
 * 仅写{"status":"verified"}的空报告必须拒绝；必须验证：
 * - sourceDump.fileName === "policyops-fc.dump"，sha256 === 真实dump字节SHA；
 * - postgresVersion与pgvectorVersion非空；
 * - tableCount === tables.length；每表有schema/table/真实rows与64位规范化hash；
 * - sequenceCount === sequences.length；每sequence有schema/name及真实
 *   lastValue/isCalled状态；
 * - mismatches必须为空；表/sequence明细为空、重复、缺失或计数不一致拒绝；
 * - archiveFileHashes必须与归档文件实际SHA一致。
 * 返回mismatches（空数组=通过）。
 */
export function validateRestoreReport(
  report: unknown,
  archive: { dumpSha256: string; fileHashes: Record<string, string> },
): string[] {
  const mismatches: string[] = [];
  if (!report || typeof report !== "object") {
    return ["restore-report.json 无法解析"];
  }
  const r = report as Record<string, unknown>;
  if (r.status !== "verified") {
    mismatches.push(`restore-report 状态为 ${String(r.status ?? "缺失")}，必须 verified`);
  }
  const sd = (r.sourceDump ?? {}) as Record<string, unknown>;
  if (sd.fileName !== "policyops-fc.dump") {
    mismatches.push(`restore-report sourceDump.fileName 必须是 policyops-fc.dump（实际 ${String(sd.fileName ?? "缺失")}）`);
  }
  if (typeof sd.sha256 !== "string" || !SHA256_HEX.test(sd.sha256)) {
    mismatches.push("restore-report sourceDump.sha256 缺失或非64位hex");
  } else if (sd.sha256 !== archive.dumpSha256) {
    mismatches.push("restore-report sourceDump.sha256 与真实dump字节SHA不符");
  }
  const env = (r.environment ?? {}) as Record<string, unknown>;
  if (typeof env.postgresVersion !== "string" || env.postgresVersion.length === 0) {
    mismatches.push("restore-report postgresVersion 为空");
  }
  if (typeof env.pgvectorVersion !== "string" || env.pgvectorVersion.length === 0) {
    mismatches.push("restore-report pgvectorVersion 为空");
  }
  const rec = (r.reconcile ?? {}) as Record<string, unknown>;
  const tables = Array.isArray(rec.tables) ? (rec.tables as Array<Record<string, unknown>>) : null;
  const sequences = Array.isArray(rec.sequences) ? (rec.sequences as Array<Record<string, unknown>>) : null;
  if (tables === null) {
    mismatches.push("restore-report reconcile.tables 缺失");
  } else if (tables.length === 0) {
    mismatches.push("restore-report 表明细为空（RCL-FR-004：禁止空明细verified）");
  } else {
    if (Number(rec.tableCount) !== tables.length) {
      mismatches.push(`restore-report tableCount ${String(rec.tableCount)} ≠ tables.length ${tables.length}`);
    }
    const seen = new Set<string>();
    for (const t of tables) {
      const key = `${String(t.schema)}.${String(t.table)}`;
      if (seen.has(key)) {
        mismatches.push(`restore-report 表重复：${key}`);
        continue;
      }
      seen.add(key);
      if (typeof t.schema !== "string" || t.schema.length === 0) mismatches.push("restore-report 表缺schema");
      if (typeof t.table !== "string" || t.table.length === 0) mismatches.push("restore-report 表缺table");
      if (typeof t.rows !== "number" || !Number.isInteger(t.rows) || t.rows < 0) {
        mismatches.push(`restore-report 表 ${key} rows 非法（${String(t.rows)}）`);
      }
      if (typeof t.hash !== "string" || !SHA256_HEX.test(t.hash)) {
        mismatches.push(`restore-report 表 ${key} hash 非法（须64位hex）`);
      }
    }
  }
  if (sequences === null) {
    mismatches.push("restore-report reconcile.sequences 缺失");
  } else if (sequences.length === 0) {
    mismatches.push("restore-report sequence明细为空（RCL-FR-004：必须包含真实sequence状态）");
  } else {
    if (Number(rec.sequenceCount) !== sequences.length) {
      mismatches.push(`restore-report sequenceCount ${String(rec.sequenceCount)} ≠ sequences.length ${sequences.length}`);
    }
    const seen = new Set<string>();
    for (const s of sequences) {
      const key = `${String(s.schema)}.${String(s.name)}`;
      if (seen.has(key)) {
        mismatches.push(`restore-report sequence重复：${key}`);
        continue;
      }
      seen.add(key);
      if (typeof s.schema !== "string" || s.schema.length === 0) mismatches.push("restore-report sequence缺schema");
      if (typeof s.name !== "string" || s.name.length === 0) mismatches.push("restore-report sequence缺name");
      if (typeof s.lastValue !== "number" && s.lastValue !== null) {
        mismatches.push(`restore-report sequence ${key} lastValue 非法`);
      }
      if (typeof s.isCalled !== "boolean") {
        mismatches.push(`restore-report sequence ${key} isCalled 缺失（须真实状态）`);
      }
    }
  }
  const mismatchList = Array.isArray(rec.mismatches) ? (rec.mismatches as unknown[]) : null;
  if (mismatchList === null) {
    mismatches.push("restore-report reconcile.mismatches 缺失");
  } else if (mismatchList.length > 0) {
    mismatches.push(`restore-report mismatches 非空：${mismatchList.slice(0, 5).join("；")}`);
  }
  const fileHashes = (r.archiveFileHashes ?? {}) as Record<string, unknown>;
  for (const fileName of SHA_LIST_FILES) {
    // restore-report.json自身无法包含自身字节的hash（自引用循环），
    // 其真实性由sha256sums.txt（最后生成）与manifest三方校验兜底。
    if (fileName === "restore-report.json") continue;
    const declared = fileHashes[fileName];
    const actual = archive.fileHashes[fileName];
    if (typeof declared !== "string" || !SHA256_HEX.test(declared)) {
      mismatches.push(`restore-report archiveFileHashes 缺${fileName}或hash非法`);
    } else if (declared !== actual) {
      mismatches.push(`restore-report archiveFileHashes.${fileName} 与实际文件SHA不符`);
    }
  }
  return mismatches;
}

export function assertRestoreVerified(batch: {
  id: string;
  status: string;
}): void {
  if (batch.status !== "restore_verified") {
    throw new Error(
      `归档批次 ${batch.id} 状态为「${batch.status}」未达到 restore_verified，恢复验证通过前禁止删除（RCL-NFR-001）`,
    );
  }
}

/** 生成批次ID（受控执行器与测试共用）。 */
export function newArchiveBatchId(): string {
  return randomUUID();
}

export type { CaseArchiveBatchStatus };
export { sha256hex };
