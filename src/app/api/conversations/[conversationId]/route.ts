import { conversationReads, conversationWrites } from "@/server/modules/conversation/application";
import { requireActor } from "@/lib/auth/require-actor";
import { mapRouteError } from "@/lib/api/route-errors";
import { deleteOwnedConversation } from "@/server/modules/conversation/application/conversation.use-case";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** DELETE /api/conversations/:conversationId：归属受控删除（09-02，仅本人）。 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const gate = await requireActor();
  if (!gate.ok) {
    return gate.response;
  }
  const { conversationId } = await params;

  try {
    const result = await deleteOwnedConversation(
      { read: conversationReads, write: conversationWrites },
      conversationId,
      { userId: gate.actor.userId },
    );
    if (result === "not-found") {
      return NextResponse.json({ error: "会话不存在" }, { status: 404 });
    }
    if (result === "forbidden") {
      return NextResponse.json({ error: "无权限删除该会话" }, { status: 403 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    const mapped = mapRouteError(err, { operation: "conversation.delete" });
    return NextResponse.json(mapped.body, { status: mapped.status });
  }
}
