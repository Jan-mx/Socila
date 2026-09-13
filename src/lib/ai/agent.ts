/**
 * AI Agent 定义与对话流创建
 *
 * 使用 Vercel AI SDK v6 的 streamText 创建支持多步工具调用的对话流。
 */

import { createOpenAI } from "@ai-sdk/openai";
import { streamText, stepCountIs } from "ai";
import type { ModelMessage, StreamTextTransform } from "ai";
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
  /** 会话已确认地区代码（任务3 JRP-FR-011/018）：computePlan 工具据此校验请求一致性。 */
  confirmedJurisdictionCode?: string;
  /** Chat Route注入的当前服务器日期（YYYY-MM-DD）；提示词与searchPolicy共用。 */
  currentDate?: string;
}

// ─── 消息类型（Vercel AI SDK v6 使用 ModelMessage）─────────────────────────

export type { ModelMessage as ChatMessage } from "ai";

export const SAFE_NO_POLICY_SOURCE_RESPONSE =
  "未在官方原文库中检索到可靠依据，无法提供政策事实或来源链接。请咨询12333或当地社保窗口。";

/** 以产品部署时区计算服务器日期；同一请求由route只调用一次。 */
export function formatServerDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env.TZ || "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function modelMessageText(message: ModelMessage): string {
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return "";
  return message.content
    .map((part) =>
      part && typeof part === "object" && "text" in part && typeof part.text === "string"
        ? part.text
        : "",
    )
    .join("");
}

/** 保守识别政策事实/来源问题；命中后模型文本在服务器内缓存至来源校验完成。 */
export function requiresPolicyProvenance(messages: ModelMessage[]): boolean {
  const lastUserIndex = messages.findLastIndex((message) => message.role === "user");
  if (lastUserIndex < 0) return false;
  const text = modelMessageText(messages[lastUserIndex]);
  const policySubject =
    /(政策|社保|养老|退休|医保|医疗保险|失业(?:保险|金)|生育津贴|工伤|缴费|最低工资|补贴|待遇)/;
  const policyFact =
    /(多少|标准|金额|比例|费率|条件|资格|期限|多久|几个月|年限|年龄|何时|什么时候|有效|依据|文件|来源|原文|规定|可领|领取)/;
  const userQuestion = /(?:多少|如何|怎么|是否|能否|可以吗|是什么|为什么|何时|什么时候|多久|吗|呢|[？?])/;
  const profileDeclaration =
    /(?:^|[，,。\s])(?:我|我的|本人).{0,30}(?:年龄|出生(?:年|月|日期)|性别|社保缴费年限|养老保险已缴|医保已缴|医疗保险已缴|就业状态).{0,20}(?:\d+(?:\.\d+)?\s*(?:岁|年|月|个月)?|男性|女性|男|女|在职|失业|灵活就业|退休)/;
  if (profileDeclaration.test(text) && !userQuestion.test(text)) {
    return false;
  }
  if (policySubject.test(text) && (policyFact.test(text) || /[？?]/.test(text))) {
    return true;
  }

  // 省略式追问本身可能不再重复“失业金/医保”等主体。仅在近期user/assistant
  // 上下文明确讨论政策事实，且最新消息具有短追问形态时继承该要求。
  const recentContext = messages
    .slice(Math.max(0, lastUserIndex - 6), lastUserIndex)
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map(modelMessageText)
    .join("\n");
  const priorPolicyFacts =
    policySubject.test(recentContext) &&
    (policyFact.test(recentContext) || /\d+(?:\.\d+)?\s*(?:元|%|％|岁|年|月|个月)/.test(recentContext));
  const ellipticalPolicyFollowUp =
    text.trim().length <= 80 &&
    /(?:第[一二三四五六七八九十\d]+(?:年|个月?)|前[一二三四五六七八九十\d]+个月?|后[一二三四五六七八九十\d]+个月?|之后|以后|标准|金额|比例|费率|条件|资格|期限|还能领|能领多久|多少|(?:这个|那个|这项|那项|这份|那份)(?:政策|文件|规定)|来源|原文)/.test(
      text.trim(),
    );
  return priorPolicyFacts && ellipticalPolicyFollowUp;
}

