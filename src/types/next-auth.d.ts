import type { AuthenticatedActor } from "@/server/modules/identity/domain/access";
import type { AuthTokenClaims } from "@/lib/auth/claims";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    /** 认证用户 id（数据库 users.id）。 */
    userId?: string;
    username?: string;
    role?: "user" | "admin";
    authVersion?: number;
    mustChangePassword?: boolean;
    accessExpiresAt?: number;
    refreshSessionId?: string;
    /** Secret 原文只在 authorize 返回值 → jwt callback 的内存路径中出现，绝不回写客户端。 */
    refreshSecret?: string;
  }

  interface Session {
    /** 刷新时数据库暂时不可用的标记：门禁据此返回 503（AUTH-AC-019）。 */
    storeUnavailable?: boolean;
    user?: DefaultSession["user"] & Partial<AuthenticatedActor>;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    authClaims?: AuthTokenClaims;
    /** 刷新失败（撤销/过期/复用/版本变更）：会话整体失效，需重新登录。 */
    sessionInvalid?: boolean;
    storeUnavailable?: boolean;
  }
}
