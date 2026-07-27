"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";

export interface JsonEditorProps {
  value: object | null;
  onChange?: (value: object | null) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  rows?: number;
  readOnly?: boolean;
}

export function JsonEditor({
  value,
  onChange,
  label,
  placeholder = "输入 JSON...",
  className,
  rows = 10,
  readOnly = false,
}: JsonEditorProps) {
  const serialized = value != null ? JSON.stringify(value, null, 2) : "";
  const [text, setText] = useState(serialized);
  const [error, setError] = useState<string | null>(null);
  const [prevSerialized, setPrevSerialized] = useState(serialized);

  if (serialized !== prevSerialized) {
    setPrevSerialized(serialized);
    setText(serialized);
  }

  const handleChange = (raw: string) => {
    setText(raw);
    if (!raw.trim()) {
      setError(null);
      onChange?.(null);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as object;
      setError(null);
      onChange?.(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "JSON 格式错误");
    }
  };

  return (
    <div className={cn("w-full", className)}>
      {label && <label className="ui-label mb-1.5 block">{label}</label>}
      <div className="relative">
        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          readOnly={readOnly}
          aria-invalid={Boolean(error)}
          spellCheck={false}
          className={cn(
            "ui-control px-3 py-2.5 font-mono text-sm leading-relaxed resize-y",
            error && "ui-control-error",
            readOnly && "bg-muted/75 cursor-default",
          )}
        />
      </div>
      {error && <p className="ui-error mt-1.5 font-mono">解析错误: {error}</p>}
      {!error && text.trim() && <p className="ui-helper mt-1.5 text-success">JSON 格式正确</p>}
    </div>
  );
}
