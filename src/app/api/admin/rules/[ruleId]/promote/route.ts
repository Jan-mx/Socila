import { NextRequest, NextResponse } from "next/server";
import {
  normalizeStageInput,
  promoteEntity,
  PublishServiceError,
} from "@/lib/admin/publish-service";

export const dynamic = "force-dynamic";

interface PromoteBody {
  toStage?: string;
  to_stage?: string;
  jurisdiction_code?: string;
  jurisdictionCode?: string;
  version?: number;
  actor?: string;
  reason?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  try {
    const { ruleId } = await params;
    const body = (await req.json()) as PromoteBody;
    const jurisdictionCode =
      req.nextUrl.searchParams.get("jurisdiction_code") ??
      body.jurisdiction_code ??
      body.jurisdictionCode;
    const version = Number(
      req.nextUrl.searchParams.get("version") ?? body.version,
    );
    if (!jurisdictionCode || !Number.isInteger(version) || version < 1) {
      return NextResponse.json(
        { error: "缺少精确实体身份（jurisdiction_code/version，NRP-FR-021）" },
        { status: 400 },
      );
    }

    const requestedToStage = normalizeStageInput(body.toStage ?? body.to_stage);
    const actor = body.actor ?? "admin-ui";
    if ((body.toStage || body.to_stage) && !requestedToStage) {
      return NextResponse.json(
        { error: "目标发布阶段无效" },
        { status: 400 },
      );
    }

    const result = await promoteEntity({
      entityType: "rule",
      jurisdictionCode,
      entityId: ruleId,
      version,
      requestedToStage,
      actor,
      reason: body.reason,
    });

    return NextResponse.json({
      success: true,
      publish: result.publish,
      gateResults: result.gateResults,
      fromStage: result.fromStage,
      toStage: result.toStage,
      newStatus: result.newStatus,
    });
  } catch (error) {
    if (error instanceof PublishServiceError) {
      return NextResponse.json(
        {
          error: error.message,
          ...(error.details && typeof error.details === "object"
            ? error.details
            : {}),
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "晋级规则失败" },
      { status: 500 },
    );
  }
}
