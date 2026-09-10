/**
 * RCL-FR-021、RCL-AC-005/011/012 受控执行器单元测试（Red先行）：
 *
 * 2026-09-09复审P0：`scripts/rcl-case-library.ts`七模式只打印说明并退出0，
 * 不读取数据库、不生成manifest、不归档、不验证、不apply。
 * 本测试要求执行器（executor）调用真实业务逻辑并输出可验证结果：
 * - audit 返回真实库计数与目标指纹；
 * - prepare-archive 真实生成归档文件并最后生成不自包含的 sha256sums.txt；
 * - verify-archive 对真实文件字节校验SHA并拒绝缺失/漂移/restore pending；
 * - generate 真实生成36条场景并回填快照规划器期望；
 * - plan-replacement 构建完整manifest并输出可验证manifestHash；
 * - apply 调用受控替换并返回真实删除/插入计数；
 * - verify 核对 N/36/N+42 与字段完整性。
 *
 * 纯函数/依赖注入：本文件不连库、不spawn进程；CLI脚本只是executor的薄壳。
 */
import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  auditRcl,
  prepareRclArchive,
  verifyRclArchive,
  generateRclScenarios,
  planRclReplacement,
  applyRclReplacement,
  verifyRclReplacement,
  RclExecutorError,
} from "../executor";
import { computeSelectionReport, buildSelectionReport } from "../archive";
import { caseArchiveBatches, caseArchiveEntries } from "@/lib/db/schema";

function fakeDb(overrides: Record<string, unknown> = {}) {
  const insertChain = {
    values: vi.fn(() => ({ returning: vi.fn(async () => []) })),
  };
  const updateChain = {
    set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(async () => [{ id: "b-1" }]) })) })),
    where: vi.fn(() => ({ returning: vi.fn(async () => [{ id: "b-1" }]) })),
  };
  const dbObj = {
    execute: vi.fn(async () => ({ rows: [] })),
    // 事务回调以db自身作为tx（prepare-archive事务内insert可用）。
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(dbObj)),
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
    ...overrides,
  };
  return dbObj;
}

function fakeStorage(files: Record<string, string> = {}) {
  const norm = (p: string) => p.split("\\").join("/");
  const store = new Map<string, string>();
  for (const [k, v] of Object.entries(files)) store.set(norm(k), v);
  return {
    read: vi.fn((p: string) => {
      const key = norm(p);
      if (!store.has(key)) throw new Error(`ENOENT: ${p}`);
      return Buffer.from(store.get(key)!, "utf8");
    }),
    write: vi.fn((p: string, content: string | Buffer) => {
      store.set(norm(p), Buffer.isBuffer(content) ? content.toString("utf8") : content);
    }),
    exists: vi.fn((p: string) => store.has(norm(p))),
    list: vi.fn(() => [...store.keys()]),
    remove: vi.fn((p: string) => {
      store.delete(norm(p));
    }),
  };
}

/**
 * 带内存状态的db假实现（第四轮复审prepare补偿测试用）：
 * - insert/delete 对 case_archive_batches/case_archive_entries 真实增删；
 * - 支持预置历史批次，验证补偿只精确清理本次batchId；
 * - failDelete 注入补偿失败（验证原始错误与补偿错误同时报告）。
 */
function memoryDb(opts: {
  preExistingBatches?: Array<{ id: string; status: string }>;
  failDelete?: boolean;
} = {}) {
  const batches = new Map<string, { id: string; status: string }>();
  for (const b of opts.preExistingBatches ?? []) batches.set(b.id, b);
  const entries: Array<{ archiveBatchId: string }> = [];
  const uuidRe = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/;
  const dbObj = {
    batches,
    entries,
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(dbObj)),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((rows: unknown) => {
        const arr = Array.isArray(rows) ? rows : [rows];
        if (table === caseArchiveBatches) {
          for (const r of arr as Array<{ id: string; status: string }>) batches.set(r.id, r);
        } else if (table === caseArchiveEntries) {
          entries.push(...(arr as Array<{ archiveBatchId: string }>));
        }
        return {};
      }),
    })),
    delete: vi.fn((table: unknown) => ({
      where: vi.fn((cond: unknown) => {
        if (opts.failDelete) throw new Error("注入的补偿删除失败");
        const id = uuidRe.exec(queryText(cond))?.[1] ?? "";
        if (table === caseArchiveBatches) {
          batches.delete(id);
        } else {
          const keep = entries.filter((e) => e.archiveBatchId !== id);
          entries.splice(0, entries.length, ...keep);
        }
        return { returning: vi.fn(async () => [{ id }]) };
      }),
    })),
  };
  return dbObj;
}

/** drizzle SQL 对象文本提取（queryChunks → 编译文本，测试mock匹配用；
 * 递归展开and()/or()的嵌套queryChunks）。 */
