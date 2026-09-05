import { rulesWrites } from "@/server/modules/rules/application";
import { NextRequest, NextResponse } from "next/server";
import {
  resolveParamRecordExact,
  validateParamRecord,
} from "@/lib/admin/params-service";

export const dynamic = "force-dynamic";

async function handleUpdate(
  req: NextRequest,
  routeParams: Promise<{ paramId: string }>,
) {
  try {
    const { paramId } = await routeParams;
    const jurisdictionCode = req.nextUrl.searchParams.get("jurisdiction_code");
    if (!jurisdictionCode) {
      return NextResponse.json(
        { error: "缺少精确实体身份（jurisdiction_code，NRP-FR-021）" },
        { status: 400 },
      );
    }
    const body = await req.json();

    const existing = await resolveParamRecordExact(paramId, jurisdictionCode);
    if (!existing) {
      return NextResponse.json({ error: "未找到参数" }, { status: 404 });
    }

    if (existing.status !== "draft") {
      return NextResponse.json(
        { error: "只能更新草稿状态的参数" },
        { status: 400 },
      );
    }

    const updated = await rulesWrites.updateParam(existing.id, body);
    return NextResponse.json({ param: updated });
  } catch {
    return NextResponse.json(
      { error: "更新参数失败" },
      { status: 500 },
    );
  }
}

async function handleValidate(
  req: NextRequest,
  routeParams: Promise<{ paramId: string }>,
) {
  try {
    const { paramId } = await routeParams;
    const jurisdictionCode = req.nextUrl.searchParams.get("jurisdiction_code");
    if (!jurisdictionCode) {
      return NextResponse.json(
        { error: "缺少精确实体身份（jurisdiction_code，NRP-FR-021）" },
        { status: 400 },
      );
    }
    const existing = await resolveParamRecordExact(paramId, jurisdictionCode);

    if (!existing) {
      return NextResponse.json({ error: "未找到参数" }, { status: 404 });
    }

    const validation = validateParamRecord(existing);
    return NextResponse.json(validation);
  } catch {
    return NextResponse.json(
      { error: "校验参数失败" },
      { status: 500 },
    );
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
    return NextResponse.json(
      { error: "校验参数失败" },
      { status: 500 },
    );
  }
}
