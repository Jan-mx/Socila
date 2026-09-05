import { rulesReads } from "@/server/modules/rules/application";
import { rulesWrites } from "@/server/modules/rules/application";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string; versionId: string }> },
) {
  try {
    const { ruleId, versionId } = await params;
    const version = parseInt(versionId, 10);
    const jurisdictionCode =
      req.nextUrl.searchParams.get("jurisdiction_code") ?? undefined;
    if (!jurisdictionCode) {
      return NextResponse.json(
        { error: "缺少精确实体身份（jurisdiction_code，NRP-FR-021）" },
        { status: 400 },
      );
    }
    const body = await req.json();

    const existing = await rulesReads.getRuleExact({
      ruleId,
      jurisdictionCode,
      version,
    });
    if (!existing) {
      return NextResponse.json(
        { error: "未找到规则版本" },
        { status: 404 },
      );
    }

    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "只能更新草稿状态的规则" },
        { status: 400 },
      );
    }

    const updated = await rulesWrites.updateRule(existing.id, body);
    return NextResponse.json({ rule: updated });
  } catch {
    return NextResponse.json(
      { error: "更新规则版本失败" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string; versionId: string }> },
) {
  try {
    const { ruleId, versionId } = await params;
    const version = parseInt(versionId, 10);
    const jurisdictionCode =
      req.nextUrl.searchParams.get("jurisdiction_code") ?? undefined;
    if (!jurisdictionCode) {
      return NextResponse.json(
        { error: "缺少精确实体身份（jurisdiction_code，NRP-FR-021）" },
        { status: 400 },
      );
    }
    const body = await req.json();
    const { action } = body;

    if (action !== "validate") {
      return NextResponse.json({ error: "未知操作" }, { status: 400 });
    }

    const existing = await rulesReads.getRule(ruleId, version);
    if (!existing) {
      return NextResponse.json(
        { error: "未找到规则版本" },
        { status: 404 },
      );
    }

    // Validate schema: check required fields
    const decisionTable = existing.decisionTable as Record<string, unknown>;
    const schemaValid =
      existing.ruleId && existing.name && decisionTable?.rows !== undefined;

    // Validate examples
    const examples = (existing.examples as unknown[]) ?? [];
    const examplesValid = examples.length > 0;

    const results = {
      schema_valid: schemaValid,
      examples_valid: examplesValid,
      examples_count: examples.length,
    };

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json(
      { error: "校验规则版本失败" },
      { status: 500 },
    );
  }
}
