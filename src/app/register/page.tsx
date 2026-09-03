/**
 * 公开注册页（09-02 §9.1，AUTH-US-001，AUTH-FR-001）。
 *
 * 只提交用户名与密码两个字段——客户端契约与服务端 strict Schema 一致，
 * 角色固定 user（AUTH-AC-002）。成功后跳转 /login?registered=1，不自动登录。
 */
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type RegisterError =
  | "INVALID_INPUT"
  | "USERNAME_TAKEN"
  | "RATE_LIMITED"
  | "FORBIDDEN"
  | "NETWORK";

const ERROR_MESSAGES: Record<RegisterError, string> = {
  INVALID_INPUT:
    "用户名需 3-32 位，仅限字母、数字、_ 或 -；密码至少 8 位，需包含字母和数字。",
  USERNAME_TAKEN: "该用户名已被占用，请换一个。",
  RATE_LIMITED: "注册尝试过于频繁，请一小时后再试。",
  FORBIDDEN: "请求来源不受支持。",
  NETWORK: "网络异常，请稍后重试。",
};

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<RegisterError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("INVALID_INPUT");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.status === 201) {
        router.push("/login?registered=1");
        return;
      }
      if (res.status === 400) setError("INVALID_INPUT");
      else if (res.status === 409) setError("USERNAME_TAKEN");
      else if (res.status === 429) setError("RATE_LIMITED");
      else if (res.status === 403) setError("FORBIDDEN");
      else setError("NETWORK");
    } catch {
      setError("NETWORK");
    } finally {
      setSubmitting(false);
    }
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
            社保规划助手
          </p>
          <h1 className="mt-4 font-display text-4xl font-bold text-foreground">
            注册
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            创建账号，跨设备保留你的规划与对话
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-10 shadow-lg sm:p-12">
          {error && (
            <div className="mb-7 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-base text-red-700">
              {ERROR_MESSAGES[error]}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="username"
                className="mb-2.5 block text-base font-medium text-foreground"
              >
                用户名
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                minLength={3}
                maxLength={32}
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-border bg-background-elevated px-4 py-3.5 text-[1.04rem] text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
              <p className="mt-2 text-sm text-muted-foreground">
                3-32 位，仅限字母、数字、下划线和中划线
              </p>
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2.5 block text-base font-medium text-foreground"
              >
                密码
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-border bg-background-elevated px-4 py-3.5 text-[1.04rem] text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
              <p className="mt-2 text-sm text-muted-foreground">至少 8 个字符，需包含字母和数字</p>
            </div>

            <div>
              <label
                htmlFor="confirm"
                className="mb-2.5 block text-base font-medium text-foreground"
              >
                确认密码
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
              {submitting ? "注册中…" : "注册"}
            </button>
          </form>

          <p className="mt-6 text-center text-base text-muted-foreground">
            已有账号？{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              直接登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
