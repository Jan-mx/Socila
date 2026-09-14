import { NextRequest, NextResponse } from "next/server";
import {
  normalizeStageInput,
  promoteEntity,
  PublishEntityType,
  PublishServiceError,
} from "@/lib/admin/publish-service";

export const dynamic = "force-dynamic";

interface PromoteRequest {
  entity_type?: PublishEntityType;
  jurisdiction_code?: string;
  entity_id?: string;
  version?: number;
  to_stage?: string;
  actor?: string;
  reason?: string;

  entityType?: PublishEntityType;
  jurisdictionCode?: string;
  entityId?: string;
  toStage?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PromoteRequest;

    const entityType = body.entity_type ?? body.entityType;
    const jurisdictionCode =
      body.jurisdiction_code ?? body.jurisdictionCode;
    const entityId = body.entity_id ?? body.entityId;
    const version = body.version;
    const requestedToStage = normalizeStageInput(body.to_stage ?? body.toStage);
    const actor = body.actor ?? "admin-ui";

    if (!entityType || !jurisdictionCode || !entityId || !version) {
      return NextResponse.json(
        {
          error:
            "缺少精确实体身份（entity_type/jurisdiction_code/entity_id/version，NRP-FR-021）",
        },
        { status: 400 },
      );
    }

    if ((body.to_stage || body.toStage) && !requestedToStage) {
      return NextResponse.json(
        { error: "目标发布阶段无效" },
        { status: 400 },
      );
    }

    const result = await promoteEntity({
      entityType,
      jurisdictionCode,
      entityId,
      version: Number(version),
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
      { error: "晋级发布实体失败" },
      { status: 500 },
    );
  }
}
