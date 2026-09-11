/**
 * SHV2（WI-20260911-02）专用 Chromium E2E：合成披露文案与API字段契约
 * （SHV2-FR-013/014、SHV2-AC-010/012）。
 *
 * - 公开案例页：使用“合成政策案例”，不出现“真实咨询记录/真实社保规划案例/真实咨询样本/真实案例”；
 *   卡片显示地区、能力、人物条件；不展示V1统一占位问答（V1数据显示“待生成V2案例文档”，
 *   V2数据显示可读问题）；详情含完整问答/计算日期/风险提示/政策依据；
 * - 首页与导航无“真实案例”表述；
 * - 公开API：36条均带 caseNature=synthetic 与 policySources 数组，既有字段保持；
 * - 管理后台：“合成案例文档”/“待生成V2案例文档”，不再出现“案例原文”；管理API附带caseNature；
 *   匿名/普通用户/管理员权限契约由 task4 spec 覆盖，此处只复用管理员会话。
 *
 * 前提同 task4-case-library.spec.ts（e2e-rcl-setup 输出 .e2e-rcl-state.json；
 * generatorVersion===RCL-GEN-2.0 时按V2可读内容断言，否则按V1待生成状态断言）。
 */
import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ADMIN_USERNAME = "Jan";
const ADMIN_PASSPHRASE = ["Acceptance", "Temp", "9137"].join("-");
const BANNED = /真实咨询记录|真实社保规划案例|真实咨询样本|真实案例/;
const V1_PLACEHOLDER_Q = "确定性模板生成的政策案例（无真实用户数据）";
const V1_PLACEHOLDER_A = "由修复后的快照规划器计算期望";

function isV2State(): boolean {
  const p = resolve(process.cwd(), ".e2e-rcl-state.json");
  if (!existsSync(p)) return false;
  const state = JSON.parse(readFileSync(p, "utf-8")) as { generatorVersion?: string };
  return state.generatorVersion === "RCL-GEN-2.0";
}

