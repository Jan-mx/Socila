import { planningReads } from "@/server/modules/planning/application";
import { mapRouteError } from "@/lib/api/route-errors";
import {
  decideOwnership,
  resolveOwnerKey,
} from "@/server/modules/identity/domain/owner";
import { NextRequest, NextResponse } from "next/server";
import { readAnonymousSession } from "@/lib/security/anon-session";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const plan = await planningReads.getPlan(id);

    if (!plan) {
      return NextResponse.json({ error: "未找到规划方案" }, { status: 404 });
    }

    // 归属校验在用例层语义上完成（CORE-FR-005/009）：owner_user_id 优先、其次
    // session 绑定；旧数据两者皆空不限制。方案读取用 404 而非 403，避免泄露
    // "该 id 存在"（CORE-AC-002 的不可枚举等价响应）。
    const decision = decideOwnership(
      plan,
      resolveOwnerKey({ sessionId: readAnonymousSession(req) }),
    );
    if (decision.decision === "forbidden") {
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
