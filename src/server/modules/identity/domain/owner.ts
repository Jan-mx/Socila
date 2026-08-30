/**
 * 身份与资源所有权（CORE-FR-009）——纯领域模型。
 *
 * OwnerKey：认证用户优先（owner_user_id），否则匿名会话（session_id）。
 * 资源行的归属以 (owner_user_id, session_id) 表示：
 * - ownerUserId 非空：仅当 OwnerKey 为同一用户 id 时授权；
 * - ownerUserId 为空且 sessionId 非空：仅当 OwnerKey 为同一 session 时授权；
 * - 两者皆空：遗留数据，按各资源的遗留语义处理（plans 不限制、conversations 拒绝）。
 */

export interface OwnerIdentity {
  /** 认证用户 id（NextAuth 数据库用户）；匿名会话时为空。 */
  userId?: string | null;
  /** 匿名会话 id（Cookie 会话）。 */
  sessionId?: string | null;
}

export type OwnerKey = { kind: "user"; id: string } | { kind: "session"; id: string };

/** 由调用方身份解析 OwnerKey：认证用户优先，其次匿名会话。两者皆空 = 无身份。 */
export function resolveOwnerKey(identity: OwnerIdentity): OwnerKey | null {
  if (identity.userId) return { kind: "user", id: identity.userId };
  if (identity.sessionId) return { kind: "session", id: identity.sessionId };
  return null;
}

export interface OwnedResource {
  ownerUserId?: string | null;
  sessionId?: string | null;
}

export type OwnershipDecision =
  | { decision: "granted" }
  | { decision: "forbidden" }
  /** 遗留数据（归属列为空）：由调用方按资源语义决定放行或拒绝。 */
  | { decision: "legacy-unowned" };

export function decideOwnership(
  resource: OwnedResource,
  ownerKey: OwnerKey | null,
): OwnershipDecision {
  if (resource.ownerUserId) {
    if (ownerKey?.kind === "user" && ownerKey.id === resource.ownerUserId) {
      return { decision: "granted" };
    }
    return { decision: "forbidden" };
  }
  if (resource.sessionId) {
    if (ownerKey?.kind === "session" && ownerKey.id === resource.sessionId) {
      return { decision: "granted" };
    }
    return { decision: "forbidden" };
  }
  return { decision: "legacy-unowned" };
}