function queryText(q: unknown): string {
  const chunks = (q as { queryChunks?: Array<unknown> }).queryChunks ?? [];
  return chunks
    .map((c) => {
      const chunk = c as { value?: unknown; queryChunks?: Array<unknown> };
      if (Array.isArray(chunk.value)) return chunk.value.join("");
      if (chunk.queryChunks) return queryText(chunk);
      return String(chunk.value ?? "");
    })
    .join("");
}

describe("RCL受控执行器（RCL-FR-021）", () => {
  it("audit：返回真实计数与目标指纹（非打印说明）", async () => {
    const db = fakeDb();
    db.execute.mockImplementation((async (q: unknown) => {
      const t = queryText(q);
      if (t.includes("string_agg")) return { rows: [{ h: "fingerprint-abc" }] };
      if (t.includes("FROM " + '"cases"')) return { rows: [{ n: 2 }] };
      if (t.includes("showcase_cases")) return { rows: [{ n: 1 }] };
      if (t.includes('FROM "tests"')) return { rows: [{ n: 1 }] };
      if (t.includes("case_archive_batches")) return { rows: [] };
      return { rows: [] };
    }) as never);

    const result = await auditRcl(db as never);
    expect(result.counts).toMatchObject({ cases: 2, showcase: 1, tests: 1 });
    expect(typeof result.targetFingerprint).toBe("string");
    expect(result.targetFingerprint.length).toBeGreaterThan(8);
  });

  it("prepare-archive：生成必备文件且sha256sums.txt最后生成、不自包含", async () => {
    const storage = fakeStorage();
    const db = fakeDb();
    const dump = vi.fn(async (table?: string) =>
      Buffer.from(table ? `DUMP-${table}` : "FULLDUMP"),
    );
    const result = await prepareRclArchive({
      db: db as never,
      storageDir: "/archive",
      storage,
      pgDump: dump,
      selectionReport: computeSelectionReport([
        { uid: "RPC-310000-SH-1-V1", jurisdictionCode: "310000", qualityStatus: "selected", input: { a: 1 }, expected: { b: 2 }, assertions: [{ path: "calc.x", operator: "eq", value: 1 }], coverageObligations: ["c"], evidence: [{ documentId: "D", locator: "l" }], multiLabels: ["male", "before_1970", "employed"] },
      ]),
      manifest: {
        manifestHash: "manifest-hash-1",
        oldTargets: { cases: [], showcase: [], tests: [] },
      } as never,
      createdBy: "test",
    });

    expect(result.files).toContain("sha256sums.txt");
    const sums = String(storage.write.mock.calls.find((c) => String(c[0]).endsWith("sha256sums.txt"))?.[1] ?? "");
    // 不自包含：清单中不得出现 sha256sums.txt 自身。
    expect(sums).not.toContain("sha256sums.txt");
    // 其余文件都出现在清单中。
    for (const f of ["policyops-fc.dump", "cases.dump", "selection-report.json", "manifest.json", "restore-report.json"]) {
      expect(sums).toContain(f);
    }
    // 第四轮复审：正常路径在批次事务提交后重新dump完整库（自包含归档记录本身），
    // 共5次dump（full, cases, showcase, tests, full），最终policyops-fc.dump为第二次完整dump。
    expect(dump.mock.calls.map((c) => c[0])).toEqual([undefined, "cases", "showcase_cases", "tests", undefined]);
    const writtenDump = storage.write.mock.calls.find((c) => String(c[0]).endsWith("policyops-fc.dump"))?.[1];
    expect(writtenDump).toBeInstanceOf(Buffer);
    expect((writtenDump as Buffer).toString("utf8")).toBe("FULLDUMP");
  });

  it("verify-archive：文件SHA不符或restore报告pending → 失败并返回mismatches", async () => {
    const good = createHash("sha256").update("DUMPDATA").digest("hex");
    const sha = (s: string) => createHash("sha256").update(s).digest("hex");
    // 自洽manifest（正文重算hash=声明hash）+ 真实明细restore报告 + 合法selection。
    const manifestBody = JSON.stringify({
      algorithmVersion: "RCL-MANIFEST-1.0",
      generatorVersion: "RCL-GEN-1.0",
      snapshot: null,
      caseCount: 0,
      showcaseCount: 0,
      newTestCount: 0,
      exampleTestCount: 42,
      newCases: [],
      newShowcase: [],
      newTests: [],
      exampleTests: [],
      exampleSync: { retained: [], updated: [], added: [], deleted: [] },
      oldTargets: { cases: [], showcase: [], tests: [] },
      counts: { cases: 0, showcase: 0, tests: 42 },
      manifestHash: "",
      createdAt: "2026-09-09T00:00:00.000Z",
    });
    const body = JSON.parse(manifestBody) as { manifestHash: string };
    const { recomputeManifestHash } = await import("../manifest");
    body.manifestHash = recomputeManifestHash(body as never);
    const manifestJson = JSON.stringify(body);
    const restoreBase = {
      status: "verified",
      sourceDump: { fileName: "policyops-fc.dump", sha256: good },
      environment: { postgresVersion: "17.2", pgvectorVersion: "0.8.0", restoredDatabaseUrl: "postgresql://x", restoredAt: "2026-09-09T00:00:00.000Z" },
      reconcile: {
        tableCount: 1,
        sequenceCount: 1,
        tables: [{ schema: "public", table: "cases", rows: 1, hash: "a".repeat(64) }],
        sequences: [{ schema: "public", name: "cases_id_seq", lastValue: 1, isCalled: true }],
        mismatches: [],
      },
    };
    const selectionJson = JSON.stringify({ status: "verified", violations: [], sourceCounts: { "310000": 18, "440000": 18 }, curatedUids: [], quotaStats: {} });
    const restoreReport = {
      ...restoreBase,
      // restore-report.json自身不进入archiveFileHashes（自引用循环，
      // 其真实性由最后生成的sha256sums.txt兜底）。
      archiveFileHashes: {
        "policyops-fc.dump": good,
        "cases.dump": sha("CASES"),
        "showcase_cases.dump": sha("SHOW"),
        "tests.dump": sha("TESTS"),
        "selection-report.json": sha(selectionJson),
        "manifest.json": sha(manifestJson),
      },
    };
    const restoreJson = JSON.stringify(restoreReport);
    const storage = fakeStorage({
      "/archive/policyops-fc.dump": "DUMPDATA",
      "/archive/cases.dump": "CASES",
      "/archive/showcase_cases.dump": "SHOW",
      "/archive/tests.dump": "TESTS",
      "/archive/selection-report.json": selectionJson,
      "/archive/manifest.json": manifestJson,
      "/archive/restore-report.json": restoreJson,
      "/archive/sha256sums.txt": [
        `${good}  policyops-fc.dump`,
        `${sha("CASES")}  cases.dump`,
        `${sha("SHOW")}  showcase_cases.dump`,
        `${sha("TESTS")}  tests.dump`,
        `${sha(selectionJson)}  selection-report.json`,
        `${sha(manifestJson)}  manifest.json`,
        `${sha(restoreJson)}  restore-report.json`,
        "",
      ].join("\n"),
    });
    const db = fakeDb();
    db.execute.mockImplementation((async (q: unknown) => {
      const t = queryText(q);
      if (t.includes("case_archive_batches")) {
        return { rows: [{ id: "b-1", status: "prepared", storagePath: "/archive", manifestHash: body.manifestHash }] };
      }
      return { rows: [] };
    }) as never);
    const ok = await verifyRclArchive({
      db: db as never,
      storageDir: "/archive",
      storage,
      batchId: "b-1",
    });
    expect(ok.mismatches).toEqual([]);
    expect(ok.ok).toBe(true);

    // 篡改文件内容后SHA不符 → 失败。
    const tampered = fakeStorage({
      "/archive/policyops-fc.dump": "DUMPDATA-TAMPERED",
      "/archive/cases.dump": "CASES",
      "/archive/showcase_cases.dump": "SHOW",
      "/archive/tests.dump": "TESTS",
      "/archive/selection-report.json": JSON.stringify({ status: "verified" }),
      "/archive/manifest.json": JSON.stringify({ manifestHash: "x" }),
      "/archive/restore-report.json": JSON.stringify({ status: "verified" }),
      "/archive/sha256sums.txt": `${good}  policyops-fc.dump\n`,
    });
    const bad = await verifyRclArchive({ db: fakeDb() as never, storageDir: "/archive", storage: tampered, batchId: "b-1" });
    expect(bad.ok).toBe(false);
    expect(bad.mismatches.some((m) => m.includes("policyops-fc.dump"))).toBe(true);

    // restore报告pending → 拒绝。
    const pending = fakeStorage({
      "/archive/policyops-fc.dump": "DUMPDATA",
      "/archive/cases.dump": "CASES",
      "/archive/showcase_cases.dump": "SHOW",
      "/archive/tests.dump": "TESTS",
      "/archive/selection-report.json": JSON.stringify({ status: "verified" }),
      "/archive/manifest.json": JSON.stringify({ manifestHash: "x" }),
      "/archive/restore-report.json": JSON.stringify({ status: "pending" }),
      "/archive/sha256sums.txt": `${good}  policyops-fc.dump\n`,
    });
    const pend = await verifyRclArchive({ db: fakeDb() as never, storageDir: "/archive", storage: pending, batchId: "b-1" });
    expect(pend.ok).toBe(false);
    expect(pend.mismatches.some((m) => m.includes("restore"))).toBe(true);
  });

  it("generate：真实生成36条场景（沪18/粤18）并回填断言值", async () => {
    const db = fakeDb();
    const computeExpected = vi.fn(async (t: { assertionSpecs: Array<{ path: string }> }) => ({
      snapshotId: "snap-1",
      snapshotContentHash: "hash-1",
      values: t.assertionSpecs.map((s) => ({ path: s.path, value: 42 })),
    }));
    const result = await generateRclScenarios({
      db: db as never,
      computeExpected,
    });
    expect(result.coverageManifest.manifestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.scenarios).toHaveLength(36);
    expect(result.scenarios.filter((s) => s.jurisdictionCode === "310000")).toHaveLength(18);
    expect(result.scenarios.filter((s) => s.jurisdictionCode === "440000")).toHaveLength(18);
    // 断言值已回填（快照规划器计算，非null占位）。
    expect(result.scenarios.every((s) => s.assertions.every((a) => a.value === 42))).toBe(true);
    expect(result.coverageManifest.caseCount).toBe(36);
  });

  it("plan-replacement：构建完整manifest并输出可验证manifestHash", async () => {
    const db = fakeDb();
    const scenarios = Array.from({ length: 36 }, (_, i) => {
      const code = i < 18 ? "310000" : "440000";
      const gender = i % 2 === 0 ? "male" : "female";
      return {
        scenarioKey: `S-${i}`,
        caseUid: `RPC-${code}-S-${i}-V1`,
        testUid: `RPCT-${code}-S-${i}-V1`,
        jurisdictionCode: code as "310000" | "440000",
        asOfDate: "2026-09-01",
        capability: "retirement",
        input: { basic: { gender, birth_year: 1965 } },
        assertions: [{ path: "calc.retirement.legal_retire_age_years", operator: "eq", value: 60 }],
        coverageObligations: ["capability:retirement"],
        evidence: [{ documentId: "DOC", locator: "正文" }],
        snapshotId: "snap-1",
        snapshotContentHash: "hash-1",
        generatorVersion: "RCL-GEN-1.0",
        showcaseEligible: true,
      };
    });
    const result = await planRclReplacement({
      db: db as never,
      scenarios: scenarios as never,
      snapshotMap: { "310000": { id: "snap-1", hash: "hash-1" }, "440000": { id: "snap-2", hash: "hash-2" } },
    });
    expect(result.manifest.manifestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.manifestHash).toBe(result.manifest.manifestHash);
  });

  it("apply：调用受控替换并返回真实计数", async () => {
    const execute = vi.fn(async () => ({
      deletedCases: 2, deletedShowcases: 1, deletedTests: 1,
      insertedCases: 36, insertedShowcases: 36, insertedTests: 36,
      noop: false,
    }));
    const result = await applyRclReplacement({
      db: fakeDb() as never,
      manifest: { manifestHash: "abc" } as never,
      batchId: "b-1",
      actor: "admin",
      authorized: true,
      executeApply: execute as never,
    });
    expect(execute).toHaveBeenCalled();
    expect(result.insertedCases).toBe(36);
  });

  it("apply：缺少授权参数 → RclExecutorError", async () => {
    await expect(
      applyRclReplacement({
        db: fakeDb() as never,
        manifest: { manifestHash: "abc" } as never,
        batchId: "b-1",
        actor: "admin",
        authorized: false,
      }),
    ).rejects.toBeInstanceOf(RclExecutorError);
  });

  it("verify：核对N/36/N+42与配额（沪粤18/18、男女9/9、年龄段6/6/6、就业态6/6/6）", async () => {
    const db = fakeDb();
    db.execute.mockImplementation((async (q: unknown) => {
      const t = queryText(q);
      if (t.includes("input IS NULL")) return { rows: [{ n: 0 }] };
      if (t.includes('FROM "cases"')) return { rows: [{ n: 36 }] };
      if (t.includes('FROM "tests"')) return { rows: [{ n: 78 }] };
      if (t.includes("GROUP BY") && t.includes("jurisdiction_code")) {
        return { rows: [{ jurisdiction_code: "310000", n: 18 }, { jurisdiction_code: "440000", n: 18 }] };
      }
      if (t.includes("multi_labels")) {
        // 36行showcase标签，配额满足：男女18/18、三年龄带各12、三就业态各12。
        const rows = Array.from({ length: 36 }, (_, i) => {
          const gender = i < 18 ? "male" : "female";
          const band = ["before_1970", "1970_1979", "from_1980"][Math.floor((i % 18) / 6)];
          const emp = ["employed", "flexible", "unemployed"][i % 3];
          return { multi_labels: [gender, band, emp] };
        });
        return { rows };
      }
      if (t.includes("input_data")) return { rows: [{ n: 0 }] };
      if (t.includes("showcase_cases")) return { rows: [{ n: 36 }] };
      return { rows: [] };
    }) as never);
    const result = await verifyRclReplacement({
      db: db as never,
      counts: { cases: 36, showcase: 36, tests: 78 },
      showcaseByRegion: { "310000": 18, "440000": 18 },
      quota: { gender: { male: 18, female: 18 }, band: { before_1970: 12, "1970_1979": 12, from_1980: 12 }, employment: { employed: 12, flexible: 12, unemployed: 12 } },
      manifest: null as never,
    });
    expect(result.ok).toBe(true);
    expect(result.counts).toEqual({ cases: 36, showcase: 36, tests: 78 });
  });
});

