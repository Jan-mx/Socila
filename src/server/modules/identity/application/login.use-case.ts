/**
 * 统一登录用例（09-02 AUTH-FR-002，AUTH-AC-004；§7.5 强制改密状态）。
 *
 * user/admin 共用入口；账号状态、角色和密码校验全部由数据库事实决定。
 * 抗枚举（AUTH-NFR-002）：未知用户名也执行 dummy bcrypt 比较，失败统一
 * INVALID_CREDENTIALS，不暴露具体原因。登录成功在同一事务中创建刷新会话
 * 并更新 last_login_at。
 */
import { validateUsername } from "../domain/username";
import {
  ACCESS_WINDOW_SECONDS,
  REFRESH_ABSOLUTE_DAYS,
  REFRESH_IDLE_DAYS,
} from "../domain/refresh-session";
import type { AuthenticatedActor } from "../domain/access";
import { IdentityError } from "./errors";
import type { IdentityDeps, UserRecord } from "./ports";

export interface LoginInput {
  username: string;
  password: string;
  requestId?: string | null;
}

export interface LoginSessionResult {
  actor: AuthenticatedActor;
  refreshSessionId: string;
  refreshSecret: string;
  /** 授权声明到期时间（epoch ms）：now + 15 分钟。 */
  accessExpiresAt: number;
}

export function buildActor(user: UserRecord): AuthenticatedActor {
  return {
    userId: user.id,
    username: user.username,
    role: user.role,
    authVersion: user.authVersion,
    mustChangePassword: user.mustChangePassword,
  };
}

export async function startLoginSession(
  deps: IdentityDeps,
  input: LoginInput,
): Promise<LoginSessionResult> {
  const normalized = validateUsername(input.username);
  const user = normalized.ok
    ? await deps.repos.users.findByNormalizedUsername(normalized.normalized)
    : null;

  if (!user) {
    // 抗枚举：未知用户名同样执行一次 bcrypt 比较（AUTH-NFR-002）。
    await deps.hasher.compare(input.password, deps.hasher.dummyHash());
    throw new IdentityError("INVALID_CREDENTIALS");
  }

  const passwordValid = await deps.hasher.compare(
    input.password,
    user.passwordHash,
  );
  if (
    !passwordValid ||
    user.status !== "active" ||
    // 临时密码过期后不得登录，必须由管理员重新重置（§7.5）。
    (user.mustChangePassword &&
      user.temporaryPasswordExpiresAt !== null &&
      deps.clock.now().getTime() > user.temporaryPasswordExpiresAt.getTime())
  ) {
    throw new IdentityError("INVALID_CREDENTIALS");
  }

  const now = deps.clock.now();
  const refreshSecret = deps.random.refreshSecret();
  const result = await deps.tx.run(async (repos) => {
    await repos.users.update(user.id, { lastLoginAt: now });
    const session = await repos.refreshSessions.create({
      userId: user.id,
      tokenHash: deps.tokenHasher.sha256Hex(refreshSecret),
      authVersion: user.authVersion,
      idleExpiresAt: new Date(
        now.getTime() + REFRESH_IDLE_DAYS * 24 * 3600 * 1000,
      ),
      absoluteExpiresAt: new Date(
        now.getTime() + REFRESH_ABSOLUTE_DAYS * 24 * 3600 * 1000,
      ),
    });
    return { refreshSessionId: session.id };
  });

  return {
    actor: buildActor(user),
    refreshSessionId: result.refreshSessionId,
    refreshSecret,
    accessExpiresAt: now.getTime() + ACCESS_WINDOW_SECONDS * 1000,
  };
}
