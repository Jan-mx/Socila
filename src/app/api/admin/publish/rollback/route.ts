import { NextRequest, NextResponse } from "next/server";
import {
  rollbackEntity,
  PublishEntityType,
  PublishServiceError,
} from "@/lib/admin/publish-service";

export const dynamic = "force-dynamic";

interface RollbackBody {
  entity_type?: PublishEntityType;
  entity_id?: string;
  actor?: string;
  reason?: string;

  entityType?: PublishEntityType;
  entityId?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RollbackBody;
    const entityType = body.entity_type ?? body.entityType;
    const entityId = body.entity_id ?? body.entityId;
    const actor = body.actor ?? "admin-ui";

    if (!entityType || !entityId) {
      return NextResponse.json(
        { error: "缺少必填字段" },
        { status: 400 },
      );
    }

    const result = await rollbackEntity({
      entityType,
      entityId,
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
