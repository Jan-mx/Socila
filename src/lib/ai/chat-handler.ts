import { convertToModelMessages, type ModelMessage, type UIMessage } from "ai";
import type { ChatContext } from "./agent";

export interface ConversationRecord {
  id: string;
  sessionId?: string | null;
  messages: unknown[];
  userProfile: Record<string, unknown>;
}

export interface ConversationStore {
  get(id: string): Promise<ConversationRecord | null>;
  create(data: { id?: string; sessionId: string }): Promise<ConversationRecord | null | undefined>;
  update(id: string, data: { messages?: unknown[]; userProfile?: Record<string, unknown> }): Promise<ConversationRecord | null | undefined>;
}

interface ChatStream {
  totalUsage: PromiseLike<unknown>;
  steps: PromiseLike<unknown[]>;
  toUIMessageStreamResponse(options: {
    originalMessages: UIMessage[];
    onFinish: (event: { messages: UIMessage[] }) => Promise<void>;
    onError: (error: unknown) => string;
  }): Response;
}

export interface ChatHandlerLogger {
  warn(event: string, data?: Record<string, unknown>): void;
}

export function createChatRequestHandler(dependencies: {
  conversationStore: ConversationStore;
  streamFactory: (messages: ModelMessage[], context: ChatContext) => ChatStream;
  convertMessages?: (messages: UIMessage[]) => Promise<ModelMessage[]>;
  logger?: ChatHandlerLogger;
}) {
  const convertMessages = dependencies.convertMessages ?? convertToModelMessages;
  const logger = dependencies.logger ?? { warn() {} };

  return {
    async handle(input: {
      rawMessages: unknown[];
      requestedConversationId?: string;
      sessionId: string;
      userProfile?: Record<string, unknown>;
      questions?: ChatContext["questions"];
    }) {
      const existing = input.requestedConversationId
        ? await dependencies.conversationStore.get(input.requestedConversationId)
        : null;
      if (existing && existing.sessionId !== input.sessionId) {
        return { status: 403 as const, error: "无权限访问该会话" };
      }
      const conversation = existing ?? await dependencies.conversationStore.create({
        id: input.requestedConversationId,
        sessionId: input.sessionId,
      });
      if (!conversation) return { status: 500 as const, error: "无法创建会话" };

      const uiMessages = input.rawMessages as UIMessage[];
      try {
        await dependencies.conversationStore.update(conversation.id, {
          messages: uiMessages as unknown[],
          userProfile: input.userProfile,
        });
      } catch (error) {
        logger.warn("chat.persist_snapshot_failed", errorData(error, conversation.id));
      }

      const modelMessages = await convertMessages(uiMessages);
      const stream = dependencies.streamFactory(modelMessages, {
        questions: input.questions,
        userProfile: input.userProfile as ChatContext["userProfile"],
        sessionId: input.sessionId,
      });
      let resolveFinished!: () => void;
      const finished = new Promise<void>((resolve) => { resolveFinished = resolve; });
      const response = stream.toUIMessageStreamResponse({
        originalMessages: uiMessages,
        onFinish: async ({ messages }) => {
          try {
            await dependencies.conversationStore.update(conversation.id, {
              messages: messages as unknown[],
              userProfile: input.userProfile,
            });
          } catch (error) {
            logger.warn("chat.persist_finish_failed", errorData(error, conversation.id));
          } finally {
            resolveFinished();
          }
        },
        onError: (error) => {
          logger.warn("chat.stream_error", errorData(error, conversation.id));
          resolveFinished();
          return "抱歉，回复中断了。请发送“继续”，我会接着回答。";
        },
      });
      return {
        status: 200 as const,
        response,
        conversationId: conversation.id,
        totalUsage: stream.totalUsage,
        steps: stream.steps,
        finished,
      };
    },
  };
}

function errorData(error: unknown, conversationId: string) {
  return {
    error_message: error instanceof Error ? error.message : String(error),
    conversation_id: conversationId,
  };
}
