import { planningReads } from "@/server/modules/planning/application";
import { mapRouteError } from "@/lib/api/route-errors";
import { decorateShowcaseCase } from "@/lib/showcase/case-nature";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * 公开合成政策案例（SHV2-FR-013/014、SHV2-AC-012）：既有字段保持兼容，
 * 每条附加 caseNature（RCL生成器=synthetic，其余=human_curated）与结构化 policySources。
 */
export async function GET() {
  try {
    const rows = await planningReads.listShowcaseCases();
    const cases = rows.map((row) => decorateShowcaseCase(row as unknown as Record<string, unknown>));
    return NextResponse.json({ cases });
  } catch (err) {
    const mapped = mapRouteError(err, { operation: "showcase.list" });
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
