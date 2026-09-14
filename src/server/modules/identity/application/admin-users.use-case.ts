/**
 * 管理员用户管理用例（09-02 AUTH-FR-008/009/010，§9.3，AUTH-AC-013/014/015）。
 *
 * 全部写操作先经 requireFreshAdmin 在数据库重新校验 actor 的 role、status
 * 与 authVersion（AUTH-NFR-005：不信任可能过期的 JWT 角色）；
 * 目标行与 admin 行在事务内锁定，用户状态变更、authVersion 递增、
 * 刷新会话撤销与审计同事务提交。管理员不可操作自己。
 */
import { normalizeUsername } from "../domain/username";
import {
  TEMP_PASSWORD_TTL_HOURS,
} from "../domain/refresh-session";
import {
  decideRoleChange,
  decideStatusChange,
  type UserRole,
  type UserStatus,
} from "../domain/roles";
import { IdentityError } from "./errors";
import type { IdentityDeps, UserRecord } from "./ports";
import { AUTH_AUDIT_EVENTS } from "./ports";

export interface AdminActorClaims {
  actorUserId: string;
  actorAuthVersion: number;
}

/** 数据库回读校验：存在、active、role=admin、authVersion 与声明一致（§12.1）。 */
export async function requireFreshAdmin(
  deps: IdentityDeps,
  claims: { userId: string; authVersion: number; role?: string },
): Promise<UserRecord> {
  const user = await deps.repos.users.findById(claims.userId);
  if (!user || user.status !== "active") {
    throw new IdentityError("AUTH_REQUIRED", "需要重新登录");
  }
  if (claims.role !== undefined && claims.role !== user.role) {
    throw new IdentityError("FORBIDDEN", "角色已变更");
  }
  if (user.role !== "admin") {
    throw new IdentityError("FORBIDDEN", "需要管理员权限");
  }
  if (user.authVersion !== claims.authVersion) {
    throw new IdentityError("AUTH_REQUIRED", "安全状态已变更，请重新登录");
  }
  return user;
}