// ─── RCL第三轮复审Red：旧regression test完整hash / 恢复报告 / selection / per-row hash ───

describe("RCL第三轮复审：plan-replacement读取完整旧test行并写非空hash（RCL-FR-002）", () => {
  it("旧regression test的contentHash为64位非空SHA-256（当前实现写空串→Red）", async () => {
    const db = fakeDb();
    const ts = new Date(1700000000000);
    const scenarios = Array.from({ length: 36 }, (_, i) => {
      const code = i < 18 ? "310000" : "440000";
      return {
        scenarioKey: `S-${i}`,
        caseUid: `RPC-${code}-S-${i}-V1`,
        testUid: `RPCT-${code}-S-${i}-V1`,
        jurisdictionCode: code,
        asOfDate: "2026-09-01",
        capability: "retirement",
        input: { basic: { gender: i % 2 === 0 ? "male" : "female", birth_year: 1965 } },
        assertions: [{ path: "calc.retirement.legal_retire_age_years", operator: "eq", value: 60 }],
        coverageObligations: ["capability:retirement"],
        evidence: [{ documentId: "DOC", locator: "正文" }],
        snapshotId: "snap-1",
        snapshotContentHash: "hash-1",
        generatorVersion: "RCL-GEN-1.0",
        showcaseEligible: true,
      };
    });
    db.execute.mockImplementation((async (q: unknown) => {
      const t = queryText(q);
      if (t.includes('FROM "cases"')) {
        return { rows: [{ id: 1, case_uid: "old-case-1", content_hash: null, quality_status: "active", created_at: ts }] };
      }
      if (t.includes('FROM "showcase_cases"')) {
        return { rows: [{ id: 2, case_uid: "old-show-1", quality_status: "selected", created_at: ts }] };
      }
      if (t.includes('FROM "tests"') && t.includes("regression")) {
        // 完整旧regression test行（旧实现只SELECT id, source_case_uid → hash为空）。
        return {
          rows: [{
            id: 700,
            name: "R-100: 旧回归",
            jurisdiction_code: "310000",
            rule_id: "R-100",
            input: { user: { basic: { gender: "male" } } },
            params_override: null,
            expected: { calc: {} },
            source: "regression",
            source_case_uid: "old-case-1",
            last_run_result: null,
            last_run_at: null,
            created_at: ts,
            updated_at: ts,
          }],
        };
      }
      if (t.includes("source = 'example'")) {
        return { rows: [] };
      }
      return { rows: [] };
    }) as never);

    const result = await planRclReplacement({
      db: db as never,
      scenarios: scenarios as never,
      snapshotMap: { "310000": { id: "snap-1", hash: "hash-1" }, "440000": { id: "snap-2", hash: "hash-2" } },
    });
    expect(result.manifest.oldTargets.tests).toHaveLength(1);
    expect(result.manifest.oldTargets.tests[0].contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.manifest.oldTargets.tests[0].contentHash).not.toBe("");
  });
});

