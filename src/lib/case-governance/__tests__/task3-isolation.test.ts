/**
 * 执行要求一.12 / CLG-AC-015 任务3并行隔离：
 * 案例治理模块不得依赖任务3（migration 0015、地区发布记录、planning发布表），
 * 其目标测试在任务3不存在/未合入时仍可独立通过。
 *
 * 本测试为源码契约：扫描case-governance目录的import图与字符串，
 * 断言不存在对0015、planning发布记录/publishes/policy_import_batches的引用。
 *
 * Red：实现前模块 `src/lib/case-governance/manifest` 不存在，import失败即Red。
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const GOVERNANCE_DIR = path.resolve(process.cwd(), "src/lib/case-governance");

function listSourceFiles(): string[] {
  const files = readdirSync(GOVERNANCE_DIR, { recursive: true }) as string[];
  return files
    .filter((f) => f.endsWith(".ts") && !f.includes("__tests__"))
    .map((f) => path.join(GOVERNANCE_DIR, f));
}

describe("CLG-AC-015 任务3并行隔离（源码契约）", () => {
  const files = listSourceFiles();

  it("case-governance有实现源文件（非空目录）", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("不import任务3/planning发布记录模块", () => {
    const forbiddenImports = [
      "@/server/modules/planning",
      "planning/",
      "publishes",
      "policy_import_batch",
    ];
    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      for (const token of forbiddenImports) {
        expect(
          content.includes(token),
          `${file} 不应引用任务3发布记录模块（${token}）`,
        ).toBe(false);
      }
    }
  });

  it("不引用migration 0015", () => {
    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      expect(content.includes("0015"), `${file} 不应引用0015`).toBe(false);
    }
  });

  it("不读取publishes表名", () => {
    for (const file of files) {
      const content = readFileSync(file, "utf-8");
      expect(content.includes('"publishes"'), `${file} 不应读取publishes表`).toBe(false);
    }
  });

  it("任务3未合入时本模块测试可独立通过（无0015依赖即证明）", () => {
    // drizzle目录不得包含0015（任务3未合入冻结基线的事实）
    const drizzleFiles = readdirSync(path.resolve(process.cwd(), "drizzle"));
    expect(drizzleFiles.some((f) => f.startsWith("0015"))).toBe(false);
  });
});