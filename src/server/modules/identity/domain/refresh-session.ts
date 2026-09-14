/**
 * 刷新会话领域规则（09-02 §7.2/§7.3，AUTH-FR-004，ADR-0007）。
 *
 * 纯决策函数：不触库、不做 IO。Secret 原文从不入域——只处理其 SHA-256 哈希，
 * 以及经注入 HMAC 端口的确定性后继派生：
 *   nextSecret = HMAC-SHA256(pepper, presentedSecret + "." + refreshSessionId + "." + targetCounter)
 * 轮换路径 targetCounter = rotationCounter + 1（presented = 当前 Secret）；
 * 30 秒宽限路径 targetCounter = rotationCounter（presented = 前一 Secret），
 * 两路径对同一合法输入派生同一后继 Secret（AUTH-AC-010）。
 */

export const ACCESS_WINDOW_SECONDS = 15 * 60; // 15 分钟授权声明
export const REFRESH_GRACE_SECONDS = 30; // 前一哈希宽限
export const REFRESH_IDLE_DAYS = 7; // 闲置失效
export const REFRESH_ABSOLUTE_DAYS = 30; // 绝对失效
export const TEMP_PASSWORD_TTL_HOURS = 24; // 临时密码有效期

export type HmacDeriveFn = (key: string, message: string) => string;

export function deriveNextRefreshSecret(
  hmac: HmacDeriveFn,
  pepper: string,
  presentedSecret: string,
  refreshSessionId: string,
  targetCounter: number,
): string {
  return hmac(pepper, `${presentedSecret}.${refreshSessionId}.${targetCounter}`);
}

export interface RefreshSessionState {
  currentTokenHash: string;
  previousTokenHash: string | null;
  previousValidUntil: Date | null;
  rotationCounter: number;
  authVersion: number;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt: Date | null;
}

export type RefreshRejectReason =
  | "revoked"
  | "expired_idle"
  | "expired_absolute"
  | "auth_version_mismatch"
  | "user_disabled"
  | "reuse_detected";

export type RefreshDecision =
  | { kind: "rotate"; targetCounter: number }
  | { kind: "grace" }
  | { kind: "reject"; reason: RefreshRejectReason };

export function decideRefresh(input: {
  now: Date;
  session: RefreshSessionState;
  user: { status: "active" | "disabled"; authVersion: number };
  presentedHash: string;
}): RefreshDecision {
  const { now, session, user, presentedHash } = input;

  if (session.revokedAt) {
    return { kind: "reject", reason: "revoked" };
  }
  if (now.getTime() > session.absoluteExpiresAt.getTime()) {
    return { kind: "reject", reason: "expired_absolute" };
  }
  if (now.getTime() > session.idleExpiresAt.getTime()) {
    return { kind: "reject", reason: "expired_idle" };
  }
  if (user.status !== "active") {
    return { kind: "reject", reason: "user_disabled" };
  }
  if (user.authVersion !== session.authVersion) {
    return { kind: "reject", reason: "auth_version_mismatch" };
  }
  if (presentedHash === session.currentTokenHash) {
    return { kind: "rotate", targetCounter: session.rotationCounter + 1 };
  }
  if (
    session.previousTokenHash !== null &&
    presentedHash === session.previousTokenHash
  ) {
    const withinGrace =
      session.previousValidUntil !== null &&
      now.getTime() <= session.previousValidUntil.getTime();
    return withinGrace
      ? { kind: "grace" }
      : { kind: "reject", reason: "reuse_detected" };
  }
  // 当前与前一哈希都不匹配：未知 Secret，按复用处理（§7.3）
  return { kind: "reject", reason: "reuse_detected" };
}
