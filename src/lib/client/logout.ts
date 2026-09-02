/**
 * 登出客户端流程（09-02 AUTH-NFR-005）。
 *
 * 两步撤销：先调用 /api/auth/logout 撤销数据库刷新会话并写审计，
 * 再走 NextAuth signout 端点清除加密 Cookie。第二步失败不阻塞本地登出。
 */
"use client";

import { signOut } from "next-auth/react";

export async function logoutAndClearSession(options?: {
  redirectTo?: string;
}): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // 数据库撤销失败时仍继续清除本地会话
  }
  await signOut({ redirectTo: options?.redirectTo ?? "/", redirect: true });
}
