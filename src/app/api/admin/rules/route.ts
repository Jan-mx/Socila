import { rulesReads } from "@/server/modules/rules/application";
import { rulesWrites } from "@/server/modules/rules/application";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const ruleModule = searchParams.get("module") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const jurisdictionCode = searchParams.get("jurisdiction_code") ?? undefined;
    const q = searchParams.get("q") ?? undefined;

    const rules = await rulesReads.listRules({
      module: ruleModule,
      status,
      jurisdictionCode,
      q,
    });
    return NextResponse.json({ rules });
  } catch {
    return NextResponse.json(
      { error: "加载规则列表失败" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // New entities always start as draft; promotion to published goes through the
    // publish pipeline. Forcing status here stops a create from skipping that gate.
    const rule = await rulesWrites.insertRule({ ...body, status: "draft" });
    return NextResponse.json({ rule }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "创建规则失败" },
      { status: 500 },
    );
  }
}
