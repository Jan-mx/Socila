import { forwardRef } from "react";
import { cn } from "@/lib/utils/cn";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const checkId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="w-full">
        <label htmlFor={checkId} className="flex items-center gap-2.5 cursor-pointer">
          <input
            ref={ref}
            type="checkbox"
            id={checkId}
            aria-invalid={Boolean(error)}
            className={cn(
              "h-4 w-4 rounded-[0.3rem] border-input bg-background-elevated accent-cta",
              "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "disabled:opacity-55 disabled:cursor-not-allowed",
              error && "ring-1 ring-destructive/30",
              className,
            )}
            {...props}
          />
          {label && <span className="text-sm text-foreground select-none">{label}</span>}
        </label>
        {error && <p className="ui-error mt-1.5">{error}</p>}
      </div>
    );
  },
);

Checkbox.displayName = "Checkbox";
