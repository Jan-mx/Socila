import { cn } from "@/lib/utils/cn";

export type BadgeVariant =
  | "published"
  | "draft"
  | "retired"
  | "error"
  | "warning"
  | "info";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children?: React.ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  published: "bg-[#effaf6] text-[#0f7660] border-[#a9ddce]",
  draft: "bg-[#fff9ed] text-[#8f6300] border-[#e9d2a0]",
  retired: "bg-muted/80 text-muted-foreground border-border",
  error: "bg-[#fff4f6] text-[#b42335] border-[#e8bdc4]",
  warning: "bg-[#fff9ed] text-[#8f6300] border-[#e9d2a0]",
  info: "bg-[#eff6ff] text-[#0f4f8a] border-[#b7d2ef]",
};

export function Badge({
  variant = "info",
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-[0.01em]",
        variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
