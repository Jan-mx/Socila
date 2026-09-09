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

function fakeDb(overrides: Record<string, unknown> = {}) {
  const chain = {
    values: vi.fn(() => ({ returning: vi.fn(async () => []) })),
    set: vi.fn(() => ({ where: vi.fn(async () => []) })),
    where: vi.fn(async () => []),
  };
  return {
    execute: vi.fn(async () => ({ rows: [] })),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    ...overrides,
  };
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
  };
}

/** drizzle SQL 对象文本提取（queryChunks → 编译文本，测试mock匹配用）。 */
function queryText(q: unknown): string {
  const chunks = (q as { queryChunks?: Array<{ value: string | string[] }> }).queryChunks ?? [];
  return chunks
    .map((c) => (Array.isArray(c.value) ? c.value.join("") : String(c.value)))
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
    const result = await prepareRclArchive({
      db: db as never,
      storageDir: "/archive",
      storage,
      pgDump: async (table?: string) =>
        Buffer.from(table ? `DUMP-${table}` : "FULLDUMP"),
      selection: {
        curatedUids: ["RPC-310000-SH-1-V1"],
        sourceCounts: { "310000": 18, "440000": 18 },
        quotaStats: { gender_male: 18, gender_female: 18 },
        violations: [],
      },
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
  });

  it("verify-archive：文件SHA不符或restore报告pending → 失败并返回mismatches", async () => {
    const good = createHash("sha256").update("DUMPDATA").digest("hex");
    const storage = fakeStorage({
      "/archive/policyops-fc.dump": "DUMPDATA",
      "/archive/cases.dump": "CASES",
      "/archive/showcase_cases.dump": "SHOW",
      "/archive/tests.dump": "TESTS",
      "/archive/selection-report.json": JSON.stringify({ status: "verified" }),
      "/archive/manifest.json": JSON.stringify({ manifestHash: "x" }),
      "/archive/restore-report.json": JSON.stringify({ status: "verified" }),
      "/archive/sha256sums.txt": `${good}  policyops-fc.dump\n`,
    });
    const ok = await verifyRclArchive({
      db: fakeDb() as never,
      storageDir: "/archive",
      storage,
      batchId: "b-1",
    });
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
    });
    expect(result.ok).toBe(true);
    expect(result.counts).toEqual({ cases: 36, showcase: 36, tests: 78 });
  });
});
