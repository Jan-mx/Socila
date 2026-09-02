/**
 * 登录后跳转规则（09-02 §9.1）：只接受同源相对 callback；
 * 拒绝绝对 URL、`//` 协议相对 URL 和反斜杠绕过。
 */

/** 合法 callback 返回原值；非法返回 null。 */
export function safeCallbackUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  return /^\/(?!\/|\\)/.test(raw) ? raw : null;
}
