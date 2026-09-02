import { conversationReads } from "@/server/modules/conversation/application";
import { requireActor } from "@/lib/auth/require-actor";
import { NextRequest, NextResponse } from "next/server";
import { mapRouteError } from "@/lib/api/route-errors";

export const dynamic = "force-dynamic";

/** GET /api/chat/:conversationId：归属受控读取（09-02，仅 owner_user_id 本人）。 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const gate = await requireActor();
  if (!gate.ok) {
    return gate.response;
  }
  const { conversationId } = await params;

  try {
    const conv = await conversationReads.getConversation(conversationId);
    if (!conv) {
      return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    }
    // 不可枚举：他人会话（含旧匿名数据）与不存在一律 404（CORE-AC-002 语义）
    if (conv.ownerUserId !== gate.actor.userId) {
      return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    }

    return NextResponse.json({ conversation: conv });
  } catch (err) {
    const mapped = mapRouteError(err, { operation: "chat.read" });
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
