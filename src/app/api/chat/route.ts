import { NextRequest, NextResponse, after } from "next/server";
import { createChatStream } from "@/lib/ai/agent";
import type { ChatContext } from "@/lib/ai/agent";
import type { UIMessage } from "ai";
import { convertToModelMessages } from "ai";
import { createRequestLogger } from "@/lib/logging";
import { conversationReads } from "@/server/modules/conversation/application";
import { conversationWrites } from "@/server/modules/conversation/application";
import {
  attachAnonymousSessionCookie,
  ensureAnonymousSession,
} from "@/lib/security/anon-session";
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getClientIp,
} from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 4000;
const MAX_TOTAL_CHARS = 20000;
const CHAT_RATE_LIMIT = 30;
const CHAT_RATE_WINDOW_MS = 60_000;
const MAX_REQUEST_BYTES = 1_048_576; // 1 MB — reject oversized bodies before parsing

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function estimateMessageChars(messages: unknown[]): number {
  let total = 0;

  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const m = message as Record<string, unknown>;

    if (typeof m.content === "string") {
      total += m.content.length;
    }

    if (!Array.isArray(m.parts)) continue;
    for (const part of m.parts) {
      if (!part || typeof part !== "object") continue;
      const p = part as Record<string, unknown>;
      if (typeof p.text === "string") {
        total += p.text.length;
      }
    }
  }

  return total;
}

function exceedsSingleMessageLimit(messages: unknown[]): boolean {
  return messages.some((message) => {
    if (!message || typeof message !== "object") return false;
    const m = message as Record<string, unknown>;

    if (typeof m.content === "string" && m.content.length > MAX_MESSAGE_CHARS) {
      return true;
    }

    if (!Array.isArray(m.parts)) return false;
    for (const part of m.parts) {
      if (!part || typeof part !== "object") continue;
      const p = part as Record<string, unknown>;
      if (typeof p.text === "string" && p.text.length > MAX_MESSAGE_CHARS) {
        return true;
      }
    }

    return false;
  });
}

