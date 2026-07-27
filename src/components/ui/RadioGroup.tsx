import { cn } from "@/lib/utils/cn";

export interface RadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  label?: string;
  name: string;
  options: RadioOption[];
  value?: string;
  onChange?: (value: string) => void;
  layout?: "horizontal" | "vertical";
  error?: string;
  className?: string;
}

export function RadioGroup({
  label,
  name,
  options,
  value,
  onChange,
  layout = "vertical",
  error,
  className,
}: RadioGroupProps) {
  return (
    <div className={cn("w-full", className)}>
      {label && <span className="ui-label mb-2 block">{label}</span>}
      <div
        className={cn(
          "flex gap-3",
          layout === "vertical" ? "flex-col" : "flex-row flex-wrap",
        )}
      >
        {options.map((opt) => (
          <label
            key={opt.value}
            className={cn(
              "inline-flex items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1",
              "cursor-pointer transition-[background-color,color] duration-200 hover:bg-muted/60",
              opt.disabled && "opacity-50 cursor-not-allowed hover:bg-transparent",
            )}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              disabled={opt.disabled}
              onChange={() => onChange?.(opt.value)}
              className="h-4 w-4 border-input bg-background-elevated accent-cta focus-visible:ring-4 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
            <span className="text-sm text-foreground">{opt.label}</span>
          </label>
        ))}
      </div>
      {error && <p className="ui-error mt-1.5">{error}</p>}
    </div>
  );
}
