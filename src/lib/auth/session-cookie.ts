/**
 * 从请求 Cookie 读取刷新会话句柄（09-02，ADR-0007）。
 *
 * refreshSessionId 只存于 NextAuth 加密 JWT；会话 callback 不暴露它，
 * 因此登出接口经 decode 读取。refreshSecret 同样在 claims 中但本模块
 * 只提取 id，绝不返回 Secret。
 */
import { decode, type JWT } from "next-auth/jwt";

import type { AuthTokenClaims } from "@/lib/auth/claims";

function sessionCookieName(): string {
  const useSecure =
    process.env.NEXTAUTH_URL?.startsWith("https://") ||
    process.env.AUTH_URL?.startsWith("https://") ||
    process.env.NODE_ENV === "production";
  return (useSecure ? "__Secure-" : "") + "authjs.session-token";
}

export async function readRefreshSessionIdFromCookies(
  request: Request & { cookies?: { get(name: string): { value: string } | undefined } },
): Promise<string | null> {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) return null;

  const cookieName = sessionCookieName();
  let tokenValue: string | undefined;
  const cookiesLike = request.cookies;
  if (cookiesLike) {
    tokenValue = cookiesLike.get(cookieName)?.value;
  } else {
    const header = request.headers.get("cookie") ?? "";
    const match = header
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${cookieName}=`));
    tokenValue = match?.slice(cookieName.length + 1);
  }
  if (!tokenValue) return null;

  try {
    const payload = (await decode({
      token: tokenValue,
      secret,
      salt: cookieName,
    })) as (JWT & { authClaims?: AuthTokenClaims }) | null;
    return payload?.authClaims?.refreshSessionId ?? null;
  } catch {
    return null;
  }
}
