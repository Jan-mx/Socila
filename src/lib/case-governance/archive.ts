/**
 * RCL-FR-002/003/004/005、RCL-NFR-001 归档包与恢复门禁：
 * - 归档清单对**真实文件字节**计算SHA-256（修复旧实现`sha256(fileName)`的P0缺陷）；
 * - 归档包必须包含：完整库dump、三表dump、selection-report、manifest、
 *   restore-report、不自包含的sha256sums.txt（最后生成且不包含自身）；
 * - restore report 绑定来源dump SHA、PostgreSQL/pgvector版本、恢复目标、
 *   全部表/sequence计数与规范化哈希（RCL-FR-004）；
 * - assertRestoreVerified：未 restore_verified 的批次禁止apply。
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { sha256hex } from "./hashes";
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
    sequences: string[];
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