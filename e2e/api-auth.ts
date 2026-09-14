/**
 * E2E共享API认证辅助（UAT修复2026-09-14）。
 *
 * 背景：登录页动作层对每IP登录有20次/5分钟限流（AUTH-NFR-003产品契约）。
 * 全套件spec数量增加后，若每个用例都经登录页表单登录，套件总提交数会超过
 * 产品限流阈值，导致与被测功能无关的失败。auth.spec专测登录页UI流程；
 * 5分钟窗口限流契约由 src/lib/security/__tests__/rate-limit.test.ts（可控时钟）覆盖；
 * 其余spec的“登录前置数据准备”统一改走NextAuth callback API（用户级
 * 5次/5分钟/规范化用户名限流依然生效，各spec独立用户名互不影响）。
 */
import { expect, type Page } from "@playwright/test";

/** 通过API注册（响应201；409视为已存在，幂等复用）。 */
export async function registerViaApi(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  const res = await page.context().request.post("/api/auth/register", {
    data: { username, password },
  });
  expect([201, 409]).toContain(res.status());
}

/**
 * 通过NextAuth callback API登录：page.context().request与页面共享Cookie，
 * 登录态对page直接生效；随后由调用方goto目标页。
 * 凭据失败（含限流拒绝）时next-auth会302回登录页并带error参数，
 * 此处断言重定向目标不含error=，登录失败立即显式失败而非下游超时。
 */
export async function loginViaApi(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  const csrfRes = await page.context().request.get("/api/auth/csrf");
  expect(csrfRes.status()).toBe(200);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await page.context().request.post("/api/auth/callback/credentials", {
    form: { csrfToken, username, password },
    maxRedirects: 0,
  });
  // 302重定向目标：成功→/或callbackUrl；失败→/login?error=...
  expect([302, 303]).toContain(res.status());
  expect(res.headersArray().some((h) => h.name.toLowerCase() === "location" && h.value.includes("error="))).toBe(false);
}

/** 注册+登录+进入 /chat 的组合前置（替代逐用例的登录页表单提交）。 */
export async function registerLoginAndEnterChat(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await registerViaApi(page, username, password);
  await loginViaApi(page, username, password);
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/chat/);
}
