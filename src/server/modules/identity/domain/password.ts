/**
 * 密码规则（09-02 §10.2，2026-09-03 PRD修订）：UTF-8 字节长度 8-72，
 * 必须同时包含至少一个字母（不区分大小写）和一个数字；不强制大小写或特殊字符组合。
 * bcrypt cost 12 会静默截断超 72 字节的输入，因此必须在哈希前拒绝（不得截断后继续处理）。
 */

export const PASSWORD_MIN_BYTES = 8;
export const PASSWORD_MAX_BYTES = 72;

export type PasswordInvalidReason =
  | "empty"
  | "too_short"
  | "too_long"
  | "weak_composition";

export type PasswordValidation =
  | { ok: true }
  | { ok: false; reason: PasswordInvalidReason };

export function validatePassword(password: string): PasswordValidation {
  if (typeof password !== "string" || password.length === 0) {
    return { ok: false, reason: "empty" };
  }
  const bytes = Buffer.byteLength(password, "utf8");
  if (bytes < PASSWORD_MIN_BYTES) {
    return { ok: false, reason: "too_short" };
  }
  if (bytes > PASSWORD_MAX_BYTES) {
    return { ok: false, reason: "too_long" };
  }
  // 组合规则：至少一个字母（不区分大小写）+ 一个数字
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return { ok: false, reason: "weak_composition" };
  }
  return { ok: true };
}