test.describe.serial("SHV2 合成披露与API契约（SHV2-AC-010/012）", () => {
  test("SHV2-AC-010: 公开案例页为合成政策案例，无真实表述，卡片含地区/能力/人物条件，不展示占位问答", async ({ page }) => {
    await page.goto("/cases");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("合成政策案例");
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(BANNED);
    expect(body).not.toContain(V1_PLACEHOLDER_Q);
    expect(body).not.toContain(V1_PLACEHOLDER_A);
    expect(body).toContain("本案例为合成演示，不构成个案办理决定");

    const cards = page.locator("[data-case-card]");
    await expect(cards).toHaveCount(10);
    await expect(page.locator("[data-case-region]")).toHaveCount(10);
    await expect(page.locator("[data-case-capability]")).toHaveCount(10);
    await expect(page.locator("[data-case-persona]")).toHaveCount(10);
    await expect(page.locator("[data-case-region]").first()).toContainText(/上海|广东/);
    await expect(page.locator("[data-case-capability]").first()).toContainText(/退休|养老|医保|失业|灵活就业|补贴|缴费基数/);

    if (isV2State()) {
      await expect(page.locator("[data-case-question]")).toHaveCount(10);
      await expect(page.locator("[data-case-pending]")).toHaveCount(0);
    } else {
      // V1数据：不得虚构正文，显式显示待生成状态。
      await expect(page.locator("[data-case-pending]")).toHaveCount(10);
      await expect(page.locator("[data-case-question]")).toHaveCount(0);
      expect(body).toContain("待生成V2案例文档");
    }

    await cards.first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("计算日期");
    await expect(dialog).toContainText("风险提示");
    await expect(dialog).toContainText("政策依据");
    await expect(dialog).toContainText("完整问答");
    const dialogText = await dialog.innerText();
    expect(dialogText).not.toContain(V1_PLACEHOLDER_Q);
    expect(dialogText).not.toContain(V1_PLACEHOLDER_A);
    await expect(dialog.locator("[data-case-asof]")).toContainText(/\d{4}-\d{2}-\d{2}/);
    if (isV2State()) {
      const links = dialog.locator("a[target='_blank'][rel='noopener noreferrer']");
      expect(await links.count()).toBeGreaterThanOrEqual(1);
    }
  });

  test("SHV2-AC-010: 首页与导航不再出现“真实案例”表述", async ({ page }) => {
    await page.goto("/");
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(BANNED);
    await expect(page.getByRole("link", { name: "合成案例" }).first()).toBeVisible();
  });

  test("SHV2-AC-012: 公开API向后兼容并返回caseNature/policySources", async ({ page }) => {
    const res = await page.request.get("/api/showcase-cases");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      cases: Array<{
        id: number;
        title: string;
        userMessage: string;
        aiResponse: string;
        jurisdictionCode: string | null;
        generatorVersion: string | null;
        caseNature: string;
        policySources: unknown;
      }>;
    };
    expect(body.cases.length).toBe(36);
    for (const c of body.cases) {
      expect(typeof c.title).toBe("string");
      expect(typeof c.userMessage).toBe("string");
      expect(typeof c.aiResponse).toBe("string");
      expect(c.caseNature).toBe("synthetic");
      expect(Array.isArray(c.policySources)).toBe(true);
      expect(String(c.generatorVersion)).toMatch(/^RCL-GEN-/);
    }
    if (isV2State()) {
      for (const c of body.cases) {
        expect((c.policySources as unknown[]).length).toBeGreaterThanOrEqual(1);
        expect(c.userMessage).not.toBe(V1_PLACEHOLDER_Q);
        expect(c.generatorVersion).toBe("RCL-GEN-2.0");
      }
    }
  });

  test("SHV2-AC-012: 管理后台使用“合成案例文档”，V1空正文显示“待生成V2案例文档”，管理API附带caseNature", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("用户名").fill(ADMIN_USERNAME);
    await page.getByLabel("密码", { exact: true }).fill(ADMIN_PASSPHRASE);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await page.waitForURL(/\/admin|\/chat/);

    const api = await page.evaluate(async () => {
      const r = await fetch("/api/admin/cases?q=RPC-&page=1&pageSize=100");
      const body = (await r.json()) as {
        cases?: Array<{ caseNature?: string; policySources?: unknown; qualityStatus?: string; caseText?: string | null; generatorVersion?: string | null }>;
        total?: number;
        page?: number;
        pageSize?: number;
      };
      return { status: r.status, body };
    });
    expect(api.status).toBe(200);
    expect(api.body.page).toBe(1);
    expect(api.body.pageSize).toBe(100);
    expect((api.body.cases ?? []).length).toBeGreaterThanOrEqual(36);
    for (const row of api.body.cases ?? []) {
      expect(row.qualityStatus).toBe("active");
      expect(row.caseNature).toBe("synthetic");
      expect(Array.isArray(row.policySources)).toBe(true);
    }

    await page.goto("/admin/cases");
    await expect(page.getByRole("heading", { name: "案例库" })).toBeVisible();
    await expect(page.locator("table tbody tr").first()).toBeVisible();
    const listText = await page.locator("body").innerText();
    expect(listText).not.toContain("案例原文");
    expect(listText).toContain("合成政策案例");

    await page.locator("table tbody tr").first().click();
    const detail = page.locator("h2", { hasText: "案例详情" });
    await expect(detail).toBeVisible();
    const detailText = await page.locator("body").innerText();
    expect(detailText).not.toContain("案例原文");
    expect(detailText).toContain("合成案例文档");
    expect(detailText).toContain("生成器版本");
    expect(detailText).toContain("结构化输入");
    expect(detailText).toContain("期望输出");
    expect(detailText).toContain("断言");
    expect(detailText).toContain("政策来源");
    if (isV2State()) {
      expect(detailText).not.toContain("待生成V2案例文档");
      await expect(page.locator("[data-pending-v2]")).toHaveCount(0);
    } else {
      await expect(page.locator("[data-pending-v2]")).toHaveCount(1);
      expect(detailText).toContain("待生成V2案例文档");
    }
  });
});
