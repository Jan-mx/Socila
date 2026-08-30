import { conversationReads } from "@/server/modules/conversation/application";
import { mapRouteError } from "@/lib/api/route-errors";
import { conversationWrites } from "@/server/modules/conversation/application";
import {
  deleteOwnedConversation,
} from "@/server/modules/conversation/application/conversation.use-case";
import { NextRequest, NextResponse } from "next/server";
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
    const result = await deleteOwnedConversation(
      { read: conversationReads, write: conversationWrites },
      conversationId,
      { sessionId },
    );
    // 归属判定在 conversation 用例层（CORE-FR-005/009）；
    // legacy（无归属列）与会话不匹配都映射为 403，存在性缺失为 404。
    if (result === "not-found") {
      return respondJson({ error: "会话不存在" }, { status: 404 });
    }
    if (result === "forbidden") {
      return respondJson({ error: "无权限删除该会话" }, { status: 403 });
    }
    return respondJson({ success: true });
  } catch (err) {
    const mapped = mapRouteError(err, { operation: "conversation.delete" });
    return respondJson(mapped.body, { status: mapped.status });
  }
}
