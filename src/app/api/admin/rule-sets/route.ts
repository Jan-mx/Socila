import { NextRequest, NextResponse } from "next/server";
import { listRuleSets, insertRuleSet } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ruleSets = await listRuleSets();
    return NextResponse.json({ rule_sets: ruleSets });
  } catch {
    return NextResponse.json(
      { error: "加载规则集列表失败" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Force draft on create; publishing goes through the publish pipeline (no gate skip).
    const ruleSet = await insertRuleSet({ ...body, status: "draft" });
    return NextResponse.json({ rule_set: ruleSet }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "创建规则集失败" },
      { status: 500 },
    );
  }
}
