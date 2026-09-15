/**
 * SHV2运行时RAG对话闭环E2E（SHV2-AC-027，WI-20260913-01任务4）
 * 与 ATR LLM自主工具路由验收（ATR-AC-001/004/005/007，
 * docs/prd/09-15-feature-llm-autonomous-tool-routing.md）。
 *
 * 在真实Next（standalone构建）+ mock模型 + mock Agent内部API上验证：
 * - 未登录调用 /api/rag/originals/:id 一律401；
 * - 登录用户输入“你是谁”→ 模型依据系统提示词直接回答角色说明，本轮无工具调用，
 *   回答不被知识库兜底语覆盖（ATR-AC-001）；
 * - 登录用户确认地区后提问政策事实问题 → 模型在tool_choice=auto下自主调用searchPolicy →
 *   工具经服务JWT调用Agent检索 → 最终回复同时展示官网原文链接与
 *   /api/rag/originals/<documentVersionId>归档原件链接（ATR-AC-004）；
 * - 登录态下载返回attachment/nosniff/private no-store与正确字节；
 * - 无可靠命中（生育津贴场景）时模型如实说明，不编造链接（ATR-AC-005）；
 * - 恢复含混合warning工具消息的会话不崩溃且可继续对话（UAT 2026-09-14）。
 *
 * 注册只发生一次（套件共享 /api/auth/register 的IP限流，上限5次/小时）：
 * 后续场景复用同一用户直接登录。
 */
import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

import { loginViaApi, registerLoginAndEnterChat } from "./api-auth";

const suffix = Date.now().toString(36).slice(-6);
const E2E_USER_RAG = `e2erag${suffix}`;
const E2E_PASSPHRASE = ["e2e", "rag", "pass", "123"].join("-");
const MOCK_DOC_VERSION_ID = "a1b2c3d4-0000-4000-8000-000000003100";
const MOCK_OFFICIAL_URL = "https://rsj.sh.gov.cn/e2e-mock-policy-2340";

// UAT修复2026-09-14：登录页IP限流20次/5分钟为产品契约（窗口契约由rate-limit单测覆盖），
// 本spec的登录前置改走API登录，避免套件级登录提交总数超过限流阈值。
async function registerAndLogin(page: Page, username: string, password: string): Promise<void> {
  await registerLoginAndEnterChat(page, username, password);
}

