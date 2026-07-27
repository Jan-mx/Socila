import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

interface LoginPageProps {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  // Only allow same-origin relative paths to prevent open-redirect via ?callbackUrl=
  // (rejects absolute URLs, "//evil.com" protocol-relative, and "/\evil.com").
  const rawCallbackUrl = params.callbackUrl || "/admin";
  const callbackUrl = /^\/(?![/\\])/.test(rawCallbackUrl) ? rawCallbackUrl : "/admin";
  const error = params.error;

  async function handleLogin(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        username: formData.get("username"),
        password: formData.get("password"),
        redirectTo: callbackUrl,
      });
    } catch (err) {
      if (err instanceof AuthError) {
        redirect(
          `/admin/login?error=InvalidCredentials&callbackUrl=${encodeURIComponent(callbackUrl)}`,
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
            系统管理
          </p>
          <h1 className="mt-4 font-display text-4xl font-bold text-foreground">管理后台登录</h1>
          <p className="mt-3 text-base text-muted-foreground">请输入账号密码进入控制台</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-10 shadow-lg sm:p-12">
          {error && (
            <div className="mb-7 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-base text-red-700">
              用户名或密码错误
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
        </div>
      </div>
    </div>
  );
}
