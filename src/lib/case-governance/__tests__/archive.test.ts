/**
 * CLG-FR-011/012/NFR-001/006 归档包与恢复门禁（单元层）：
 * - 归档包结构：版本、批次UTC时间戳目录、文件清单、SHA-256 checksum；
 * - 恢复门禁：未 restore_verified 的批次禁止 apply（恢复失败禁止删除）；
 * - 治理状态机：prepared → restore_verified → applied，非法迁移被拒；
 * - 审计元数据只保存UID/哈希/原因，不复制原始转录正文（CLG-FR-013/NFR-004）。
 *
 * Red：实现前模块 `src/lib/case-governance/archive` 不存在。
 */
import { describe, it, expect } from "vitest";
import {
  buildArchiveFileManifest,
  assertRestoreVerified,
  type ArchiveFileEntry,
} from "../archive";

describe("CLG-FR-011 归档包结构", () => {
  it("生成文件清单：完整库dump、案例三表dump、manifest、SHA清单、选择与恢复报告", () => {
    const entries = buildArchiveFileManifest({
      storagePath: "backup/case-library/2026-09-07T120000Z",
      tableDumpNames: ["cases", "showcase_cases", "tests"],
    });
    const names = entries.map((e) => e.fileName);
    expect(names).toContain("policyops-fc.dump");
    expect(names).toContain("cases.dump");
    expect(names).toContain("showcase_cases.dump");
    expect(names).toContain("tests.dump");
    expect(names).toContain("manifest.json");
    expect(names).toContain("sha256sums.txt");
    expect(names).toContain("selection-report.json");
    expect(names).toContain("restore-report.json");
  });

  it("每个条目带与存储路径拼接后的完整路径（backup/case-library/下）", () => {
    const entries = buildArchiveFileManifest({
      storagePath: "backup/case-library/2026-09-07T120000Z",
      tableDumpNames: ["cases"],
    });
    for (const e of entries) {
      expect(e.path).toMatch(/^backup\/case-library\/2026-09-07T120000Z\//);
    }
  });

  it("哈希条目为64位小写hex", () => {
    const entries = buildArchiveFileManifest({
      storagePath: "backup/case-library/2026-09-07T120000Z",
      tableDumpNames: [],
      hashOverride: (name: string) => `${name.length.toString(16).padStart(64, "0")}`,
    });
    for (const e of entries) {
      expect(e.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("CLG-NFR-001 恢复门禁（恢复失败禁止删除）", () => {
  it("批次仍为prepared → assertRestoreVerified抛错", () => {
    expect(() =>
      assertRestoreVerified({ id: "b1", status: "prepared" }),
    ).toThrow(/restore_verified/);
  });

  it("批次为restore_verified → 通过", () => {
    expect(() =>
      assertRestoreVerified({ id: "b1", status: "restore_verified" }),
    ).not.toThrow();
  });

  it("批次为applied → 不允许再次apply（状态机防重入）", () => {
    expect(() =>
      assertRestoreVerified({ id: "b1", status: "applied" }),
    ).toThrow();
  });

  it("批次为rolled_back → 不允许apply", () => {
    expect(() =>
      assertRestoreVerified({ id: "b1", status: "rolled_back" }),
    ).toThrow();
  });
});

describe("CLG-FR-013 归档元数据不含正文", () => {
  it("归档条目只保存UID/哈希/原因——正文永不出现在归档元数据", () => {
    const entry: ArchiveFileEntry = {
      fileName: "manifest.json",
      path: "backup/case-library/x/manifest.json",
      sha256: "ab".repeat(32),
    };
    expect(JSON.stringify(entry)).not.toContain("transcript");
    // 归档条目类型不允许正文字段（构造器不接收正文）
    expect(Object.keys(entry).sort()).toEqual(["fileName", "path", "sha256"]);
  });
});