/**
 * 登出撤销用例（09-02 AUTH-NFR-005）。
 *
 * 只撤销调用者本人的当前刷新会话并写审计；路由层随后清除 NextAuth Cookie。
 */
import { IdentityError } from "./errors";
import type { IdentityDeps } from "./ports";
import { AUTH_AUDIT_EVENTS } from "./ports";

export interface LogoutInput {
  userId: string;
  refreshSessionId: string | null;
  requestId?: string | null;
}

export async function revokeCurrentRefreshSession(
  deps: IdentityDeps,
  input: LogoutInput,
): Promise<void> {
  if (!input.refreshSessionId) {
    return; // 无刷新声明（旧 Cookie 形态）时无需撤销
  }
  const refreshSessionId: string = input.refreshSessionId;
  await deps.tx.run(async (repos) => {
    const session = await repos.refreshSessions.lockById(refreshSessionId);
    if (!session) {
      return;
    }
    if (session.userId !== input.userId) {
      throw new IdentityError("FORBIDDEN", "无权操作该会话");
    }
    if (!session.revokedAt) {
      const now = deps.clock.now();
      await repos.refreshSessions.revoke(session.id, "logout", now);
      await repos.audit.append({
        actorUserId: input.userId,
        targetUserId: input.userId,
        eventType: AUTH_AUDIT_EVENTS.sessionsRevoked,
        requestId: input.requestId ?? null,
        metadata: { reason: "logout", refreshSessionId: session.id },
      });
    }
  });
}