describe("RCL第三轮复审：verify-archive必须拒绝空明细verified恢复报告（RCL-FR-004/AC-004）", () => {
  const hex = (s: string) => createHash("sha256").update(s).digest("hex");

  function goodFiles(): Record<string, string> {
    const files: Record<string, string> = {
      "/a/policyops-fc.dump": "FULL-DUMP",
      "/a/cases.dump": "CASES",
      "/a/showcase_cases.dump": "SHOW",
      "/a/tests.dump": "TESTS",
      "/a/selection-report.json": JSON.stringify({ status: "verified", violations: [], sourceCounts: { "310000": 18, "440000": 18 }, curatedUids: Array.from({ length: 36 }, (_, i) => `RPC-${i < 18 ? "310000" : "440000"}-S-${i}-V1`) }),
      "/a/manifest.json": JSON.stringify({
        manifestHash: "m",
        algorithmVersion: "RCL-MANIFEST-1.0",
        generatorVersion: "RCL-GEN-1.0",
        snapshot: null,
        caseCount: 36,
        showcaseCount: 36,
        newTestCount: 36,
        exampleTestCount: 42,
        newCases: [],
        newShowcase: Array.from({ length: 36 }, (_, i) => ({
          rowId: 0, uid: `RPC-${i < 18 ? "310000" : "440000"}-S-${i}-V1`, contentHash: "c".repeat(64),
          jurisdictionCode: i < 18 ? "310000" : "440000", scenarioKey: `S-${i}`, asOfDate: "2026-09-01",
          input: { basic: { gender: i % 2 === 0 ? "male" : "female" } }, expected: { calc: {} },
          assertions: [{ path: "calc.x", operator: "eq", value: 1 }],
          coverageObligations: ["capability:retirement"], evidence: [{ documentId: "DOC", locator: "正文" }],
          sourceCaseUid: `RPC-${i < 18 ? "310000" : "440000"}-S-${i}-V1`, qualityScore: 80, qualityBreakdown: { total: 80 },
          multiLabels: [i % 2 === 0 ? "male" : "female", ["before_1970", "1970_1979", "from_1980"][Math.floor((i % 18) / 6)], ["employed", "flexible", "unemployed"][i % 3]],
          snapshotId: "s", snapshotHash: "h",
        })),
        newTests: [], exampleTests: [],
        exampleSync: { retained: [], updated: [], added: [], deleted: [] },
        oldTargets: { cases: [], showcase: [], tests: [] },
        counts: { cases: 36, showcase: 36, tests: 78 },
        createdAt: "2026-09-09T00:00:00.000Z",
      }),
      "/a/restore-report.json": JSON.stringify({ status: "verified" }),
    };
    const entries = Object.entries(files)
      .filter(([name]) => !name.endsWith("sha256sums.txt"))
      .map(([name, content]) => `${hex(content)}  ${name.split("/").pop()}`);
    files["/a/sha256sums.txt"] = entries.join("\n") + "\n";
    return files;
  }

  it("仅{\"status\":\"verified\"}且表/sequence明细为空的恢复报告 → verify-archive失败（当前只查status→Red）", async () => {
    const storage = fakeStorage(goodFiles());
    const db = fakeDb();
    db.update.mockImplementation(() => ({ where: vi.fn(async () => [{ id: "b-1" }]) }) as never);
    const result = await verifyRclArchive({ db: db as never, storageDir: "/a", storage, batchId: "b-1" });
    expect(result.ok).toBe(false);
    expect(result.mismatches.length).toBeGreaterThan(0);
  });
});