async function login(page: Page, username: string, password: string): Promise<void> {
  await loginViaApi(page, username, password);
  await page.goto("/chat");
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

  test("政策事实问题由模型在auto模式自主调用searchPolicy并展示官网与归档原件链接；登录态下载字节一致（ATR-AC-004）", async ({
    page,
  }) => {
    await registerAndLogin(page, E2E_USER_RAG, E2E_PASSPHRASE);
    await confirmShanghai(page);

    await page.locator("#chat-input").fill("上海失业保险金标准是多少？");
    await page.getByRole("button", { name: "发送" }).click();

    // mock模型第一轮在tool_choice=auto下自主发起searchPolicy，第二轮把命中的双链写进最终回复（AC-027/ATR-AC-004）。
    await expect(
      page.getByText(`官网原文：${MOCK_OFFICIAL_URL}`),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByText(`归档原件：/api/rag/originals/${MOCK_DOC_VERSION_ID}`),
    ).toBeVisible();

    // 流式回答完成后必须保存非空assistant消息；生产缺reasoning_content时会在此之前
    // 中断并留下空会话，不能只验证RAG内部接口曾返回200。
    const conversationId = new URL(page.url()).searchParams.get("conversationId");
    expect(conversationId).toMatch(/^[0-9a-f-]{36}$/i);
    const saved = await page.evaluate(async (id) => {
      const res = await fetch(`/api/chat/${id}`);
      return { status: res.status, body: await res.json() };
    }, conversationId);
    expect(saved.status).toBe(200);
    const persistedMessages = saved.body.conversation.messages as Array<{
      role?: string;
      parts?: Array<{ type?: string; text?: unknown }>;
    }>;
    expect(
      persistedMessages.some(
        (message) =>
          message.role === "assistant" &&
          message.parts?.some(
            (part) =>
              part.type === "text" &&
              typeof part.text === "string" &&
              part.text.trim().length > 0,
          ) === true,
      ),
    ).toBe(true);

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

  test("“你是谁”返回角色说明，本轮无工具调用且不被知识库兜底语覆盖（ATR-AC-001）", async ({
    page,
  }) => {
    await login(page, E2E_USER_RAG, E2E_PASSPHRASE);
    // 已确认地区是更严格的场景：即使具备检索条件，身份问题也不得被强制路由到searchPolicy。
    await confirmShanghai(page);

    await page.locator("#chat-input").fill("你是谁");
    await page.getByRole("button", { name: "发送" }).click();

    // mock模型依据系统提示词直接回答人设；其自然表达含“社保政策”“相关规定”，
    // 旧输出正则会据此把整段替换为兜底语（PRD §2.2根因），新链路必须原样展示。
    await expect(page.getByText(/我是社保规划助手/)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/帮助您理解社保政策和相关规定/)).toBeVisible();
    await expect(page.getByText(/未在官方原文库中检索到可靠依据/)).toHaveCount(0);
    await expect(page.getByText(/官网原文：/)).toHaveCount(0);
    await expect(page.getByText(/归档原件：/)).toHaveCount(0);

    // 持久化会话：assistant消息只有文本part，不存在任何工具调用part（本轮零工具调用）。
    const conversationId = new URL(page.url()).searchParams.get("conversationId");
    expect(conversationId).toMatch(/^[0-9a-f-]{36}$/i);
    const saved = await page.evaluate(async (id) => {
      const res = await fetch(`/api/chat/${id}`);
      return { status: res.status, body: await res.json() };
    }, conversationId);
    expect(saved.status).toBe(200);
    const persistedMessages = saved.body.conversation.messages as Array<{
      role?: string;
      parts?: Array<{ type?: string; text?: unknown }>;
    }>;
    const assistantMessages = persistedMessages.filter((m) => m.role === "assistant");
    expect(assistantMessages.length).toBeGreaterThan(0);
    for (const message of assistantMessages) {
      for (const part of message.parts ?? []) {
        expect(String(part.type)).not.toMatch(/^tool-/);
        expect(part.type).not.toBe("dynamic-tool");
      }
    }
    const finalText = assistantMessages
      .at(-1)
      ?.parts?.find((part) => part.type === "text")?.text;
    expect(typeof finalText).toBe("string");
    expect(String(finalText)).toContain("我是社保规划助手");
    expect(String(finalText)).not.toContain("未在官方原文库中检索到可靠依据");
  });

  test("无可靠命中时模型如实说明且不编造来源（ATR-AC-005）", async ({ page }) => {
    // 复用同一注册用户（注册限流为套件级共享资源）；新上下文重新登录。
    await login(page, E2E_USER_RAG, E2E_PASSPHRASE);
    await confirmShanghai(page);

    await page.locator("#chat-input").fill("上海生育津贴标准是多少？");
    await page.getByRole("button", { name: "发送" }).click();

    // searchPolicy返回空hits：模型的最终回复如实说明且不含任何来源链接（不再由服务端改写）。
    await expect(
      page.getByText(/未在官方原文库中检索到可靠依据/),
    ).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/官网原文：/)).toHaveCount(0);
    await expect(page.getByText(/归档原件：/)).toHaveCount(0);
  });
});

/**
 * UAT第二轮崩溃回归（2026-09-14）：生产实证顶层output.warnings同时含
 * string×3与对象×1、calc.warnings为对象×4，旧实现对对象直接调用trim()
 * 导致历史恢复渲染时抛出"e.trim is not a function"页面崩溃。
 * 复用E2E_USER_RAG（注册限流5次/小时为套件级共享资源，不新增注册），
 * 经验收库fixture写入会话，验证恢复渲染与第三轮继续对话。
 */
