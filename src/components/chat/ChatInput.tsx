"use client";

import { useRef, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils/cn";

interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (text?: string) => void;
  disabled?: boolean;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // 中文输入法选词时，Enter 只应结束合成，不应触发发送。
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const currentValue = e.currentTarget.value;
      if (!disabled && currentValue.trim()) onSubmit(currentValue);
    }
  }

  return (
    <div className="border-t border-border bg-card px-5 py-4 sm:px-6 sm:py-5">
      <div
        className={cn(
          "flex items-end gap-3 rounded-2xl border bg-background-elevated px-4 py-3.5 shadow-md transition-colors sm:gap-4 sm:px-5 sm:py-4",
          disabled
            ? "border-border/45 opacity-60"
            : "border-border/80 focus-within:border-primary/55",
        )}
      >
        <label htmlFor="chat-input" className="sr-only">
          输入消息
        </label>
        <textarea
          id="chat-input"
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="描述您的社保情况，例如：出生年月、性别、已缴月数…"
          rows={1}
          aria-label="消息输入框"
          className="max-h-40 flex-1 resize-none overflow-y-auto bg-transparent text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
          style={{ minHeight: "28px" }}
        />
        <button
          type="button"
          onClick={() => {
            const currentValue = textareaRef.current?.value ?? value;
            if (!disabled && currentValue.trim()) onSubmit(currentValue);
          }}
          disabled={disabled || !value.trim()}
          aria-disabled={disabled || !value.trim()}
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card",
            value.trim() && !disabled
              ? "bg-primary text-white shadow-md hover:bg-primary-hover"
              : "bg-muted text-muted-foreground cursor-not-allowed",
          )}
          aria-label="发送"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Enter 发送 · Shift+Enter 换行
      </p>
    </div>
  );
}
