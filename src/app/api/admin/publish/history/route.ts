import { publishReads } from "@/server/modules/publishing/application";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const publishes = await publishReads.listPublishes(200);
    return NextResponse.json(publishes);
  } catch {
    return NextResponse.json(
      { error: "加载发布历史失败" },
      { status: 500 },
    );
  }
}
