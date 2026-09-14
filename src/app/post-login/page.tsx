/**
 * 登录后落点页（09-02 §9.1，AUTH-AC-004/005）。
 *
 * 登录动作本身在 /login 服务端动作中完成；本页在全新 GET 请求中读取会话，
 * 按固定双角色与合法 callback 决定最终跳转：
 * - 强制改密会话 → /account/security；
 * - 普通用户携带 admin callback → /chat?error=forbidden；
 * - 无 callback 时 admin → /admin，user → /chat。
 */
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { safeCallbackUrl } from "@/lib/auth/callback-url";

interface PostLoginPageProps {
  searchParams: Promise<{ cb?: string }>;
}

export const dynamic = "force-dynamic";

export default async function PostLoginPage({ searchParams }: PostLoginPageProps) {
  const { cb } = await searchParams;
  const session = await auth();
  const user = session?.user;
  if (!user?.userId) {
    redirect("/login");
  }
  if (user.mustChangePassword) {
    redirect("/account/security");
  }

  const callbackUrl = safeCallbackUrl(cb);
  if (callbackUrl) {
    if (callbackUrl === "/admin" || callbackUrl.startsWith("/admin/")) {
      if (user.role !== "admin") {
        redirect("/chat?error=forbidden");
      }
    }
    redirect(callbackUrl);
  }

  redirect(user.role === "admin" ? "/admin" : "/chat");
}
