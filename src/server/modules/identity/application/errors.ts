/**
 * identity 稳定错误（09-02 §9.4）：HTTP 状态与错误码契约固定，
 * Route Handler 不得自行改写。敏感资源统一使用不可枚举语义。
 */

export type IdentityErrorCode =
  | "INVALID_INPUT"
  | "AUTH_REQUIRED"
  | "INVALID_CREDENTIALS"
  | "FORBIDDEN"
  | "PASSWORD_CHANGE_REQUIRED"
  | "RESOURCE_NOT_FOUND"
  | "USERNAME_TAKEN"
  | "LAST_ADMIN_REQUIRED"
  | "RATE_LIMITED"
  | "AUTH_STORE_UNAVAILABLE";

const STATUS_BY_CODE: Record<IdentityErrorCode, number> = {
  INVALID_INPUT: 400,
  AUTH_REQUIRED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  PASSWORD_CHANGE_REQUIRED: 403,
  RESOURCE_NOT_FOUND: 404,
  USERNAME_TAKEN: 409,
  LAST_ADMIN_REQUIRED: 409,
  RATE_LIMITED: 429,
  AUTH_STORE_UNAVAILABLE: 503,
};

export class IdentityError extends Error {
  readonly code: IdentityErrorCode;
  readonly status: number;

  constructor(code: IdentityErrorCode, message?: string) {
    super(message ?? code);
    this.name = "IdentityError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
  }
}

/** PostgreSQL unique_violation 判定（并发注册幂等映射 409）。
 * drizzle/驱动可能把pg原生错误（含code 23505）包装在cause链中：
 * 递归检查顶层与cause链（2026-09-09真实并发环境暴露）。 */
export function isUniqueViolationError(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 8 && current !== null && typeof current === "object"; depth++) {
    if ((current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