/** 把会话分类结果落实为首步强制searchPolicy，供streamText与契约测试共用。 */
export function getPolicySearchStep(
  messages: ModelMessage[],
  confirmedJurisdictionCode: string | undefined,
  stepNumber: number,
):
  | {
      activeTools: Array<keyof typeof tools>;
      toolChoice: { type: "tool"; toolName: "searchPolicy" };
    }
  | undefined {
  if (
    stepNumber !== 0 ||
    !confirmedJurisdictionCode ||
    !requiresPolicyProvenance(messages)
  ) {
    return undefined;
  }
  return {
    activeTools: ["searchPolicy"],
    toolChoice: { type: "tool", toolName: "searchPolicy" },
  };
}

/** 对模型最终文本做第二道识别，防止非政策问题下主动夹带无来源政策事实。 */
export function requiresPolicyOutputProvenance(text: string): boolean {
  const policySubject =
    /(政策|社保|养老|退休|医保|医疗保险|失业(?:保险|金)|生育津贴|工伤|缴费|最低工资|补贴|待遇)/;
  const policyFact =
    /(标准|金额|比例|费率|条件|资格|期限|年限|年龄|有效|依据|文件|来源|原文|规定|可领|领取|\d+(?:\.\d+)?\s*(?:元|%|％|岁|年|月|个月))/;
  const profileField =
    /(?:年龄|出生(?:年|月|日期)|性别|社保缴费年限|养老保险已缴|医保缴费年限|医保已缴|医疗保险已缴|就业状态)/;
  const policyAssertion =
    /(?:法定|领取|标准|金额|比例|费率|资格|补贴|待遇|政策|规定|有效|上限|下限|依据|来源|原文)/;
  const profileCollectionOrEcho =
    /(?:(?:请|麻烦).{0,20}(?:告诉|提供|补充|确认)|(?:已记录|收到|了解到|根据您提供)|(?:您|你)(?:的)?.{0,30}(?:是多少|是几|有多少|是否|吗|呢|[？?]))/;
  // UAT修复2026-09-14：能力自述豁免。助手在普通回复里自然带出的自我介绍/能力说明
  // （如“我是社保规划助手，主要帮你做缴费缺口和补贴测算”）不是政策事实断言；
  // 生产实证：普通祝福类问题的回复被旧逻辑误判并整段替换为兜底文本，普通对话无法返回。
  // 例外：句段含数量化事实（数字+单位/文号）或官方来源引用（gov.cn/归档路径）时，
  // 仍必须进入来源门禁——失败关闭语义不变。
  const capabilitySelfDescription =
    /(?:我是|我们是)|(?:主要)?帮你|为您|助手|顾问|规划师|随时告诉我/;
  const quantitativeFact =
    /\d+(?:\.\d+)?\s*(?:元|%|％|岁|年|个月|月)|〔\d{4}〕\s*\d+\s*号/;
  const officialSourceRef = /gov\.cn|\/api\/rag\/originals\/|〔\d{4}〕\s*\d+\s*号/;

  return text
    .split(/[。！？!?；;\r\n]+/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .some((segment) => {
      // 助手人设/服务性句段（且无数量化事实、无官方来源引用）整体豁免。
      const capabilityExempt =
        capabilitySelfDescription.test(segment) &&
        !quantitativeFact.test(segment) &&
        !officialSourceRef.test(segment);
      let profileEchoContext = false;
      return segment
        .split(/[，,]+/)
        .map((fragment) => fragment.trim())
        .filter(Boolean)
        .some((fragment) => {
          const startsProfileContext = profileCollectionOrEcho.test(fragment);
          if (startsProfileContext) profileEchoContext = true;
          const pureProfileFragment =
            profileField.test(fragment) &&
            (startsProfileContext || profileEchoContext) &&
            !policyAssertion.test(fragment);
          return (
            !capabilityExempt &&
            !pureProfileFragment &&
            policySubject.test(fragment) &&
            policyFact.test(fragment)
          );
        });
    });
}

interface PolicyHitLike {
  documentVersionId?: unknown;
  documentTitle?: unknown;
  authority?: unknown;
  officialUrl?: unknown;
  originalDownloadPath?: unknown;
}

interface PolicyToolOutputLike {
  success?: unknown;
  hits?: unknown;
  noReliableHits?: unknown;
}

function trustedPolicyHits(outputs: unknown[]): PolicyHitLike[] {
  const successful = [...outputs].reverse().find((value) => {
    const output = value as PolicyToolOutputLike;
    return output?.success === true && output.noReliableHits === false && Array.isArray(output.hits);
  }) as PolicyToolOutputLike | undefined;
  if (!successful || !Array.isArray(successful.hits) || successful.hits.length === 0) return [];
  return successful.hits.filter((value): value is PolicyHitLike => {
    if (!value || typeof value !== "object") return false;
    const hit = value as PolicyHitLike;
    if (
      typeof hit.documentVersionId !== "string" ||
      typeof hit.documentTitle !== "string" ||
      hit.documentTitle.trim() === "" ||
      typeof hit.authority !== "string" ||
      hit.authority.trim() === "" ||
      typeof hit.officialUrl !== "string" ||
      typeof hit.originalDownloadPath !== "string"
    ) return false;
    try {
      const official = new URL(hit.officialUrl);
      const officialHost = official.hostname.toLowerCase();
      return (
        official.protocol === "https:" &&
        (officialHost === "gov.cn" || officialHost.endsWith(".gov.cn")) &&
        hit.originalDownloadPath === `/api/rag/originals/${hit.documentVersionId}`
      );
    } catch {
      return false;
    }
  });
}

/**
 * 最终政策文本门禁：只有真实searchPolicy成功命中且模型只引用命中返回的官网/归档
 * 双链时放行；跳过工具、无命中、缺provenance或任一编造URL均替换为无事实安全答复。
 */
export function evaluatePolicyProvenance(
  text: string,
  searchPolicyOutputs: unknown[],
): { accepted: boolean; text: string } {
  const hits = trustedPolicyHits(searchPolicyOutputs);
  if (hits.length === 0) return { accepted: false, text: SAFE_NO_POLICY_SOURCE_RESPONSE };

  const approvedOfficial = new Set(hits.map((hit) => String(hit.officialUrl)));
  const approvedArchive = new Set(hits.map((hit) => String(hit.originalDownloadPath)));
  const destinations = extractRenderedDestinations(text);
  const emittedOfficial = destinations.filter((destination) => /^https?:\/\//i.test(destination));
  const emittedArchive = destinations.filter((destination) =>
    destination.startsWith("/api/rag/originals/"),
  );
  const containsPairedCitation = hits.some(
    (hit) =>
      emittedOfficial.includes(String(hit.officialUrl)) &&
      emittedArchive.includes(String(hit.originalDownloadPath)),
  );
  const onlyApprovedLinks =
    destinations.every(
      (destination) =>
        approvedOfficial.has(destination) || approvedArchive.has(destination),
    );
  if (!containsPairedCitation || !onlyApprovedLinks) {
    return { accepted: false, text: SAFE_NO_POLICY_SOURCE_RESPONSE };
  }
  return { accepted: true, text };
}

/** 提取Markdown链接、自动链接与纯文本中完整的URL/归档路径，不截断查询或路径后缀。 */
function extractRenderedDestinations(text: string): string[] {
  const destinations = new Set<string>();
  const referenceDefinitions = new Map<string, string>();
  const normalizeLabel = (label: string) => label.trim().replace(/\s+/g, " ").toLowerCase();
  const referenceDefinition =
    /^[ \t]{0,3}\[([^\]]+)\]:[ \t]*(?:<([^>\r\n]+)>|([^\s\r\n]+))(?:[ \t]+(?:"[^"]*"|'[^']*'|\([^)]*\)))?[ \t]*$/gm;
  for (const match of text.matchAll(referenceDefinition)) {
    referenceDefinitions.set(normalizeLabel(match[1]), match[2] ?? match[3]);
  }

  const markdownLinks = /!?\[[^\]]*\]\(\s*([^\r\n)]+)\s*\)/g;
  for (const match of text.matchAll(markdownLinks)) {
    let destination = match[1].trim();
    if (destination.startsWith("<") && destination.includes(">")) {
      destination = destination.slice(1, destination.indexOf(">"));
    } else {
      destination = destination.split(/\s+(?=["'])/, 1)[0];
    }
    if (destination) destinations.add(destination);
  }

  // CommonMark完整/折叠引用链接：[text][label]、[label][]。只验证实际被引用的定义；
  // 未使用的定义不会渲染为href，故不进入集合。
  const referenceLink = /!?\[([^\]]+)\]\[([^\]]*)\]/g;
  for (const match of text.matchAll(referenceLink)) {
    const label = normalizeLabel(match[2] || match[1]);
    const destination = referenceDefinitions.get(label);
    if (destination) destinations.add(destination);
  }

  // 全角/半角标点与括号同时作为终止符：路径后紧跟全角括号补充说明（如“（登录后可下载）”）
  // 不得把括号内容粘进路径，否则精确来源校验会误判为编造链接（UAT修复2026-09-14）。
  const plainDestinations =
    text.match(
      /(?:[a-z][a-z0-9+.-]*:\/\/|\/\/[a-z0-9.-]+|\/api\/rag\/originals\/)[^\s<>(（)"'）\]}，,；;。：？！]+/gi,
    ) ?? [];
  for (const destination of plainDestinations) destinations.add(destination);
  return [...destinations];
}

/** 缓存政策回答全部文本token，直到真实工具结果与双链校验结束，避免失败时首token泄漏。 */
function policyProvenanceTransform(
  requestedPolicyFacts: boolean,
): StreamTextTransform<typeof tools> {
  return () => {
    let bufferedText = "";
    let textId = "policy-provenance-enforced";
    const outputs: unknown[] = [];
    return new TransformStream({
      transform(part, controller) {
        if (part.type === "tool-result" && part.toolName === "searchPolicy") {
          outputs.push(part.output);
          controller.enqueue(part);
          return;
        }
        if (part.type === "text-start") {
          textId = part.id;
          return;
        }
        if (part.type === "text-delta") {
          bufferedText += part.text;
          return;
        }
        if (part.type === "text-end") return;
        if (part.type === "finish") {
          const needsProvenance =
            requestedPolicyFacts || requiresPolicyOutputProvenance(bufferedText);
          const checked = needsProvenance
            ? evaluatePolicyProvenance(bufferedText, outputs)
            : { accepted: true, text: bufferedText };
          controller.enqueue({ type: "text-start", id: textId });
          controller.enqueue({ type: "text-delta", id: textId, text: checked.text });
          controller.enqueue({ type: "text-end", id: textId });
        }
        controller.enqueue(part);
      },
    });
  };
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
  // DeepSeek兼容（2026-09-14探测矩阵）：默认thinking拒绝强制tool_choice（生产UAT
  // 阻断"Thinking mode does not support this tool_choice"）。适配器仅对DeepSeek
  // /chat/completions且显式tool_choice的JSON请求注入thinking={type:"disabled"}；
  // 普通对话与tool_choice=auto保持默认thinking；首步强制searchPolicy来源门禁不变。
  const openai = createOpenAI({ apiKey, baseURL, fetch: withDeepSeekCompat(fetch) });

  const currentDate = context?.currentDate ?? formatServerDate();
  // 未确认地区时模型仍需能追问地区；确认后才允许进入政策检索/事实输出门禁。
  const policyProvenanceRequired =
    Boolean(context?.confirmedJurisdictionCode) && requiresPolicyProvenance(messages);

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
    // 把归属用户 id 与已确认地区代码透传给工具的 execute（AI SDK v6：execute 第二参 experimental_context）。
    experimental_context: {
      ownerUserId: context?.ownerUserId,
      confirmedJurisdictionCode: context?.confirmedJurisdictionCode,
      currentDate,
    },
    // 真实Provider应在首步被强制调用searchPolicy；流变换仍校验Provider是否违规跳过。
    prepareStep: ({ stepNumber }) =>
      getPolicySearchStep(messages, context?.confirmedJurisdictionCode, stepNumber),
    experimental_transform: policyProvenanceTransform(policyProvenanceRequired),
    // 增加步数上限，避免复杂对话里在输出结论前提前截断。
    stopWhen: stepCountIs(8),
    // 低温度：本 Agent 的职责是确定性的字段抽取 + 工具调用，尽量减少行为方差。
    temperature: 0.1,
    onFinish,
  });
}
