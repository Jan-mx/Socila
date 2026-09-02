/**
 * 服务端路由门禁（09-02 AUTH-FR-003/006，§7.4 权限矩阵）。
 *
 * 决策逻辑在 identity domain（decidePageAccess/decideApiAccess），
 * 这里只做 NextResponse 映射；数据库校验由各 API 的 requireFreshAdmin 承担。
 * 匿名访客不得进入 /chat、/account、/admin 或调用规划/对话/管理 API。
 */
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

import {
  decideApiAccess,
  decidePageAccess,
  type AuthenticatedActor,
} from "@/server/modules/identity/domain/access";
import type { Session } from "next-auth";

export const AUTH_STORE_UNAVAILABLE_BODY = {
  error: "AUTH_STORE_UNAVAILABLE",
} as const;

function actorFromSession(
  session: Session | null,
): { actor: AuthenticatedActor | null; storeUnavailable: boolean } {
  const user = session?.user;
  const actor =
    user &&
    typeof user.userId === "string" &&
    typeof user.username === "string" &&
    (user.role === "user" || user.role === "admin") &&
    typeof user.authVersion === "number"
      ? {
          userId: user.userId,
          username: user.username,
          role: user.role,
          authVersion: user.authVersion,
          mustChangePassword: user.mustChangePassword === true,
        }
      : null;
  return { actor, storeUnavailable: session?.storeUnavailable === true };
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const { actor, storeUnavailable } = actorFromSession(req.auth);

  // 刷新时数据库暂时不可用：503，不误判为未认证（AUTH-AC-019）
  if (storeUnavailable) {
    return NextResponse.json(AUTH_STORE_UNAVAILABLE_BODY, { status: 503 });
  }

  const isApi = pathname.startsWith("/api/");
  const decision = isApi
    ? decideApiAccess(actor, pathname)
    : decidePageAccess(actor, pathname);

  switch (decision.effect) {
    case "allow":
      return NextResponse.next();
    case "redirect":
      return NextResponse.redirect(new URL(decision.location, req.url));
    case "deny":
      return NextResponse.json(
        { error: decision.code },
        { status: decision.status },
      );
  }
});

export const config = {
  matcher: [
    "/chat",
    "/chat/:path*",
    "/account/:path*",
    "/admin/:path*",
    "/api/chat",
    "/api/chat/:path*",
    "/api/conversations",
    "/api/conversations/:path*",
    "/api/plan",
    "/api/plan/:path*",
    "/api/account/:path*",
    "/api/admin/:path*",
    "/api/auth/logout",
  ],
};
