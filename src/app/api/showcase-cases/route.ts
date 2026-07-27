import { NextResponse } from "next/server";
import { listShowcaseCases } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cases = await listShowcaseCases();
    return NextResponse.json({ cases });
  } catch {
    return NextResponse.json(
      { error: "无法加载案例数据" },
      { status: 500 },
    );
  }
}
