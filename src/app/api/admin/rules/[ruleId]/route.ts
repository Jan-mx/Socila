import { NextRequest, NextResponse } from "next/server";
import { getRule, listRuleVersions, updateRule } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

async function handleUpdate(
  req: NextRequest,
  params: Promise<{ ruleId: string }>,
) {
  try {
    const { ruleId } = await params;
    const body = await req.json();

    const existing = await getRule(ruleId);
    if (!existing) {
      return NextResponse.json({ error: "未找到规则" }, { status: 404 });
    }

    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "只能更新草稿状态的规则" },
        { status: 400 },
      );
    }

    const updated = await updateRule(existing.id, body);
    return NextResponse.json({ rule: updated });
  } catch {
    return NextResponse.json(
      { error: "更新规则失败" },
      { status: 500 },
    );
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  try {
    const { ruleId } = await params;
    const rule = await getRule(ruleId);

    if (!rule) {
      return NextResponse.json({ error: "未找到规则" }, { status: 404 });
    }

    const versions = await listRuleVersions(ruleId);
    return NextResponse.json({ rule, versions });
  } catch {
    return NextResponse.json(
      { error: "加载规则详情失败" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  return handleUpdate(req, params);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  return handleUpdate(req, params);
}
