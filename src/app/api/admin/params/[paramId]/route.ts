import { rulesWrites } from "@/server/modules/rules/application";
import { NextRequest, NextResponse } from "next/server";
import {
  resolveParamRecordExact,
  validateParamRecord,
} from "@/lib/admin/params-service";
import { sanitizeParamEdit } from "@/lib/admin/entity-edit-policy";

export const dynamic = "force-dynamic";

/** NRP-FR-021/审查缺陷6：参数详情/更新/校验必须携带jurisdiction_code+version
 * 精确身份；缺失返回400，不存在返回404，不得静默选择“该地区最新版本”。 */
function requireExactIdentity(searchParams: URLSearchParams): {
  jurisdictionCode: string;
  version: number;
} | null {
  const jurisdictionCode = searchParams.get("jurisdiction_code");
  const version = Number(searchParams.get("version"));
  if (
    !jurisdictionCode ||
    !Number.isInteger(version) ||
    version < 1
  ) {
    return null;
  }
  return { jurisdictionCode, version };
}

export async function GET(
  req: NextRequest,
  { params: routeParams }: { params: Promise<{ paramId: string }> },
) {
  try {
    const { paramId } = await routeParams;
    const identity = requireExactIdentity(req.nextUrl.searchParams);
    if (!identity) {
      return NextResponse.json(
        { error: "缺少精确实体身份（jurisdiction_code/version，NRP-FR-021）" },
        { status: 400 },
      );
    }
    const existing = await resolveParamRecordExact(
      paramId,
      identity.jurisdictionCode,
      identity.version,
    );
    if (!existing) {
      return NextResponse.json(
        { error: "未找到该地区与版本的参数" },
        { status: 404 },
      );
    }
    return NextResponse.json({ param: existing });
  } catch {
    return NextResponse.json({ error: "加载参数失败" }, { status: 500 });
  }
}

async function handleUpdate(
  req: NextRequest,
  routeParams: Promise<{ paramId: string }>,
) {
  try {
    const { paramId } = await routeParams;
    const identity = requireExactIdentity(req.nextUrl.searchParams);
    if (!identity) {
      return NextResponse.json(
        { error: "缺少精确实体身份（jurisdiction_code/version，NRP-FR-021）" },
        { status: 400 },
      );
    }
    const body = (await req.json()) as Record<string, unknown>;

    // 审查缺陷2：编辑字段白名单——受控字段/未知字段出现即400。
    const sanitized = sanitizeParamEdit(body);
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

    const existing = await resolveParamRecordExact(
      paramId,
      identity.jurisdictionCode,
      identity.version,
    );
    if (!existing) {
      return NextResponse.json(
        { error: "未找到该地区与版本的参数" },
        { status: 404 },
      );
    }

    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "只能更新草稿状态的参数" },
        { status: 400 },
      );
    }

    const updated = await rulesWrites.updateParam(existing.id, sanitized.fields);
    return NextResponse.json({ param: updated });
  } catch {
    return NextResponse.json({ error: "更新参数失败" }, { status: 500 });
  }
}

async function handleValidate(
  req: NextRequest,
  routeParams: Promise<{ paramId: string }>,
) {
  try {
    const { paramId } = await routeParams;
    const identity = requireExactIdentity(req.nextUrl.searchParams);
    if (!identity) {
      return NextResponse.json(
        { error: "缺少精确实体身份（jurisdiction_code/version，NRP-FR-021）" },
        { status: 400 },
      );
    }
    const existing = await resolveParamRecordExact(
      paramId,
      identity.jurisdictionCode,
      identity.version,
    );

    if (!existing) {
      return NextResponse.json(
        { error: "未找到该地区与版本的参数" },
        { status: 404 },
      );
    }

    const validation = validateParamRecord(existing);
    return NextResponse.json(validation);
  } catch {
    return NextResponse.json({ error: "校验参数失败" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params: routeParams }: { params: Promise<{ paramId: string }> },
) {
  return handleUpdate(req, routeParams);
}

export async function PATCH(
  req: NextRequest,
  { params: routeParams }: { params: Promise<{ paramId: string }> },
) {
  return handleUpdate(req, routeParams);
}

export async function POST(
  req: NextRequest,
  { params: routeParams }: { params: Promise<{ paramId: string }> },
) {
  try {
    let body: { action?: string } | null = null;
    try {
      body = (await req.json()) as { action?: string };
    } catch {
      body = null;
    }

    if (body?.action && body.action !== "validate") {
      return NextResponse.json({ error: "未知操作" }, { status: 400 });
    }

    return handleValidate(req, routeParams);
  } catch {
    return NextResponse.json({ error: "校验参数失败" }, { status: 500 });
  }
}
