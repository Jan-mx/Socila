import { NextRequest, NextResponse } from "next/server";
import { mapRouteError } from "@/lib/api/route-errors";
import { requireActor } from "@/lib/auth/require-actor";
import { planningReads } from "@/server/modules/planning/application";
import { DrizzleJurisdictionPlanningReadRepository } from "@/server/modules/planning/infrastructure/drizzle/jurisdiction-planning-read.repository";
import {
  replayPlan,
  ReplayForbiddenError,
  ReplayNotFoundError,
  ReplaySnapshotUnavailableError,
} from "@/server/modules/planning/application/replay-plan.use-case";

export const dynamic = "force-dynamic";

/**
 * POST /api/plan/:id/replay（任务3 JRP-FR-014/028、JRP-AC-008）：
 * owner 重放自己的历史 plan。按 plan 保存的 snapshotId + snapshotContentHash +
 * asOfDate 从不可变快照恢复执行，返回原快照元数据与漂移结论（drift）；
 * 不随当前活动快照调度变化（JRP-NFR-006）。无快照引用或快照已删除 → 409。
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireActor();
  if (!gate.ok) return gate.response;
  const { id } = await params;

  try {
    const reads = new DrizzleJurisdictionPlanningReadRepository();
    const result = await replayPlan(
      {
        getPlan: (planId) => planningReads.getPlan(planId),
        getSnapshot: (snapshotId) => reads.getSnapshot(snapshotId),
      },
      id,
      { userId: gate.actor.userId },
    );
    return NextResponse.json({ replay: result });
  } catch (err) {
    if (err instanceof ReplayNotFoundError) {
      return NextResponse.json({ error: "REPLAY_NOT_FOUND" }, { status: 404 });
    }
    if (err instanceof ReplayForbiddenError) {
      return NextResponse.json({ error: "REPLAY_FORBIDDEN" }, { status: 403 });
    }
    if (err instanceof ReplaySnapshotUnavailableError) {
      return NextResponse.json(
        { error: "REPLAY_SNAPSHOT_UNAVAILABLE" },
        { status: 409 },
      );
    }
    const mapped = mapRouteError(err, { operation: "plan.replay" });
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}