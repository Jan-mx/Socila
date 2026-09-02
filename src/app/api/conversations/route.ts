import { conversationReads } from "@/server/modules/conversation/application";
import { requireActor } from "@/lib/auth/require-actor";
import { mapRouteError } from "@/lib/api/route-errors";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET /api/conversations：认证用户列出本人会话（owner_user_id 过滤，09-02 AUTH-FR-005/006）。 */
export async function GET() {
  const gate = await requireActor();
  if (!gate.ok) {
    return gate.response;
  }

  try {
    const rows = await conversationReads.listConversations();
    const own = rows.filter((c) => c.ownerUserId === gate.actor.userId);
    return NextResponse.json({ conversations: own });
  } catch (err) {
    const mapped = mapRouteError(err, { operation: "conversation.list" });
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
