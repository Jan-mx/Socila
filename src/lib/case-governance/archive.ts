/**
 * CLG-FR-011/012/NFR-001 归档包与恢复门禁（单元层）：
 * - 归档包结构：UTC时间戳目录、完整库dump、案例三表dump、manifest、SHA清单、
 *   选择报告、恢复报告；
 * - assertRestoreVerified：未 restore_verified 的批次禁止apply（恢复失败禁止删除）。
 */
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
  /** 测试注入：稳定哈希（默认对文件名内容取真实SHA-256）。 */
  hashOverride?: (fileName: string) => string;
}

export function buildArchiveFileManifest(
  input: BuildArchiveFileManifestInput,
): ArchiveFileEntry[] {
  const hash = (fileName: string): string => {
    if (input.hashOverride) return input.hashOverride(fileName);
    return sha256hex(fileName);
  };
  const names = [
    "policyops-fc.dump",
    ...input.tableDumpNames.map((t) => `${t}.dump`),
    "manifest.json",
    "sha256sums.txt",
    "selection-report.json",
    "restore-report.json",
  ];
  return names.map((fileName) => ({
    fileName,
    path: `${input.storagePath}/${fileName}`,
    sha256: hash(fileName),
  }));
}

export function assertRestoreVerified(batch: {
  id: string;
  status: string;
}): void {
  if (batch.status !== "restore_verified") {
    throw new Error(
      `归档批次 ${batch.id} 状态为「${batch.status}」未达到 restore_verified，恢复验证通过前禁止删除（CLG-NFR-001）`,
    );
  }
}

export type { CaseArchiveBatchStatus };
