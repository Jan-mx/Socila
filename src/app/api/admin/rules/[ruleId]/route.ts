import { rulesReads } from "@/server/modules/rules/application";
import { rulesWrites } from "@/server/modules/rules/application";
import { NextRequest, NextResponse } from "next/server";

/** NRP-FR-021：详情/更新必须携带jurisdiction_code+version精确定位。 */
function requireExactIdentity(
  searchOrBody: URLSearchParams | Record<string, unknown>,
): { jurisdictionCode: string; version: number } | null {
  const jurisdictionCode =
    searchOrBody instanceof URLSearchParams
      ? searchOrBody.get("jurisdiction_code")
      : ((searchOrBody.jurisdiction_code as string | undefined) ??
        (searchOrBody.jurisdictionCode as string | undefined));
  const versionRaw =
    searchOrBody instanceof URLSearchParams
      ? searchOrBody.get("version")
      : ((searchOrBody.version as number | string | undefined) ?? undefined);
  const version = Number(versionRaw);
  if (!jurisdictionCode || !Number.isInteger(version) || version < 1) {
    return null;
  }
  return { jurisdictionCode, version };
}

export const dynamic = "force-dynamic";

async function handleUpdate(
  req: NextRequest,
  params: Promise<{ ruleId: string }>,
) {
  try {
    const { ruleId } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    const identity = requireExactIdentity(body);
    if (!identity) {
      return NextResponse.json(
        {
          error:
            "缺少精确实体身份（jurisdiction_code/version，NRP-FR-021）",
        },
        { status: 400 },
      );
    }

    const existing = await rulesReads.getRuleExact({
      ruleId,
      jurisdictionCode: identity.jurisdictionCode,
      version: identity.version,
    });
    if (!existing) {
      return NextResponse.json({ error: "未找到该地区与版本的规则" }, { status: 404 });
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
      { error: "更新规则失败" },
      { status: 500 },
    );
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  try {
    const { ruleId } = await params;
    const identity = requireExactIdentity(req.nextUrl.searchParams);
    if (!identity) {
      return NextResponse.json(
        {
          error:
            "缺少精确实体身份（jurisdiction_code/version，NRP-FR-021）",
        },
        { status: 400 },
      );
    }
    const rule = await rulesReads.getRuleExact({
      ruleId,
      jurisdictionCode: identity.jurisdictionCode,
      version: identity.version,
    });

    if (!rule) {
      return NextResponse.json(
        { error: "未找到该地区与版本的规则" },
        { status: 404 },
      );
    }

    const versions = await rulesReads.listRuleVersions(
      ruleId,
      identity.jurisdictionCode,
    );
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
