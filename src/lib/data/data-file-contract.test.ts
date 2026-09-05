/**
 * 数据文件重命名契约（09-05 SDL-FR-010、SDL-AC-010）。
 *
 * data/ssp-test-cases-from-transcripts.xlsx → data/shanghai-test-cases-from-transcripts.xlsx，
 * 重命名前后SHA-256必须一致（内容零变化，仅名称去历史缩写）。
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const NEW_PATH = path.join(process.cwd(), "data/shanghai-test-cases-from-transcripts.xlsx");
const OLD_PATH = path.join(process.cwd(), "data/ssp-test-cases-from-transcripts.xlsx");

/** 重命名前记录的SHA-256（2026-09-05 对 data/ssp-test-cases-from-transcripts.xlsx 计算）。 */
const EXPECTED_SHA256 = "708ad300f5c6ee759103b22a2dbe1b1fe61cfff9ba72e72bd977d226509f839a";

describe("上海测试用例数据文件（SDL-FR-010/AC-010）", () => {
  it("新文件存在且SHA-256与重命名前一致", () => {
    expect(existsSync(NEW_PATH)).toBe(true);
    const digest = createHash("sha256").update(readFileSync(NEW_PATH)).digest("hex");
    expect(digest).toBe(EXPECTED_SHA256);
  });

  it("旧文件名已不存在（不保留别名）", () => {
    expect(existsSync(OLD_PATH)).toBe(false);
  });
});
