import type { NextRequest } from "next/server";

export const ANON_SESSION_COOKIE_NAME = "socila-anon-session";

const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function isValidSessionId(value: string | undefined): value is string {
  if (!value) return false;
  return /^[a-zA-Z0-9-]{16,128}$/.test(value);
}

function createSessionId(): string {
  return crypto.randomUUID();
}

export function ensureAnonymousSession(
  req: NextRequest,
  fallbackSessionId?: string,
): {
  sessionId: string;
  isNewSession: boolean;
} {
  const existing = req.cookies.get(ANON_SESSION_COOKIE_NAME)?.value;
  if (isValidSessionId(existing)) {
    return { sessionId: existing, isNewSession: false };
  }

  if (isValidSessionId(fallbackSessionId)) {
    return { sessionId: fallbackSessionId, isNewSession: true };
  }

  return { sessionId: createSessionId(), isNewSession: true };
}

export function readAnonymousSession(req: NextRequest): string | null {
  const existing = req.cookies.get(ANON_SESSION_COOKIE_NAME)?.value;
  return isValidSessionId(existing) ? existing : null;
}

export function buildAnonymousSessionCookie(sessionId: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${ANON_SESSION_COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_COOKIE_MAX_AGE}${secure}`;
}

export function attachAnonymousSessionCookie(
  response: Response,
  sessionId: string,
): void {
  response.headers.append(
    "set-cookie",
    buildAnonymousSessionCookie(sessionId),
  );
}
