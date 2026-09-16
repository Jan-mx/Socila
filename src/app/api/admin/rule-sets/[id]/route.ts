import { sanitizeRuleSetEdit } from "@/lib/admin/entity-edit-policy";
import {
  assertDisplayDescription,
  assertDisplayMeta,
  DisplayMetaError,
} from "@/lib/dsl/display-names";
import { rulesReads, rulesWrites } from "@/server/modules/rules/application";
import {
  getRuleSetDetailView,
  isValidIsoDate,
  todayIsoDate,
  type RuleSetLocator,
} from "@/server/modules/rules/application/rule-set-view";
import { validateRuleSetMembers } from "@/lib/admin/rule-set-members-validation";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * APR-FR-006：规则集读取与更新必须使用rule_set_id + jurisdiction_code + version
 * 精确身份；缺地区或版本返回明确400，不存在404，不得跨地区猜测。
 */
function parseLocator(
  ruleSetId: string,
  searchParams: URLSearchParams,
): RuleSetLocator | null {
  const jurisdictionCode = searchParams.get("jurisdiction_code");
  const version = Number(searchParams.get("version"));
  if (!ruleSetId || !jurisdictionCode || !Number.isInteger(version) || version < 1) {
    return null;
  }
  return { ruleSetId, jurisdictionCode, version };
}

/** as_of_date缺省=服务器当前日期并回显（APR-FR-007）；非法格式400。 */
function parseAsOfDate(
  searchParams: URLSearchParams,
): { ok: true; asOf: string } | { ok: false; error: string } {
  const raw = searchParams.get("as_of_date");
  if (raw === null) return { ok: true, asOf: todayIsoDate() };
  if (!isValidIsoDate(raw)) {
    return { ok: false, error: "as_of_date必须是合法的YYYY-MM-DD日期" };
  }
  return { ok: true, asOf: raw };
}

/** GET详情：同时返回原始rules（执行顺序）与解析后的members（PRD §8、APR-FR-004/005）。 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const locator = parseLocator(id, req.nextUrl.searchParams);
    const asOf = parseAsOfDate(req.nextUrl.searchParams);
    if (!asOf.ok) {
      return NextResponse.json({ error: asOf.error }, { status: 400 });
    }
    const result = await getRuleSetDetailView(locator, asOf.asOf);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    const { ruleSet, rules, members } = result.view;
    return NextResponse.json({
      rule_set: ruleSet,
      rules,
      members,
      asOfDate: asOf.asOf,
    });
  } catch {
    return NextResponse.json({ error: "加载规则集详情失败" }, { status: 500 });
  }
}

/** 保存前成员完整性校验（APR-FR-007/AC-006，与创建入口共用）：重复或缺失即拒绝。 */
async function validateMemberSave(
  locator: RuleSetLocator,
  nextRules: string[],
  asOf: string,
): Promise<NextResponse | null> {
  const result = await validateRuleSetMembers(locator, nextRules, asOf);
  if (result.duplicateRuleIds.length > 0) {
    return NextResponse.json(
      {
        error: "规则集成员包含重复编号，拒绝保存（保存值必须为稳定编号且顺序保持）",
        duplicateRuleIds: result.duplicateRuleIds,
      },
      { status: 400 },
    );
  }
  if (result.invalidRuleIds.length > 0) {
    return NextResponse.json(
      {
        error: `规则集成员无法解析（规则不存在或不可用），拒绝保存：${result.invalidRuleIds.join(", ")}`,
        invalidRuleIds: result.invalidRuleIds,
      },
      { status: 400 },
    );
  }
  return null;
}

async function handleUpdate(
  req: NextRequest,
  paramsPromise: Promise<{ id: string }>,
) {
  try {
    const { id } = await paramsPromise;
    const locator = parseLocator(id, req.nextUrl.searchParams);
    if (
      !locator ||
      !locator.ruleSetId ||
      !locator.jurisdictionCode ||
      !Number.isInteger(locator.version)
    ) {
      return NextResponse.json(
        {
          error:
            "规则集更新必须携带jurisdiction_code与version精确身份（APR-FR-006）",
        },
        { status: 400 },
      );
    }
    const asOf = parseAsOfDate(req.nextUrl.searchParams);
    if (!asOf.ok) {
      return NextResponse.json({ error: asOf.error }, { status: 400 });
    }

    const body = (await req.json()) as Record<string, unknown>;
    // 审查缺陷2：编辑白名单——status/jurisdiction/version等受控字段拒绝。
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

    const payload: Record<string, unknown> = { ...sanitized.fields };

    // APR-FR-003/§9：name进入白名单，但提交时必须是非空正式名称；说明拒绝HTML尖括号。
    if ("name" in payload) {
      try {
        payload.name = assertDisplayMeta(locator.ruleSetId, {
          name: payload.name,
        }).name;
      } catch (err) {
        if (err instanceof DisplayMetaError) {
          return NextResponse.json({ error: err.message }, { status: 400 });
        }
        throw err;
      }
    }
    if ("description" in payload) {
      try {
        payload.description = assertDisplayDescription(
          locator.ruleSetId,
          payload.description,
        );
      } catch (err) {
        if (err instanceof DisplayMetaError) {
          return NextResponse.json({ error: err.message }, { status: 400 });
        }
        throw err;
      }
    }

    // APR-FR-007/AC-006：保存含重复或缺失成员拒绝并指出问题编号。
    if ("rules" in payload) {
      const nextRules = payload.rules;
      if (
        !Array.isArray(nextRules) ||
        nextRules.length === 0 ||
        nextRules.some((r) => typeof r !== "string" || r.trim().length === 0)
      ) {
        return NextResponse.json(
          { error: "rules必须是规则编号字符串数组，且不得为空" },
          { status: 400 },
        );
      }
      const invalid = await validateMemberSave(
        locator,
        nextRules as string[],
        asOf.asOf,
      );
      if (invalid) return invalid;
      payload.rules = nextRules;
    }

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: "未提供可编辑字段" }, { status: 400 });
    }

    const existing = await rulesReads.getRuleSetExact(locator);
    if (!existing) {
      return NextResponse.json(
        { error: "未找到该地区与版本的规则集" },
        { status: 404 },
      );
    }

    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "只能更新草稿状态的规则集" },
        { status: 400 },
      );
    }

    const updated = await rulesWrites.updateRuleSet(
      existing.id,
      payload as Parameters<typeof rulesWrites.updateRuleSet>[1],
    );
    return NextResponse.json({ rule_set: updated });
  } catch {
    return NextResponse.json({ error: "更新规则集失败" }, { status: 500 });
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
