"use client";

import { useState, useCallback, useEffect } from "react";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ConversationList } from "@/components/chat/ConversationList";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
  Library,
  Shield,
} from "lucide-react";
import type { UIMessage } from "ai";
import { cn } from "@/lib/utils/cn";
import { getLegacySessionId } from "@/lib/client/session";
import {
  getConversationRestoreErrorMessage,
  shouldRestoreConversationFromUrl,
} from "@/components/chat/conversation-runtime";
import { PaperBackdrop } from "@/components/layout/PaperBackdrop";

interface ConversationRow {
  id: string;
  sessionId: string | null;
  messages: unknown[];
  userProfile: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

function replaceConversationIdInUrl(conversationId: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (conversationId) {
    url.searchParams.set("conversationId", conversationId);
  } else {
    url.searchParams.delete("conversationId");
  }
  window.history.replaceState({}, "", url.toString());
}

function getSessionId(): string {
  return getLegacySessionId();
}

export function ChatPageClient() {
  const searchParams = useSearchParams();
  const [sessionId, setSessionId] = useState("");
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null,
  );
  const [panelConversationId, setPanelConversationId] = useState<string | null>(
    null,
  );
  const [initialMessages, setInitialMessages] = useState<
    UIMessage[] | undefined
  >(undefined);
  const [chatPanelKey, setChatPanelKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const conversationIdFromUrl = searchParams.get("conversationId");

  // Initialize sessionId on client
  useEffect(() => {
    setSessionId(getSessionId());
    if (window.matchMedia("(max-width: 639px)").matches) {
      setSidebarOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen]);

  const loadConversationById = useCallback(
    async (conversationId: string) => {
      if (!conversationId) return false;

      try {
        const res = await fetch(`/api/chat/${conversationId}`, {
          headers: sessionId
            ? { "x-legacy-session-id": sessionId }
            : undefined,
        });
        if (!res.ok) {
          setRestoreError(getConversationRestoreErrorMessage(res.status));
          setActiveConversationId(null);
          setPanelConversationId(null);
          setInitialMessages(undefined);
          setChatPanelKey((prev) => prev + 1);
          return false;
        }
        const data = (await res.json()) as {
          conversation: {
            messages: UIMessage[];
          };
        };
        const msgs = data.conversation.messages as UIMessage[];
        setRestoreError(null);
        setInitialMessages(msgs.length > 0 ? msgs : undefined);
        setActiveConversationId(conversationId);
        setPanelConversationId(conversationId);
        setChatPanelKey((prev) => prev + 1);
        return true;
      } catch {
        setRestoreError("聊天记录恢复失败，已为你打开新对话。");
        setActiveConversationId(null);
        setPanelConversationId(null);
        setInitialMessages(undefined);
        setChatPanelKey((prev) => prev + 1);
        return false;
      }
    },
    [sessionId],
  );

  useEffect(() => {
    // 新会话一拿到 URL 参数后，当前面板可能仍在流式响应中；
    // 如果此时立刻按 URL 重新恢复，会用旧快照重建面板并丢失正在显示的 assistant 回复。
    const targetConversationId = conversationIdFromUrl;
    if (!targetConversationId) {
      return;
    }

    if (
      !shouldRestoreConversationFromUrl({
        sessionId,
        conversationIdFromUrl: targetConversationId,
        panelConversationId,
      })
    ) {
      return;
    }

    void loadConversationById(targetConversationId).then((loaded) => {
      if (!loaded) {
        replaceConversationIdInUrl(null);
      }
    });
  }, [conversationIdFromUrl, loadConversationById, panelConversationId, sessionId]);

  const handleSelectConversation = useCallback(
    async (conv: ConversationRow) => {
      if (conv.id === activeConversationId) return;
      const loaded = await loadConversationById(conv.id);
      if (loaded) {
        replaceConversationIdInUrl(conv.id);
      }
    },
    [activeConversationId, loadConversationById],
  );

  const handleNewChat = useCallback(() => {
    setRestoreError(null);
    setActiveConversationId(null);
    setPanelConversationId(null);
    setInitialMessages(undefined);
    setChatPanelKey((prev) => prev + 1);
    replaceConversationIdInUrl(null);
  }, []);

  const handleConversationCreated = useCallback((id: string) => {
    setRestoreError(null);
    setActiveConversationId(id);
    setPanelConversationId(id);
    replaceConversationIdInUrl(id);
  }, []);

  const handleDeleteConversation = useCallback(
    (deletedConversationId: string) => {
      if (deletedConversationId !== activeConversationId) return;
      // 删除当前激活会话后，重置为新会话状态
      handleNewChat();
    },
    [activeConversationId, handleNewChat],
  );

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden">
      <PaperBackdrop />

      <header className="relative z-20 px-3 pt-3 sm:px-5 sm:pt-4">
        <nav className="mx-auto flex h-16 w-full max-w-[1580px] items-center justify-between rounded-2xl border border-border bg-card/95 px-4 shadow-md backdrop-blur sm:h-[74px] sm:px-5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-controls="conversation-sidebar"
              aria-expanded={sidebarOpen}
              className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-background-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card sm:hidden"
              aria-label={sidebarOpen ? "关闭侧栏" : "打开侧栏"}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
            </button>
            <Link
              href="/"
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-base text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">返回首页</span>
            </Link>
          </div>

          <span className="text-base font-semibold text-foreground sm:text-[1.08rem]">
            社保助手
          </span>

          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-controls="conversation-sidebar"
              aria-expanded={sidebarOpen}
              className="hidden h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-background-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card sm:inline-flex"
              aria-label={sidebarOpen ? "关闭侧栏" : "打开侧栏"}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
            </button>
            <Link
              href="/cases"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card sm:text-base"
            >
              <Library className="h-4 w-4" />
              <span className="hidden sm:inline">案例</span>
            </Link>
            <Link
              href="/admin/login"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card sm:text-base"
            >
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">管理</span>
            </Link>
          </div>
        </nav>
      </header>

      <div className="relative z-10 mx-auto flex w-full max-w-[1580px] flex-1 overflow-hidden px-3 pb-4 pt-4 sm:px-5 sm:pb-6">
        <section className="relative flex w-full flex-1 overflow-hidden rounded-2xl border border-border bg-card/92 shadow-lg backdrop-blur">
          {restoreError ? (
            <div className="absolute left-4 right-4 top-4 z-30 rounded-xl border border-amber-300/80 bg-amber-50/95 px-4 py-3 text-sm text-amber-900 shadow-sm sm:left-5 sm:right-5">
              {restoreError}
            </div>
          ) : null}
          {sidebarOpen && (
            <button
              type="button"
              aria-label="关闭会话列表"
              onClick={() => setSidebarOpen(false)}
              className="absolute inset-0 z-20 cursor-pointer bg-foreground/20 backdrop-blur-[1px] sm:hidden"
            />
          )}

          <aside
            id="conversation-sidebar"
            aria-hidden={!sidebarOpen}
            className={cn(
              "absolute inset-y-0 left-0 z-30 w-[320px] overflow-hidden border-r border-border bg-background-elevated transition-transform duration-200 sm:relative sm:z-0 sm:transition-[width] sm:duration-200",
              sidebarOpen
                ? "translate-x-0 sm:w-[320px]"
                : "-translate-x-full sm:w-0 sm:translate-x-0 sm:border-r-0",
            )}
          >
            {sidebarOpen && sessionId && (
              <ConversationList
                sessionId={sessionId}
                activeConversationId={activeConversationId}
                onSelect={handleSelectConversation}
                onNewChat={handleNewChat}
                onDelete={handleDeleteConversation}
              />
            )}
          </aside>

          <main className="flex-1 overflow-hidden bg-background-elevated">
            <div className="h-full w-full">
              <ChatPanel
                key={chatPanelKey}
                conversationId={panelConversationId ?? undefined}
                initialMessages={initialMessages}
                onConversationCreated={handleConversationCreated}
              />
            </div>
          </main>
        </section>
      </div>
    </div>
  );
}
