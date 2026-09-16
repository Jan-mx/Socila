import { rulesReads } from "@/server/modules/rules/application";
import {
  assertDisplayMeta,
  DisplayMetaError,
} from "@/lib/dsl/display-names";
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
    const body = (await req.json()) as Record<string, unknown>;
    // APR-FR-004/§9：规则name是成员列表与发布卡片的主展示字段，
    // 创建入口同样强制非空且拒绝HTML尖括号（与规则集/参数入口同一assertDisplayMeta口径）。
    const ruleId = typeof body.ruleId === "string" ? body.ruleId.trim() : "";
    if (ruleId.length === 0) {
      return NextResponse.json({ error: "缺少ruleId" }, { status: 400 });
    }
    try {
      body.name = assertDisplayMeta(ruleId, { name: body.name }).name;
    } catch (err) {
      if (err instanceof DisplayMetaError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
    // New entities always start as draft; promotion to published goes through the
    // publish pipeline. Forcing status here stops a create from skipping that gate.
    const rule = await rulesWrites.insertRule({
      ...(body as Parameters<typeof rulesWrites.insertRule>[0]),
      status: "draft",
    });
    return NextResponse.json({ rule }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "创建规则失败" },
      { status: 500 },
    );
  }
}
