import { sanitizeRuleSetEdit } from "@/lib/admin/entity-edit-policy";
import { rulesReads, rulesWrites } from "@/server/modules/rules/application";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function handleUpdate(
  req: NextRequest,
  paramsPromise: Promise<{ id: string }>,
) {
  try {
    const { id } = await paramsPromise;
    const body = (await req.json()) as Record<string, unknown>;
    // 审查缺陷2：规则集编辑白名单——status/jurisdiction/version等受控字段拒绝。
    const sanitized = sanitizeRuleSetEdit(body);
    if (!sanitized.ok) {
      return NextResponse.json(
        {
          error: "请求包含不允许修改的字段（NRP-FR-021白名单）",
          controlledFields: sanitized.controlledFields,
          unknownFields: sanitized.unknownFields,
        },
        { status: 400 },
      );
    }

    const existing = await rulesReads.getLatestRuleSetVersion(id);

    if (!existing) {
      return NextResponse.json({ error: "未找到规则集" }, { status: 404 });
    }

    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "只能更新草稿状态的规则集" },
        { status: 400 },
      );
    }

    // 白名单后的字段直接构成更新载荷。
    const payload: Record<string, unknown> = { ...sanitized.fields };

    if (Object.keys(payload).length === 0) {
      return NextResponse.json(
        { error: "未提供可编辑字段" },
        { status: 400 },
      );
    }

    const updated = await rulesWrites.updateRuleSet(existing.id, payload);
    return NextResponse.json({ rule_set: updated });
  } catch {
    return NextResponse.json(
      { error: "更新规则集失败" },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleUpdate(req, params);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  return handleUpdate(req, params);
}
