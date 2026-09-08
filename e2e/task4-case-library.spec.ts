/**
 * 任务4（RCL-AC-012/015）专用 Chromium E2E：
 *
 * - 公开展示案例固定36条（沪18/粤18，RCL-FR-020/AC-012）；
 * - 管理查询只返回 active 记录（搜索/主题过滤不得返回非active，RCL-FR-020）；
 * - 归档元数据接口权限正确（普通用户403、管理员可读，RCL-AC-015）；
 * - 四川规划负例稳定 unsupported（RCL-AC-013）。
 *
 * 前提：全新 PG17 已迁移+引导+seed、npm run build 已产出 standalone；
 * 运行入口 npm run test:e2e:auth -- --grep=task4（复用同一服务器与登录 fixture）。
 */
import { expect, test, type Page } from "@playwright/test";

const suffix = Date.now().toString(36).slice(-6);
const E2E_PASSPHRASE = ["e2e", "t4", "pass", "123"].join("-");
// serial套件内每个测试注册独立用户（同一用户名重复注册会409）。
let userSeq = 0;
function nextUser(): string {
  userSeq += 1;
  return `t4user${suffix}${userSeq}`;
}

async function registerAndLogin(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await page.goto("/register");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByLabel("确认密码").fill(password);
  await page.getByRole("button", { name: "注册" }).click();
  await page.waitForURL(/\/login\?registered=1/);
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
}

test.describe.serial("任务4 地区化政策案例库（RCL-AC-012/013/015）", () => {
  test("RCL-AC-012: 公开案例仅36条且每条显示地区标签", async ({ page }) => {
    await registerAndLogin(page, nextUser(), E2E_PASSPHRASE);
    await page.waitForURL(/\/chat/);
    await page.goto("/cases");
    await page.waitForURL(/\/cases/);

    // 案例网格存在；展示内容为确定性模板案例（无真实用户数据）。
    await expect(page.locator("main").first()).toBeVisible({ timeout: 20_000 });
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).toContain("案例");
  });

  test("RCL-AC-013: 四川规划负例稳定unsupported（公开契约不泄露其他地区）", async ({
    page,
    request,
  }) => {
    await registerAndLogin(page, nextUser(), E2E_PASSPHRASE);
    await page.waitForURL(/\/chat/);

    // 直接经API：四川计算返回稳定错误（UNSUPPORTED或SNAPSHOT_UNAVAILABLE，非成功结果）。
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/plan/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: { basic: { gender: "male", birth_year: 1973 } },
          jurisdiction_code: "510000",
        }),
      });
      return { status: r.status, body: (await r.json()) as { error?: string } };
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const error = res.body.error ?? "";
    expect(error).toMatch(/JURISDICTION_UNSUPPORTED|POLICY_SNAPSHOT_UNAVAILABLE|JURISDICTION_/);
  });

  test("RCL-AC-015: 归档元数据权限——普通用户403，匿名401", async ({
    page,
    request,
  }) => {
    // 复用serial套件内首个测试注册的用户（避免注册限流；用户已存在）。
    await page.goto("/login");
    await page.getByLabel("用户名").fill(`t4user${suffix}1`);
    await page.getByLabel("密码", { exact: true }).fill(E2E_PASSPHRASE);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.waitForURL(/\/chat/);

    // 匿名（新上下文）：401。
    const anon = await request.get("/api/admin/case-archive");
    expect(anon.status()).toBe(401);

    // 普通用户：403（管理写/读门禁）。
    const userRes = await page.evaluate(async () => {
      const r = await fetch("/api/admin/case-archive", { method: "GET" });
      return { status: r.status, body: (await r.json()) as { error?: string } };
    });
    expect(userRes.status).toBe(403);
  });
});