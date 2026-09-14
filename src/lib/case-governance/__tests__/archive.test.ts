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
  verifySha256SumsFile,
  validateRestoreReport,
  computeSelectionReport,
  verifySelectionReport,
  SHA_LIST_FILES,
  type ArchiveFileEntry,
  type RestoreReport,
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

// ─── RCL第三轮复审：SHA清单精确覆盖（RCL-FR-003/AC-001）────────────────────────

function memStorage(files: Record<string, Buffer | string>) {
  const store = new Map<string, Buffer>();
  for (const [k, v] of Object.entries(files)) {
    store.set(k.split("\\").join("/"), Buffer.isBuffer(v) ? v : Buffer.from(v));
  }
  return {
    read: (p: string) => {
      const key = p.split("\\").join("/");
      if (!store.has(key)) throw new Error(`ENOENT ${p}`);
      return store.get(key)!;
    },
    exists: (p: string) => store.has(p.split("\\").join("/")),
  };
}

/** 生成合法7文件归档（sha256sums按真实字节）。 */
function validArchiveFiles(): Record<string, Buffer | string> {
  const files: Record<string, Buffer | string> = {
    "policyops-fc.dump": "FULL-DUMP",
    "cases.dump": "CASES",
    "showcase_cases.dump": "SHOW",
    "tests.dump": "TESTS",
    "selection-report.json": JSON.stringify({ status: "verified", violations: [] }),
    "manifest.json": JSON.stringify({ manifestHash: "x".repeat(64), oldTargets: { cases: [], showcase: [], tests: [] }, exampleTests: [], exampleSync: { retained: [], updated: [], added: [], deleted: [] }, newCases: [], newShowcase: [], newTests: [], counts: { cases: 0, showcase: 0, tests: 0 }, caseCount: 0, showcaseCount: 0, newTestCount: 0, exampleTestCount: 42, algorithmVersion: "RCL-MANIFEST-1.0", generatorVersion: "RCL-GEN-1.0", snapshot: null, createdAt: "2026-09-09T00:00:00.000Z" }),
    "restore-report.json": JSON.stringify({ status: "pending" }),
  };
  const hash = (b: Buffer | string) =>
    createHash("sha256").update(Buffer.isBuffer(b) ? b : Buffer.from(b)).digest("hex");
  const lines = Object.entries(files)
    .filter(([name]) => name !== "sha256sums.txt")
    .map(([name, content]) => `${hash(content)}  ${name}`);
  files["sha256sums.txt"] = lines.join("\n") + "\n";
  return files;
}

describe("RCL-FR-003 第三轮复审：SHA清单精确覆盖", () => {
  it("合法归档零mismatch；SHA_LIST_FILES恰好7个必备文件且不含清单自身", () => {
    const storage = memStorage(validArchiveFiles());
    expect(verifySha256SumsFile(storage, "")).toEqual([]);
    expect(SHA_LIST_FILES).toEqual([
      "policyops-fc.dump",
      "cases.dump",
      "showcase_cases.dump",
      "tests.dump",
      "selection-report.json",
      "manifest.json",
      "restore-report.json",
    ]);
  });

  it("删除manifest.json对应SHA行后再篡改manifest → 报缺失清单行（RCL-AC-001）", () => {
    const files = validArchiveFiles();
    const lines = String(files["sha256sums.txt"]).trim().split("\n").filter((l) => !l.endsWith("manifest.json"));
    files["manifest.json"] = "TAMPERED-BODY";
    files["sha256sums.txt"] = lines.join("\n") + "\n";
    const mm = verifySha256SumsFile(memStorage(files), "");
    expect(mm.some((m) => m.includes("manifest.json"))).toBe(true);
  });

  it("重复条目 → 拒绝", () => {
    const files = validArchiveFiles();
    const lines = String(files["sha256sums.txt"]).trim().split("\n");
    const hash = createHash("sha256").update("CASES").digest("hex");
    files["sha256sums.txt"] = [...lines, `${hash}  cases.dump`].join("\n") + "\n";
    const mm = verifySha256SumsFile(memStorage(files), "");
    expect(mm.some((m) => /重复|duplicate/i.test(m))).toBe(true);
  });

  it("额外文件条目（清单中不存在的文件） → 拒绝", () => {
    const files = validArchiveFiles();
    files["extra.txt"] = "EXTRA";
    const hash = createHash("sha256").update("EXTRA").digest("hex");
    files["sha256sums.txt"] = String(files["sha256sums.txt"]) + `${hash}  extra.txt\n`;
    const mm = verifySha256SumsFile(memStorage(files), "");
    expect(mm.some((m) => m.includes("extra.txt"))).toBe(true);
  });

  it("清单包含自身 → 拒绝（不自包含，RCL-FR-003）", () => {
    const files = validArchiveFiles();
    const selfHash = createHash("sha256").update("SELF").digest("hex");
    files["sha256sums.txt"] = `${selfHash}  sha256sums.txt\n`;
    const mm = verifySha256SumsFile(memStorage(files), "");
    expect(mm.some((m) => m.includes("sha256sums.txt"))).toBe(true);
  });

  it("../路径、绝对路径、子目录路径 → 全部拒绝", () => {
    for (const bad of ["../manifest.json", "/etc/passwd", "sub/manifest.json", "a\\b.json"]) {
      const files = validArchiveFiles();
      files["sha256sums.txt"] = `${"a".repeat(64)}  ${bad}\n`;
      const mm = verifySha256SumsFile(memStorage(files), "");
      expect(mm.length, bad).toBeGreaterThan(0);
    }
  });

  it("hash格式非法（非64位/大写/非hex） → 拒绝", () => {
    for (const badHash of ["abc", "A".repeat(64), "g".repeat(64), ""]) {
      const files = validArchiveFiles();
      files["sha256sums.txt"] = `${badHash}  cases.dump\n`;
      const mm = verifySha256SumsFile(memStorage(files), "");
      expect(mm.length, badHash).toBeGreaterThan(0);
    }
  });

  it("必备文件存在但没有进入清单 → 拒绝（精确覆盖）", () => {
    const files = validArchiveFiles();
    const lines = String(files["sha256sums.txt"]).trim().split("\n").filter((l) => !l.endsWith("tests.dump"));
    files["sha256sums.txt"] = lines.join("\n") + "\n";
    const mm = verifySha256SumsFile(memStorage(files), "");
    expect(mm.some((m) => m.includes("tests.dump"))).toBe(true);
  });
});

