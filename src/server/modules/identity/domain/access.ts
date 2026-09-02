/**
 * 客户端可见的认证主体与路由门禁决策（09-02 §7.2/§7.4，AUTH-FR-003/006）。
 *
 * AuthenticatedActor 是唯一允许出现在客户端 Session 的身份形态；
 * refreshSessionId/refreshSecret/密码哈希绝不进入本类型。
 * 门禁返回语义决策，Next.js 适配层负责映射为 redirect/JSON 响应。
 */

export type { UserRole, UserStatus } from "./roles";

export interface AuthenticatedActor {
  userId: string;
  username: string;
  role: "user" | "admin";
  authVersion: number;
  mustChangePassword: boolean;
}

export type AccessDecision =
  | { effect: "allow" }
  | { effect: "redirect"; location: string }
  | {
      effect: "deny";
      status: 401 | 403;
      code: "AUTH_REQUIRED" | "FORBIDDEN" | "PASSWORD_CHANGE_REQUIRED";
    };

const PROTECTED_PAGE_PREFIXES = ["/admin", "/account", "/chat"];

function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function loginRedirect(pathname: string): string {
  return `/login?callbackUrl=${encodeURIComponent(pathname)}`;
}

/** HTML 页面门禁（权限矩阵 §7.4）。 */
export function decidePageAccess(
  actor: AuthenticatedActor | null,
  pathname: string,
): AccessDecision {
  if (!isProtectedPage(pathname)) {
    return { effect: "allow" };
  }
  if (!actor) {
    return { effect: "redirect", location: loginRedirect(pathname) };
  }
  // 强制改密会话只能停留在 /account/security
  if (actor.mustChangePassword && pathname !== "/account/security") {
    return { effect: "redirect", location: "/account/security" };
  }
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (actor.role !== "admin") {
      return { effect: "redirect", location: "/chat?error=forbidden" };
    }
  }
  return { effect: "allow" };
}

const ANON_ALLOWED_API_PREFIXES = ["/api/auth/register"];

const USER_DATA_API_PREFIXES = [
  "/api/chat",
  "/api/conversations",
  "/api/plan",
];

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** API 门禁：匿名 401、强制改密 403 PASSWORD_CHANGE_REQUIRED、角色不足 403（AUTH-AC-001/016）。 */
export function decideApiAccess(
  actor: AuthenticatedActor | null,
  pathname: string,
): AccessDecision {
  if (matchesPrefix(pathname, ANON_ALLOWED_API_PREFIXES)) {
    return { effect: "allow" };
  }
  if (pathname === "/api/auth/logout") {
    if (!actor) {
      return { effect: "deny", status: 401, code: "AUTH_REQUIRED" };
    }
    return { effect: "allow" };
  }
  if (pathname === "/api/account/change-password") {
    if (!actor) {
      return { effect: "deny", status: 401, code: "AUTH_REQUIRED" };
    }
    return { effect: "allow" };
  }
  if (pathname.startsWith("/api/admin/")) {
    if (!actor) {
      return { effect: "deny", status: 401, code: "AUTH_REQUIRED" };
    }
    if (actor.mustChangePassword) {
      return { effect: "deny", status: 403, code: "PASSWORD_CHANGE_REQUIRED" };
    }
    if (actor.role !== "admin") {
      return { effect: "deny", status: 403, code: "FORBIDDEN" };
    }
    return { effect: "allow" };
  }
  if (matchesPrefix(pathname, USER_DATA_API_PREFIXES)) {
    if (!actor) {
      return { effect: "deny", status: 401, code: "AUTH_REQUIRED" };
    }
    if (actor.mustChangePassword) {
      return { effect: "deny", status: 403, code: "PASSWORD_CHANGE_REQUIRED" };
    }
    return { effect: "allow" };
  }
  return { effect: "allow" };
}
