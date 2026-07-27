"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePartPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import { AssistantChatTransport, useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import type {
  EmptyMessagePartProps,
  ToolCallMessagePartProps,
} from "@assistant-ui/core/react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { getLegacySessionId } from "@/lib/client/session";
import { ToolResultCard } from "./ToolResultCard";
import { createConversationTrackingFetch } from "./conversation-runtime";
import type { EmitQuestionAction } from "@/types/engine";

interface AgentQuestionOption {
  value: string;
  label: string;
}

interface AgentQuestion {
  question_id: string;
  field: string;
  label: string;
  hint?: string;
  options?: AgentQuestionOption[];
}

interface ComputePlanOutput {
  plan_id?: string;
  needs_agent?: boolean;
  questions?: AgentQuestion[];
  [key: string]: unknown;
}

interface UpdateProfileOutput {
  profile?: Record<string, unknown>;
}

export interface ChatPanelProps {
  questions?: EmitQuestionAction["value"][];
  userProfile?: Record<string, unknown>;
  planId?: string;
  onPlanComputed?: (newPlanId: string, conversationId: string) => void;
  onConversationCreated?: (conversationId: string) => void;
  conversationId?: string;
  initialMessages?: UIMessage[];
}

function makeWelcomeText(questions?: EmitQuestionAction["value"][]): string {
  if (questions && questions.length > 0) {
    return `您好！我是社保小助手。系统还需要了解以下信息才能为您完成规划：\n\n${questions
      .map((q) => `• ${q.text}`)
      .join("\n")}\n\n您可以直接用文字描述，不必逐一填写。`;
  }

  return "您好！我是社保小助手。\n\n请描述您的社保情况，例如：出生年月、性别、已缴养老/医保月数等，我来帮您规划最优方案。";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Deep merge source into target (mutates target).
 * Arrays are replaced, not concatenated.
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target[key];
    if (
      isRecord(sv) &&
      isRecord(tv)
    ) {
      deepMerge(tv, sv);
    } else if (sv !== null && sv !== undefined) {
      target[key] = sv;
    }
  }
  return target;
}

function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className="typing-dot h-1.5 w-1.5 rounded-full bg-primary inline-block"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="typing-dot h-1.5 w-1.5 rounded-full bg-primary inline-block"
        style={{ animationDelay: "200ms" }}
      />
      <span
        className="typing-dot h-1.5 w-1.5 rounded-full bg-primary inline-block"
        style={{ animationDelay: "400ms" }}
      />
    </span>
  );
}

function UserMessageText() {
  return (
    <MessagePartPrimitive.Text className="whitespace-pre-wrap text-[1.1rem] leading-9 text-white" />
  );
}

function AssistantMessageText() {
  return (
    <MarkdownTextPrimitive
      className="prose prose-base max-w-none text-[1.1rem] leading-9 text-foreground [&_p]:my-3 [&_ol]:my-3 [&_ul]:my-3 [&_li]:my-1.5 [&_h1]:mb-3 [&_h1]:mt-5 [&_h2]:mb-2.5 [&_h2]:mt-4 [&_h3]:mb-2 [&_h3]:mt-3.5 [&_strong]:font-semibold [&_code]:rounded-md [&_code]:bg-primary-light/55 [&_code]:px-1.5 [&_code]:py-0.5 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border [&_pre]:bg-background-elevated [&_pre]:p-3 [&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-primary/45 [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground"
    />
  );
}

function AssistantMessageEmpty({ status }: EmptyMessagePartProps) {
  if (status.type !== "running") return null;

  return (
    <div className="rounded-2xl rounded-bl-md border border-border bg-card px-5 py-4 shadow-md">
      <LoadingDots />
    </div>
  );
}

function ToolPendingCard({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-border bg-background-elevated px-3 py-2 text-xs text-muted-foreground">
      {label}处理中...
    </div>
  );
}

function UnknownToolPart({ toolName }: ToolCallMessagePartProps) {
  return (
    <div className="rounded-xl border border-border bg-background-elevated p-3 text-xs text-muted-foreground">
      <span className="font-medium">{toolName}</span>：已完成
    </div>
  );
}

function ValidateFieldToolPart(props: ToolCallMessagePartProps) {
  if (props.status.type === "running" && props.result === undefined) {
    return <ToolPendingCard label="字段校验" />;
  }

  if (props.result === undefined) {
    return null;
  }

  return <ToolResultCard toolName="validateField" result={props.result} />;
}

