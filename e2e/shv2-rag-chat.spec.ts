/**
 * SHV2运行时RAG对话闭环E2E（SHV2-AC-027，WI-20260913-01任务4）。
 *
 * 在真实Next（standalone构建）+ mock模型 + mock Agent内部API上验证：
 * - 未登录调用 /api/rag/originals/:id 一律401；
 * - 登录用户确认地区后提问政策事实问题 → 模型调用searchPolicy工具 →
 *   工具经服务JWT调用Agent检索 → 最终回复同时展示官网原文链接与
 *   /api/rag/originals/<documentVersionId>归档原件链接；
 * - 登录态下载返回attachment/nosniff/private no-store与正确字节；
 * - 无可靠命中（生育津贴场景）时如实说明，不编造链接。
 *
 * 注册只发生一次（套件共享 /api/auth/register 的IP限流，上限5次/小时）：
 * 第二个场景复用同一用户直接登录。
 */
import { expect, test, type Page } from "@playwright/test";

const suffix = Date.now().toString(36).slice(-6);
const E2E_USER_RAG = `e2erag${suffix}`;
const E2E_PASSPHRASE = ["e2e", "rag", "pass", "123"].join("-");
const MOCK_DOC_VERSION_ID = "a1b2c3d4-0000-4000-8000-000000003100";
const MOCK_OFFICIAL_URL = "https://rsj.sh.gov.cn/e2e-mock-policy-2340";

async function registerAndLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto("/register");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByLabel("确认密码").fill(password);
  await page.getByRole("button", { name: "注册" }).click();
  await expect(page).toHaveURL(/\/login\?registered=1/);
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL(/\/chat/);
}

async function login(page: Page, username: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.waitForURL(/\/chat/);
}

async function confirmShanghai(page: Page): Promise<void> {
  const selector = page.getByRole("button", {
    name: /选择规划地区|上海市|广东省/,
  });
  await expect(selector).toBeVisible({ timeout: 20_000 });
  await selector.click();
  const shOption = page.getByRole("option", { name: /上海市/ });
  await expect(shOption).toBeVisible();
  await shOption.click();
  await expect(page.getByText("规划地区：上海市（已确认）")).toBeVisible({
    timeout: 15_000,
  });
}

test.describe.serial("SHV2 对话RAG来源链（AC-027）", () => {
  test("未登录调用 /api/rag/originals/:id 一律401（登录态下载门禁）", async ({
    request,
  }) => {
    const res = await request.get(`/api/rag/originals/${MOCK_DOC_VERSION_ID}`);
    expect(res.status()).toBe(401);
  });

  test("政策事实问题调用searchPolicy并展示官网与归档原件链接；登录态下载字节一致", async ({
    page,
  }) => {
    await registerAndLogin(page, E2E_USER_RAG, E2E_PASSPHRASE);
    await confirmShanghai(page);

    await page.locator("#chat-input").fill("上海失业保险金标准是多少？");
    await page.getByRole("button", { name: "发送" }).click();

    // mock模型第二轮把searchPolicy命中的双链写进最终回复（AC-027）。
    await expect(
      page.getByText(`官网原文：${MOCK_OFFICIAL_URL}`),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByText(`归档原件：/api/rag/originals/${MOCK_DOC_VERSION_ID}`),
    ).toBeVisible();

    // 登录态下载：附件安全头 + 字节来自Agent原件流（mock 2340文本）。
    const download = await page.evaluate(async (id) => {
      const res = await fetch(`/api/rag/originals/${id}`);
      return {
        status: res.status,
        disposition: res.headers.get("content-disposition"),
        nosniff: res.headers.get("x-content-type-options"),
        cache: res.headers.get("cache-control"),
        body: await res.text(),
      };
    }, MOCK_DOC_VERSION_ID);
    expect(download.status).toBe(200);
    expect(download.disposition).toMatch(/^attachment;/);
    expect(download.nosniff).toBe("nosniff");
    expect(download.cache).toBe("private, no-store");
    expect(download.body).toContain("2340");
  });

  test("无可靠命中时不编造来源（AC-027无命中分支）", async ({ page }) => {
    // 复用同一注册用户（注册限流为套件级共享资源）；新上下文重新登录。
    await login(page, E2E_USER_RAG, E2E_PASSPHRASE);
    await confirmShanghai(page);

    await page.locator("#chat-input").fill("上海生育津贴标准是多少？");
    await page.getByRole("button", { name: "发送" }).click();

    // searchPolicy返回空hits：最终回复必须如实说明且不含任何来源链接。
    await expect(
      page.getByText(/未在官方原文库中检索到可靠依据/),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/官网原文：/)).toHaveCount(0);
    await expect(page.getByText(/归档原件：/)).toHaveCount(0);
  });
});