// ─── RCL第三轮复审：restore-report真实验证（RCL-FR-004/AC-004）─────────────────

function realRestoreReport(overrides: Record<string, unknown> = {}): RestoreReport {
  const dumpSha = createHash("sha256").update("FULL-DUMP").digest("hex");
  const tableHash = "e".repeat(64);
  const report: RestoreReport = {
    status: "verified",
    sourceDump: { fileName: "policyops-fc.dump", sha256: dumpSha },
    environment: {
      postgresVersion: "17.2",
      pgvectorVersion: "0.8.0",
      restoredDatabaseUrl: "postgresql://***@localhost:1/r",
      restoredAt: "2026-09-09T00:00:00.000Z",
    },
    reconcile: {
      tableCount: 1,
      sequenceCount: 1,
      tables: [{ schema: "public", table: "cases", rows: 3, hash: tableHash }],
      sequences: [{ schema: "public", name: "cases_id_seq", lastValue: 3, isCalled: true }],
      mismatches: [],
    },
    archiveFileHashes: {
      "policyops-fc.dump": dumpSha,
      "cases.dump": createHash("sha256").update("CASES").digest("hex"),
      "showcase_cases.dump": createHash("sha256").update("SHOW").digest("hex"),
      "tests.dump": createHash("sha256").update("TESTS").digest("hex"),
      "selection-report.json": createHash("sha256").update(JSON.stringify({ status: "verified", violations: [] })).digest("hex"),
      "manifest.json": createHash("sha256").update("M").digest("hex"),
      "restore-report.json": createHash("sha256").update("R").digest("hex"),
    },
    ...overrides,
  };
  return report;
}

