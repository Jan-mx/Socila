/**
 * 用户名规则（09-02 §10.1，AUTH-FR-001）。
 *
 * 规范化：trim + NFKC + lowercase；展示名保留 NFKC 后的原始大小写。
 * 唯一性由规范化形承担；保留名仅约束公开注册（引导脚本绕过）。
 */

export const RESERVED_USERNAMES = [
  "admin",
  "administrator",
  "system",
  "root",
  "support",
] as const;

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;

export type UsernameInvalidReason =
  | "empty"
  | "length"
  | "charset"
  | "reserved";

export type UsernameValidation =
  | { ok: true; username: string; normalized: string }
  | { ok: false; reason: UsernameInvalidReason };

/** trim + NFKC + lowercase（PRD §10.1）。 */
export function normalizeUsername(raw: string): string {
  return raw.trim().normalize("NFKC").toLowerCase();
}

/** 展示名：trim + NFKC，保留大小写；规范化形在其基础上 lowercase。 */
export function validateUsername(raw: string): UsernameValidation {
  if (typeof raw !== "string") {
    return { ok: false, reason: "empty" };
  }
  const display = raw.trim().normalize("NFKC");
  const normalized = display.toLowerCase();

  if (normalized.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (
    normalized.length < USERNAME_MIN_LENGTH ||
    normalized.length > USERNAME_MAX_LENGTH
  ) {
    return { ok: false, reason: "length" };
  }
  // 规范化后只允许 ASCII 字母、数字、_、-
  if (!/^[a-z0-9_-]+$/.test(normalized)) {
    return { ok: false, reason: "charset" };
  }
  if ((RESERVED_USERNAMES as readonly string[]).includes(normalized)) {
    return { ok: false, reason: "reserved" };
  }
  return { ok: true, username: display, normalized };
}
