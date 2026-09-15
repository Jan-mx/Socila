/**
 * AI Agent 定义与对话流创建
 *
 * 使用 Vercel AI SDK v6 的 streamText 创建支持多步工具调用的对话流。
 *
 * 工具路由（ATR，docs/prd/09-15-feature-llm-autonomous-tool-routing.md）：
 * 全部工具（computePlan/validateField/updateProfile/searchPolicy）作为普通工具注册，
 * toolChoice 显式为 "auto"，由模型依据系统提示词、工具描述和会话上下文自主决定
 * 是否调用。服务端只负责鉴权、会话所有权、地区上下文、工具执行安全与持久化，
 * 不根据自然语言正则裁决用户意图，也不改写模型最终回答；工具边界内的输入、
 * 上下文与来源真实性校验位于各工具实现（见 search-policy.ts）。
 */

import { createOpenAI } from "@ai-sdk/openai";
import { streamText, stepCountIs } from "ai";
import type { ModelMessage } from "ai";
import { SYSTEM_PROMPT, buildContextPrompt } from "./prompts";
import type { AgentQuestion, UserProfileSummary } from "./prompts";
import { tools } from "./tools";
import { getOpenAIConfig } from "./config";
import { withDeepSeekCompat } from "./deepseek-compat";

// ─── 上下文类型 ───────────────────────────────────────────────────────────────

export interface ChatContext {
  /** 规则引擎返回的待解决问题列表 */
  questions?: AgentQuestion[];
  /** 当前已知的用户画像信息 */
  userProfile?: UserProfileSummary;
  /** 归属用户 id，透传给 computePlan 工具用于给方案打 owner_user_id 归属标记（09-02） */
  ownerUserId?: string;
  /** 会话已确认地区代码（任务3 JRP-FR-011/018）：computePlan/searchPolicy 工具据此校验请求一致性。 */
  confirmedJurisdictionCode?: string;
  /** Chat Route注入的当前服务器日期（YYYY-MM-DD）；提示词与searchPolicy共用。 */
  currentDate?: string;
}

// ─── 消息类型（Vercel AI SDK v6 使用 ModelMessage）─────────────────────────

export type { ModelMessage as ChatMessage } from "ai";

/** 以产品部署时区计算服务器日期；同一请求由route只调用一次。 */
export function formatServerDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.TZ || "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

// ─── 核心函数：创建对话流 ──────────────────────────────────────────────────────

/**
 * 创建社保规划助手的流式对话响应。
 *
 * @param messages - 对话历史消息数组（符合 Vercel AI SDK ModelMessage 格式）
 * @param context  - 可选的上下文信息，包含引擎问题列表和用户画像
 * @returns streamText 返回的 StreamTextResult，可直接转为 SSE 响应
 *
 * @example
 * ```typescript
 * // 在 /api/chat/route.ts 中使用
 * const stream = createChatStream(messages, {
 *   questions: engineResult.questions,
 *   userProfile: session.userProfile,
 * });
 * return stream.toUIMessageStreamResponse();
 * ```
 */
export function createChatStream(
  messages: ModelMessage[],
  context?: ChatContext,
  onFinish?: (result: { text: string }) => void | Promise<void>,
) {
  const { apiKey, baseURL, model } = getOpenAIConfig();
  // DeepSeek兼容（2026-09-14生产UAT）：工具结果后的auto步骤要求回传AI SDK未保留的
  // reasoning_content。适配器对DeepSeek /chat/completions中携带非空tools数组的整个
  // 工具循环注入thinking={type:"disabled"}；不带tools的普通请求保持默认thinking。
  const openai = createOpenAI({ apiKey, baseURL, fetch: withDeepSeekCompat(fetch) });

  const currentDate = context?.currentDate ?? formatServerDate();

  const contextPrompt = buildContextPrompt(
    context?.questions ?? [],
    context?.userProfile,
    currentDate,
  );

  const systemPrompt = contextPrompt
    ? `${SYSTEM_PROMPT}\n\n${contextPrompt}`
    : SYSTEM_PROMPT;

  return streamText({
    // PMG-FR-001：显式使用 Chat Completions 协议（OpenAI 兼容 POST /chat/completions）。
    // 不得回退到默认模型选择（AI SDK v3 默认走 /responses）：部署目标 DeepSeek
    // 与本地 mock 只提供 Chat Completions 接口。
    model: openai.chat(model),
    system: systemPrompt,
    messages,
    tools,
    // ATR-FR-002：全部工具对模型可见，由模型自主选择；不在任何步骤覆盖为强制某个工具。
    toolChoice: "auto",
    // 把归属用户 id、已确认地区代码与服务器日期透传给工具的 execute（AI SDK v6：execute 第二参 experimental_context）。
    experimental_context: {
      ownerUserId: context?.ownerUserId,
      confirmedJurisdictionCode: context?.confirmedJurisdictionCode,
      currentDate,
    },
    // 增加步数上限，避免复杂对话里在输出结论前提前截断。
    stopWhen: stepCountIs(8),
    // 低温度：本 Agent 的职责是确定性的字段抽取 + 工具调用，尽量减少行为方差。
    temperature: 0.1,
    onFinish,
  });
}
