import { NextResponse } from "next/server";
import { loadRegionReadiness } from "@/lib/policy-materialization/materialize";

export const dynamic = "force-dynamic";

/** NRP-FR-022：各地区物化就绪状态与覆盖缺口（awaiting_approval / blocked）。 */
export async function GET() {
  try {
    const regions = await loadRegionReadiness();
    return NextResponse.json({
      regions: regions.map((r) => ({
        jurisdictionCode: r.jurisdictionCode,
        readiness: r.readiness,
        blockingReasons: r.blockingReasons,
        entityCounts: r.entityCounts,
        status: r.status,
      })),
    });
  } catch {
    return NextResponse.json({ error: "加载覆盖状态失败" }, { status: 500 });
  }
}
