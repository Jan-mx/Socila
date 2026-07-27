"use client";

import { adminFetch } from "@/lib/client/admin-fetch";
import { Fragment, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Play, CheckCircle, XCircle } from "lucide-react";
import { formatAdminTestSource } from "@/lib/client/admin-labels";

interface Test {
  id: number;
  name: string;
  ruleId: string | null;
  source: string;
  lastRunResult: { passed: boolean; diff?: unknown; error?: string } | null;
  lastRunAt: string | null;
}

interface TestsResponse {
  tests: Test[];
  total: number;
  passed: number;
  failed: number;
  passRate: number;
}

interface RunResult {
  total: number;
  passed: number;
  failed: number;
  results: { name: string; passed: boolean; diff?: unknown; error?: string }[];
}

function sourceBadgeVariant(source: string): "info" | "warning" | "published" {
  if (source === "regression") return "warning";
  if (source === "example") return "published";
  return "info";
}

export default function TestsPage() {
  const [data, setData] = useState<TestsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchTests = () => {
    setLoading(true);
    fetch("/api/admin/tests")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTests();
  }, []);

  const runTests = async (type: "examples" | "regression" | "all") => {
    setRunning(type);
    setRunResult(null);
    try {
      const res = await adminFetch("/api/admin/tests/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: type }),
      });
      const json = await res.json();
      const normalized: RunResult = {
        total: json.total ?? 0,
        passed: json.passed ?? 0,
        failed: json.failed ?? 0,
        results: (json.results ?? []).map(
          (r: {
            name: string;
            pass?: boolean;
            passed?: boolean;
            diff?: unknown;
            error?: string;
          }) => ({
            name: r.name,
            passed: r.passed ?? r.pass ?? false,
            diff: r.diff,
            error: r.error,
          }),
        ),
      };
      setRunResult(normalized);
      fetchTests();
    } finally {
      setRunning(null);
    }
  };

  const stats = data
    ? [
        { label: "总测试数", value: data.total },
        { label: "通过", value: data.passed, color: "text-emerald-700" },
        { label: "失败", value: data.failed, color: "text-red-600" },
        {
          label: "通过率",
          value: `${data.passRate.toFixed(1)}%`,
          color:
            data.passRate >= 90
              ? "text-emerald-700"
              : data.passRate >= 70
                ? "text-amber-700"
                : "text-red-600",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">测试中心</h1>
            <p className="mt-1 text-sm text-slate-600">运行示例测试和回归测试</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              loading={running === "examples"}
              onClick={() => runTests("examples")}
              className="cursor-pointer"
            >
              <Play size={13} className="mr-1.5" />
              运行示例测试
            </Button>
            <Button
              variant="outline"
              size="sm"
              loading={running === "regression"}
              onClick={() => runTests("regression")}
              className="cursor-pointer"
            >
              <Play size={13} className="mr-1.5" />
              运行回归测试
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={running === "all"}
              onClick={() => runTests("all")}
              className="cursor-pointer"
            >
              <Play size={13} className="mr-1.5" />
              运行全部测试
            </Button>
          </div>
        </div>
      </section>

      {data && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map(({ label, value, color }) => (
            <Card key={label} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <CardContent className="py-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
                <p className={`mt-1 text-2xl font-semibold ${color ?? "text-slate-900"}`}>
                  {value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {runResult && (
        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              运行结果
              {runResult.failed === 0 ? (
                <Badge variant="published">全部通过</Badge>
              ) : (
                <Badge variant="error">{runResult.failed} 个失败</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-slate-500">
              共 {runResult.total} 个测试，通过 {runResult.passed}，失败 {runResult.failed}
            </p>
            {(runResult.results ?? [])
              .filter((r) => !r.passed)
              .map((r) => (
                <div
                  key={r.name}
                  className="mb-2 rounded-xl border border-red-200 bg-red-50/60 p-3"
                >
                  <div className="flex items-center gap-2">
                    <XCircle size={14} className="text-red-500" />
                    <span className="text-sm font-medium text-slate-900">{r.name}</span>
                  </div>
                  {r.error && <p className="mt-1 text-xs text-red-600">{r.error}</p>}
                  {Boolean(r.diff) && (
                    <pre className="mt-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-600">
                      {JSON.stringify(r.diff as Record<string, unknown>, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle>
            测试列表{" "}
            {data && (
              <span className="text-sm font-normal text-slate-500">共 {data.total} 条</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">加载中...</div>
          ) : !data?.tests?.length ? (
            <div className="p-8 text-center text-sm text-slate-500">暂无测试</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="border-y border-slate-200 bg-slate-50/90">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">名称</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">规则编号</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">来源</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">上次结果</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">上次运行</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tests.map((t) => (
                    <Fragment key={t.id}>
                      <tr
                        className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-cyan-50/40"
                        onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
                      >
                        <td className="px-4 py-3 text-slate-900">{t.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{t.ruleId ?? "-"}</td>
                        <td className="px-4 py-3">
                          <Badge variant={sourceBadgeVariant(t.source)}>
                            {formatAdminTestSource(t.source)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {t.lastRunResult == null ? (
                            <span className="text-xs text-slate-500">未运行</span>
                          ) : t.lastRunResult.passed ? (
                            <div className="flex items-center gap-1 text-emerald-700">
                              <CheckCircle size={13} />
                              <span className="text-xs">通过</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-red-600">
                              <XCircle size={13} />
                              <span className="text-xs">失败</span>
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {t.lastRunAt ? new Date(t.lastRunAt).toLocaleString("zh-CN") : "-"}
                        </td>
                      </tr>
                      {expandedId === t.id && t.lastRunResult && !t.lastRunResult.passed && (
                        <tr>
                          <td colSpan={5} className="border-b border-red-100 bg-red-50/60 px-4 py-3">
                            {t.lastRunResult.error && (
                              <p className="mb-1 text-xs text-red-600">{t.lastRunResult.error}</p>
                            )}
                            {Boolean(t.lastRunResult.diff) && (
                              <pre className="overflow-x-auto rounded-lg border border-red-100 bg-white p-2 text-xs text-slate-700">
                                {JSON.stringify(t.lastRunResult.diff as Record<string, unknown>, null, 2)}
                              </pre>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