describe("RCL第三轮复审：selection-report与per-row hash（verify）", () => {
  it("computeSelectionReport从showcase真实计算（CLI不得硬编码violations=[]）", async () => {
    const { computeSelectionReport } = await import("../archive");
    const rows = Array.from({ length: 36 }, (_, i) => ({
      uid: `RPC-${i < 18 ? "310000" : "440000"}-S-${i}-V1`,
      jurisdictionCode: i < 18 ? "310000" : "440000",
      qualityStatus: "selected",
      input: { basic: { gender: i % 2 === 0 ? "male" : "female" } },
      expected: { calc: {} },
      assertions: [{ path: "calc.x", operator: "eq", value: 1 }],
      coverageObligations: ["capability:retirement"],
      evidence: [{ documentId: "DOC", locator: "正文" }],
      multiLabels: [i % 2 === 0 ? "male" : "female", ["before_1970", "1970_1979", "from_1980"][Math.floor((i % 18) / 6)], ["employed", "flexible", "unemployed"][i % 3]],
    }));
    const report = computeSelectionReport(rows as never);
    expect(report.status).toBe("verified");
    expect(report.sourceCounts).toEqual({ "310000": 18, "440000": 18 });
    expect(report.quotaStats["310000_male"]).toBe(9);
    expect(report.quotaStats["440000_unemployed"]).toBe(6);
  });
});

