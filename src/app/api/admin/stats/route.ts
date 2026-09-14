import { rulesReads } from "@/server/modules/rules/application";
import { publishReads } from "@/server/modules/publishing/application";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [ruleCount, paramCount, allTests, recentPublishes] = await Promise.all([
      rulesReads.countRules(),
      rulesReads.countParams(),
      rulesReads.listTests(),
      publishReads.listPublishes(30),
    ]);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentPublishCount = recentPublishes.filter(
      (p) => new Date(p.createdAt) >= thirtyDaysAgo,
    ).length;

    const testsWithResults = allTests.filter((t) => t.lastRunResult !== null);
    const passed = testsWithResults.filter((t) => {
      const result = t.lastRunResult as Record<string, unknown> | null;
      return result?.pass === true;
    }).length;

    const testPassRate =
      testsWithResults.length > 0
        ? (passed / testsWithResults.length) * 100
        : 0;

    return NextResponse.json({
      ruleCount,
      paramCount,
      testPassRate,
      recentPublishes: recentPublishCount,
    });
  } catch {
    return NextResponse.json(
      { error: "加载统计数据失败" },
      { status: 500 },
    );
  }
}
