/**
 * AI Agent 定义与对话流创建
 *
 * 使用 Vercel AI SDK v6 的 streamText 创建支持多步工具调用的对话流。
 */

import { createOpenAI } from "@ai-sdk/openai";
import { streamText, stepCountIs } from "ai";
import type { ModelMessage } from "ai";
import { SYSTEM_PROMPT, buildContextPrompt } from "./prompts";
import type { AgentQuestion, UserProfileSummary } from "./prompts";
import { tools } from "./tools";
import { getOpenAIConfig } from "./config";

// ─── 上下文类型 ───────────────────────────────────────────────────────────────

export interface ChatContext {
  /** 规则引擎返回的待解决问题列表 */
  questions?: AgentQuestion[];
  /** 当前已知的用户画像信息 */
  userProfile?: UserProfileSummary;
  /** 归属用户 id，透传给 computePlan 工具用于给方案打 owner_user_id 归属标记（09-02） */
  ownerUserId?: string;
}

// ─── 消息类型（Vercel AI SDK v6 使用 ModelMessage）─────────────────────────

export type { ModelMessage as ChatMessage } from "ai";

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
  const openai = createOpenAI({ apiKey, baseURL });

  const contextPrompt = context
    ? buildContextPrompt(context.questions ?? [], context.userProfile)
    : "";

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
    // 把归属用户 id 透传给工具的 execute（AI SDK v6：execute 第二参 experimental_context）。
    experimental_context: { ownerUserId: context?.ownerUserId },
    // 增加步数上限，避免复杂对话里在输出结论前提前截断。
    stopWhen: stepCountIs(8),
    // 低温度：本 Agent 的职责是确定性的字段抽取 + 工具调用，尽量减少行为方差。
    temperature: 0.1,
    onFinish,
  });
}
