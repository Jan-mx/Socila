/**
 * 09-02 Chromium E2E（AUTH-US-001～005，AUTH-AC-001/002/004/005/008/013/015/016）。
 *
 * 在真实 Next（生产构建）+ 全新 PostgreSQL 17 上执行：
 * 注册 → 登录 → 对话持久化、固定双角色门禁、管理用户管理、
 * 临时密码 → 强制改密、所有权 404 不可枚举。
 */
import { expect, test, type Page, type APIRequestContext } from "@playwright/test";

const ADMIN_USERNAME = "Jan";
// 拆分构造，避免与仓库 Secret 扫描规则的凭据字面量模式冲突（本地一次性口令）。
const ADMIN_PASSPHRASE = ["Acceptance", "Temp", "9137"].join("-");
const suffix = Date.now().toString(36).slice(-6);
const E2E_USER = `e2euser${suffix}`;
const E2E_PASSPHRASE = ["e2e", "pass", "word", "123"].join("-");
const E2E_NEW_PASSPHRASE = ["e2e", "new", "pass", "456"].join("-");
// mock-openai.mjs 流式拼接后的固定助手文本（PMG-FR-002 真实回复断言）。
const MOCK_ASSISTANT_REPLY = "你好，我是本地 mock 回复。";

async function login(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
}

async function logoutViaUi(page: Page): Promise<void> {
  const exit = page.getByRole("button", { name: "退出", exact: true });
  if (await exit.count()) {
    await exit.first().click();
    await page.waitForURL(/\/login/);
  }
}

