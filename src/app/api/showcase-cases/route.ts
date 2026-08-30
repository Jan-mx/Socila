import { planningReads } from "@/server/modules/planning/application";
import { mapRouteError } from "@/lib/api/route-errors";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cases = await planningReads.listShowcaseCases();
    return NextResponse.json({ cases });
  } catch (err) {
    const mapped = mapRouteError(err, { operation: "showcase.list" });
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
