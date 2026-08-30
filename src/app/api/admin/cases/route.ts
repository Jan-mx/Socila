import { NextRequest, NextResponse } from "next/server";
import { planningReads } from "@/server/modules/planning/application";

export const dynamic = "force-dynamic";

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
      cases: rows,
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
