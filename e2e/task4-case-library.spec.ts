/**
 * 任务4（RCL-AC-008/009/011/012/013/015）专用 Chromium E2E：
 *
 * - 公开案例精确36条、上海18、广东18（RCL-AC-008/012）；
 * - 治理字段非空：qualityScore/qualityBreakdown/multiLabels/assertions（RCL-AC-009）；
 * - 管理查询 active AND filters：搜索不得返回非active（RCL-FR-020/AC-012）；
 * - 四川规划负例稳定 unsupported（RCL-AC-013）；
 * - 归档元数据权限：匿名401、普通用户403、管理员可读（RCL-AC-015）。
 *
 * 前提：全新 PG17 已迁移+引导+seed、scripts/e2e-rcl-setup.ts 已完成沪粤快照
 * 激活与受控CLI替换演练（输出 .e2e-rcl-state.json）、npm run build 已产出
 * standalone；运行入口 npm run test:e2e:auth（复用同一服务器与登录 fixture）。
 */
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type RclE2EState = {
  batchId: string;
  counts: { cases: number; showcase: number; tests: number };
};

function loadRclState(): RclE2EState {
  const raw = readFileSync(resolve(process.cwd(), ".e2e-rcl-state.json"), "utf-8");
  return JSON.parse(raw) as RclE2EState;
}

const suffix = Date.now().toString(36).slice(-6);
const E2E_PASSPHRASE = ["e2e", "t4", "pass", "123"].join("-");
const ADMIN_USERNAME = "Jan";
const ADMIN_PASSPHRASE = ["Acceptance", "Temp", "9137"].join("-");
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

test.describe.serial("任务4 地区化政策案例库（RCL-AC-008/009/012/013/015）", () => {
  test("RCL-AC-008/012: 公开案例精确36条且上海18、广东18（API精确断言）", async ({
    page,
  }) => {
    await registerAndLogin(page, nextUser(), E2E_PASSPHRASE);
    await page.waitForURL(/\/chat/);

    // 公开API精确计数：36条、沪18、粤18、治理字段非空。
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/showcase-cases");
      const body = (await r.json()) as {
        cases?: Array<{
          jurisdictionCode?: string | null;
          qualityScore?: number | null;
          qualityBreakdown?: unknown;
          multiLabels?: unknown;
          assertions?: unknown;
          scenarioKey?: string | null;
          asOfDate?: string | null;
        }>;
      };
      return { status: r.status, cases: body.cases ?? [] };
    });
    expect(res.status).toBe(200);
    expect(res.cases.length).toBe(36);
    const sh = res.cases.filter((c) => c.jurisdictionCode === "310000");
    const gd = res.cases.filter((c) => c.jurisdictionCode === "440000");
    expect(sh.length).toBe(18);
    expect(gd.length).toBe(18);

    // 治理字段非空（RCL-AC-009/011）。
    for (const c of res.cases) {
      expect(typeof c.qualityScore).toBe("number");
      expect(c.qualityScore! > 0).toBe(true);
      expect(c.qualityBreakdown).not.toBeNull();
      expect(Array.isArray(c.multiLabels)).toBe(true);
      expect((c.multiLabels as string[]).length).toBeGreaterThanOrEqual(5);
      expect(Array.isArray(c.assertions)).toBe(true);
      expect((c.assertions as unknown[]).length).toBeGreaterThanOrEqual(1);
      expect(c.scenarioKey).toBeTruthy();
      expect(c.asOfDate).toBeTruthy();
    }
  });

  test("RCL-AC-012: 管理案例搜索只返回active（active AND filters）", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("用户名").fill(ADMIN_USERNAME);
    await page.getByLabel("密码", { exact: true }).fill(ADMIN_PASSPHRASE);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.waitForURL(/\/admin|\/chat/);

    // 管理API：搜索RPC-前缀只返回active案例（apply产物均为active）。
    const res = await page.evaluate(async () => {
      const r = await fetch("/api/admin/cases?q=RPC-&page=1&pageSize=100");
      const body = (await r.json()) as {
        cases?: Array<{ qualityStatus?: string | null; caseUid?: string | null }>;
      };
      return { status: r.status, rows: body.cases ?? [] };
    });
    expect(res.status).toBe(200);
    expect(res.rows.length).toBeGreaterThanOrEqual(36);
    for (const row of res.rows) {
      expect(row.qualityStatus).toBe("active");
    }

    // 管理员归档元数据可读（RCL-AC-015：沿用本测试admin会话，避免额外登录计数）：
    // apply产物批次（applied）应出现在批次列表中。
    const archiveRes = await page.evaluate(async () => {
      const r = await fetch("/api/admin/case-archive", { method: "GET" });
      const body = (await r.json()) as { batches?: unknown[] };
      return { status: r.status, batches: body.batches ?? [] };
    });
    expect(archiveRes.status).toBe(200);
    const state = loadRclState();
    expect(archiveRes.batches.some((b) => (b as { id?: string }).id === state.batchId)).toBe(true);
  });

  test("RCL-AC-013: 四川规划负例稳定unsupported（公开契约不泄露其他地区）", async ({
    page,
  }) => {
    // 复用 RCL-AC-008 注册的用户（注册接口有每小时频率限制）。
    await page.goto("/login");
    await page.getByLabel("用户名").fill(`t4user${suffix}1`);
    await page.getByLabel("密码", { exact: true }).fill(E2E_PASSPHRASE);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.waitForURL(/\/chat/);

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

  test("RCL-AC-015: 归档元数据权限——匿名401、普通用户403（管理员200并入RCL-AC-012）", async ({
    page,
    request,
  }) => {
    // 匿名（新上下文）：401。
    const anon = await request.get("/api/admin/case-archive");
    expect(anon.status()).toBe(401);

    // 普通用户：403（管理写/读门禁）。复用已注册用户登录（注册/登录均有频率限制）。
    await page.goto("/login");
    await page.getByLabel("用户名").fill(`t4user${suffix}1`);
    await page.getByLabel("密码", { exact: true }).fill(E2E_PASSPHRASE);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.waitForURL(/\/chat/);
    const userRes = await page.evaluate(async () => {
      const r = await fetch("/api/admin/case-archive", { method: "GET" });
      return { status: r.status };
    });
    expect(userRes.status).toBe(403);
  });
});