// ─── RCL第四轮复审Red：prepare-archive补偿（WI-20260907-03）────────────────
// 任何prepare阶段失败均不得留下prepared批次或archive entries；只精确清理本次
// 新建batchId；文件失败时清理本次不完整临时归档；补偿失败必须同时报告原始错误
// 与补偿错误（不得伪装成功）。

describe("RCL第四轮复审：prepare-archive补偿（RCL-FR-002/003/005）", () => {
  const verifiedSelection = buildSelectionReport({
    algorithmVersion: "RCL-GEN-1.0",
    curatedUids: [],
    sourceCounts: {},
    quotaStats: {},
    violations: [],
  });
  const emptyManifest = {
    manifestHash: "mh",
    oldTargets: { cases: [], showcase: [], tests: [] },
  } as never;

  it("第二次完整dump失败：批次事务已提交→补偿删除本次批次/entries，历史批次不受影响（当前不清理→Red）", async () => {
    const { RclPrepareError } = await import("../executor");
    const storage = fakeStorage();
    const db = memoryDb({
      preExistingBatches: [{ id: "11111111-1111-4111-8111-111111111111", status: "applied" }],
    });
    const dump = vi.fn(async (table?: string) => {
      if (table === undefined && dump.mock.calls.filter((c) => c[0] === undefined).length === 2) {
        throw new Error("第二次完整dump失败（注入）");
      }
      return Buffer.from(table ? `DUMP-${table}` : "FULLDUMP");
    });

    const err = await prepareRclArchive({
      db: db as never,
      storageDir: "/archive",
      storage,
      pgDump: dump,
      selectionReport: verifiedSelection,
      manifest: emptyManifest,
      createdBy: "test",
    }).then(
      () => null,
      (e: unknown) => e as InstanceType<typeof RclPrepareError>,
    );
    expect(err).toBeInstanceOf(RclPrepareError);
    expect(err!.originalError.message).toContain("第二次完整dump失败");
    // 原始错误必须报告；补偿成功时compensationErrors为空（未伪装成功、未吞错）。
    expect(err!.compensationErrors).toEqual([]);
    // 不留prepared批次/entries；历史批次保留。
    expect(db.batches.size).toBe(1);
    expect(db.batches.has("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(db.entries.length).toBe(0);
    // 本次写入的归档文件被清理（本次不完整临时归档）。
    expect(storage.remove.mock.calls.length).toBeGreaterThan(0);
  });

  it("第二次dump写文件失败：无批次/entries落库，清理已写入的临时归档（当前写文件失败留残留→Red）", async () => {
    const { RclPrepareError } = await import("../executor");
    const storage = fakeStorage();
    storage.write.mockImplementation(((p: string) => {
      if (String(p).endsWith("cases.dump")) throw new Error("写文件失败（注入）：cases.dump");
      // 其余写入正常（记录内容以便remove断言）。
    }) as never);
    const db = memoryDb();
    const dump = vi.fn(async (table?: string) => Buffer.from(table ? `DUMP-${table}` : "FULLDUMP"));

    const err = await prepareRclArchive({
      db: db as never,
      storageDir: "/archive",
      storage,
      pgDump: dump,
      selectionReport: verifiedSelection,
      manifest: emptyManifest,
      createdBy: "test",
    }).then(
      () => null,
      (e: unknown) => e as InstanceType<typeof RclPrepareError>,
    );
    expect(err).toBeInstanceOf(RclPrepareError);
    expect(err!.originalError.message).toContain("写文件失败");
    // 批次事务从未提交：无批次/entries。
    expect(db.batches.size).toBe(0);
    expect(db.entries.length).toBe(0);
    // 已写入的policyops-fc.dump被补偿清理（本次不完整临时归档）。
    expect(storage.remove).toHaveBeenCalledWith(expect.stringContaining("policyops-fc.dump"));
  });

  it("最终SHA生成失败：批次已提交→补偿删除批次/entries并清理全部本次文件（当前残留prepared→Red）", async () => {
    const { RclPrepareError } = await import("../executor");
    const storage = fakeStorage();
    storage.read.mockImplementation(((p: string) => {
      if (String(p).endsWith("cases.dump")) throw new Error("读文件失败（注入）：cases.dump");
      return Buffer.from("x", "utf8");
    }) as never);
    const db = memoryDb();
    const dump = vi.fn(async (table?: string) => Buffer.from(table ? `DUMP-${table}` : "FULLDUMP"));

    const err = await prepareRclArchive({
      db: db as never,
      storageDir: "/archive",
      storage,
      pgDump: dump,
      selectionReport: verifiedSelection,
      manifest: emptyManifest,
      createdBy: "test",
    }).then(
      () => null,
      (e: unknown) => e as InstanceType<typeof RclPrepareError>,
    );
    expect(err).toBeInstanceOf(RclPrepareError);
    expect(err!.originalError.message).toContain("读文件失败");
    expect(err!.compensationErrors).toEqual([]);
    expect(db.batches.size).toBe(0);
    expect(db.entries.length).toBe(0);
  });

  it("补偿失败：错误同时报告原始错误与补偿错误，不得伪装成功（当前无补偿→Red）", async () => {
    const { RclPrepareError } = await import("../executor");
    const storage = fakeStorage();
    const db = memoryDb({ failDelete: true });
    const dump = vi.fn(async (table?: string) => {
      if (table === undefined && dump.mock.calls.filter((c) => c[0] === undefined).length === 2) {
        throw new Error("第二次完整dump失败（注入）");
      }
      return Buffer.from(table ? `DUMP-${table}` : "FULLDUMP");
    });

    const err = await prepareRclArchive({
      db: db as never,
      storageDir: "/archive",
      storage,
      pgDump: dump,
      selectionReport: verifiedSelection,
      manifest: emptyManifest,
      createdBy: "test",
    }).then(
      () => null,
      (e: unknown) => e as InstanceType<typeof RclPrepareError>,
    );
    expect(err).toBeInstanceOf(RclPrepareError);
    // 原始错误与补偿错误都必须可见。
    expect(err!.originalError.message).toContain("第二次完整dump失败");
    expect(err!.compensationErrors.length).toBeGreaterThan(0);
    expect(err!.compensationErrors.some((m) => m.includes("补偿失败"))).toBe(true);
    expect(err!.message).toContain("第二次完整dump失败");
    expect(err!.message).toContain("补偿亦失败");
  });
});

// ─── RCL第五轮复审Red：prepare-archive归档目录保护（WI-20260907-03）─────────
// 目标目录已包含任一归档必备文件时必须拒绝开始（禁止覆盖历史归档）；补偿逻辑
// 只能删除本次新建的文件（历史无关文件必须保留）。

describe("RCL第五轮复审：prepare-archive归档目录保护（RCL-FR-002/003）", () => {
  const verifiedSelection = buildSelectionReport({
    algorithmVersion: "RCL-GEN-1.0",
    curatedUids: [],
    sourceCounts: {},
    quotaStats: {},
    violations: [],
  });
  const emptyManifest = {
    manifestHash: "mh",
    oldTargets: { cases: [], showcase: [], tests: [] },
  } as never;

  it("目标目录已包含任一历史归档专属文件（policyops-fc.dump）→ 拒绝开始，零写入零批次（禁止覆盖历史归档→Red）", async () => {
    const { RclExecutorError } = await import("../executor");
    const storage = fakeStorage({ "/archive/policyops-fc.dump": "历史归档dump" });
    const db = memoryDb({
      preExistingBatches: [{ id: "22222222-2222-4222-8222-222222222222", status: "applied" }],
    });
    const dump = vi.fn(async (table?: string) => Buffer.from(table ? `DUMP-${table}` : "FULLDUMP"));

    await expect(
      prepareRclArchive({
        db: db as never,
        storageDir: "/archive",
        storage,
        pgDump: dump,
        selectionReport: verifiedSelection,
        manifest: emptyManifest,
        createdBy: "test",
      }),
    ).rejects.toBeInstanceOf(RclExecutorError);
    // 拒绝发生在任何写入之前：无dump、无文件写入、无批次/entries、历史批次保留。
    expect(dump).not.toHaveBeenCalled();
    expect(storage.write).not.toHaveBeenCalled();
    expect(db.batches.size).toBe(1);
    expect(db.batches.has("22222222-2222-4222-8222-222222222222")).toBe(true);
    expect(db.entries.length).toBe(0);
    // 历史归档文件原样保留。
    expect(storage.read("/archive/policyops-fc.dump").toString("utf8")).toContain("历史归档dump");
  });

  it("目标目录已包含sha256sums.txt → 同样拒绝开始（必备文件清单含sha清单自身）", async () => {
    const { RclExecutorError } = await import("../executor");
    const storage = fakeStorage({ "/archive/sha256sums.txt": "old-sums" });
    const db = memoryDb();
    const dump = vi.fn(async () => Buffer.from("DUMP"));

    await expect(
      prepareRclArchive({
        db: db as never,
        storageDir: "/archive",
        storage,
        pgDump: dump,
        selectionReport: verifiedSelection,
        manifest: emptyManifest,
        createdBy: "test",
      }),
    ).rejects.toBeInstanceOf(RclExecutorError);
    expect(dump).not.toHaveBeenCalled();
    expect(db.batches.size).toBe(0);
    expect(db.entries.length).toBe(0);
    expect(storage.read("/archive/sha256sums.txt").toString("utf8")).toBe("old-sums");
  });

  it("工作目录仅有manifest.json（plan-replacement产物）→ 允许开始，不拒绝（当前流程先plan后prepare共用目录）", async () => {
    const storage = fakeStorage({ "/archive/manifest.json": "{\"manifestHash\":\"plan产物\"}" });
    const db = memoryDb();
    const dump = vi.fn(async (table?: string) => Buffer.from(table ? `DUMP-${table}` : "FULLDUMP"));

    const result = await prepareRclArchive({
      db: db as never,
      storageDir: "/archive",
      storage,
      pgDump: dump,
      selectionReport: verifiedSelection,
      manifest: emptyManifest,
      createdBy: "test",
    });
    expect(result.batchId).toBeTruthy();
    expect(dump.mock.calls.length).toBe(5);
    expect(db.batches.size).toBe(1);
  });

  it("补偿只删除本次新建文件：历史无关文件保留，本次不完整归档被清理（当前补偿可能误删→Red）", async () => {
    const { RclPrepareError } = await import("../executor");
    // 目录中有一个历史无关文件（非归档必备文件，prepare允许开始），
    // 第二次完整dump失败后：本次新建文件被清理，历史文件必须原样保留。
    const storage = fakeStorage({ "/archive/notes.txt": "历史备注（非归档必备文件）" });
    const db = memoryDb();
    const dump = vi.fn(async (table?: string) => {
      if (table === undefined && dump.mock.calls.filter((c) => c[0] === undefined).length === 2) {
        throw new Error("第二次完整dump失败（注入）");
      }
      return Buffer.from(table ? `DUMP-${table}` : "FULLDUMP");
    });

    const err = await prepareRclArchive({
      db: db as never,
      storageDir: "/archive",
      storage,
      pgDump: dump,
      selectionReport: verifiedSelection,
      manifest: emptyManifest,
      createdBy: "test",
    }).then(
      () => null,
      (e: unknown) => e as InstanceType<typeof RclPrepareError>,
    );
    expect(err).toBeInstanceOf(RclPrepareError);
    expect(db.batches.size).toBe(0);
    expect(db.entries.length).toBe(0);
    // 本次新建的归档文件被清理。
    expect(storage.remove.mock.calls.length).toBeGreaterThan(0);
    for (const [p] of storage.remove.mock.calls as Array<[string]>) {
      expect(String(p)).not.toContain("notes.txt");
    }
    // 历史无关文件保留且内容不变。
    expect(storage.exists("/archive/notes.txt")).toBe(true);
    expect(storage.read("/archive/notes.txt").toString("utf8")).toBe("历史备注（非归档必备文件）");
  });
});
