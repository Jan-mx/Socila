import { NextRequest, NextResponse } from "next/server";
import { planningReads } from "@/server/modules/planning/application";
import { decorateShowcaseCase } from "@/lib/showcase/case-nature";

export const dynamic = "force-dynamic";

/**
 * 管理案例列表（RCL-FR-020 `active AND filters`；SHV2-AC-012）：
 * 分页与既有字段保持不变，每行附加 caseNature 与结构化 policySources。
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const q = searchParams.get("q") ?? "";
    const topic = searchParams.get("topic") ?? "";
    const pageStr = searchParams.get("page") ?? "1";
    const pageSizeStr = searchParams.get("pageSize") ?? "50";

    const page = Math.max(1, parseInt(pageStr, 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(pageSizeStr, 10)));

    const { rows, total } = await planningReads.searchCases({
      q,
      topic,
      page,
      pageSize,
    });

    return NextResponse.json({
      cases: rows.map((row) => decorateShowcaseCase(row as unknown as Record<string, unknown>)),
      total,
      page,
      pageSize,
    });
  } catch {
    return NextResponse.json(
      { error: "加载案例列表失败" },
      { status: 500 },
    );
  }
}