describe("RCL-FR-004/AC-004 第三轮复审：restore-report真实验证", () => {
  function archiveCtx(report: RestoreReport) {
    return {
      dumpSha256: createHash("sha256").update("FULL-DUMP").digest("hex"),
      fileHashes: report.archiveFileHashes,
    };
  }

  it("仅写{\"status\":\"verified\"}的空报告 → 拒绝（第三轮复审P0反例）", () => {
    const mm = validateRestoreReport({ status: "verified" }, archiveCtx(realRestoreReport()));
    expect(mm.length).toBeGreaterThan(0);
  });

  it("sourceDump.fileName不是policyops-fc.dump → 拒绝", () => {
    const mm = validateRestoreReport(
      realRestoreReport({ sourceDump: { fileName: "other.dump", sha256: "a".repeat(64) } }),
      archiveCtx(realRestoreReport()),
    );
    expect(mm.some((m) => m.includes("policyops-fc.dump"))).toBe(true);
  });

  it("sourceDump.sha256与真实dump字节SHA不符 → 拒绝", () => {
    const mm = validateRestoreReport(
      realRestoreReport({ sourceDump: { fileName: "policyops-fc.dump", sha256: "b".repeat(64) } }),
      archiveCtx(realRestoreReport()),
    );
    expect(mm.some((m) => /sourceDump|dump.*SHA|SHA.*dump/i.test(m))).toBe(true);
  });

  it("postgresVersion/pgvectorVersion为空 → 拒绝", () => {
    for (const env of [
      { postgresVersion: "", pgvectorVersion: "0.8.0" },
      { postgresVersion: "17.2", pgvectorVersion: null },
      { postgresVersion: "17.2", pgvectorVersion: "" },
    ]) {
      const mm = validateRestoreReport(realRestoreReport({ environment: { ...realRestoreReport().environment, ...env } }), archiveCtx(realRestoreReport()));
      expect(mm.some((m) => /version/i.test(m)), JSON.stringify(env)).toBe(true);
    }
  });

  it("tableCount≠tables.length → 拒绝", () => {
    const mm = validateRestoreReport(realRestoreReport({ reconcile: { ...realRestoreReport().reconcile, tableCount: 5 } }), archiveCtx(realRestoreReport()));
    expect(mm.some((m) => /table/i.test(m))).toBe(true);
  });

  it("表明细为空/缺失schema/缺失table/rows非数/hash非64位 → 拒绝", () => {
    const base = realRestoreReport();
    const cases2: Array<{ label: string; report: RestoreReport }> = [
      { label: "空明细", report: realRestoreReport({ reconcile: { ...base.reconcile, tableCount: 0, tables: [] } }) },
      { label: "缺schema", report: realRestoreReport({ reconcile: { ...base.reconcile, tables: [{ table: "cases", rows: 3, hash: "e".repeat(64) } as never] } }) },
      { label: "缺table", report: realRestoreReport({ reconcile: { ...base.reconcile, tables: [{ schema: "public", rows: 3, hash: "e".repeat(64) } as never] } }) },
      { label: "rows非数", report: realRestoreReport({ reconcile: { ...base.reconcile, tables: [{ schema: "public", table: "cases", rows: "3", hash: "e".repeat(64) } as never] } }) },
      { label: "hash非64位", report: realRestoreReport({ reconcile: { ...base.reconcile, tables: [{ schema: "public", table: "cases", rows: 3, hash: "short" }] } }) },
    ];
    for (const c of cases2) {
      const mm = validateRestoreReport(c.report, archiveCtx(base));
      expect(mm.length, c.label).toBeGreaterThan(0);
    }
  });

  it("sequenceCount≠sequences.length或sequence缺schema/name/状态 → 拒绝", () => {
    const base = realRestoreReport();
    const cases2: Array<{ label: string; report: RestoreReport }> = [
      { label: "计数不符", report: realRestoreReport({ reconcile: { ...base.reconcile, sequenceCount: 9 } }) },
      { label: "空明细", report: realRestoreReport({ reconcile: { ...base.reconcile, sequenceCount: 0, sequences: [] } }) },
      { label: "缺name", report: realRestoreReport({ reconcile: { ...base.reconcile, sequences: [{ schema: "public", lastValue: 3, isCalled: true } as never] } }) },
      { label: "缺状态", report: realRestoreReport({ reconcile: { ...base.reconcile, sequences: [{ schema: "public", name: "s" } as never] } }) },
    ];
    for (const c of cases2) {
      const mm = validateRestoreReport(c.report, archiveCtx(base));
      expect(mm.length, c.label).toBeGreaterThan(0);
    }
  });

  it("mismatches非空/表重复/sequence重复 → 拒绝", () => {
    const base = realRestoreReport();
    const dupTable = realRestoreReport({ reconcile: { ...base.reconcile, tables: [...base.reconcile.tables, base.reconcile.tables[0]] } });
    expect(validateRestoreReport(dupTable, archiveCtx(base)).length).toBeGreaterThan(0);
    const dupSeq = realRestoreReport({ reconcile: { ...base.reconcile, sequences: [...base.reconcile.sequences, base.reconcile.sequences[0]] } });
    expect(validateRestoreReport(dupSeq, archiveCtx(base)).length).toBeGreaterThan(0);
    const withMismatch = realRestoreReport({ reconcile: { ...base.reconcile, mismatches: ["表 x 不一致"] } });
    expect(validateRestoreReport(withMismatch, archiveCtx(base)).length).toBeGreaterThan(0);
  });

  it("archiveFileHashes与实际归档文件SHA不符 → 拒绝", () => {
    const base = realRestoreReport();
    const bad = realRestoreReport({ archiveFileHashes: { ...base.archiveFileHashes, "cases.dump": "f".repeat(64) } });
    const mm = validateRestoreReport(bad, archiveCtx(realRestoreReport()));
    expect(mm.some((m) => m.includes("cases.dump"))).toBe(true);
  });

  it("合法完整报告 → 零mismatch", () => {
    expect(validateRestoreReport(realRestoreReport(), archiveCtx(realRestoreReport()))).toEqual([]);
  });
});

