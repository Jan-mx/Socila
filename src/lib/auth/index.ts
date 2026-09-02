/**
 * NextAuth v5 Credentials 配置（09-02 §7.2，AUTH-FR-002/004，ADR-0007）。
 *
 * 双层会话：加密 JWT Cookie 内保存 15 分钟授权声明（accessExpiresAt）与
 * PostgreSQL 刷新会话句柄；声明过期后由 jwt callback 经 identity application
 * 验证并轮换刷新会话（行锁 + 确定性派生，30 秒并发宽限）。
 * 客户端 Session 只暴露 AuthenticatedActor 字段。
 *
 * 本文件是 Route/NextAuth 适配层：领域规则在 identity 模块，这里只做映射。
 */
import NextAuth, { type Session, type User } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";

import { isDatabaseUnavailableError } from "@/lib/api/route-errors";
import {
  checkRateLimit,
  clientIpFromRequest,
} from "@/lib/security/rate-limit";
import {
  buildTokenClaims,
  isAccessWindowExpired,
  refreshAccessTokenClaims,
} from "@/lib/auth/claims";
import { startLoginSession } from "@/server/modules/identity/application/login.use-case";
import { rotateRefreshSession } from "@/server/modules/identity/application/refresh.use-case";
import { normalizeUsername } from "@/server/modules/identity/domain/username";
import { getIdentityDeps } from "@/server/modules/identity/infrastructure/identity-container";

/** 每IP/规范化用户名 15 分钟最多 5 次（AUTH-NFR-003；每IP 20 次在登录页动作层执行）。 */
const LOGIN_USER_RATE_LIMIT = 5;
const LOGIN_USER_RATE_WINDOW_MS = 15 * 60 * 1000;

export const { auth, signIn, signOut, handlers } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const username =
          typeof credentials?.username === "string" ? credentials.username : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";
        if (!username || !password) {
          return null;
        }

        // 抗限流键不含密码/Cookie（§12.3）：IP + 规范化用户名
        const ip = clientIpFromRequest(new Request("http://local", { headers: request.headers }));
        const limit = checkRateLimit(
          `auth:login:user:${ip}:${normalizeUsername(username)}`,
          { limit: LOGIN_USER_RATE_LIMIT, windowMs: LOGIN_USER_RATE_WINDOW_MS },
        );
        if (!limit.allowed) {
          return null;
        }

        try {
          const outcome = await startLoginSession(getIdentityDeps(), {
            username,
            password,
          });
          return {
            id: outcome.actor.userId,
            name: outcome.actor.username,
            userId: outcome.actor.userId,
            username: outcome.actor.username,
            role: outcome.actor.role,
            authVersion: outcome.actor.authVersion,
            mustChangePassword: outcome.actor.mustChangePassword,
            accessExpiresAt: outcome.accessExpiresAt,
            refreshSessionId: outcome.refreshSessionId,
            refreshSecret: outcome.refreshSecret,
          } satisfies User;
        } catch (err) {
          if (isDatabaseUnavailableError(err)) {
            // 数据库不可用属于 503 语义；authorize 只能返回失败，日志保留稳定类别（AUTH-NFR-006）
            console.error(
              JSON.stringify({
                level: "error",
                event: "auth.login_store_unavailable",
              }),
            );
          }
          return null;
        }
      },
    }),
  ],
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/login" },
  callbacks: {
    jwt({ token, user }) {
      return jwtCallbackLogic(token, user);
    },
    session({ session, token }) {
      return sessionCallbackLogic(session, token);
    },
  },
});

/**
 * jwt callback 决策（从回调中提出便于测试）：
 * - 登录时写入授权声明；
 * - 15 分钟窗口内直接放行（不读库，ADR-0007）；
 * - 过期后经 PostgreSQL 轮换刷新会话；失败则整个会话失效。
 */
export async function jwtCallbackLogic(
  token: JWT,
  user: User | undefined,
): Promise<JWT> {
  if (user?.userId && user.refreshSessionId && user.refreshSecret) {
    const claims = buildTokenClaims({
      actor: {
        userId: user.userId,
        username: user.username ?? user.name ?? user.userId,
        role: user.role ?? "user",
        authVersion: user.authVersion ?? 1,
        mustChangePassword: user.mustChangePassword ?? false,
      },
      refreshSessionId: user.refreshSessionId,
      refreshSecret: user.refreshSecret,
      accessExpiresAt: user.accessExpiresAt ?? Date.now(),
    });
    return { ...token, authClaims: claims, sessionInvalid: false, storeUnavailable: false };
  }
  if (user) {
    // authorize 返回了不完整声明（不应发生）：按登录失败处理
    return { ...token, sessionInvalid: true };
  }

  const claims = token.authClaims;
  if (!claims || token.sessionInvalid) {
    return token;
  }
  if (!isAccessWindowExpired(claims, Date.now())) {
    return token;
  }

  const refreshed = await refreshAccessTokenClaims(claims, (input) =>
    rotateRefreshSession(getIdentityDeps(), input),
  );
  if (refreshed.ok) {
    return {
      ...token,
      authClaims: refreshed.claims,
      sessionInvalid: false,
      storeUnavailable: false,
    };
  }
  if (refreshed.reason === "store_unavailable") {
    // 503 语义：不误标记会话撤销，等数据库恢复后可继续刷新（AUTH-AC-019）
    return { ...token, storeUnavailable: true };
  }
  return { ...token, sessionInvalid: true, storeUnavailable: false };
}

/** session callback：只暴露 AuthenticatedActor（§7.2 白名单字段）。 */
export function sessionCallbackLogic(session: Session, token: JWT): Session {
  if (token.storeUnavailable) {
    return { ...session, storeUnavailable: true, user: undefined };
  }
  const claims = token.authClaims;
  if (!claims || token.sessionInvalid) {
    return { ...session, user: undefined };
  }
  return {
    ...session,
    user: {
      ...session.user,
      id: claims.userId,
      name: claims.username,
      userId: claims.userId,
      username: claims.username,
      role: claims.role,
      authVersion: claims.authVersion,
      mustChangePassword: claims.mustChangePassword,
    },
  };
}
