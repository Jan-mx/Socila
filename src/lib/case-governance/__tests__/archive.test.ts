/**
 * RCL-FR-002/003/004/005、RCL-AC-001/002 归档包与恢复门禁（单元层）：
 * - 清单对真实文件字节计算SHA-256（修复 P0：禁止用文件名作为hash）；
 * - 归档包含完整库dump、三表dump、selection-report、manifest、restore-report、
 *   不自包含的sha256sums.txt（RCL-FR-002/003）；
 * - 修改任一归档文件后SHA验证失败（RCL-AC-001）；
 * - restore report绑定来源dump、版本、表/sequence与规范化哈希（RCL-FR-004）；
 * - 未 restore_verified 的批次禁止 apply（RCL-NFR-001）。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  buildArchiveFileManifest,
  buildSha256SumsContent,
  buildSelectionReport,
  buildPendingRestoreReport,
  assertRestoreVerified,
  REQUIRED_ARCHIVE_FILES,
  fileContentSha256,
  type ArchiveFileEntry,
} from "../archive";

describe("RCL-FR-003 真文件SHA（修复P0：文件名不再是hash）", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "rcl-archive-"));
    writeFileSync(path.join(dir, "policyops-fc.dump"), Buffer.from("full-dump-bytes"));
    writeFileSync(path.join(dir, "cases.dump"), Buffer.from("cases-dump-bytes"));
    writeFileSync(path.join(dir, "showcase_cases.dump"), Buffer.from("show-dump-bytes"));
    writeFileSync(path.join(dir, "tests.dump"), Buffer.from("tests-dump-bytes"));
    writeFileSync(path.join(dir, "selection-report.json"), JSON.stringify({ status: "verified" }));
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ manifestHash: "mh" }));
    writeFileSync(path.join(dir, "restore-report.json"), JSON.stringify({ status: "pending" }));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("SHA-256来自真实文件字节，且不等于文件名的hash（P0回归）", () => {
    const entries = buildArchiveFileManifest({
      storagePath: dir,
      tableDumpNames: ["cases", "showcase_cases", "tests"],
    });
    const dump = entries.find((e) => e.fileName === "policyops-fc.dump")!;
    const expected = fileContentSha256(path.join(dir, "policyops-fc.dump"));
    expect(dump.sha256).toBe(expected);
    // 修复前实现是 sha256hex(fileName)——断言不再出现。
    const fileNameHash = createHash("sha256").update("policyops-fc.dump").digest("hex");
    expect(dump.sha256).not.toBe(fileNameHash);
  });

  it("修改任一归档文件后SHA验证失败（RCL-AC-001）", () => {
    const before = buildArchiveFileManifest({
      storagePath: dir,
      tableDumpNames: ["cases", "showcase_cases", "tests"],
    }).find((e) => e.fileName === "cases.dump")!.sha256;
    writeFileSync(path.join(dir, "cases.dump"), Buffer.from("tampered"));
    const after = buildArchiveFileManifest({
      storagePath: dir,
      tableDumpNames: ["cases", "showcase_cases", "tests"],
    }).find((e) => e.fileName === "cases.dump")!.sha256;
    expect(after).not.toBe(before);
  });

  it("归档必备文件齐全（完整库dump/三表dump/selection/manifest/restore/sha清单）", () => {
    const entries = buildArchiveFileManifest({
      storagePath: dir,
      tableDumpNames: ["cases", "showcase_cases", "tests"],
    });
    const names = entries.map((e) => e.fileName);
    for (const required of REQUIRED_ARCHIVE_FILES) {
      expect(names).toContain(required);
    }
  });

  it("归档文件缺失时 fail-closed（RCL-FR-005）", () => {
    rmSync(path.join(dir, "manifest.json"));
    expect(() =>
      buildArchiveFileManifest({
        storagePath: dir,
        tableDumpNames: ["cases", "showcase_cases", "tests"],
      }),
    ).toThrow(/缺失/);
  });
});

describe("RCL-FR-003 sha256sums.txt 不自包含", () => {
  it("清单内容不含sha256sums.txt自身条目", () => {
    const entries: ArchiveFileEntry[] = [
      { fileName: "policyops-fc.dump", path: "/x/policyops-fc.dump", sha256: "a".repeat(64) },
      { fileName: "sha256sums.txt", path: "/x/sha256sums.txt", sha256: "" },
    ];
    const content = buildSha256SumsContent(entries);
    expect(content).toContain("policyops-fc.dump");
    expect(content).not.toContain("sha256sums.txt");
  });
});

describe("RCL-FR-002/004 selection与restore报告", () => {
  it("selection-report 记录策展输入、配额与最终选择；violations为空即verified", () => {
    const report = buildSelectionReport({
      algorithmVersion: "RCL-GEN-1.0",
      curatedUids: ["RPC-310000-SH-01-V1", "RPC-440000-GD-01-V1"],
      sourceCounts: { cases: 40, showcase: 36 },
      quotaStats: { female: 18, male: 18 },
      violations: [],
      nowIso: "2026-09-08T00:00:00.000Z",
    });
    expect(report.status).toBe("verified");
    expect(report.curatedUids).toHaveLength(2);
    expect(report.violations).toEqual([]);
  });

  it("selection-report 有violations时status=pending（apply禁止）", () => {
    const report = buildSelectionReport({
      algorithmVersion: "RCL-GEN-1.0",
      curatedUids: [],
      sourceCounts: {},
      quotaStats: {},
      violations: ["female不足18"],
      nowIso: "2026-09-08T00:00:00.000Z",
    });
    expect(report.status).toBe("pending");
  });

  it("restore-report 绑定来源dump SHA与环境/表/sequence信息（RCL-FR-004）", () => {
    const pending = buildPendingRestoreReport({
      sourceDumpFileName: "policyops-clg-pre-20260907205041.dump",
      sourceDumpSha256: "b".repeat(64),
      nowIso: "2026-09-08T00:00:00.000Z",
    });
    expect(pending.status).toBe("pending");
    expect(pending.sourceDump.sha256).toBe("b".repeat(64));
    expect(pending.reconcile).toMatchObject({ tableCount: 0, sequenceCount: 0, tables: [], sequences: [] });
  });
});

describe("RCL-NFR-001 恢复门禁（恢复失败禁止删除）", () => {
  it("prepared/applied/rolled_back 均拒绝；restore_verified 通过", () => {
    for (const status of ["prepared", "applied", "rolled_back"]) {
      expect(() => assertRestoreVerified({ id: "b1", status })).toThrow(/restore_verified/);
    }
    expect(() => assertRestoreVerified({ id: "b1", status: "restore_verified" })).not.toThrow();
  });
});
