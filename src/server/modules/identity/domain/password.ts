/**
 * 密码规则（09-02 §10.2）：UTF-8 字节长度 12-72，不强制组合规则。
 * bcrypt cost 12 会静默截断超 72 字节的输入，因此必须在哈希前拒绝（不得截断后继续处理）。
 */

export const PASSWORD_MIN_BYTES = 12;
export const PASSWORD_MAX_BYTES = 72;

export type PasswordInvalidReason = "empty" | "too_short" | "too_long";

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
  return { ok: true };
}
