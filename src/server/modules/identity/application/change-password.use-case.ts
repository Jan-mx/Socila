/**
 * 本人改密用例（09-02 AUTH-FR-007，§7.5）。
 *
 * 普通改密与强制改密都必须提供当前/临时密码；成功后清除强制改密状态、
 * 递增 authVersion、撤销全部刷新会话（含当前会话）并写审计；
 * 客户端随后必须重新登录（Cookie 由调用方清除）。
 */
import { validatePassword } from "../domain/password";
import { IdentityError } from "./errors";
import type { IdentityDeps } from "./ports";
import { AUTH_AUDIT_EVENTS } from "./ports";

export interface ChangePasswordInput {
  actorUserId: string;
  currentPassword: string;
  newPassword: string;
  requestId?: string | null;
}

export async function changeOwnPassword(
  deps: IdentityDeps,
  input: ChangePasswordInput,
): Promise<void> {
  const passwordCheck = validatePassword(input.newPassword);
  if (!passwordCheck.ok) {
    throw new IdentityError("INVALID_INPUT", "新密码不符合要求");
  }

  await deps.tx.run(async (repos) => {
    const user = await repos.users.lockById(input.actorUserId);
    if (!user) {
      throw new IdentityError("AUTH_REQUIRED", "需要重新登录");
    }
    const currentValid = await deps.hasher.compare(
      input.currentPassword,
      user.passwordHash,
    );
    if (!currentValid) {
      throw new IdentityError("INVALID_CREDENTIALS", "当前密码不正确");
    }

    const now = deps.clock.now();
    const nextAuthVersion = user.authVersion + 1;
    await repos.users.update(user.id, {
      passwordHash: await deps.hasher.hash(input.newPassword),
      mustChangePassword: false,
      temporaryPasswordExpiresAt: null,
      authVersion: nextAuthVersion,
    });
    const revoked = await repos.refreshSessions.revokeAllForUser(
      user.id,
      "password_changed",
      now,
    );
    await repos.audit.append({
      actorUserId: user.id,
      targetUserId: user.id,
      eventType: AUTH_AUDIT_EVENTS.passwordChanged,
      requestId: input.requestId ?? null,
      metadata: { authVersion: nextAuthVersion, revokedSessions: revoked },
    });
  });
}
