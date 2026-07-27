import Link from "next/link";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type NavKey = "home" | "chat" | "cases";

const linkMap: Array<{ key: NavKey; href: string; label: string }> = [
  { key: "chat", href: "/chat", label: "智能助手" },
  { key: "cases", href: "/cases", label: "真实案例" },
];

export function MarketingNav({ active }: { active: NavKey }) {
  return (
    <header className="sticky top-0 z-30 px-3 pt-3 sm:px-6 sm:pt-5 lg:px-10">
      <nav className="mx-auto flex h-[74px] w-full max-w-7xl items-center justify-between rounded-xl border border-border bg-card/95 px-3 shadow-md backdrop-blur sm:h-[82px] sm:rounded-2xl sm:px-6">
        <Link
          href="/"
          className="group inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-xl px-1 py-1.5 text-base transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:gap-2.5 sm:px-2"
        >
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary sm:h-8 sm:w-8">
            <Sparkles className="h-[18px] w-[18px]" />
          </span>
          <span className="whitespace-nowrap text-sm font-semibold text-foreground sm:text-[1.03rem]">
            社保规划助手
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-0.5 sm:gap-2.5">
          {linkMap.map((item) => {
            const isActive = item.key === active;
            return (
              <Link
                key={item.key}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 cursor-pointer items-center whitespace-nowrap rounded-lg px-1.5 py-2.5 text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:rounded-xl sm:px-5 sm:text-[0.95rem]",
                  isActive
                    ? "border border-primary/30 bg-primary-light font-medium text-primary"
                    : "text-muted-foreground hover:bg-background-elevated hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}

          <Link
            href="/admin/login"
            className="inline-flex min-h-10 cursor-pointer items-center whitespace-nowrap rounded-lg border border-border bg-background-elevated px-1.5 py-2.5 text-xs text-foreground transition-all hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:rounded-xl sm:px-5 sm:text-[0.95rem]"
          >
            管理后台
          </Link>
        </div>
      </nav>
    </header>
  );
}
