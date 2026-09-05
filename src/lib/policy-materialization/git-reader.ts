/**
 * GitReader生产实现：只读取已提交内容（git show HEAD:path），
 * 并检查dsl/regions工作树是否干净（PRD §6.3：工作树来源不确定时停止）。
 * 本文件不得引入dotenv/load-environment（NRP-FR-017）。
 */
import { execFileSync } from "node:child_process";
import type { GitReader } from "./manifest";

function git(args: string[], allowFailure = false): string {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      cwd: process.cwd(),
    });
  } catch (err) {
    if (allowFailure) return "";
    throw new Error(
      `[materialize-git] git ${args.join(" ")} 失败：${(err as Error).message}`,
    );
  }
}

export const productionGitReader: GitReader = {
  showHead(path: string): string {
    // COMMIT是哨兵路径：返回HEAD提交号。
    if (path === "COMMIT") {
      return git(["rev-parse", "HEAD"]);
    }
    return git(["show", `HEAD:${path}`]);
  },
  listCommittedFiles(dir: string): string[] {
    return git(["ls-tree", "-r", "--name-only", "HEAD", dir])
      .split("\n")
      .filter((f) => f.length > 0);
  },
  isWorktreeDirty(dir: string): boolean {
    const status = git(["status", "--porcelain", "--", dir], true);
    return status.trim().length > 0;
  },
};
