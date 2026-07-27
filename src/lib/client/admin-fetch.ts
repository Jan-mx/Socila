"use client";

import { showError } from "./toast";

/**
 * admin 写操作专用 fetch 包装：与原生 fetch 同签名、返回同样的 Response，
 * 但在网络错误或 `!res.ok` 时自动弹出错误提示，避免各页 handler 各自静默吞错。
 *
 * 用法：把 admin 页面里 `await fetch(...)` 改成 `await adminFetch(...)` 即可，
 * 后续的 `if (res.ok) ...` 逻辑无需改动。
 */
export async function adminFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    showError("网络错误，请稍后重试");
    throw new Error("network_error");
  }

  if (!res.ok) {
    const body = await res
      .clone()
      .json()
      .catch(() => null);
    showError(body?.error || `操作失败（${res.status}）`);
  }

  return res;
}
