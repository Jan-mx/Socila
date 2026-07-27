"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  BookOpen,
  Settings,
  CheckCircle,
  Send,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { formatAdminStage } from "@/lib/client/admin-labels";

interface DashboardStats {
  ruleCount: number;
  paramCount: number;
  testPassRate: number;
  recentPublishes: number;
}

interface PublishEntity {
  entityType: string;
  entityId: string;
  status: string;
  version: number;
  updatedAt: string;
}

interface Pipeline {
  draft: PublishEntity[];
  staging: PublishEntity[];
  prod: PublishEntity[];
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => r.json())
      .then((data) => setStats(data))
      .catch(() =>
        setStats({
          ruleCount: 0,
          paramCount: 0,
          testPassRate: 0,
          recentPublishes: 0,
        }),
      )
      .finally(() => setLoading(false));

    fetch("/api/admin/publish/pipeline")
      .then((r) => r.json())
      .then((data: Pipeline) => setPipeline(data))
      .catch(() => setPipeline(null));
  }, []);

  const cards = [
    {
      label: "规则总数",
      value: stats?.ruleCount ?? "-",
      icon: BookOpen,
      color: "text-cyan-700",
      bg: "bg-cyan-50",
      border: "border-cyan-100",
    },
    {
      label: "参数总数",
      value: stats?.paramCount ?? "-",
      icon: Settings,
      color: "text-violet-700",
      bg: "bg-violet-50",
      border: "border-violet-100",
    },
    {
      label: "测试通过率",
      value:
        stats?.testPassRate != null ? `${stats.testPassRate.toFixed(1)}%` : "-",
      icon: CheckCircle,
      color: "text-emerald-700",
      bg: "bg-emerald-50",
      border: "border-emerald-100",
    },
    {
      label: "近期发布",
      value: stats?.recentPublishes ?? "-",
      icon: Send,
      color: "text-amber-700",
      bg: "bg-amber-50",
      border: "border-amber-100",
    },
  ];

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-white px-6 py-6 shadow-sm sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">管理概览</h1>
            <p className="mt-1.5 text-base text-slate-600">规则引擎运行与发布概览</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-cyan-100 bg-cyan-50 px-4 py-2 text-sm font-medium text-cyan-700">
            <Sparkles size={14} />
            企业级控制台视图
          </div>
        </div>
      </section>

      {loading ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-white"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(({ label, value, icon: Icon, color, bg, border }) => (
            <Card
              key={label}
              className={`rounded-2xl border ${border} bg-white shadow-sm`}
            >
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
                      {label}
                    </p>
                    <p className="mt-2.5 text-4xl font-semibold text-slate-900">{value}</p>
                  </div>
                  <div className={`rounded-xl border p-3.5 ${bg} ${border}`}>
                    <Icon size={24} className={color} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-7 xl:grid-cols-2">
        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>快速导航</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5 text-base text-slate-700">
              <li>
                <Link
                  href="/admin/rules"
                  className="cursor-pointer font-medium text-primary underline-offset-2 transition-colors hover:text-primary-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  规则编辑器
                </Link>{" "}
                — 查看/编辑决策表规则
              </li>
              <li>
                <Link
                  href="/admin/params"
                  className="cursor-pointer font-medium text-primary underline-offset-2 transition-colors hover:text-primary-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  参数管理
                </Link>{" "}
                — 政策参数版本化维护
              </li>
              <li>
                <Link
                  href="/admin/rules?tab=rule-sets"
                  className="cursor-pointer font-medium text-primary underline-offset-2 transition-colors hover:text-primary-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  规则集
                </Link>{" "}
                — 管理规则执行顺序
              </li>
              <li>
                <Link
                  href="/admin/publish"
                  className="cursor-pointer font-medium text-primary underline-offset-2 transition-colors hover:text-primary-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  发布中心
                </Link>{" "}
                — 草稿 → 预发布 → 生产流水线
              </li>
              <li>
                <Link
                  href="/admin/tests"
                  className="cursor-pointer font-medium text-primary underline-offset-2 transition-colors hover:text-primary-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  测试中心
                </Link>{" "}
                — 运行示例/回归测试
              </li>
              <li>
                <a
                  href="/admin/cases"
                  className="cursor-pointer font-medium text-primary underline-offset-2 transition-colors hover:text-primary-hover hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  案例库
                </a>{" "}
                — 管理用户案例数据
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>系统说明</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5 text-base text-slate-600">
              <li>• 规则和参数均支持版本化，按生效日期取最新有效版本</li>
              <li>• 发布流程：草稿 → 预发布（需通过门禁检查）→ 生产</li>
              <li>• 每次发布前必须通过结构校验和示例测试</li>
              <li>• 回归测试失败会阻止预发布内容进入生产</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>发布状态</CardTitle>
            <Link href="/admin/publish">
              <Button variant="outline" size="sm" className="cursor-pointer">
                前往发布
                <ArrowRight size={13} className="ml-1.5" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {pipeline === null ? (
            <p className="text-base text-slate-500">加载中...</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {(["draft", "staging", "prod"] as const).map((stage) => {
                const count = pipeline[stage]?.length ?? 0;
                const colorMap = {
                  draft: "text-amber-800 bg-amber-50 border-amber-200",
                  staging: "text-cyan-800 bg-cyan-50 border-cyan-200",
                  prod: "text-emerald-800 bg-emerald-50 border-emerald-200",
                };
                return (
                  <div
                    key={stage}
                    className={`rounded-2xl border px-4 py-3 ${colorMap[stage]}`}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
                      {formatAdminStage(stage)}
                    </p>
                    <p className="mt-1 text-2xl font-semibold">{count}</p>
                    <p className="mt-0.5 text-xs opacity-70">
                      {count === 1 ? "1 项" : `${count} 项`}待处理
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
