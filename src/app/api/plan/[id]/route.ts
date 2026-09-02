import { planningReads } from "@/server/modules/planning/application";
import { mapRouteError } from "@/lib/api/route-errors";
import { requireActor } from "@/lib/auth/require-actor";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // 09-02 AUTH-FR-003/005：规划详情只对 owner_user_id 本人可见；
    // 旧匿名数据（无 owner_user_id）对新入口不可见（AUTH-AC-017）。
    const gate = await requireActor();
    if (!gate.ok) {
      return gate.response;
    }

    const { id } = await params;
    const plan = await planningReads.getPlan(id);

    if (!plan || plan.ownerUserId !== gate.actor.userId) {
      return NextResponse.json({ error: "未找到规划方案" }, { status: 404 });
    }

    // 不把归属会话 token 回显到响应体里。
    const safePlan: Record<string, unknown> = { ...plan };
    delete safePlan.sessionId;
    delete safePlan.ownerUserId;
    return NextResponse.json({ plan: safePlan });
  } catch (err) {
    const mapped = mapRouteError(err, { operation: "plan.read" });
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
