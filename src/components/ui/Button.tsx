import { forwardRef } from "react";
import { cn } from "@/lib/utils/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "destructive"
  | "outline"
  | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children?: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-cta text-cta-foreground border-transparent shadow-[var(--shadow-sm)] hover:bg-cta-hover hover:shadow-[var(--shadow-md)] cursor-pointer",
  secondary:
    "bg-primary text-primary-foreground border-transparent shadow-[var(--shadow-sm)] hover:bg-primary-hover hover:shadow-[var(--shadow-md)] cursor-pointer",
  destructive:
    "bg-destructive text-destructive-foreground border-transparent shadow-[var(--shadow-sm)] hover:bg-[#981b2c] hover:shadow-[var(--shadow-md)] cursor-pointer",
  outline:
    "ui-surface text-foreground border-border hover:border-secondary/60 hover:bg-background-elevated cursor-pointer",
  ghost:
    "bg-transparent text-foreground border-transparent hover:bg-muted/80 hover:text-primary cursor-pointer",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-10 px-4 text-sm",
  md: "h-11 px-5 text-base",
  lg: "h-12 px-6 text-[1.06rem]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center rounded-[var(--radius-md)] border font-medium tracking-[0.01em]",
          "transition-[background-color,border-color,color,box-shadow] duration-200",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:opacity-55 disabled:cursor-not-allowed disabled:shadow-none",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {loading && (
          <span
            className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