// ─── RCL第三轮复审：selection-report真实计算与验证（RCL-FR-005/AC-008）─────────

function showcaseRow(i: number, code: "310000" | "440000"): Record<string, unknown> {
  const gender = i % 2 === 0 ? "male" : "female";
  const band = ["before_1970", "1970_1979", "from_1980"][Math.floor((i % 18) / 6)];
  const emp = ["employed", "flexible", "unemployed"][i % 3];
  return {
    uid: `RPC-${code}-SHOW-${i}-V1`,
    jurisdictionCode: code,
    qualityStatus: "selected",
    input: { basic: { gender } },
    expected: { calc: {} },
    assertions: [{ path: "calc.x", operator: "eq", value: 1 }],
    coverageObligations: ["capability:retirement"],
    evidence: [{ documentId: "DOC", locator: "正文" }],
    multiLabels: [gender, band, emp],
  };
}

describe("RCL-FR-005/AC-008 第三轮复审：selection-report真实计算", () => {
  it("从showcase实际计算上海18、广东18；每地区男女9/9、三年龄段各6、三就业态各6", () => {
    const showcases = [
      ...Array.from({ length: 18 }, (_, i) => showcaseRow(i, "310000")),
      ...Array.from({ length: 18 }, (_, i) => showcaseRow(i, "440000")),
    ];
    const report = computeSelectionReport(showcases as never);
    expect(report.status).toBe("verified");
    expect(report.violations).toEqual([]);
    expect(report.sourceCounts).toEqual({ "310000": 18, "440000": 18 });
    for (const code of ["310000", "440000"]) {
      expect(report.quotaStats[`${code}_male`]).toBe(9);
      expect(report.quotaStats[`${code}_female`]).toBe(9);
      for (const band of ["before_1970", "1970_1979", "from_1980"]) {
        expect(report.quotaStats[`${code}_${band}`]).toBe(6);
      }
      for (const emp of ["employed", "flexible", "unemployed"]) {
        expect(report.quotaStats[`${code}_${emp}`]).toBe(6);
      }
    }
    expect(report.curatedUids).toHaveLength(36);
  });

  it("地区/配额不符 → violations非空且status=pending", () => {
    const bad = [
      ...Array.from({ length: 18 }, (_, i) => showcaseRow(i, "310000")),
      ...Array.from({ length: 17 }, (_, i) => showcaseRow(i, "440000")),
    ];
    const report = computeSelectionReport(bad as never);
    expect(report.status).toBe("pending");
    expect(report.violations.length).toBeGreaterThan(0);
  });

  it("UID格式/地区/必填字段校验：非法UID、非沪粤地区、空字段 → violations", () => {
    const showcases = [
      ...Array.from({ length: 18 }, (_, i) => showcaseRow(i, "310000")),
      ...Array.from({ length: 18 }, (_, i) => showcaseRow(i, "440000")),
    ];
    const badUid = { ...showcases[0], uid: "NOT-RPC-FORMAT" };
    const badJur = { ...showcases[1], jurisdictionCode: "510000" };
    const badFields = { ...showcases[2], input: {}, assertions: [] };
    for (const row of [badUid, badJur, badFields]) {
      const report = computeSelectionReport([...showcases.slice(0, 2), row, ...showcases.slice(3)] as never);
      expect(report.status).toBe("pending");
      expect(report.violations.length).toBeGreaterThan(0);
    }
  });

  it("verifySelectionReport：缺字段/计数或配额不符 → mismatches", () => {
    const manifest = {
      newShowcase: [
        ...Array.from({ length: 18 }, (_, i) => showcaseRow(i, "310000")),
        ...Array.from({ length: 18 }, (_, i) => showcaseRow(i, "440000")),
      ],
    };
    const good = computeSelectionReport(manifest.newShowcase as never);
    expect(verifySelectionReport(good, manifest as never)).toEqual([]);

    // status被篡改为pending。
    const pending = { ...good, status: "pending" as const };
    expect(verifySelectionReport(pending, manifest as never).length).toBeGreaterThan(0);
    // 计数被篡改。
    const wrongCounts = { ...good, sourceCounts: { "310000": 18, "440000": 17 } };
    expect(verifySelectionReport(wrongCounts, manifest as never).length).toBeGreaterThan(0);
    // manifest与report不一致（manifest只有34条）。
    const shortManifest = { newShowcase: manifest.newShowcase.slice(0, 34) };
    expect(verifySelectionReport(good, shortManifest as never).length).toBeGreaterThan(0);
  });
});