export async function POST(req: NextRequest) {
  const logger = createRequestLogger();

  // Reject oversized bodies before parsing them into memory (DoS guard).
  const contentLengthRaw = req.headers.get("content-length");
  const contentLength = contentLengthRaw ? parseInt(contentLengthRaw, 10) : 0;
  if (!Number.isNaN(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    logger.warn("chat.body_too_large", { contentLength });
    return NextResponse.json({ error: "请求体过大" }, { status: 413 });
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    logger.warn("chat.invalid_json");
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("messages" in body) ||
    !Array.isArray((body as Record<string, unknown>).messages)
  ) {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }

  const typedBody = body as Record<string, unknown>;
  const rawMessages = typedBody.messages as unknown[];
  const legacySessionId =
    typeof typedBody.sessionId === "string" ? typedBody.sessionId : undefined;

  const { sessionId, isNewSession } = ensureAnonymousSession(req, legacySessionId);
  const clientIp = getClientIp(req);
  const rateLimit = checkRateLimit(`chat:${clientIp}`, {
    limit: CHAT_RATE_LIMIT,
    windowMs: CHAT_RATE_WINDOW_MS,
  });

  const respondJson = (payload: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(payload, init);
    applyRateLimitHeaders(response, rateLimit, CHAT_RATE_LIMIT);
    if (isNewSession) {
      attachAnonymousSessionCookie(response, sessionId);
    }
    return response;
  };

  if (!rateLimit.allowed) {
    logger.warn("chat.rate_limited", { session_id: sessionId, client_ip: clientIp });
    return respondJson({ error: "请求过于频繁，请稍后重试" }, { status: 429 });
  }

  const isValidMessages = rawMessages.every(
    (m) =>
      m !== null &&
      typeof m === "object" &&
      "role" in (m as object) &&
      ("parts" in (m as object) || "content" in (m as object)),
  );

  if (!isValidMessages) {
    return respondJson({ error: "请求格式错误" }, { status: 400 });
  }

  if (rawMessages.length > MAX_MESSAGES) {
    return respondJson(
      { error: `消息过多，最多支持 ${MAX_MESSAGES} 条` },
      { status: 413 },
    );
  }

  const totalChars = estimateMessageChars(rawMessages);
  if (totalChars > MAX_TOTAL_CHARS) {
    return respondJson(
      { error: `内容过长，最多支持 ${MAX_TOTAL_CHARS} 字符` },
      { status: 413 },
    );
  }

  if (exceedsSingleMessageLimit(rawMessages)) {
    return respondJson(
      { error: `单条消息过长，最多支持 ${MAX_MESSAGE_CHARS} 字符` },
      { status: 413 },
    );
  }

  const metadata = isObjectRecord(typedBody.metadata)
    ? typedBody.metadata
    : undefined;
  const metadataCustom =
    metadata && isObjectRecord(metadata.custom) ? metadata.custom : undefined;
  const requestedConversationId =
    typeof typedBody.conversationId === "string"
      ? typedBody.conversationId
      : typeof typedBody.id === "string"
        ? typedBody.id
        : undefined;
  const userProfile = isObjectRecord(typedBody.userProfile)
    ? typedBody.userProfile
    : isObjectRecord(metadataCustom?.userProfile)
      ? (metadataCustom.userProfile as Record<string, unknown>)
      : undefined;
  const questions = Array.isArray(typedBody.questions)
    ? typedBody.questions
    : Array.isArray(metadataCustom?.questions)
      ? metadataCustom.questions
      : undefined;

  const context: ChatContext = {
    questions: questions as ChatContext["questions"],
    userProfile: userProfile as ChatContext["userProfile"],
    sessionId,
  };

  logger.info("chat.request", {
    message_count: rawMessages.length,
    session_id: sessionId,
  });

  try {
    const conversation = requestedConversationId
      ? await conversationReads.getConversation(requestedConversationId).then(async (existing) => {
          if (existing) {
            if (!existing.sessionId || existing.sessionId !== sessionId) {
              return null;
            }
            return existing;
          }

          return conversationWrites.createConversation({
            id: requestedConversationId,
            sessionId,
          });
        })
      : await conversationWrites.createConversation({ sessionId });

    if (requestedConversationId && conversation === null) {
      return respondJson({ error: "无权限访问该会话" }, { status: 403 });
    }

    if (!conversation) {
      return respondJson({ error: "无法创建会话" }, { status: 500 });
    }

    const uiMessages = rawMessages as UIMessage[];

    // 先保存本轮输入快照，避免流式中断时会话完全丢失。
    try {
      await conversationWrites.updateConversation(conversation.id, {
        messages: uiMessages as unknown[],
        userProfile,
      });
    } catch (persistErr) {
      logger.warn("chat.persist_snapshot_failed", {
        error_message:
          persistErr instanceof Error ? persistErr.message : String(persistErr),
        conversation_id: conversation.id,
      });
    }

    const messages = await convertToModelMessages(uiMessages);
    const result = createChatStream(messages, context);

    // token / 成本 / 步数观测：用 after() 注册到响应之后执行，确保 serverless 函数
    // 在挂起前 flush 这些日志（裸 fire-and-forget 可能随函数冻结而丢失）。
    after(async () => {
      try {
        const usage = await result.totalUsage;
        logger.info("chat.usage", {
          conversation_id: conversation.id,
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          total_tokens: usage.totalTokens,
        });
      } catch {
        // 流式中断时 totalUsage 可能 reject，忽略。
      }
      try {
        const steps = await result.steps;
        logger.info("chat.steps", {
          conversation_id: conversation.id,
          step_count: steps.length,
        });
      } catch {
        // ignore
      }
    });

    const response = result.toUIMessageStreamResponse({
      originalMessages: uiMessages,
      onFinish: async ({ messages: persistedMessages }) => {
        try {
          await conversationWrites.updateConversation(conversation.id, {
            messages: persistedMessages as unknown[],
            userProfile,
          });
        } catch (persistErr) {
          logger.warn("chat.persist_finish_failed", {
            error_message:
              persistErr instanceof Error ? persistErr.message : String(persistErr),
            conversation_id: conversation.id,
          });
        }
      },
      onError: (streamErr) => {
        logger.warn("chat.stream_error", {
          error_message:
            streamErr instanceof Error ? streamErr.message : String(streamErr),
          conversation_id: conversation.id,
        });
        return "抱歉，回复中断了。请发送“继续”，我会接着回答。";
      },
    });
    response.headers.set("x-request-id", logger.requestId);
    response.headers.set("x-conversation-id", conversation.id);
    applyRateLimitHeaders(response, rateLimit, CHAT_RATE_LIMIT);
    if (isNewSession) {
      attachAnonymousSessionCookie(response, sessionId);
    }

    return response;
  } catch (err) {
    const isAiError =
      err instanceof Error &&
      (err.message.includes("OpenAI") ||
        err.message.includes("openai") ||
        err.message.includes("OPENAI_") ||
        err.constructor.name.includes("AI") ||
        err.constructor.name.includes("OpenAI"));

    if (isAiError) {
      logger.error("chat.ai_error", {
        error_message: err instanceof Error ? err.message : String(err),
      });
      return respondJson(
        { error: "服务暂时不可用，请稍后重试" },
        { status: 503 },
      );
    }

    logger.error("chat.internal_error", {
      error_message: err instanceof Error ? err.message : String(err),
    });
    return respondJson({ error: "服务器内部错误" }, { status: 500 });
  }
}
