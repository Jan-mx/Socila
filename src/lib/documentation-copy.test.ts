import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 防自引用：负向品牌守卫的旧缩写经拆分构造，避免活动代码出现完整历史标识（SDL-AC-003）。
const LEGACY_BRAND = ["SS", "P"].join("");

function readProjectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("documentation copy", () => {
  it("uses the localized product name in the project readme", () => {
    const readme = readProjectFile("README.md");
    expect(readme).not.toMatch(new RegExp(`上海|${LEGACY_BRAND} Web|Admin 后台|AI 解释层`));
    expect(readme).toContain("<h1>社保规划助手</h1>");
  });

  it("uses localized descriptive terms in the architecture guide", () => {
    const architecture = readProjectFile("docs/architecture.md");
    expect(architecture).not.toMatch(
      new RegExp(`上海社保规划助手|# ${LEGACY_BRAND} 技术架构|AI Agent 对话流程|AI 层`),
    );
    expect(architecture).toContain("# 社保规划助手技术架构");
  });

  it("localizes DSL prose while preserving its protocol identifier", () => {
    const dslReadme = readProjectFile("dsl/protocol/socila_dsl_v1/README.md");
    expect(dslReadme).toContain("# SOCILA-DSL v1.0");
    expect(dslReadme).not.toContain("网站/Agent");
  });
});