function ComputePlanToolPart(props: ToolCallMessagePartProps) {
  const aui = useAui();
  const isRunning = useAuiState((s) => s.thread.isRunning);

  const handleOptionSelect = useCallback(
    (text: string) => {
      if (isRunning) return;
      aui.thread().append({
        content: [{ type: "text", text }],
        runConfig: aui.composer().getState().runConfig,
      });
    },
    [aui, isRunning],
  );

  if (props.status.type === "running" && props.result === undefined) {
    return <ToolPendingCard label="方案计算" />;
  }

  if (!isRecord(props.result)) {
    return null;
  }

  const output = props.result as ComputePlanOutput;
  const questionsWithOptions = Array.isArray(output.questions)
    ? output.questions.filter((q) => Array.isArray(q.options) && q.options.length > 0)
    : [];

  return (
    <div className="space-y-3">
      <ToolResultCard toolName="computePlan" result={output} />

      {questionsWithOptions.map((q) => (
        <div key={q.question_id} className="space-y-1">
          <p className="text-xs text-muted-foreground">请选择：</p>
          <div className="flex flex-wrap gap-2">
            {q.options!.map((opt) => (
              <button
                type="button"
                key={`${q.question_id}-${opt.value}`}
                onClick={() => handleOptionSelect(opt.label)}
                className="cursor-pointer rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-primary-light hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function UserMessageRow() {
  return (
    <MessagePrimitive.Root className="flex w-full justify-end gap-5 py-2">
      <div className="max-w-[82%] rounded-2xl rounded-br-md border border-primary/35 bg-primary px-6 py-5 shadow-md">
        <MessagePrimitive.Parts
          components={{
            Text: UserMessageText,
          }}
        />
      </div>

      <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-white/80 text-base font-semibold text-foreground">
        我
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessageRow() {
  const toolRenderers = useMemo(
    () => ({
      by_name: {
        computePlan: ComputePlanToolPart,
        validateField: ValidateFieldToolPart,
        updateProfile: () => null,
      },
      Fallback: UnknownToolPart,
    }),
    [],
  );

  return (
    <MessagePrimitive.Root className="flex w-full justify-start gap-5 py-2">
      <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10">
        <span className="text-base font-bold text-primary">智</span>
      </div>

      <div className="max-w-[82%] space-y-4">
        <MessagePrimitive.Parts
          components={{
            Text: AssistantMessageText,
            Empty: AssistantMessageEmpty,
            tools: toolRenderers,
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

function ChatComposer() {
  const canSend = useAuiState(
    (s) => !s.composer.isEmpty && !s.thread.isRunning && !s.thread.isDisabled,
  );

  return (
    <ComposerPrimitive.Root className="flex items-end gap-4 rounded-2xl border border-border bg-background-elevated px-5 py-4 shadow-md transition-colors focus-within:border-primary/55 sm:gap-4 sm:px-6 sm:py-4.5">
      <label htmlFor="chat-input" className="sr-only">
        输入消息
      </label>

      <ComposerPrimitive.Input
        id="chat-input"
        rows={1}
        maxRows={6}
        submitMode="enter"
        placeholder="描述您的社保情况，例如：出生年月、性别、已缴月数…"
        className="max-h-44 flex-1 resize-none overflow-y-auto bg-transparent text-[1.02rem] leading-8 text-foreground placeholder:text-muted-foreground focus:outline-none"
      />

      <ComposerPrimitive.Send
        disabled={!canSend}
        aria-label="发送"
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card",
          canSend
            ? "cursor-pointer bg-primary text-white shadow-md hover:bg-primary-hover"
            : "cursor-not-allowed bg-muted text-muted-foreground",
        )}
      >
        <ArrowUp className="h-5 w-5" />
      </ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  );
}

const QUICK_PROMPTS = [
  "我想了解退休方案",
  "计算养老金缺口",
  "查询补贴资格",
  "医保断缴怎么处理",
];

export function ChatPanel({
  questions,
  userProfile,
  planId,
  onPlanComputed,
  onConversationCreated,
  conversationId: externalConversationId,
  initialMessages,
}: ChatPanelProps) {
  // Stable conversationId: use provided or generate once at mount.
  const [conversationId] = useState(
    () => externalConversationId ?? crypto.randomUUID(),
  );
  const [sessionId] = useState(() => getLegacySessionId());
  const [acknowledgedConversationId, setAcknowledgedConversationId] = useState<
    string | null
  >(() => externalConversationId ?? null);

  // Session state: accumulated user profile across turns.
  const [sessionProfile, setSessionProfile] = useState<Record<string, unknown>>(
    () => (userProfile ? JSON.parse(JSON.stringify(userProfile)) : {}),
  );

  const handleConversationReady = useCallback((nextConversationId: string) => {
    setAcknowledgedConversationId((current) =>
      current === nextConversationId ? current : nextConversationId,
    );
  }, []);

  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: "/api/chat",
        fetch: createConversationTrackingFetch(handleConversationReady),
        prepareSendMessagesRequest: async (options) => {
          const body = isRecord(options.body)
            ? options.body
            : ({} as Record<string, unknown>);

          return {
            ...options,
            body: {
              ...body,
              id: options.id,
              messages: options.messages,
              trigger: options.trigger,
              messageId: options.messageId,
              metadata: options.requestMetadata,
              conversationId,
              sessionId,
              questions,
              userProfile: sessionProfile,
              planId,
            },
          };
        },
      }),
    [
      conversationId,
      handleConversationReady,
      planId,
      questions,
      sessionId,
      sessionProfile,
    ],
  );

  const chat = useChat({
    id: conversationId,
    transport,
    messages: initialMessages ?? [],
    onFinish: ({ message }) => {
      const parts = Array.isArray((message as { parts?: unknown }).parts)
        ? (message.parts as Array<Record<string, unknown>>)
        : [];

      for (const part of parts) {
        const rawType = typeof part.type === "string" ? part.type : "";
        if (!rawType.startsWith("tool-") && rawType !== "dynamic-tool") {
          continue;
        }

        const toolName =
          typeof part.toolName === "string"
            ? part.toolName
            : rawType.replace("tool-", "");
        const toolState = typeof part.state === "string" ? part.state : "";
        const output = part.output;

        if (
          toolName === "computePlan" &&
          toolState === "output-available" &&
          isRecord(output)
        ) {
          const planIdFromTool =
            typeof output.plan_id === "string" ? output.plan_id : undefined;
          const needsAgent = output.needs_agent === true;

          if (planIdFromTool && !needsAgent && onPlanComputed) {
            onPlanComputed(planIdFromTool, conversationId);
          }
        }

        if (
          toolName === "updateProfile" &&
          toolState === "output-available" &&
          isRecord(output)
        ) {
          const typedOutput = output as UpdateProfileOutput;
          if (isRecord(typedOutput.profile)) {
            setSessionProfile((prev) =>
              deepMerge({ ...prev }, typedOutput.profile!),
            );
          }
        }
      }
    },
  });

  const runtime = useAISDKRuntime(chat);
  const welcomeText = makeWelcomeText(questions);

  const notifiedRef = useRef(false);

  useEffect(() => {
    if (
      notifiedRef.current ||
      externalConversationId ||
      !acknowledgedConversationId ||
      !onConversationCreated
    ) {
      return;
    }

    onConversationCreated(acknowledgedConversationId);
    notifiedRef.current = true;
  }, [
    acknowledgedConversationId,
    externalConversationId,
    onConversationCreated,
  ]);

  const AssistantMessageView = useCallback(function AssistantMessageView() {
    return <AssistantMessageRow />;
  }, []);

  const messageComponents = useMemo(
    () => ({
      UserMessage: UserMessageRow,
      AssistantMessage: AssistantMessageView,
    }),
    [AssistantMessageView],
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex h-full flex-col">
        <div className="relative flex-1 overflow-hidden">
          <ThreadPrimitive.Viewport
            className="h-full overflow-y-auto px-4 py-5 sm:px-6 sm:py-6"
            role="log"
            aria-live="polite"
            aria-label="对话消息"
          >
            <ThreadPrimitive.Empty>
              <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card px-6 py-6 shadow-md sm:px-7 sm:py-7">
                <p className="whitespace-pre-wrap text-[1.1rem] leading-9 text-foreground">
                  {welcomeText}
                </p>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  {QUICK_PROMPTS.map((prompt) => (
                    <ThreadPrimitive.Suggestion
                      key={prompt}
                      prompt={prompt}
                      send
                      className="inline-flex cursor-pointer items-center rounded-full border border-border bg-background-elevated px-4.5 py-3 text-base text-muted-foreground transition-colors hover:border-primary/35 hover:bg-primary-light hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {prompt}
                    </ThreadPrimitive.Suggestion>
                  ))}
                </div>
              </div>
            </ThreadPrimitive.Empty>

            <ThreadPrimitive.Messages components={messageComponents} />
          </ThreadPrimitive.Viewport>

          <ThreadPrimitive.ScrollToBottom
            className="absolute bottom-5 right-5 cursor-pointer rounded-full border border-border bg-background-elevated px-3.5 py-2 text-sm text-muted-foreground shadow-sm transition-colors hover:border-primary hover:text-primary"
          >
            回到底部
          </ThreadPrimitive.ScrollToBottom>
        </div>

        <div className="border-t border-border bg-card px-6 py-5 sm:px-7 sm:py-6">
          <ChatComposer />
          <p className="mt-3.5 text-center text-sm text-muted-foreground">
            Enter 发送 · Shift+Enter 换行
          </p>
        </div>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
