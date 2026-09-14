/**
 * 同源 Origin/CSRF 边界（09-02 AUTH-NFR-004）。
 *
 * 自定义写路由（注册、改密、登出、管理写）在解析请求体之前校验：
 * - 必须携带 Origin 且与请求 Host 一致（反向代理后与 x-forwarded-host 一致）；
 * - 只接受 application/json（拒绝表单/多部分提交跨站触发）。
 * NextAuth Credentials 自身继续使用框架 CSRF 保护。
 */

export function isSameOriginRequest(request: Request, baseUrl?: string): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    // 非浏览器客户端（无 Origin）：同源策略不适用，交由后续鉴权
    return true;
  }
  let originHost: string | null;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  if (!originHost) return false;

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const target = forwardedHost.split(",")[0]?.trim() ?? "";
    if (target === originHost) return true;
    // 默认端口差异（443 vs 无端口）下退化为 hostname 比较
    try {
      return (
        new URL(`http://${target}`).hostname ===
        new URL(`http://${originHost}`).hostname
      );
    } catch {
      return false;
    }
  }

  if (baseUrl) {
    try {
      return new URL(baseUrl).host === originHost;
    } catch {
      // fallthrough to request URL
    }
  }
  try {
    return new URL(request.url).host === originHost;
  } catch {
    return false;
  }
}

export function isJsonContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.split(";")[0]?.trim().toLowerCase() === "application/json";
}

/** 注册/改密/管理写路由的统一前置检查；返回违规时的稳定错误码。 */
export function checkWriteRequestContract(
  request: Request,
  baseUrl?: string,
): "INVALID_INPUT" | "FORBIDDEN" | null {
  if (!isJsonContentType(request)) {
    return "INVALID_INPUT";
  }
  if (!isSameOriginRequest(request, baseUrl)) {
    return "FORBIDDEN";
  }
  return null;
}
