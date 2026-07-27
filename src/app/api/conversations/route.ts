import { NextRequest, NextResponse } from "next/server";
import { listConversations } from "@/lib/db/queries";
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
    const rows = await listConversations(sessionId);
    return respondJson({ conversations: rows });
  } catch {
    return respondJson({ error: "服务器内部错误" }, { status: 500 });
  }
}
