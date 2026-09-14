/**
 * 固定双角色与状态（09-02 §2/§7.4，AUTH-FR-003/009）。
 *
 * 系统只存在 user/admin 两个角色与 active/disabled 两种状态；
 * 不建立角色表、权限表或动态权限。最后管理员规则在事务内锁定 admin 行后判定。
 */

export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ["active", "disabled"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" && (USER_ROLES as readonly string[]).includes(value)
  );
}

export function isUserStatus(value: unknown): value is UserStatus {
  return (
    typeof value === "string" &&
    (USER_STATUSES as readonly string[]).includes(value)
  );
}

export function isActiveAdmin(user: {
  role: UserRole;
  status: UserStatus;
}): boolean {
  return user.role === "admin" && user.status === "active";
}

export type LastAdminDecision =
  | { ok: true }
  | { ok: false; code: "LAST_ADMIN_REQUIRED" };

/**
 * 状态变更判定：禁用一个 active admin 不得使 active admin 数量归零（AUTH-AC-014）。
 * activeAdminIds 必须在锁定 admin 行的事务内取得。
 */
export function decideStatusChange(
  target: { role: UserRole; status: UserStatus },
  next: UserStatus,
  activeAdminIds: readonly string[],
): LastAdminDecision {
  if (next === "disabled" && isActiveAdmin(target) && activeAdminIds.length <= 1) {
    return { ok: false, code: "LAST_ADMIN_REQUIRED" };
  }
  return { ok: true };
}

/** 角色变更判定：降级 active admin 受最后管理员约束。 */
export function decideRoleChange(
  target: { role: UserRole; status: UserStatus },
  next: UserRole,
  activeAdminIds: readonly string[],
): LastAdminDecision {
  if (
    next === "user" &&
    target.role === "admin" &&
    activeAdminIds.length <= 1
  ) {
    // 仅当目标当前是 active admin 时受限
    if (target.status === "active") {
      return { ok: false, code: "LAST_ADMIN_REQUIRED" };
    }
  }
  return { ok: true };
}
