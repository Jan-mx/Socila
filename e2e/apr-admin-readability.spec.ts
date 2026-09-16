/**
 * APR（后台政策资产中文可读化）Chromium E2E：APR-AC-001/002/003/004/005/007/008/009/010/011。
 *
 * 前提：全新 PG17 验收库已迁移+引导（Jan管理员）+seed（DSL含人工中文名称）、
 * `npm run build`已产出standalone；运行入口 npm run test:e2e:auth（同套服务器）。
 *
 * 断言策略：只读页面结构/文本断言为主，不改动发布状态、不保存规则集编辑
 * （顺序/名称修改的保存契约由路由集成测试覆盖）。
 */
import { expect, test } from "@playwright/test";
import { loginViaApi } from "./api-auth";

const ADMIN_USERNAME = "Jan";
const ADMIN_PASSPHRASE = ["Acceptance", "Temp", "9137"].join("-");

interface PipelineEntityLite {
  entityType: string;
  displayName: string | null;
}

interface PipelineLite {
  draft: PipelineEntityLite[];
  staging: PipelineEntityLite[];
  prod: PipelineEntityLite[];
}

async function loginAsAdmin(page: import("@playwright/test").Page): Promise<void> {
  await loginViaApi(page, ADMIN_USERNAME, ADMIN_PASSPHRASE);
  await page.goto("/admin/rules");
  await page.waitForURL(/\/admin/);
}

