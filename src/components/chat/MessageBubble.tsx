"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
}

function renderInlineMarkdown(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter((segment) => segment.length > 0)
    .map((segment, index) => {
      if (segment.startsWith("**") && segment.endsWith("**")) {
        return <strong key={index}>{segment.slice(2, -2)}</strong>;
      }
      return segment;
    });
}

function renderAssistantContent(content: string): ReactNode {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let bulletItems: string[] = [];
  let orderedItems: string[] = [];
  let blockIndex = 0;

  const flushBulletList = () => {
    if (bulletItems.length === 0) return;
    blocks.push(
      <ul
        key={`ul-${blockIndex++}`}
        className="my-2 list-disc space-y-1 pl-5 marker:text-muted-foreground"
      >
        {bulletItems.map((item, itemIndex) => (
          <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
        ))}
      </ul>,
    );
    bulletItems = [];
  };

  const flushOrderedList = () => {
    if (orderedItems.length === 0) return;
    blocks.push(
      <ol
        key={`ol-${blockIndex++}`}
        className="my-2 list-decimal space-y-1 pl-5 marker:text-muted-foreground"
      >
        {orderedItems.map((item, itemIndex) => (
          <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
        ))}
      </ol>,
    );
    orderedItems = [];
  };

  for (const line of lines) {
    const bulletMatch = line.match(/^[-•]\s+(.+)$/);
    if (bulletMatch) {
      flushOrderedList();
      bulletItems.push(bulletMatch[1]);
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushBulletList();
      orderedItems.push(orderedMatch[1]);
      continue;
    }

    flushBulletList();
    flushOrderedList();

    if (!line.trim()) {
      blocks.push(<div key={`sp-${blockIndex++}`} className="h-2" />);
      continue;
    }

    blocks.push(
      <p key={`p-${blockIndex++}`} className="my-0">
        {renderInlineMarkdown(line)}
      </p>,
    );
  }

  flushBulletList();
  flushOrderedList();
  return <>{blocks}</>;
}

export function MessageBubble({
  role,
  content,
  isStreaming = false,
}: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div
      className={cn(
        "flex w-full gap-4 animate-message-in",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {!isUser && (
        <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10">
          <span className="text-sm font-bold text-primary">智</span>
        </div>
      )}

      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3.5 text-[15px] leading-relaxed shadow-md sm:px-5 sm:py-4",
          isUser
            ? "rounded-br-md border border-primary/35 bg-primary text-white"
            : "rounded-bl-md border border-border bg-card text-foreground",
        )}
      >
        {isUser ? (
          <span className="whitespace-pre-wrap">{content}</span>
        ) : content ? (
          <div className="prose prose-sm max-w-none text-foreground">
            {renderAssistantContent(content)}
          </div>
        ) : null}
        {isStreaming && !isUser && (
          <span className="ml-1.5 inline-flex items-center gap-1">
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
        )}
      </div>

      {isUser && (
        <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background-elevated text-sm font-semibold text-foreground">
          我
        </div>
      )}
    </div>
  );
}
