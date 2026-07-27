"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  LayoutDashboard,
  FileText,
  BookOpen,
  Settings,
  Send,
  TestTube,
  LogOut,
  Layers,
} from "lucide-react";

const navItems = [
  { href: "/admin", label: "概览", icon: LayoutDashboard },
  { href: "/admin/cases", label: "案例库", icon: FileText },
  { href: "/admin/rules", label: "规则管理", icon: BookOpen },
  { href: "/admin/rule-sets", label: "规则集", icon: Layers },
  { href: "/admin/params", label: "参数管理", icon: Settings },
  { href: "/admin/publish", label: "发布中心", icon: Send },
  { href: "/admin/tests", label: "测试中心", icon: TestTube },
];

export default function AdminLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const session = useSession();
  const userName = session?.data?.user?.name ?? "管理员";

  return (
    <div className="flex min-h-screen bg-slate-100/80 text-foreground">
      <aside className="sticky top-0 hidden h-screen w-[292px] shrink-0 border-r border-slate-200 bg-white/95 shadow-sm backdrop-blur xl:flex xl:flex-col">
        <div className="border-b border-slate-200 px-6 py-6">
          <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold tracking-[0.08em] text-slate-500">
            规则控制台
          </div>
          <p className="mt-3 text-lg font-semibold text-slate-900">管理后台</p>
          <p className="mt-1 text-sm text-slate-500">规则引擎控制台</p>
        </div>

        <nav className="flex-1 space-y-2 overflow-y-auto px-4 py-5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`group flex cursor-pointer items-center gap-3.5 rounded-xl border px-3.5 py-3 text-base transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                  isActive
                    ? "border-primary/20 bg-primary/10 font-medium text-primary shadow-sm"
                    : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                    isActive
                      ? "border-primary/20 bg-white text-primary"
                      : "border-slate-200 bg-white text-slate-500 group-hover:text-slate-700"
                  }`}
                >
                  <Icon size={16} />
                </span>
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-5">
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              当前用户
            </p>
            <p className="mt-1.5 truncate text-base font-medium text-slate-900">
              {userName}
            </p>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/admin/login" })}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-base text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <LogOut size={14} />
            退出登录
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1600px] px-5 py-5 sm:px-7 sm:py-7 lg:px-10">
          {children}
        </div>
      </main>
    </div>
  );
}
