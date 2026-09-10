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

/** Git blob原始字节（不经任何EOL转换）。 */
function blobBytes(file: string): Buffer {
  return execFileSync("git", ["cat-file", "blob", `HEAD:drizzle/${file}`], {
    cwd: ROOT,
    maxBuffer: 128 * 1024 * 1024,
  });
}

describe("migration SQL换行契约（WI-20260907-03第四轮复审）", () => {
  it("仓库根存在.gitattributes且固定 drizzle/*.sql 为 text eol=lf", () => {
    const p = path.join(ROOT, ".gitattributes");
    expect(existsSync(p)).toBe(true);
    const text = readFileSync(p, "utf8");
    expect(text).toMatch(/drizzle\/\*\.sql\s+text\s+eol=lf/);
  });

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
  });

  it("当前工作树migration SQL无CRLF且Drizzle读取hash与Git blob LF SHA一致", () => {
    for (const f of sqlFiles()) {
      const content = readFileSync(path.join(ROOT, "drizzle", f));
      expect(content.includes(Buffer.from("\r\n")), `${f} 工作树含CRLF`).toBe(false);
      expect(sha256(content), `${f} 工作树hash != Git blob SHA`).toBe(sha256(blobBytes(f)));
    }
  });

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
  });
});
