/**
 * 路由错误映射（CORE-AC-005 / PRD §11）：数据库不可用返回稳定 503，
 * 其他意外错误保持 500；日志只含操作名与错误消息，不含连接串/密钥/环境变量值。
 * 响应体沿用既有 `{ error }` 兼容形态（§9：已登记错误状态之外不改公开契约）。
 */
import { randomUUID } from "node:crypto";

const PG_CONNECT_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "08001", // SQLCLIENT_UNABLE_TO_ESTABLISH_SQLCONNECTION
  "08006", // CONNECTION_FAILURE
  "57P01", // admin_shutdown
  "57P03", // cannot_connect_now
]);

export function isDatabaseUnavailableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  if (code && PG_CONNECT_CODES.has(code)) return true;
  const cause = (err as { cause?: unknown }).cause;
  const causeCode =
    cause && typeof cause === "object"
      ? (cause as { code?: string }).code
      : undefined;
  if (causeCode && PG_CONNECT_CODES.has(causeCode)) return true;
  return /connection terminated|pool is ended|no connection available/i.test(
    err instanceof Error ? err.message : String(err),
  );
}

/** 返回映射后的状态与兼容错误体；同时输出不含敏感信息的结构化日志。 */
export function mapRouteError(
  err: unknown,
  context: { operation: string; requestId?: string },
): { status: 500 | 503; body: { error: string; requestId?: string } } {
  const requestId = context.requestId ?? randomUUID();
  const message = err instanceof Error ? err.message : String(err);
  // 日志不含环境变量值、连接串或密钥——仅操作名、requestId 与错误消息本身。
  console.error(
    `[route-error] op=${context.operation} requestId=${requestId} dbUnavailable=${isDatabaseUnavailableError(err)} msg=${message}`,
  );
  if (isDatabaseUnavailableError(err)) {
    return {
      status: 503,
      body: { error: "服务暂时不可用，请稍后重试", requestId },
    };
  }
  return { status: 500, body: { error: "服务器内部错误", requestId } };
}
