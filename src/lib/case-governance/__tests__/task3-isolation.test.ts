/**
 * RCL-FR-016 / RCL-AC-006 快照规划器依赖契约：
 * 任务3已按 ADR-0011 串行合入并重新 Accepted，RCL 生成器的期望结果
 * 必须由修复后的快照规划器（orchestrateSnapshot）计算（PRD §4：结构化
 * 模板是输入事实源，期望只由快照规划器计算）。本测试为源码契约：
 * 生成器与重放路径必须引用任务3的快照驱动编排器，且不得直接依赖
 * 地区发布记录/账本写入表（publishes/policy_import_batches）。
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

describe("RCL-AC-015 快照规划器依赖契约（源码契约）", () => {
  const files = listSourceFiles();

  it("case-governance有实现源文件（非空目录）", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("不import任务3发布记录/账本写入模块（RCL只读快照，不触碰发布表）", () => {
    const forbiddenImports = [
      "jurisdiction-release",
      "jurisdictionPlanningReleases",
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

  it("任务3已合入：生成器依赖快照驱动编排器（RCL-FR-016 期望由快照规划器计算）", () => {
    // 生成器/重放模块必须引用任务3的快照驱动编排器（orchestrateSnapshot），
    // 期望值不允许由本模块自行计算（PRD §4）。
    const replaySrc = readFileSync(
      path.join(GOVERNANCE_DIR, "replay.ts"),
      "utf-8",
    );
    expect(replaySrc).toMatch(/orchestrateSnapshot|orchestrateInMemory|computeJurisdictionPlan/);
  });
});