"use client";

import { useState, useEffect, useCallback } from "react";
import { MessageSquare, Plus, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface ConversationItem {
  id: string;
  sessionId: string | null;
  messages: unknown[];
  userProfile: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

interface ConversationListProps {
  sessionId: string;
  activeConversationId: string | null;
  onSelect: (conversation: ConversationItem) => void;
  onNewChat: () => void;
  onDelete?: (conversationId: string) => void;
}

function getPreviewText(messages: unknown[]): string {
  if (!Array.isArray(messages)) return "新对话";
  const userMsg = messages.find(
    (m) =>
      m !== null &&
      typeof m === "object" &&
      "role" in (m as Record<string, unknown>) &&
      (m as Record<string, unknown>).role === "user",
  ) as Record<string, unknown> | undefined;

  if (!userMsg) return "新对话";

  const parts = userMsg.parts as { type: string; text?: string }[] | undefined;
  if (Array.isArray(parts)) {
    const textPart = parts.find((p) => p.type === "text" && p.text);
    if (textPart?.text) {
      return textPart.text.length > 50
        ? textPart.text.slice(0, 50) + "..."
        : textPart.text;
    }
  }

  // Fallback: try content field
  if (typeof userMsg.content === "string") {
    return userMsg.content.length > 50
      ? userMsg.content.slice(0, 50) + "..."
      : userMsg.content;
  }

  return "新对话";
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "刚刚";
  if (diffMin < 60) return `${diffMin}分钟前`;
  if (diffHr < 24) return `${diffHr}小时前`;
  if (diffDay < 7) return `${diffDay}天前`;
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

export function ConversationList({
  sessionId,
  activeConversationId,
  onSelect,
  onNewChat,
  onDelete,
}: ConversationListProps) {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/conversations?sessionId=${encodeURIComponent(sessionId)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as {
          conversations: ConversationItem[];
        };
        setConversations(data.conversations);
        setError(null);
      } else {
        setError("会话列表加载失败，请稍后重试");
      }
    } catch {
      setError("会话列表加载失败，请稍后重试");
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void fetchConversations();
  }, [fetchConversations]);

  // Refresh the list when activeConversationId changes (e.g. after sending first message)
  useEffect(() => {
    if (activeConversationId) {
      void fetchConversations();
      const timer = setTimeout(() => {
        void fetchConversations();
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [activeConversationId, fetchConversations]);

  const handleDeleteConversation = useCallback(
    async (conversationId: string) => {
      if (deletingId) return;

      const confirmed = window.confirm("确认删除该聊天记录？删除后不可恢复。");
      if (!confirmed) return;

      setDeletingId(conversationId);
      try {
        const res = await fetch(`/api/conversations/${conversationId}`, {
          method: "DELETE",
          headers: sessionId
            ? { "x-legacy-session-id": sessionId }
            : undefined,
        });

        if (!res.ok) {
          setError("删除失败，请稍后重试");
          return;
        }

        setConversations((prev) => prev.filter((item) => item.id !== conversationId));
        onDelete?.(conversationId);
        setError(null);
      } catch {
        setError("删除失败，请稍后重试");
      } finally {
        setDeletingId(null);
      }
    },
    [deletingId, onDelete, sessionId],
  );

  return (
    <div className="flex h-full flex-col">
      {/* New chat button */}
      <div className="shrink-0 p-4">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full cursor-pointer items-center gap-2 rounded-xl border border-border bg-background-elevated px-4 py-3.5 text-base font-medium text-foreground shadow-sm transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <Plus className="h-4 w-4" />
          新对话
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {!isLoading && error && (
          <div className="mb-2 rounded-lg border border-red-200/90 bg-red-50/90 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/75 bg-white/40 py-8 text-center text-xs text-muted-foreground">
            暂无历史对话
          </div>
        ) : (
          <div className="space-y-1.5">
            {conversations.map((conv) => {
              const isActive = conv.id === activeConversationId;
              const preview = getPreviewText(conv.messages);
              const isDeleting = deletingId === conv.id;

              return (
                <div key={conv.id} className="group flex items-start gap-1">
                  <button
                    type="button"
                    onClick={() => onSelect(conv)}
                    aria-current={isActive ? "true" : undefined}
                    disabled={isDeleting}
                    className={cn(
                      "flex w-full min-w-0 flex-1 cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-60",
                      isActive
                        ? "border-primary/35 bg-primary/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)]"
                        : "border-transparent bg-white/40 hover:border-border/75 hover:bg-white/80",
                    )}
                  >
                    <MessageSquare
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        isActive
                          ? "text-primary"
                          : "text-muted-foreground",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-base",
                          isActive
                            ? "font-medium text-primary"
                            : "text-foreground",
                        )}
                      >
                        {preview}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {formatRelativeTime(conv.updatedAt)}
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleDeleteConversation(conv.id)}
                    disabled={isDeleting}
                    aria-label="删除会话"
                    className="mt-1 inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground opacity-100 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:cursor-not-allowed disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                  >
                    {isDeleting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
