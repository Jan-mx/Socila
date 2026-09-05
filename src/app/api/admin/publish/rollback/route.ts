import { NextRequest, NextResponse } from "next/server";
import {
  rollbackEntity,
  PublishEntityType,
  PublishServiceError,
} from "@/lib/admin/publish-service";

export const dynamic = "force-dynamic";

interface RollbackBody {
  entity_type?: PublishEntityType;
  jurisdiction_code?: string;
  entity_id?: string;
  version?: number;
  actor?: string;
  reason?: string;

  entityType?: PublishEntityType;
  jurisdictionCode?: string;
  entityId?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RollbackBody;
    const entityType = body.entity_type ?? body.entityType;
    const jurisdictionCode =
      body.jurisdiction_code ?? body.jurisdictionCode;
    const entityId = body.entity_id ?? body.entityId;
    const version = body.version;
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

    const result = await rollbackEntity({
      entityType,
      jurisdictionCode,
      entityId,
      version: Number(version),
      actor,
      reason: body.reason,
    });

    return NextResponse.json({ success: true, publish: result.publish });
  } catch (error) {
    if (error instanceof PublishServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json(
      { error: "回滚发布实体失败" },
      { status: 500 },
    );
  }
}
