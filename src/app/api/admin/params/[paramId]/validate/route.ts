import { NextRequest, NextResponse } from "next/server";
import {
  resolveParamRecord,
  validateParamRecord,
} from "@/lib/admin/params-service";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params: routeParams }: { params: Promise<{ paramId: string }> },
) {
  try {
    const { paramId } = await routeParams;
    const existing = await resolveParamRecord(paramId);

    if (!existing) {
      return NextResponse.json({ error: "未找到参数" }, { status: 404 });
    }

    return NextResponse.json(validateParamRecord(existing));
  } catch {
    return NextResponse.json(
      { error: "校验参数失败" },
      { status: 500 },
    );
  }
}