test.describe.serial("混合warning工具消息恢复与继续对话（UAT回归）", () => {
  test("恢复含混合warning的会话不崩溃、警告归一化显示且可继续第三轮", async ({
    page,
  }) => {
    await loginViaApi(page, E2E_USER_RAG, E2E_PASSPHRASE);
    const conversationId = await seedMixedWarningConversation(E2E_USER_RAG);

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    await page.goto(`/chat?conversationId=${conversationId}`);
    await expect(page).toHaveURL(
      new RegExp(`conversationId=${conversationId}`),
    );

    // 历史恢复渲染：字符串警告与结构化warning.text均显示（trim+去重）。
    await expect(page.getByText("风险与提醒", { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("第一条警告", { exact: true })).toHaveCount(1);
    await expect(page.getByText("第二条警告", { exact: true })).toBeVisible();
    await expect(page.getByText("第三条警告", { exact: true })).toBeVisible();

    // 非法warning值（null/42/缺text对象/空白text）不得显示。
    await expect(page.getByText("[object Object]")).toHaveCount(0);
    await expect(page.getByText("42", { exact: true })).toHaveCount(0);
    await expect(page.getByText("missing-text")).toHaveCount(0);

    // 页面不崩溃：无pageerror（旧实现为 e.trim is not a function）且无错误页。
    expect(pageErrors).toEqual([]);
    await expect(page.getByText(/This page couldn.t load/i)).toHaveCount(0);

    // 第二轮工具消息之后仍可继续第三轮对话并得到回复。
    await page.locator("#chat-input").fill("好的，谢谢，请继续说明下一步。");
    await page.getByRole("button", { name: "发送" }).click();
    await expect(page.getByText("你好，我是本地 mock 回复。")).toBeVisible({
      timeout: 60_000,
    });
    expect(pageErrors).toEqual([]);
  });
});

/** 在验收库写入混合warning会话fixture：user消息+assistant工具输出（顶层与calc均含对象）。 */
async function seedMixedWarningConversation(username: string): Promise<string> {
  const connectionString = process.env.SOCILA_E2E_DATABASE_URL;
  if (!connectionString) {
    throw new Error("SOCILA_E2E_DATABASE_URL 未设置，无法写入会话fixture");
  }
  const pool = new Pool({ connectionString });
  try {
    const user = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE normalized_username = $1",
      [username],
    );
    if (user.rows.length === 0) {
      throw new Error(`fixture用户不存在：${username}`);
    }
    const conversationId = randomUUID();
    const messages = [
      {
        id: "fixture-user-1",
        role: "user",
        parts: [{ type: "text", text: "请帮我做一份社保规划" }],
      },
      {
        id: "fixture-assistant-1",
        role: "assistant",
        parts: [
          {
            type: "tool-computePlan",
            toolCallId: "fixture-call-1",
            toolName: "computePlan",
            state: "output-available",
            input: {},
            output: {
              success: true,
              warnings: [
                "  第一条警告  ",
                { warning_id: "w2", text: "第二条警告" },
                { text: "第一条警告" },
                null,
                42,
                { warning_id: "missing-text" },
              ],
              calc: {
                warnings: [
                  { warning_id: "w3", text: "第三条警告" },
                  { text: "   " },
                ],
              },
            },
          },
          { type: "text", text: "已为你生成社保规划方案，请查看风险与提醒。" },
        ],
      },
    ];
    await pool.query(
      "INSERT INTO conversations (id, owner_user_id, messages, user_profile) VALUES ($1, $2, $3, '{}'::jsonb)",
      [conversationId, user.rows[0].id, JSON.stringify(messages)],
    );
    return conversationId;
  } finally {
    await pool.end();
  }
}
