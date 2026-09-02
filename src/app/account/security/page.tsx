/**
 * 账号安全页（09-02 §9.1/§7.5，AUTH-FR-007，AUTH-US-005，AUTH-AC-016）。
 *
 * 本人改密入口，也是强制改密会话唯一可用页面；成功后 204 →
 * 全部刷新会话已撤销 → 前端登出并跳转登录页用新密码重新登录。
 */
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

type ChangeError =
  | "INVALID_INPUT"
  | "AUTH_REQUIRED"
  | "INVALID_CREDENTIALS"
  | "AUTH_STORE_UNAVAILABLE"
  | "NETWORK";

const ERROR_MESSAGES: Record<ChangeError, string> = {
  INVALID_INPUT: "新密码至少 12 个字符（不超过 72 个字符）。",
  AUTH_REQUIRED: "登录状态已失效，请重新登录。",
  INVALID_CREDENTIALS: "当前密码不正确。",
  AUTH_STORE_UNAVAILABLE: "服务暂时不可用，请稍后重试。",
  NETWORK: "网络异常，请稍后重试。",
};

export default function AccountSecurityPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<ChangeError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const mustChangePassword =
    session?.user?.mustChangePassword === true;
  const username = session?.user?.username;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError("INVALID_INPUT");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.status === 204) {
        // 改密成功：全部会话已撤销，用新密码重新登录
        await signOut({ redirect: false });
        router.push("/login?changed=1");
        return;
      }
      if (res.status === 400) setError("INVALID_INPUT");
      else if (res.status === 401) setError("AUTH_REQUIRED");
      else if (res.status === 403) setError("INVALID_CREDENTIALS");
      else if (res.status === 503) setError("AUTH_STORE_UNAVAILABLE");
      else setError("NETWORK");
    } catch {
      setError("NETWORK");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // 撤销失败也继续本地登出
    }
    await signOut({ redirectTo: "/login" });
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        正在加载…
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-12">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-1/4 h-72 w-72 rounded-[2.5rem] bg-primary/10" />
        <div className="absolute -right-16 bottom-8 h-80 w-80 rounded-[2.5rem] bg-cta/10" />
      </div>

      <div className="relative z-10 w-full max-w-lg">
        <div className="mb-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary/80">
            账号安全
          </p>
          <h1 className="mt-4 font-display text-4xl font-bold text-foreground">
            修改密码
          </h1>
          {username && (
            <p className="mt-3 text-base text-muted-foreground">
              当前账号：{username}
            </p>
          )}
        </div>

        {mustChangePassword && (
          <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3.5 text-base text-amber-800">
            管理员已为你重置密码。请先设置新密码，完成后需重新登录。
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card p-10 shadow-lg sm:p-12">
          {error && (
            <div className="mb-7 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-base text-red-700">
              {ERROR_MESSAGES[error]}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="currentPassword"
                className="mb-2.5 block text-base font-medium text-foreground"
              >
                当前密码{mustChangePassword ? "（管理员发放的临时密码）" : ""}
              </label>
              <input
                id="currentPassword"
                name="currentPassword"
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-xl border border-border bg-background-elevated px-4 py-3.5 text-[1.04rem] text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            </div>

            <div>
              <label
                htmlFor="newPassword"
                className="mb-2.5 block text-base font-medium text-foreground"
              >
                新密码
              </label>
              <input
                id="newPassword"
                name="newPassword"
                type="password"
                required
                minLength={12}
                maxLength={72}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-xl border border-border bg-background-elevated px-4 py-3.5 text-[1.04rem] text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
              <p className="mt-2 text-sm text-muted-foreground">至少 12 个字符</p>
            </div>

            <div>
              <label
                htmlFor="confirm"
                className="mb-2.5 block text-base font-medium text-foreground"
              >
                确认新密码
              </label>
              <input
                id="confirm"
                name="confirm"
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-xl border border-border bg-background-elevated px-4 py-3.5 text-[1.04rem] text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full cursor-pointer rounded-xl bg-primary px-4 py-3.5 text-[1.05rem] font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "提交中…" : "修改密码"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => void handleLogout()}
            className="mt-6 w-full cursor-pointer rounded-xl border border-border bg-background-elevated px-4 py-3 text-base text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}
