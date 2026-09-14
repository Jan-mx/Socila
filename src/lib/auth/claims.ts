/**
 * NextAuth 授权声明（09-02 §7.2，ADR-0007）。
 *
 * AuthTokenClaims 只存在于 NextAuth 加密 JWT Cookie；客户端 Session 只暴露
 * AuthenticatedActor（userId/username/role/authVersion/mustChangePassword）。
 * refreshSessionId/refreshSecret/密码哈希绝不进入客户端 Session。
 */

import type { AuthenticatedActor } from "@/server/modules/identity/domain/access";
import { isDatabaseUnavailableError } from "@/lib/api/route-errors";

export interface AuthTokenClaims {
  userId: string;
  username: string;
  role: "user" | "admin";
  authVersion: number;
  mustChangePassword: boolean;
  /** 授权声明到期时间（epoch ms）：签发/刷新时刻 + 15 分钟。 */
  accessExpiresAt: number;
  refreshSessionId: string;
  refreshSecret: string;
}

export interface LoginSessionOutcome {
  actor: AuthenticatedActor;
  refreshSessionId: string;
  refreshSecret: string;
  accessExpiresAt: number;
}

export function buildTokenClaims(
  outcome: LoginSessionOutcome,
): AuthTokenClaims {
  return {
    userId: outcome.actor.userId,
    username: outcome.actor.username,
    role: outcome.actor.role,
    authVersion: outcome.actor.authVersion,
    mustChangePassword: outcome.actor.mustChangePassword,
    accessExpiresAt: outcome.accessExpiresAt,
    refreshSessionId: outcome.refreshSessionId,
    refreshSecret: outcome.refreshSecret,
  };
}

/** 授权声明窗口判定（AUTH-FR-004）：now >= accessExpiresAt 即需要刷新。 */
export function isAccessWindowExpired(
  claims: Pick<AuthTokenClaims, "accessExpiresAt">,
  nowMs: number,
): boolean {
  return nowMs >= claims.accessExpiresAt;
}

/** 授权声明刷新编排：由 NextAuth jwt callback 注入真实轮换端口。 */
export async function refreshAccessTokenClaims(
  current: AuthTokenClaims,
  rotate: (input: {
    refreshSessionId: string;
    refreshSecret: string;
  }) => Promise<LoginSessionOutcome>,
): Promise<
  | { ok: true; claims: AuthTokenClaims }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "store_unavailable" }
> {
  try {
    const outcome = await rotate({
      refreshSessionId: current.refreshSessionId,
      refreshSecret: current.refreshSecret,
    });
    return { ok: true, claims: buildTokenClaims(outcome) };
  } catch (err) {
    if (isDatabaseUnavailableError(err)) {
      return { ok: false, reason: "store_unavailable" };
    }
    return { ok: false, reason: "invalid" };
  }
}