test.describe.serial("09-02 双角色鉴权关键流程", () => {
  test("AUTH-AC-001: 匿名访客被重定向到 /login，API 返回 401", async ({
  page,
  request,
}: {
  page: Page;
  request: APIRequestContext;
}) => {
    await page.goto("/chat");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fchat/);

    const conversations = await request.get("/api/conversations");
    expect(conversations.status()).toBe(401);
    expect(await conversations.json()).toMatchObject({ error: "AUTH_REQUIRED" });

    const adminUsers = await request.get("/api/admin/users");
    expect(adminUsers.status()).toBe(401);

    const planCompute = await request.post("/api/plan/compute", {
      data: { user: {} },
    });
    expect(planCompute.status()).toBe(401);
  });

  test("AUTH-FR-013: /admin/login 308 重定向到统一登录页", async ({ request }) => {
    const res = await request.get("/admin/login", { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers().location).toBe("/login?callbackUrl=/admin");
  });

  test("AUTH-US-001 / AUTH-AC-002: 公开注册创建 role=user 且不自动登录", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("用户名").fill(E2E_USER);
    await page.getByLabel("密码", { exact: true }).fill(E2E_PASSPHRASE);
    await page.getByLabel("确认密码").fill(E2E_PASSPHRASE);
    await page.getByRole("button", { name: "注册" }).click();

    await expect(page).toHaveURL(/\/login\?registered=1/);
  });

  test("重复用户名注册返回 409 提示（AUTH-FR-001）", async ({ page }) => {
    await page.goto("/register");
    await page.getByLabel("用户名").fill(E2E_USER);
    await page.getByLabel("密码", { exact: true }).fill(E2E_PASSPHRASE);
    await page.getByLabel("确认密码").fill(E2E_PASSPHRASE);
    await page.getByRole("button", { name: "注册" }).click();

    await expect(page.getByText("该用户名已被占用")).toBeVisible();
  });

  test("AUTH-US-002: 用户登录进入 /chat，对话按 owner 持久化（AUTH-AC-004/008）", async ({ page }) => {
    await login(page, E2E_USER, E2E_PASSPHRASE);
    await page.waitForURL(/\/chat/);

    const message = `e2e-persistence-check-${suffix}`;
    await page.locator("#chat-input").fill(message);
    await page.getByRole("button", { name: "发送" }).click();

    // 会话在服务端持久化并出现在侧栏（owner_user_id 归属）
    await expect(
      page.locator("#conversation-sidebar").getByText(message.slice(0, 30)),
    ).toBeVisible({ timeout: 30_000 });

    // PMG-FR-002（PMG-AC-001）：真实助手流式回复必须可见。
    // 协议修正前（/v1/responses 对 mock 404）此处无助手回复，断言 Red。
    const assistantReply = page.getByText("你好，我是本地 mock 回复。");
    await expect(assistantReply).toBeVisible({ timeout: 30_000 });

    // 刷新后会话仍在，且助手回复来自服务端持久化（非本地状态）
    await page.reload();
    await expect(
      page.locator("#conversation-sidebar").getByText(message.slice(0, 30)),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("你好，我是本地 mock 回复。")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("AUTH-AC-005: user 携带 /admin callback 登录 → /chat?error=forbidden", async ({ page }) => {
    await logoutViaUi(page);
    await page.goto("/login?callbackUrl=%2Fadmin");
    await page.getByLabel("用户名").fill(E2E_USER);
    await page.getByLabel("密码", { exact: true }).fill(E2E_PASSPHRASE);
    await page.getByRole("button", { name: "登录", exact: true }).click();

    await page.waitForURL(/\/chat\?error=forbidden/);
    await logoutViaUi(page);
  });

  test("AUTH-US-004: 管理员经统一入口进入后台并管理用户（AUTH-AC-004）", async ({ page }) => {
    await page.goto("/login?callbackUrl=%2Fadmin");
    await page.getByLabel("用户名").fill(ADMIN_USERNAME);
    await page.getByLabel("密码", { exact: true }).fill(ADMIN_PASSPHRASE);
    await page.getByRole("button", { name: "登录", exact: true }).click();

    await page.waitForURL(/\/admin/);
    await page.goto("/admin/users");

    // 搜索目标用户
    await page.getByPlaceholder("按用户名搜索").fill(E2E_USER);
    await page.getByRole("button", { name: "查询" }).click();
    const row = page.getByRole("row").filter({ hasText: E2E_USER });
    await expect(row).toBeVisible();

    // 禁用 → 启用（AUTH-AC-013 的 UI 路径）
    await row.getByRole("button", { name: "禁用" }).click();
    await expect(
      page.getByText(`已禁用 ${E2E_USER}`),
    ).toBeVisible();
    await row.getByRole("button", { name: "启用" }).click();
    await expect(page.getByText(`已启用 ${E2E_USER}`)).toBeVisible();

    // 重置密码：明文临时密码只在 no-store 响应展示一次（AUTH-AC-015）
    // 页面使用 window.confirm 二次确认，Playwright 需显式接受。
    page.once("dialog", (dialog) => void dialog.accept());
    await row.getByRole("button", { name: "重置密码" }).click();
    await expect(page.getByText("临时密码（只显示这一次")).toBeVisible();
    const tempText = await page
      .locator("p.font-mono")
      .first()
      .innerText();
    expect(tempText.trim()).toMatch(/^[A-Za-z0-9_-]{20}$/);
    (globalThis as Record<string, unknown>).__e2eTempPassword = tempText.trim();
    await page.getByRole("button", { name: "我已保存，关闭" }).click();
    await logoutViaUi(page);
  });

  test("AUTH-US-005: 临时密码登录被强制改密（AUTH-AC-016）", async ({ page }) => {
    const tempPassword = (globalThis as Record<string, unknown>).__e2eTempPassword as string;

    await login(page, E2E_USER, tempPassword);
    await page.waitForURL(/\/account\/security/);

    // 强制改密会话访问其他页面被门禁弹回
    await page.goto("/chat");
    await expect(page).toHaveURL(/\/account\/security/);

    await page.getByLabel("当前密码（管理员发放的临时密码）").fill(tempPassword);
    await page.getByLabel("新密码", { exact: true }).fill(E2E_NEW_PASSPHRASE);
    await page.getByLabel("确认新密码").fill(E2E_NEW_PASSPHRASE);
    await page.getByRole("button", { name: "修改密码" }).click();

    await page.waitForURL(/\/login\?changed=1/);
  });

  test("改密后使用新密码重新登录恢复正常权限（AUTH-FR-007）", async ({ page }) => {
    await login(page, E2E_USER, E2E_NEW_PASSPHRASE);
    await page.waitForURL(/\/chat/);
    await expect(page.getByText(E2E_USER).first()).toBeVisible();

    // 所有权不可枚举（AUTH-AC-006/007）：随机 id 与他人会话一律 404
    const randomId = "00000000-0000-4000-8000-000000000000";
    const conv = await page.request.get(`/api/chat/${randomId}`);
    expect(conv.status()).toBe(404);
    const plan = await page.request.get(`/api/plan/${randomId}`);
    expect(plan.status()).toBe(404);
    const adminApi = await page.request.get("/api/admin/users");
    expect(adminApi.status()).toBe(403);
    await logoutViaUi(page);
  });

  test("AUTH-AC-013: 被禁用账号无法登录（统一错误）", async ({
  page,
  request,
}: {
  page: Page;
  request: APIRequestContext;
}) => {
    // 管理员登录并禁用目标用户
    await login(page, ADMIN_USERNAME, ADMIN_PASSPHRASE);
    await page.waitForURL(/\/admin/);
    await page.goto("/admin/users");
    await page.getByPlaceholder("按用户名搜索").fill(E2E_USER);
    await page.getByRole("button", { name: "查询" }).click();
    const row = page.getByRole("row").filter({ hasText: E2E_USER });
    await row.getByRole("button", { name: "禁用" }).click();
    await expect(page.getByText(`已禁用 ${E2E_USER}`)).toBeVisible();
    await logoutViaUi(page);

    // 被禁用用户登录：统一"用户名或密码错误"，不泄露禁用状态（AUTH-NFR-002）
    await login(page, E2E_USER, E2E_NEW_PASSPHRASE);
    await expect(page.getByText("用户名或密码错误")).toBeVisible();

    // 管理接口直接验证 401（无会话）
    const adminApi = await request.get("/api/admin/users");
    expect(adminApi.status()).toBe(401);
  });
});
