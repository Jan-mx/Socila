import { NextRequest, NextResponse } from "next/server";
import {
  getSelectableRules,
  isValidIsoDate,
  todayIsoDate,
  type RuleSetLocator,
} from "@/server/modules/rules/application/rule-set-view";

export const dynamic = "force-dynamic";

/**
 * APR-FR-009/AC-007：规则集成员选择器。
 * GET /api/admin/rule-sets/:rule_set_id/candidates
 *   ?jurisdiction_code=&version=&q=&as_of_date=
 * 候选=目标继承链上当前可解析、未加入规则集的规则；q支持中文名称与稳定编号搜索；
 * 排除已加入成员与无法解析/不可用规则；保存值仍为稳定编号。批量单查询（NFR-002）。
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const searchParams = req.nextUrl.searchParams;
    const jurisdictionCode = searchParams.get("jurisdiction_code");
    const version = Number(searchParams.get("version"));
    const rawAsOf = searchParams.get("as_of_date");
    if (
      !id ||
      !jurisdictionCode ||
      !Number.isInteger(version) ||
      version < 1
    ) {
      return NextResponse.json(
        {
          error:
            "缺少规则集精确实体身份（jurisdiction_code/version，APR-FR-006）",
        },
        { status: 400 },
      );
    }
    if (rawAsOf !== null && !isValidIsoDate(rawAsOf)) {
      return NextResponse.json(
        { error: "as_of_date必须是合法的YYYY-MM-DD日期" },
        { status: 400 },
      );
    }
    const locator: RuleSetLocator = { ruleSetId: id, jurisdictionCode, version };
    const result = await getSelectableRules(
      locator,
      rawAsOf ?? todayIsoDate(),
      searchParams.get("q") ?? "",
    );
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      candidates: result.candidates,
      asOfDate: rawAsOf ?? todayIsoDate(),
    });
  } catch {
    return NextResponse.json({ error: "加载候选规则失败" }, { status: 500 });
  }
}
