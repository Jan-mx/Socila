import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ruleSets } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { updateRuleSet } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

async function handleUpdate(
  req: NextRequest,
  paramsPromise: Promise<{ id: string }>,
) {
  try {
    const { id } = await paramsPromise;
    const body = await req.json();

    const rows = await db
      .select()
      .from(ruleSets)
      .where(eq(ruleSets.ruleSetId, id))
      .orderBy(desc(ruleSets.version))
      .limit(1);

    if (rows.length === 0) {
      return NextResponse.json({ error: "未找到规则集" }, { status: 404 });
    }

    const existing = rows[0];
    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "只能更新草稿状态的规则集" },
        { status: 400 },
      );
    }

    const payload: Record<string, unknown> = {};
    if (Array.isArray(body.rules)) payload.rules = body.rules;
    if (
      Object.prototype.hasOwnProperty.call(body, "description") &&
      (typeof body.description === "string" || body.description === null)
    ) {
      payload.description = body.description;
    }
    if (Object.prototype.hasOwnProperty.call(body, "conflictResolution")) {
      payload.conflictResolution = body.conflictResolution;
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json(
        { error: "未提供可编辑字段" },
        { status: 400 },
      );
    }

    const updated = await updateRuleSet(existing.id, payload);
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
