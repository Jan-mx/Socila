/**
 * RCL-FR-018/AC-011（第三轮复审P0）：42条DSL example确定性加载。
 *
 * 当前持久执行的缺陷：manifest生成时包含49 example，随后在apply事务外删除7条；
 * applied manifest声明85 tests而数据库实际78。本测试要求：
 * - 从CN19、上海9、广东10、四川4的地区DSL文件确定性加载精确42条目标example；
 * - 每条目标example的规范化内容hash为64位非空SHA-256；
 * - 任一业务字段漂移改变hash（与apply事务内重算一致）；
 * - 28/49等数量不得自动成为合法目标（assertRclCounts强制42，见manifest.test）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { loadDslExampleTargets } from "../dsl-examples";
import { testRowContentHash } from "../hashes";
import { discoverRegionDsl } from "@/lib/dsl/region-manifest";

describe("RCL-FR-018/AC-011 42条DSL example确定性加载", () => {
  it("从CN/上海/广东/四川DSL文件加载精确42条（CN19+沪9+粤10+川4）", () => {
    const targets = loadDslExampleTargets();
    expect(targets).toHaveLength(42);
    const byRegion = new Map<string, number>();
    for (const t of targets) byRegion.set(t.jurisdictionCode, (byRegion.get(t.jurisdictionCode) ?? 0) + 1);
    expect(byRegion.get("CN")).toBe(19);
    expect(byRegion.get("310000")).toBe(9);
    expect(byRegion.get("440000")).toBe(10);
    expect(byRegion.get("510000")).toBe(4);
  });

  it("重复加载逐字节一致（确定性，RCL-NFR-002）", () => {
    const a = loadDslExampleTargets();
    const b = loadDslExampleTargets();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("每条目标example携带64位非空规范化内容hash", () => {
    for (const t of loadDslExampleTargets()) {
      expect(t.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(t.name).toMatch(/^R-/);
    }
  });

  it("目标hash与数据库行规范化hash一致：修改任一业务字段改变hash", () => {
    const t = loadDslExampleTargets()[0];
    // 与apply事务内重算相同的规范化规则（testRowContentHash）。
    const row = {
      id: 1,
      name: t.name,
      jurisdiction_code: t.jurisdictionCode,
      rule_id: t.ruleId,
      input: t.input,
      params_override: t.paramsOverride,
      expected: t.expected,
      source: "example",
      source_case_uid: null,
      last_run_result: null,
      last_run_at: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    expect(testRowContentHash(row)).toBe(t.contentHash);
    expect(testRowContentHash({ ...row, name: "R-X: 改名" })).not.toBe(t.contentHash);
    expect(testRowContentHash({ ...row, jurisdiction_code: "440000" })).not.toBe(t.contentHash);
    expect(testRowContentHash({ ...row, input: { user: { basic: { gender: "female" } } } })).not.toBe(t.contentHash);
    expect(testRowContentHash({ ...row, expected: { calc: { x: 1 } } })).not.toBe(t.contentHash);
  });

  it("CN/上海/广东/四川四地区jurisdictionCode与seed命名一致（rule_id: example_name）", () => {
    const regions = discoverRegionDsl();
    // 每地区tests文件条目数 = 该地区加载数。
    const counts = new Map<string, number>();
    for (const r of regions) {
      const file = JSON.parse(readFileSync(r.testsPath, "utf-8")) as { tests: Array<{ rule_id: string; example_name: string }> };
      counts.set(r.manifest.jurisdiction_code, file.tests.length);
    }
    const targets = loadDslExampleTargets();
    const actual = new Map<string, number>();
    for (const t of targets) actual.set(t.jurisdictionCode, (actual.get(t.jurisdictionCode) ?? 0) + 1);
    for (const [code, n] of counts) expect(actual.get(code)).toBe(n);
  });
});
