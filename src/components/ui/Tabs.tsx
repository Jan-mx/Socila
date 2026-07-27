"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";

export interface TabItem {
  key: string;
  label: string;
  content: React.ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  defaultKey?: string;
  activeKey?: string;
  onChange?: (key: string) => void;
  className?: string;
}

export function Tabs({
  tabs,
  defaultKey,
  activeKey,
  onChange,
  className,
}: TabsProps) {
  const [internalActive, setInternalActive] = useState(defaultKey || tabs[0]?.key);

  const active = activeKey !== undefined ? activeKey : internalActive;

  const handleChange = (key: string) => {
    setInternalActive(key);
    onChange?.(key);
  };

  const activeTab = tabs.find((t) => t.key === active);

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-4 flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && handleChange(tab.key)}
            className={cn(
              "relative -mb-px rounded-t-[var(--radius-sm)] px-4 py-2 text-sm font-medium tracking-[0.01em]",
              "border border-transparent border-b-0 transition-[background-color,color,border-color] duration-200 cursor-pointer",
              "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              active === tab.key
                ? "bg-[#f4f9ff] text-primary border-border"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:border-border/70",
              tab.disabled && "opacity-50 cursor-not-allowed hover:bg-transparent",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>{activeTab?.content}</div>
    </div>
  );
}