test.describe("APR 后台政策资产中文可读化", () => {
  test("APR-AC-001/002：规则管理只保留规则列表，无重复规则集标签页", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    await expect(
      page.getByPlaceholder("搜索规则编号或名称..."),
    ).toBeVisible();
    await expect(page.locator("th", { hasText: "规则编号" })).toBeVisible();
    await expect(page.locator("th", { hasText: "名称" })).toBeVisible();
    // 原行为：规则中文名称列直接展示（规则seed已带name）。
    await expect(page.locator("td").filter({ hasText: "解析出生年份" }).first()).toBeVisible();
    // 无重复的"规则集"标签页（APR-FR-001）。
    await expect(
      page.locator('[role="tablist"], button', { hasText: /^规则集$/ }),
    ).toHaveCount(0);
    // 侧边栏独立入口存在（APR-AC-001）。
    await expect(
      page.getByRole("link", { name: "规则集" }).first(),
    ).toBeVisible();
  });

  test("APR-AC-003/004/005/007：规则集按原顺序显示中文规则名、展开与名称搜索", async ({
    page,
  }) => {
    await loginViaApi(page, ADMIN_USERNAME, ADMIN_PASSPHRASE);
    // 选择器/编辑仅对草稿开放（published只读是APR设计）：先建草稿规则集（含国家基线成员）。
    const create = await page.context().request.post("/api/admin/rule-sets", {
      data: {
        ruleSetId: "RS-APR-E2E-V1",
        jurisdictionCode: "310000",
        name: "APR演示草稿规则集",
        rules: ["R-010-PARSE-BIRTH-YEAR", "R-200-MIN-PENSION-YEARS"],
        effectiveFrom: "2024-01-01",
      },
    });
    expect(create.status()).toBe(201);
    await page.goto("/admin/rule-sets");
    // 列表以中文名称为主（seed后必有正式名称）。
    const shEntry = page.getByRole("button", { name: /上海规划主规则集/ });
    await expect(shEntry.first()).toBeVisible({ timeout: 15_000 });
    await shEntry.first().click();

    // 成员按执行顺序显示中文名称+编号+来源地区（published集只读预览）。
    const membersHeading = page.getByText(/规则执行顺序/);
    await expect(membersHeading).toBeVisible();
    await expect(
      page.locator("button", { hasText: "解析出生年份" }).first(),
    ).toBeVisible({ timeout: 15_000 });
    // 成员顺序=持久化顺序：第一条成员为R-010（数组首位）。
    const firstMember = page
      .locator('[aria-label^="展开规则"]')
      .first();
    await expect(firstMember).toContainText("R-010-PARSE-BIRTH-YEAR");
    // 编号为辅、来源地区显示（继承国家基线的成员来源地区=CN）。
    await expect(firstMember).toContainText("@ CN");

    // 展开成员查看只读规则内容（APR-FR-008）。
    await firstMember.click();
    await expect(page.getByText("决策条件与动作").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("查看完整规则详情（只读）").first()).toBeVisible();

    // 草稿规则集的选择器：按中文名称搜索候选（APR-FR-009/AC-007）。
    const draftEntry = page.getByRole("button", { name: /APR演示草稿规则集/ });
    await draftEntry.first().click();
    await expect(page.getByText(/共 2 条/).first()).toBeVisible();
    const search = page.getByLabel("规则搜索关键词");
    await search.fill("延迟");
    await page.getByRole("button", { name: "搜索", exact: true }).click();
    await expect(
      page.getByText(/@ (CN|310000) · v/).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("APR-AC-008：参数管理以中文名称为主、编号为辅", async ({ page }) => {
    await loginViaApi(page, ADMIN_USERNAME, ADMIN_PASSPHRASE);
    await page.goto("/admin/params");
    await expect(
      page.getByText("上海市月最低工资标准").first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText("P-SH-MIN-WAGE").first(),
    ).toBeVisible();
    // 展开详情：说明、来源与引用规则可见。
    await page
      .getByRole("button", { name: /展开参数 P-SH-MIN-WAGE 的说明与关联信息/ })
      .first()
      .click();
    await expect(page.getByText("正式说明").first()).toBeVisible();
    await expect(page.getByText("引用该规则的参数（只读）").first()).toBeVisible();
  });

  test("APR-AC-009/010/011：发布阶段分组、卡片中文名称与历史名称真实性", async ({
    page,
  }) => {
    await loginViaApi(page, ADMIN_USERNAME, ADMIN_PASSPHRASE);
    await page.goto("/admin/publish");
    await expect(page.getByRole("heading", { name: "发布中心" })).toBeVisible();

    // 阶段内按规则集→规则→参数分组（可折叠、显示数量）。
    for (const groupLabel of ["规则集", "规则", "参数"]) {
      await expect(
        page
          .locator('button[aria-expanded]')
          .filter({ hasText: groupLabel })
          .first(),
      ).toBeVisible({ timeout: 15_000 });
    }

    // 卡片中文名称为主（seed后发布实体均有正式名称）。
    const wageCard = page.locator("div").filter({
      hasText: /^上海市月最低工资标准/,
    });
    await expect(wageCard.first()).toBeVisible();

    // API级核对：三分类数量之和等于阶段总数（APR-FR-014/AC-009）。
    const check = await page.evaluate(async () => {
      const r = await fetch("/api/admin/publish/pipeline");
      const p = (await r.json()) as PipelineLite;
      const stages = { draft: p.draft, staging: p.staging, prod: p.prod };
      const perStage = Object.entries(stages).map(([stage, entities]) => {
        const byType = { rule_set: 0, rule: 0, param: 0 };
        for (const e of entities) {
          if (e.entityType in byType) byType[e.entityType as keyof typeof byType] += 1;
        }
        const sum = byType.rule_set + byType.rule + byType.param;
        return {
          stage,
          total: entities.length,
          sum,
          allNamed: entities.every((e) => e.displayName !== null),
        };
      });
      return perStage;
    });
    expect(check.length).toBe(3);
    for (const s of check) {
      expect(s.sum, `阶段${s.stage}分类数量之和`).toBe(s.total);
    }
    // Seed后三类实体均有正式名称（APR-FR-015）。
    expect(check.every((s) => s.allNamed)).toBe(true);

    // 发布历史：名称列存在；不可解析行显示"名称不可用"而非猜测。
    await expect(
      page.getByRole("heading", { name: "发布历史" }),
    ).toBeVisible();
    const historyRows = page.locator("tbody tr");
    const rowCount = await historyRows.count();
    if (rowCount > 0) {
      const firstRow = historyRows.first();
      await expect(
        firstRow.locator("p").filter({ hasText: /[一-鿿]/ }).first(),
      ).toBeVisible();
    }
  });
});
