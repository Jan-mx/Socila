/**
 * 上海规划行为回归（NRP-NFR-012 零运行漂移验证工具）：
 * 对目标库的 tests 表全量用例执行 runDbTestSuite，输出聚合结果与
 * 逐案通过集合的内容哈希。物化前后各运行一次，输出必须一致。
 *
 * 用法：DATABASE_URL=<目标库> npx tsx scripts/planning-regression.ts
 * 输出不含连接串（NRP-NFR-009）。
 */
import "@/lib/env/load-environment";
import { runDbTestSuite } from "@/lib/engine/test-runner";
import { rulesReads } from "@/server/modules/rules/application";

async function main() {
  const tests = await rulesReads.listTests();
  const suite = await runDbTestSuite(
    tests.map((t) => ({
      ruleId: t.ruleId,
      name: t.name,
      input: t.input as Record<string, unknown>,
      paramsOverride: t.paramsOverride as Record<string, unknown> | null,
      expected: t.expected as Record<string, unknown>,
    })),
  );

  const passNames = suite.results
    .filter((r) => r.pass)
    .map((r) => r.name)
    .sort();
  const { createHash } = await import("node:crypto");
  const passSetHash = createHash("sha256")
    .update(JSON.stringify(passNames))
    .digest("hex");

  console.log(
    JSON.stringify(
      {
        total: suite.total,
        passed: suite.passed,
        failed: suite.failed,
        passRate: suite.pass_rate,
        passSetHash,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(`[planning-regression] 失败：${err.message}`);
  process.exit(1);
});
