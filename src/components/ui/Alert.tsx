import { cn } from "@/lib/utils/cn";
import {
  AlertCircle,
  CheckCircle,
  Info,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";

export type AlertVariant = "error" | "warning" | "info" | "success";

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
  icon?: LucideIcon;
  children?: React.ReactNode;
}

const variantConfig: Record<
  AlertVariant,
  { container: string; icon: LucideIcon; iconColor: string }
> = {
  error: {
    container: "bg-[#fff5f7]/90 border-[#e8b8bf] text-[#6f1c28]",
    icon: AlertCircle,
    iconColor: "text-[#b42335]",
  },
  warning: {
    container: "bg-[#fff9ec]/90 border-[#ecd7a2] text-[#6d4b05]",
    icon: AlertTriangle,
    iconColor: "text-[#8f6300]",
  },
  info: {
    container: "bg-[#f2f8ff]/90 border-[#b8d2ee] text-[#153e6f]",
    icon: Info,
    iconColor: "text-[#0f4f8a]",
  },
  success: {
    container: "bg-[#f1fcf8]/90 border-[#b7e5d8] text-[#145748]",
    icon: CheckCircle,
    iconColor: "text-[#0f7660]",
  },
};

export function Alert({
  variant = "info",
  title,
  icon,
  className,
  children,
  ...props
}: AlertProps) {
  const config = variantConfig[variant];
  const Icon = icon || config.icon;

  return (
    <div
      role="alert"
      className={cn(
        "ui-surface flex gap-3 rounded-[var(--radius-md)] border p-4",
        config.container,
        className,
      )}
      {...props}
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", config.iconColor)} />
      <div className="flex-1 text-sm leading-relaxed">
        {title && <p className="mb-1 font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}
