import { rulesReads } from "@/server/modules/rules/application";
import { rulesWrites } from "@/server/modules/rules/application";
import {
  assertDisplayMeta,
  DisplayMetaError,
} from "@/lib/dsl/display-names";
import { parseOverlayOperation } from "@/lib/dsl/overlay-operation";
import { validateRuleSetMembers } from "@/lib/admin/rule-set-members-validation";
import { todayIsoDate } from "@/server/modules/rules/application/rule-set-view";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const ruleSets = await rulesReads.listRuleSets();
    return NextResponse.json({ rule_sets: ruleSets });
  } catch {
    return NextResponse.json(
      { error: "加载规则集列表失败" },
      { status: 500 },
    );
  }
}

/**
 * APR-FR-003/017：新建规则集必须携带rule_set_id + jurisdiction_code与
 * 非空正式中文名称；只接受白名单字段（审查缺陷2的创建面对齐），
 * status强制draft，发布只走发布门禁。
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const ruleSetId = body.ruleSetId;
    const jurisdictionCode = body.jurisdictionCode;
    if (typeof ruleSetId !== "string" || ruleSetId.trim().length === 0) {
      return NextResponse.json({ error: "缺少ruleSetId" }, { status: 400 });
    }
    if (
      typeof jurisdictionCode !== "string" ||
      jurisdictionCode.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "缺少jurisdictionCode（APR-FR-006精确身份）" },
        { status: 400 },
      );
    }
    let display: { name: string; description: string | null };
    try {
      // description为规则集原有详细说明字段：允许缺省/null，但拒绝HTML尖括号（PRD §9）。
      display = assertDisplayMeta(ruleSetId, {
        name: body.name,
        description: body.description,
      });
    } catch (err) {
      if (err instanceof DisplayMetaError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
    // APR-FR-007/AC-006（二轮复审F7修复）：创建面同样校验成员完整性——
    // 非空rules携带重复或在继承链上无法解析的编号即拒绝（与PATCH共用实现）。
    if (Array.isArray(body.rules) && (body.rules as unknown[]).length > 0) {
      const nextRules = body.rules as unknown[];
      if (nextRules.some((r) => typeof r !== "string" || (r as string).trim().length === 0)) {
        return NextResponse.json(
          { error: "rules必须是规则编号字符串数组" },
          { status: 400 },
        );
      }
      const validation = await validateRuleSetMembers(
        { ruleSetId, jurisdictionCode, version: Number.isInteger(body.version) && (body.version as number) >= 1 ? (body.version as number) : 1 },
        nextRules as string[],
        todayIsoDate(),
      );
      if (validation.duplicateRuleIds.length > 0) {
        return NextResponse.json(
          { error: "规则集成员包含重复编号，拒绝创建", duplicateRuleIds: validation.duplicateRuleIds },
          { status: 400 },
        );
      }
      if (validation.invalidRuleIds.length > 0) {
        return NextResponse.json(
          {
            error: `规则集成员无法在继承链上解析，拒绝创建：${validation.invalidRuleIds.join(", ")}`,
            invalidRuleIds: validation.invalidRuleIds,
          },
          { status: 400 },
        );
      }
    }

    const overlay = parseOverlayOperation(
      "rule_set",
      ruleSetId,
      typeof body.operation === "string" ? body.operation : undefined,
      typeof body.targetBusinessKey === "string"
        ? body.targetBusinessKey
        : null,
      jurisdictionCode,
    );
    const ruleSet = await rulesWrites.insertRuleSet({
      ruleSetId,
      jurisdictionCode,
      name: display.name,
      description: display.description,
      status: "draft",
      effectiveFrom:
        typeof body.effectiveFrom === "string" ? body.effectiveFrom : todayIsoDate(),
      rules: Array.isArray(body.rules) ? (body.rules as string[]) : [],
      conflictResolution: body.conflictResolution ?? null,
      version:
        Number.isInteger(body.version) && (body.version as number) >= 1
          ? (body.version as number)
          : 1,
      operation: overlay.operation,
      targetBusinessKey: overlay.targetBusinessKey,
    });
    return NextResponse.json({ rule_set: ruleSet }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "创建规则集失败" },
      { status: 500 },
    );
  }
}
