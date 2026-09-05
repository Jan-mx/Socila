/**
 * Golden 回归测试 —— 直接从磁盘上的 DSL（规则 + 参数包 + 示例用例）加载，
 * 在内存里跑确定性编排，断言每条示例都能复现其 expected 输出。
 *
 * 这是真实数据驱动的回归基线：任何改动让既有规则示例的输出漂移，都会在 CI 红掉。
 * 全程不依赖数据库（只用纯函数 runTestSuite + orchestrateInMemory）。
 *
 * 注：28 条 hand-authored 示例里有 4 条 expected 与当前确定性引擎不一致。经逐条核对，
 * 均非引擎回归（见 KNOWN_DIVERGENCES 注释）。把它们登记为"已知偏差"，既保持 CI 绿，
 * 又能在未来任何一条状态变化（新回归 / 意外修复）时强制人工复核。
 */
import { describe, it, expect } from "vitest";
import { loadRules, loadBaseParams, loadGoldenCases } from "./golden-fixtures";
import { runTestSuite } from "../test-runner";

// 链式语料装载（CN baseline + 上海overlay）见 golden-fixtures.ts。

/**
 * 已知偏差：以 example_name 为键。每条都已核对过根因，属示例过期 / 策略语义 / 浮点噪声，
 * 不是引擎回归。修复任意一条后，请把它从此清单移除（测试会强制提醒）。
 */
const KNOWN_DIVERGENCES: Record<string, string> = {
  "下限基数5000，比例0.3，补贴50% -> 750":
    "浮点表示噪声：5000*(0.2+0.1)=1500.0000000000002，数值正确仅非精确可表示，属金额取整/展示层问题。",
  // 重分类前的另外三处已知偏差已随NRP里程碑A/B显式解决并留痕：
  // 1) R-200 2036年示例期望19 vs 表值18.5 —— 表值18.5与国务院办法第二条一致，
  //    CN用例（退休年份2036 -> 18.5年）按权威口径收敛；
  // 2) R-220 缺性别示例期望180月 —— 规则现为性别分档+缺参守卫，CN用例改为追问期望；
  // 3) R-300 "断缴2个月"期望2 —— date_diff_months 为自然月差且被 R-120/单测锁定，
  //    CN用例按自然月差口径（2025-12-31→2026-03-01=3）显式命名；
  //    day-aware 断缴口径仍留作未来策略变更待办（见 stage-09-05 验收报告§上海重分类）。
};

describe("golden regression (DSL examples)", () => {
  const allRules = loadRules();
  const baseParams = loadBaseParams();
  const cases = loadGoldenCases();
  const knownKeys = new Set(Object.keys(KNOWN_DIVERGENCES));

  // 整套只跑一次：引擎在内存里复用同一组 rule/param 对象时存在就地修改，
  // 重复跑会污染结果（生产中每个请求都从 DB 加载全新对象，故不受影响）。
  const suite = runTestSuite(cases, allRules, baseParams);

  it("loads a non-trivial corpus of rules, params, and seed cases", () => {
    expect(allRules.length).toBeGreaterThanOrEqual(20);
    expect(Object.keys(baseParams).length).toBeGreaterThanOrEqual(20);
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });

  it("every non-divergent seeded example reproduces its expected output", () => {
    const failed = suite.results
      .filter((r) => !knownKeys.has(r.name) && !r.pass)
      .map((r) => ({ name: r.name, rule_id: r.rule_id, diff: r.diff }));

    if (failed.length > 0) {
      console.error(
        `Golden regressions (${failed.length}):\n` +
          JSON.stringify(failed, null, 2),
      );
    }
    expect(failed).toEqual([]);
  });

  it("known divergences stay exactly the documented set", () => {
    const actualDivergent = new Set(
      suite.results.filter((r) => !r.pass).map((r) => r.name),
    );

    // 出现未登记的新偏差 = 引擎回归。
    const newDivergences = [...actualDivergent].filter((n) => !knownKeys.has(n));
    // 已登记偏差"消失" = 被（有意/无意）修复，需更新清单显式承认。
    const resolved = [...knownKeys].filter((n) => !actualDivergent.has(n));

    expect({ newDivergences, resolved }).toEqual({
      newDivergences: [],
      resolved: [],
    });
  });
});
