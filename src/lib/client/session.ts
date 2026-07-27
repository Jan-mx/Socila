/**
 * 客户端会话标识（兼容用途）。
 *
 * 服务端的权威匿名会话是 HttpOnly cookie `ssp-anon-session`（见
 * `src/lib/security/anon-session.ts`），由服务端在首个请求时下发，前端不可见、也无需感知。
 *
 * 这里的 localStorage `ssp-session-id` 仅作**向后兼容**：在 cookie 机制上线前创建的会话，
 * 其归属是按这个 legacy id 记录的。前端把它作为 `legacySessionId` 随请求带上，服务端
 * `ensureAnonymousSession(req, legacySessionId)` 在没有 cookie 时用它兜底，保证老用户的历史
 * 会话不丢。新会话一律以 cookie 为准。
 *
 * 之前这段逻辑在 `ChatPanel.tsx` 与 `ChatPageClient.tsx` 里各复制了一份，这里收敛为单一实现。
 */

const LEGACY_SESSION_KEY = "ssp-session-id";

/**
 * 读取（或惰性创建）客户端 legacy 会话 id。SSR 阶段返回空串。
 */
export function getLegacySessionId(): string {
  if (typeof window === "undefined") return "";

  let sid = localStorage.getItem(LEGACY_SESSION_KEY);
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem(LEGACY_SESSION_KEY, sid);
  }
  return sid;
}
