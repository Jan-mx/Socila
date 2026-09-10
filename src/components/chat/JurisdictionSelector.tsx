"use client";

/**
 * 任务3（JRP-FR-010/015、JRP-AC-003/017）规划地区选择器。
 * 用户通过本选择器明确确认规划地区（source=selector）；服务端校验稳定代码并
 * 写入会话画像。四川510000 显示"暂未支持"且不可选；自由文本不参与政策选择。
 */
import { useCallback, useState } from "react";
import { MapPin, ChevronDown } from "lucide-react";
import {
  PLANNING_JURISDICTION_OPTIONS,
  readJurisdictionFromProfile,
} from "./jurisdiction-selector-logic";
import { cn } from "@/lib/utils/cn";

export interface ConfirmedJurisdiction {
  code: string;
  name: string;
}

interface JurisdictionSelectorProps {
  conversationId: string;
  /** 会话画像中的已确认地区（恢复场景）。 */
  profile?: Record<string, unknown> | null;
  onConfirmed?: (jurisdiction: ConfirmedJurisdiction) => void;
  className?: string;
}

export function JurisdictionSelector({
  conversationId,
  profile,
  onConfirmed,
  className,
}: JurisdictionSelectorProps) {
  const [confirmed, setConfirmed] = useState<ConfirmedJurisdiction | null>(() =>
    readJurisdictionFromProfile(profile),
  );
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSelect = useCallback(
    async (code: string) => {
      const option = PLANNING_JURISDICTION_OPTIONS.find((o) => o.code === code);
      if (!option || !option.supported) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/conversations/${encodeURIComponent(conversationId)}/jurisdiction`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, source: "selector" }),
          },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          setError(body?.error ?? "地区确认失败，请重试");
          return;
        }
        const data = (await res.json()) as {
          jurisdiction: { code: string; name: string };
        };
        const next = {
          code: data.jurisdiction.code,
          name: data.jurisdiction.name,
        };
        setConfirmed(next);
        onConfirmed?.(next);
        setOpen(false);
      } catch {
        setError("地区确认失败，请重试");
      } finally {
        setBusy(false);
      }
    },
    [conversationId, onConfirmed],
  );

  const currentOption = confirmed
    ? PLANNING_JURISDICTION_OPTIONS.find((o) => o.code === confirmed.code)
    : null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border bg-background-elevated px-3.5 py-1.5 text-sm text-foreground transition-colors hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <MapPin className="h-3.5 w-3.5 text-primary" />
          {currentOption
            ? currentOption.name
            : confirmed
              ? confirmed.name
              : "选择规划地区"}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
        {open && (
          <ul
            role="listbox"
            aria-label="规划地区"
            className="absolute left-0 z-40 mt-1.5 w-52 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
          >
            {PLANNING_JURISDICTION_OPTIONS.map((option) => (
              <li key={option.code} role="option" aria-selected={option.supported && confirmed?.code === option.code}>
                <button
                  type="button"
                  disabled={!option.supported || busy}
                  onClick={() => void handleSelect(option.code)}
                  className={cn(
                    "flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm",
                    option.supported
                      ? "cursor-pointer text-foreground transition-colors hover:bg-primary-light hover:text-primary"
                      : "cursor-not-allowed text-muted-foreground",
                    confirmed?.code === option.code && "bg-primary/10 text-primary",
                  )}
                >
                  <span>{option.name}</span>
                  {option.supported ? (
                    confirmed?.code === option.code ? (
                      <span className="text-xs text-primary">已确认</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">选择</span>
                    )
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {option.reason ?? "暂未支持"}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {confirmed && (
        <span className="text-xs text-muted-foreground">
          规划地区：{confirmed.name}（已确认）
        </span>
      )}
      {error && (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
