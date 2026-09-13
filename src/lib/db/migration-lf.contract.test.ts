/**
 * Migration SQL换行契约（WI-20260907-03第四轮复审）：
 *
 * 背景：drizzle-orm的migrator对**工作树文件字节**计算sha256并写入
 * `drizzle.__drizzle_migrations.hash`。宿主`core.autocrlf=true`（Windows默认）
 * 会把checkout写成CRLF，同一SQL在Windows/Linux产生不同账本hash——持久库
 * 账本ID 18/19/20正是0012/0013/0014的CRLF重复登记。仓库根`.gitattributes`
 * 固定 `drizzle/*.sql text eol=lf` 后：
 * - Git blob内容（0010～0018）保持不变（blob本来就是LF，见契约3）；
 * - 任何checkout（含core.autocrlf=true）写出的工作树均为LF（契约2）；
 * - Drizzle实际读取的hash恒等于Git blob的LF SHA-256（契约1/2）。
 *
 * 本测试不连库、不改文件；git为只读子进程。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../../");

function git(args: string[], cwd: string = ROOT): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
}

const sqlFiles = (): string[] =>
  readdirSync(path.join(ROOT, "drizzle"))
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();

const sha256 = (buf: Buffer): string => createHash("sha256").update(buf).digest("hex");

/**
 * Git blob原始字节（不经任何EOL转换）。
 * 单次`git cat-file --batch`批量读取全部migration blob并缓存：完整套件并行负载下
 * 每文件一次spawn（3个用例×20文件=60次git子进程）曾使工作树用例超过默认5秒
 * （2026-09-12独立审查复现5243ms）；批量一次spawn消除重复扫描耗时，断言不变。
 */
let blobCache: Map<string, Buffer> | null = null;
function blobBytes(file: string): Buffer {
  if (!blobCache) {
    const files = sqlFiles();
    const input = files.map((f) => `HEAD:drizzle/${f}\n`).join("");
    const out = execFileSync("git", ["cat-file", "--batch"], {
      cwd: ROOT,
      input,
      maxBuffer: 128 * 1024 * 1024,
    });
    blobCache = new Map();
    let off = 0;
    for (const f of files) {
      const nl = out.indexOf(0x0a, off);
      const header = out.subarray(off, nl).toString("utf8");
      if (header.endsWith(" missing")) throw new Error(`git blob missing: drizzle/${f}`);
      const size = Number(header.split(" ")[2]);
      if (!Number.isInteger(size) || size < 0) throw new Error(`cat-file --batch头部异常：${header}`);
      blobCache.set(f, Buffer.from(out.subarray(nl + 1, nl + 1 + size)));
      off = nl + 1 + size + 1; // 正文后紧跟一个换行分隔符。
    }
  }
  const cached = blobCache.get(file);
  if (!cached) throw new Error(`blob未批量加载：drizzle/${file}`);
  return cached;
}

