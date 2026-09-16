import { rulesReads } from "@/server/modules/rules/application";
import { rulesWrites } from "@/server/modules/rules/application";
import {
  assertDisplayMeta,
  DisplayMetaError,
} from "@/lib/dsl/display-names";
import {
  buildParamReferenceIndex,
  filterRefsForJurisdiction,
} from "@/lib/admin/param-references";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * 参数列表（APR-FR-012）：中文名称为主展示字段（rows自带name/description），
 * 并批量附加引用规则（referencedByRules）——单查询构建反查索引，禁止逐参数N+1。
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const policyPackId = searchParams.get("policy_pack_id") ?? undefined;
    const type = searchParams.get("type") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const jurisdictionCode = searchParams.get("jurisdiction_code") ?? undefined;

    const [paramsData, referenceIndex] = await Promise.all([
      rulesReads.listParams({
        policyPackId,
        type,
        status,
        jurisdictionCode,
      }),
      rulesReads.listRuleParamReferenceIndex(),
    ]);
    const refsByParamKey = buildParamReferenceIndex(referenceIndex);
    const decorated = paramsData.map((row) => ({
      ...row,
      referencedByRules: filterRefsForJurisdiction(
        refsByParamKey.get(row.paramId) ?? [],
        row.jurisdictionCode,
      ),
    }));
    return NextResponse.json({ params: decorated });
  } catch {
    return NextResponse.json(
      { error: "加载参数列表失败" },
      { status: 500 },
    );
  }
}

/** APR-FR-010/017：新建参数必须携带非空正式中文名称（description可选）。 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const paramId = typeof body.paramId === "string" ? body.paramId.trim() : "";
    if (paramId.length === 0) {
      return NextResponse.json({ error: "缺少paramId" }, { status: 400 });
    }
    try {
      const display = assertDisplayMeta(paramId, {
        name: body.name,
        description: body.description,
      });
      body.name = display.name;
      body.description = display.description;
    } catch (err) {
      if (err instanceof DisplayMetaError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
    // Force draft on create; publishing goes through the publish pipeline (no gate skip).
    const param = await rulesWrites.insertParam({
      ...(body as Parameters<typeof rulesWrites.insertParam>[0]),
      status: "draft",
    });
    return NextResponse.json({ param }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "创建参数失败" },
      { status: 500 },
    );
  }
}
