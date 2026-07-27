import { NextRequest, NextResponse } from "next/server";
import { listParams, insertParam } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const policyPackId = searchParams.get("policy_pack_id") ?? undefined;
    const type = searchParams.get("type") ?? undefined;
    const status = searchParams.get("status") ?? undefined;

    const paramsData = await listParams({ policyPackId, type, status });
    return NextResponse.json({ params: paramsData });
  } catch {
    return NextResponse.json(
      { error: "加载参数列表失败" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Force draft on create; publishing goes through the publish pipeline (no gate skip).
    const param = await insertParam({ ...body, status: "draft" });
    return NextResponse.json({ param }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "创建参数失败" },
      { status: 500 },
    );
  }
}