describe("migration SQL换行契约（WI-20260907-03第四轮复审）", () => {
  it("仓库根存在.gitattributes且固定 drizzle/*.sql 为 text eol=lf", () => {
    const p = path.join(ROOT, ".gitattributes");
    expect(existsSync(p)).toBe(true);
    const text = readFileSync(p, "utf8");
    expect(text).toMatch(/drizzle\/\*\.sql\s+text\s+eol=lf/);
  });

  // 全新checkout经真实git子进程写临时目录：并行单元负载下可能超过默认5秒（2026-09-11 SHV2复现5075ms），
  // 与identity-container重载用例同策略显式30秒；断言本身仍是确定性LF/hash契约。
  it("全新checkout（显式 core.autocrlf=true）中migration SQL均为LF且hash等于Git blob", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "rcl-lf-contract-"));
    try {
      // 模拟Windows默认autocrlf=true的全新checkout（.gitattributes来自index/HEAD）。
      git(["--work-tree", tmp, "-c", "core.autocrlf=true", "checkout", "HEAD", "--", "drizzle"]);
      const files = sqlFiles();
      expect(files.length).toBeGreaterThanOrEqual(9); // 0000～0018
      for (const f of files) {
        const content = readFileSync(path.join(tmp, "drizzle", f));
        // 无CRLF（eol=lf覆盖autocrlf=true）。
        expect(content.includes(Buffer.from("\r\n")), `${f} 含CRLF`).toBe(false);
        // Drizzle读取hash == Git blob LF SHA。
        expect(sha256(content), `${f} hash != Git blob SHA`).toBe(sha256(blobBytes(f)));
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }, 30_000);

  it("当前工作树migration SQL无CRLF且Drizzle读取hash与Git blob LF SHA一致", () => {
    for (const f of sqlFiles()) {
      const content = readFileSync(path.join(ROOT, "drizzle", f));
      expect(content.includes(Buffer.from("\r\n")), `${f} 工作树含CRLF`).toBe(false);
      expect(sha256(content), `${f} 工作树hash != Git blob SHA`).toBe(sha256(blobBytes(f)));
    }
  }, 30_000);

  it("Git blob内容本身保持LF（.gitattributes未改写0010～0018 blob）", () => {
    const files = sqlFiles();
    expect(files).toEqual(
      expect.arrayContaining([
        "0010_sdl_dsl_normalization_example_cleanup.sql",
        "0011_sdl_tests_jurisdiction_backfill.sql",
        "0012_nrp_explicit_overlay_operation.sql",
        "0013_nrp_stage_e_materialization.sql",
        "0014_nrp_stage_e_constraints.sql",
        "0015_jurisdiction_planning_releases.sql",
        "0016_clg_case_governance.sql",
        "0017_jurisdiction_snapshot_schedules.sql",
        "0018_case_library_rebuild.sql",
      ]),
    );
    for (const f of files) {
      const blob = blobBytes(f);
      expect(blob.includes(Buffer.from("\r\n")), `${f} blob含CRLF`).toBe(false);
    }
  }, 30_000);
});

describe("migration journal严格单调契约（WI-20260907-03第四轮复审修复）", () => {
  const JOURNAL_PATH = path.join(ROOT, "drizzle/meta/_journal.json");
  /** 0010～0019预期when（0010～0018必须与持久账本ID 10～16、21、22的created_at一致；
   * 0019为WI-20260911-03新增审计迁移，其持久执行须另行fresh授权）。 */
  const EXPECTED_TIMES: Record<string, number> = {
    "0010": 1788560000000, "0011": 1788600000000, "0012": 1788640000000,
    "0013": 1788680000000, "0014": 1788705240000, "0015": 1788777720000,
    "0016": 1788785400000, "0017": 1788796800000, "0018": 1788796860000,
    "0019": 1788797000000,
  };

  it("journal全部entry按idx严格递增（0000～0018）", () => {
    const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8")) as {
      entries: Array<{ idx: number; when: number }>;
    };
    const ws = journal.entries.map((e) => Number(e.when));
    for (let i = 1; i < ws.length; i++) {
      expect(ws[i], `entry idx=${journal.entries[i].idx} when不严格递增`).toBeGreaterThan(ws[i - 1]);
    }
    // idx连续且从0开始。
    expect(journal.entries.map((e) => e.idx)).toEqual(Array.from({ length: journal.entries.length }, (_, i) => i));
  });

  it("0010～0018的journal when与预期时间表一致（严格单调；不修改SQL）", () => {
    const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8")) as {
      entries: Array<{ tag: string; when: number }>;
    };
    const byTag: Record<string, number> = {};
    for (const e of journal.entries) byTag[e.tag.slice(0, 4)] = Number(e.when);
    for (const [prefix, expected] of Object.entries(EXPECTED_TIMES)) {
      expect(byTag[prefix], `${prefix} when=${byTag[prefix]} ≠ 预期${expected}`).toBe(expected);
    }
  });

  it("0010～0018在持久账本（max=0018）上不重应用；journal max恰为0019", () => {
    const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8")) as {
      entries: Array<{ tag: string; when: number }>;
    };
    const byTag: Record<string, number> = {};
    for (const e of journal.entries) byTag[e.tag.slice(0, 4)] = Number(e.when);
    // 持久账本max created_at=0018的when（1788796860000）：0010～0018的when都不得高于它
    //（旧journal的0014=1788991200000即Re-apply事故）；0019=1788797000000是唯一高于账本
    // max的新迁移（WI-20260911-03审计结构），对持久policyops的执行必须另行fresh授权。
    for (const prefix of ["0010", "0011", "0012", "0013", "0014", "0015", "0016", "0017", "0018"]) {
      expect(byTag[prefix], `${prefix} 不得高于持久账本max`).toBeLessThanOrEqual(1788796860000);
    }
    expect(Math.max(...Object.values(byTag))).toBe(1788797000000);
  });
});
