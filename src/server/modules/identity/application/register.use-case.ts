/**
 * 公开注册用例（09-02 AUTH-FR-001，AUTH-AC-002/003）。
 *
 * 角色固定为 user、状态固定为 active——调用方无法注入任何特权字段；
 * 并发同名规范化注册依赖唯一索引，冲突统一映射 409 USERNAME_TAKEN。
 */
import {
  validatePassword,
} from "../domain/password";
import { validateUsername } from "../domain/username";
import { IdentityError, isUniqueViolationError } from "./errors";
import type { IdentityDeps, UserRecord } from "./ports";
import { AUTH_AUDIT_EVENTS } from "./ports";

export interface RegisterInput {
  username: string;
  password: string;
  requestId?: string | null;
}

export async function registerUser(
  deps: IdentityDeps,
  input: RegisterInput,
): Promise<UserRecord> {
  const usernameCheck = validateUsername(input.username);
  if (!usernameCheck.ok) {
    throw new IdentityError("INVALID_INPUT", "用户名不符合要求");
  }
  const passwordCheck = validatePassword(input.password);
  if (!passwordCheck.ok) {
    throw new IdentityError("INVALID_INPUT", "密码不符合要求");
  }

  const passwordHash = await deps.hasher.hash(input.password);

  const created = await deps.tx.run(async (repos) => {
    const existing = await repos.users.findByNormalizedUsername(
      usernameCheck.normalized,
    );
    if (existing) {
      throw new IdentityError("USERNAME_TAKEN", "用户名已被占用");
    }
    try {
      const user = await repos.users.createUser({
        username: usernameCheck.username,
        normalizedUsername: usernameCheck.normalized,
        passwordHash,
        role: "user",
        status: "active",
      });
      await repos.audit.append({
        actorUserId: user.id,
        targetUserId: user.id,
        eventType: AUTH_AUDIT_EVENTS.userRegistered,
        requestId: input.requestId ?? null,
        metadata: { role: user.role, status: user.status },
      });
      return user;
    } catch (err) {
      if (isUniqueViolationError(err)) {
        throw new IdentityError("USERNAME_TAKEN", "用户名已被占用");
      }
      throw err;
    }
  });

  return created;
}
