/**
 * 阶段01.4 API 基础契约（FND-FR-004～007）。
 *
 * Zod 是运行时校验源；约定全文见 memory-bank/architecture.md「跨服务API契约约定」。
 * 本模块保持框架无关（不导入 next/server）：Route Handler 只做协议适配，
 * 领域与用例层可直接复用这些类型。
 *
 * 阶段01只固定约定，不迁移存量路由——存量 `{ error }` 形态在阶段02模块化时替换。
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";

/** 稳定业务错误码 → HTTP 状态固定映射（PRD 6.3 要求覆盖的 10 个状态）。 */
export const API_ERROR_CODES = [
  "BAD_REQUEST", // 400
  "UNAUTHORIZED", // 401
  "FORBIDDEN", // 403
  "NOT_FOUND", // 404
  "CONFLICT", // 409
  "PAYLOAD_TOO_LARGE", // 413
  "VALIDATION_FAILED", // 422
  "RATE_LIMITED", // 429
  "INTERNAL_ERROR", // 500
  "SERVICE_UNAVAILABLE", // 503
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  VALIDATION_FAILED: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

/** 统一错误体。code 为稳定业务码（客户端可编程处理），message 为人类可读文案。 */
export const ApiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  requestId: z.string().min(1),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** 角色与来源：与 design-document 三类角色（用户/管理员/Agent服务身份）对齐。 */
export const RequestRoleSchema = z.enum(["user", "admin", "agent"]);
export const RequestSourceSchema = z.enum(["web", "service", "agent"]);

export const RequestContextSchema = z.object({
  requestId: z.string().min(1),
  actorId: z.string().min(1).optional(),
  role: RequestRoleSchema.optional(),
  sessionId: z.string().min(1).optional(),
  source: RequestSourceSchema,
});
export type RequestContext = z.infer<typeof RequestContextSchema>;

/** 幂等元数据：写接口以 Idempotency-Key 头声明，重复语义见下。 */
export const IdempotencyMetadataSchema = z.object({
  key: z.string().min(1),
  operation: z.string().min(1),
  createdAt: z.string(), // ISO-8601 UTC
});
export type IdempotencyMetadata = z.infer<typeof IdempotencyMetadataSchema>;

export const REQUEST_ID_HEADER = "X-Request-Id";
export const IDEMPOTENCY_HEADER = "Idempotency-Key";
export const SERVICE_NAME_HEADER = "X-Service-Name";

/**
 * 幂等重复请求语义（FND-AC-005）：相同幂等键的重复写请求，
 * 要么返回首次执行结果（等价成功），要么以 CONFLICT(409) 拒绝；
 * 禁止出现第三种结果（部分执行、重复副作用）。
 */
export const IDEMPOTENCY_SEMANTICS = "first-result-or-409" as const;

export function getRequestId(req: Request): string {
  return req.headers.get(REQUEST_ID_HEADER)?.trim() || randomUUID();
}

/** 写接口幂等键提取；无头则该请求未声明幂等语义（由用例层决定是否强制）。 */
export function extractIdempotencyKey(req: Request): string | null {
  const key = req.headers.get(IDEMPOTENCY_HEADER)?.trim();
  return key ? key : null;
}

/**
 * 从请求构建 RequestContext。actor/role/session 由调用方（auth 层）传入，
 * 头里只取 requestId——不接受客户端伪造身份。
 */
export function buildRequestContext(
  req: Request,
  identity: {
    source: RequestContext["source"];
    actorId?: string;
    role?: RequestContext["role"];
    sessionId?: string;
  },
): RequestContext {
  return {
    requestId: getRequestId(req),
    source: identity.source,
    actorId: identity.actorId,
    role: identity.role,
    sessionId: identity.sessionId,
  };
}

/** 构建统一错误体与对应状态码；输出始终通过 ApiErrorSchema 校验。 */
export function apiError(
  code: ApiErrorCode,
  message: string,
  requestId: string,
  details?: unknown,
): { status: number; body: ApiError } {
  const body: ApiError = ApiErrorSchema.parse({
    code,
    message,
    requestId,
    ...(details === undefined ? {} : { details }),
  });
  return { status: API_ERROR_STATUS[code], body };
}
