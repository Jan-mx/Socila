import { rulesReads } from "@/server/modules/rules/application";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tests = await rulesReads.listTests();

    const normalized = tests.map((test) => {
      const result = test.lastRunResult as Record<string, unknown> | null;
      const passed = result?.passed === true || result?.pass === true;

      return {
        ...test,
        lastRunResult: result
          ? {
              passed,
              diff: result.diff,
              error: result.error,
            }
          : null,
      };
    });

    const total = normalized.length;
    const passed = normalized.filter((test) => test.lastRunResult?.passed).length;
    const failed = total - passed;
    const passRate = total > 0 ? (passed / total) * 100 : 0;

    return NextResponse.json({
      tests: normalized,
      total,
      passed,
      failed,
      passRate,
    });
  } catch {
    return NextResponse.json(
      { error: "加载测试列表失败" },
      { status: 500 },
    );
  }
}
