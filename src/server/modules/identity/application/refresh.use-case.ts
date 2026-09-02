/**
 * 刷新会话轮换用例（09-02 AUTH-FR-004，§7.3，AUTH-AC-009～012，ADR-0007）。
 *
 * 15 分钟授权声明过期后，由 NextAuth jwt callback 调用本用例：
 * 行锁串行化同一刷新会话；当前 Secret 走轮换、前一 Secret 在 30 秒宽限内
 * 派生同一后继 Secret（并发安全、不重复递增计数）；宽限后重放或未知 Secret
 * 撤销会话、写审计并要求重新登录。
 */
import type { AuthenticatedActor } from "../domain/access";
import {
  ACCESS_WINDOW_SECONDS,
  REFRESH_GRACE_SECONDS,
  REFRESH_IDLE_DAYS,
  decideRefresh,
  deriveNextRefreshSecret,
} from "../domain/refresh-session";
import { buildActor } from "./login.use-case";
import { IdentityError } from "./errors";
import type { IdentityDeps } from "./ports";
import { AUTH_AUDIT_EVENTS } from "./ports";

export interface RefreshInput {
  refreshSessionId: string;
  refreshSecret: string;
  requestId?: string | null;
}

export interface RefreshSessionResult {
  actor: AuthenticatedActor;
  refreshSessionId: string;
  refreshSecret: string;
  accessExpiresAt: number;
}

export async function rotateRefreshSession(
  deps: IdentityDeps,
  input: RefreshInput,
): Promise<RefreshSessionResult> {
  if (!input.refreshSessionId || !input.refreshSecret) {
    throw new IdentityError("AUTH_REQUIRED", "会话已失效");
  }
  const presentedHash = deps.tokenHasher.sha256Hex(input.refreshSecret);
  const now = deps.clock.now();

  const outcome = await deps.tx.run(async (repos) => {
    const session = await repos.refreshSessions.lockById(input.refreshSessionId);
    if (!session) {
      return { kind: "invalid" as const };
    }
    const user = await repos.users.findById(session.userId);
    if (!user) {
      return { kind: "invalid" as const };
    }

    const decision = decideRefresh({
      now,
      session,
      user: { status: user.status, authVersion: user.authVersion },
      presentedHash,
    });

    if (decision.kind === "rotate") {
      const nextSecret = deriveNextRefreshSecret(
        deps.hmac.derive,
        deps.pepper,
        input.refreshSecret,
        session.id,
        decision.targetCounter,
      );
      const nextHash = deps.tokenHasher.sha256Hex(nextSecret);
      const idleExpiresAt = new Date(
        Math.min(
          now.getTime() + REFRESH_IDLE_DAYS * 24 * 3600 * 1000,
          session.absoluteExpiresAt.getTime(),
        ),
      );
      await repos.refreshSessions.applyRotation(session.id, {
        currentTokenHash: nextHash,
        previousTokenHash: session.currentTokenHash,
        previousValidUntil: new Date(
          now.getTime() + REFRESH_GRACE_SECONDS * 1000,
        ),
        rotationCounter: decision.targetCounter,
        authVersion: user.authVersion,
        idleExpiresAt,
        lastUsedAt: now,
      });
      return {
        kind: "rotated" as const,
        actor: buildActor(user),
        refreshSecret: nextSecret,
      };
    }

    if (decision.kind === "grace") {
      // 并发请求携带前一 Secret：派生后必须与已存储的当前哈希一致（防御）。
      const derivedSecret = deriveNextRefreshSecret(
        deps.hmac.derive,
        deps.pepper,
        input.refreshSecret,
        session.id,
        session.rotationCounter,
      );
      if (
        deps.tokenHasher.sha256Hex(derivedSecret) !== session.currentTokenHash
      ) {
        await repos.refreshSessions.revoke(session.id, "reuse_detected", now);
        return { kind: "reuse" as const };
      }
      await repos.refreshSessions.touch(session.id, now);
      return {
        kind: "grace" as const,
        actor: buildActor(user),
        refreshSecret: derivedSecret,
      };
    }

    // reject：复用/未知 Secret 撤销并审计（AUTH-AC-011）；过期/版本变更仅失效。
    if (decision.reason === "reuse_detected") {
      await repos.refreshSessions.revoke(session.id, "reuse_detected", now);
      await repos.audit.append({
        actorUserId: session.userId,
        targetUserId: session.userId,
        eventType: AUTH_AUDIT_EVENTS.refreshReuseDetected,
        requestId: input.requestId ?? null,
        metadata: { refreshSessionId: session.id },
      });
    } else if (decision.reason === "auth_version_mismatch") {
      await repos.refreshSessions.revoke(
        session.id,
        "auth_version_changed",
        now,
      );
    } else if (
      decision.reason === "expired_idle" ||
      decision.reason === "expired_absolute"
    ) {
      await repos.refreshSessions.revoke(session.id, "expired", now);
    }
    return { kind: "invalid" as const };
  });

  if (outcome.kind === "reuse" || outcome.kind === "invalid") {
    throw new IdentityError("AUTH_REQUIRED", "会话已失效，请重新登录");
  }

  return {
    actor: outcome.actor,
    refreshSessionId: input.refreshSessionId,
    refreshSecret: outcome.refreshSecret,
    accessExpiresAt: now.getTime() + ACCESS_WINDOW_SECONDS * 1000,
  };
}
