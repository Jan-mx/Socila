import { NextRequest, NextResponse } from "next/server";
import { deleteConversation, getConversation } from "@/lib/db/queries";
import {
  attachAnonymousSessionCookie,
  ensureAnonymousSession,
} from "@/lib/security/anon-session";

export const dynamic = "force-dynamic";

/** DELETE /api/conversations/:conversationId */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const legacySessionId = req.headers.get("x-legacy-session-id") ?? undefined;
  const { sessionId, isNewSession } = ensureAnonymousSession(
    req,
    legacySessionId,
  );
  const { conversationId } = await params;

  const respondJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    if (isNewSession) {
      attachAnonymousSessionCookie(response, sessionId);
    }
    return response;
  };

  try {
    const conv = await getConversation(conversationId);
    if (!conv) {
      return respondJson({ error: "会话不存在" }, { status: 404 });
    }

    if (!conv.sessionId || conv.sessionId !== sessionId) {
      return respondJson({ error: "无权限删除该会话" }, { status: 403 });
    }

    await deleteConversation(conversationId);
    return respondJson({ success: true });
  } catch {
    return respondJson({ error: "服务器内部错误" }, { status: 500 });
  }
}
