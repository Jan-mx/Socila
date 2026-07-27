import { forwardRef } from "react";
import { cn } from "@/lib/utils/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="ui-label mb-1.5 block">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          className={cn(
            "ui-control h-12 px-4 text-base",
            error && "ui-control-error",
            className,
          )}
          {...props}
        />
        {error && <p className="ui-error mt-1.5">{error}</p>}
        {helperText && !error && <p className="ui-helper mt-1.5">{helperText}</p>}
      </div>
    );
  },
);

Input.displayName = "Input";