export interface SanitizedUser {
  id: string;
  username: string;
  role: UserRole;
  status: UserStatus;
  authVersion: number;
  mustChangePassword: boolean;
  temporaryPasswordExpiresAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function sanitizeUser(user: UserRecord): SanitizedUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    status: user.status,
    authVersion: user.authVersion,
    mustChangePassword: user.mustChangePassword,
    temporaryPasswordExpiresAt: user.temporaryPasswordExpiresAt,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export interface AdminUserListQuery {
  q?: string;
  role?: UserRole;
  status?: UserStatus;
  cursor?: string;
  limit?: number;
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export async function listUsersForAdmin(
  deps: IdentityDeps,
  actor: AdminActorClaims,
  query: AdminUserListQuery,
): Promise<{ items: SanitizedUser[]; nextCursor: string | null }> {
  await requireFreshAdmin(deps, {
    userId: actor.actorUserId,
    authVersion: actor.actorAuthVersion,
    role: "admin",
  });

  const limit = Math.min(
    Math.max(Math.trunc(query.limit ?? DEFAULT_PAGE_SIZE), 1),
    MAX_PAGE_SIZE,
  );
  let cursorCreatedAt: Date | undefined;
  let cursorId: string | undefined;
  if (query.cursor) {
    const [createdAtRaw, idRaw] = query.cursor.split("|");
    const parsed = createdAtRaw ? new Date(createdAtRaw) : null;
    if (!parsed || Number.isNaN(parsed.getTime()) || !idRaw) {
      throw new IdentityError("INVALID_INPUT", "游标无效");
    }
    cursorCreatedAt = parsed;
    cursorId = idRaw;
  }

  const qNormalized = query.q ? normalizeUsername(query.q) : undefined;
  const page = await deps.repos.users.listUsers({
    qNormalized: qNormalized || undefined,
    role: query.role,
    status: query.status,
    cursorCreatedAt,
    cursorId,
    limit,
  });
  return {
    items: page.items.map(sanitizeUser),
    nextCursor: page.nextCursor,
  };
}

/** 公共前置：新鲜管理员校验 + 禁止自我操作。 */
async function requireAdminNotSelf(
  deps: IdentityDeps,
  actor: AdminActorClaims,
  targetUserId: string,
): Promise<UserRecord> {
  const freshActor = await requireFreshAdmin(deps, {
    userId: actor.actorUserId,
    authVersion: actor.actorAuthVersion,
    role: "admin",
  });
  if (targetUserId === freshActor.id) {
    // 管理员不能修改自己的 role/status，也不能通过重置接口重置自己（§8.1）
    throw new IdentityError("FORBIDDEN", "不能对本人执行该操作");
  }
  return freshActor;
}

/** 状态变更（AUTH-FR-008，AUTH-AC-013/014）。 */
export async function updateUserStatus(
  deps: IdentityDeps,
  actor: AdminActorClaims,
  targetUserId: string,
  nextStatus: UserStatus,
): Promise<UserRecord> {
  const freshActor = await requireAdminNotSelf(deps, actor, targetUserId);

  return deps.tx.run(async (repos) => {
    const target = await repos.users.lockById(targetUserId);
    if (!target) {
      throw new IdentityError("RESOURCE_NOT_FOUND", "用户不存在");
    }
    if (nextStatus !== target.status) {
      if (target.role === "admin" && target.status === "active") {
        const adminIds = await repos.users.lockActiveAdminIds();
        const decision = decideStatusChange(target, nextStatus, adminIds);
        if (!decision.ok) {
          throw new IdentityError("LAST_ADMIN_REQUIRED", "至少保留一个可用管理员");
        }
      }
      const now = deps.clock.now();
      const updated = await repos.users.update(target.id, {
        status: nextStatus,
        authVersion: target.authVersion + 1,
      });
      const revoked = await repos.refreshSessions.revokeAllForUser(
        target.id,
        "admin_action",
        now,
      );
      await repos.audit.append({
        actorUserId: freshActor.id,
        targetUserId: target.id,
        eventType: AUTH_AUDIT_EVENTS.userStatusChanged,
        metadata: { from: target.status, to: nextStatus, revokedSessions: revoked },
      });
      return updated;
    }
    return target;
  });
}

/** 角色变更（AUTH-FR-009，仅 active 账号）。 */
export async function updateUserRole(
  deps: IdentityDeps,
  actor: AdminActorClaims,
  targetUserId: string,
  nextRole: UserRole,
): Promise<UserRecord> {
  const freshActor = await requireAdminNotSelf(deps, actor, targetUserId);

  return deps.tx.run(async (repos) => {
    const target = await repos.users.lockById(targetUserId);
    if (!target) {
      throw new IdentityError("RESOURCE_NOT_FOUND", "用户不存在");
    }
    if (target.status !== "active") {
      throw new IdentityError("FORBIDDEN", "仅可变更active账号的角色");
    }
    if (nextRole !== target.role) {
      const adminIds = await repos.users.lockActiveAdminIds();
      const decision = decideRoleChange(target, nextRole, adminIds);
      if (!decision.ok) {
        throw new IdentityError("LAST_ADMIN_REQUIRED", "至少保留一个可用管理员");
      }
      const now = deps.clock.now();
      const updated = await repos.users.update(target.id, {
        role: nextRole,
        authVersion: target.authVersion + 1,
      });
      const revoked = await repos.refreshSessions.revokeAllForUser(
        target.id,
        "admin_action",
        now,
      );
      await repos.audit.append({
        actorUserId: freshActor.id,
        targetUserId: target.id,
        eventType: AUTH_AUDIT_EVENTS.userRoleChanged,
        metadata: { from: target.role, to: nextRole, revokedSessions: revoked },
      });
      return updated;
    }
    return target;
  });
}

export interface ResetPasswordResult {
  /** 明文临时密码：只在响应中展示一次（AUTH-AC-015）。 */
  temporaryPassword: string;
  expiresAt: Date;
}

/** 临时密码重置（AUTH-FR-010，AUTH-AC-015）。 */
export async function resetUserPassword(
  deps: IdentityDeps,
  actor: AdminActorClaims,
  targetUserId: string,
): Promise<ResetPasswordResult> {
  const freshActor = await requireAdminNotSelf(deps, actor, targetUserId);

  const temporaryPassword = deps.random.temporaryPassword();
  const passwordHash = await deps.hasher.hash(temporaryPassword);
  const now = deps.clock.now();
  const expiresAt = new Date(
    now.getTime() + TEMP_PASSWORD_TTL_HOURS * 3600 * 1000,
  );

  return deps.tx.run(async (repos) => {
    const target = await repos.users.lockById(targetUserId);
    if (!target) {
      throw new IdentityError("RESOURCE_NOT_FOUND", "用户不存在");
    }
    const updated = await repos.users.update(target.id, {
      passwordHash,
      mustChangePassword: true,
      temporaryPasswordExpiresAt: expiresAt,
      authVersion: target.authVersion + 1,
    });
    const revoked = await repos.refreshSessions.revokeAllForUser(
      target.id,
      "admin_action",
      now,
    );
    // 审计 metadata 不得包含明文或哈希（AUTH-NFR-001）
    await repos.audit.append({
      actorUserId: freshActor.id,
      targetUserId: target.id,
      eventType: AUTH_AUDIT_EVENTS.passwordResetByAdmin,
      metadata: { revokedSessions: revoked },
    });
    return updated;
  }).then(() => ({ temporaryPassword, expiresAt }));
}
