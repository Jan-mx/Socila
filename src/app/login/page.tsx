/**
 * 统一登录页（09-02 §9.1，AUTH-FR-002，AUTH-AC-004/005）。
 *
 * user/admin 共用 /login；账号状态、角色、密码校验由数据库事实决定。
 * 登录成功后跳转 /post-login 按角色与合法 callback 决定落点；
 * 每IP登录限流 20 次/15 分钟（AUTH-NFR-003）。
 */
import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { signIn } from "@/lib/auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { safeCallbackUrl } from "@/lib/auth/callback-url";

export const dynamic = "force-dynamic";

interface LoginPageProps {
  searchParams: Promise<{
    callbackUrl?: string;
    error?: string;
    registered?: string;
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);
  const error = params.error;
  const registered = params.registered === "1";

  async function handleLogin(formData: FormData) {
    "use server";
    const username = String(formData.get("username") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    // 每IP登录限流（AUTH-NFR-003）：20次/15分钟
    const h = await headers();
    const ip =
      h.get("x-real-ip") ??
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const limit = checkRateLimit(`auth:login:ip:${ip}`, {
      limit: 20,
      windowMs: 15 * 60 * 1000,
    });
    if (!limit.allowed) {
      redirect("/login?error=rate_limited");
    }

    const postLoginTarget = "/post-login" + (callbackUrl ? `?cb=${encodeURIComponent(callbackUrl)}` : "");
    try {
      await signIn("credentials", {
        username,
        password,
        redirectTo: postLoginTarget,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        redirect(
          "/login?error=invalid" +
            (callbackUrl
              ? `&callbackUrl=${encodeURIComponent(callbackUrl)}`
              : ""),
        );
      }
      throw err;
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
            登录
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            登录后开始使用你的规划与对话
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-10 shadow-lg sm:p-12">
          {registered && (
            <div className="mb-7 rounded-xl border border-green-200 bg-green-50 px-4 py-3.5 text-base text-green-700">
              注册成功，请使用新账号登录。
            </div>
          )}
          {error === "invalid" && (
            <div className="mb-7 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-base text-red-700">
              用户名或密码错误
            </div>
          )}
          {error === "rate_limited" && (
            <div className="mb-7 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-base text-amber-700">
              尝试过于频繁，请稍后再试。
            </div>
          )}

          <form action={handleLogin} className="space-y-6">
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
                autoComplete="username"
                className="w-full rounded-xl border border-border bg-background-elevated px-4 py-3.5 text-[1.04rem] text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
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
                autoComplete="current-password"
                className="w-full rounded-xl border border-border bg-background-elevated px-4 py-3.5 text-[1.04rem] text-foreground placeholder:text-muted-foreground transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
              />
            </div>

            <button
              type="submit"
              className="w-full cursor-pointer rounded-xl bg-primary px-4 py-3.5 text-[1.05rem] font-semibold text-white transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              登录
            </button>
          </form>

          <p className="mt-6 text-center text-base text-muted-foreground">
            还没有账号？{" "}
            <a
              href="/register"
              className="font-medium text-primary hover:underline"
            >
              注册新账号
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
