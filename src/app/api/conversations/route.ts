import { conversationReads } from "@/server/modules/conversation/application";
import { mapRouteError } from "@/lib/api/route-errors";
import { NextRequest, NextResponse } from "next/server";
import {
  attachAnonymousSessionCookie,
  ensureAnonymousSession,
} from "@/lib/security/anon-session";

export const dynamic = "force-dynamic";

/** GET /api/conversations */
export async function GET(req: NextRequest) {
  const legacySessionId =
    req.nextUrl.searchParams.get("sessionId") ??
    req.headers.get("x-legacy-session-id") ??
    undefined;
  const { sessionId, isNewSession } = ensureAnonymousSession(
    req,
    legacySessionId,
  );

  const respondJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);
    if (isNewSession) {
      attachAnonymousSessionCookie(response, sessionId);
    }
    return response;
  };

  try {
    const rows = await conversationReads.listConversations(sessionId);
    return respondJson({ conversations: rows });
  } catch (err) {
    const mapped = mapRouteError(err, { operation: "conversation.list" });
    return respondJson(mapped.body, { status: mapped.status });
  }
}
