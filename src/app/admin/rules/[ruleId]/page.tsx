"use client";

import { adminFetch } from "@/lib/client/admin-fetch";
import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ChevronLeft,
  Save,
  CheckCircle,
  ArrowUpCircle,
  Play,
} from "lucide-react";
import { formatAdminModule, formatAdminStatus } from "@/lib/client/admin-labels";

interface RuleDetail {
  id: number;
  ruleId: string;
  jurisdictionCode: string | null;
  name: string;
  module: string;
  priority: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: string;
  version: number;
  notes: string | null;
  inputs: unknown[];
  outputs: unknown[];
  parameterRefs: { param_id: string; purpose: string }[];
  decisionTable: unknown;
  examples: Example[];
}

interface Example {
  name: string;
  input: unknown;
  params?: unknown;
  expected: unknown;
}

interface ExampleResult {
  name: string;
  passed: boolean;
  actual?: unknown;
  diff?: unknown;
  error?: string;
}

function statusVariant(
  status: string,
): "published" | "draft" | "retired" | "info" {
  if (status === "published") return "published";
  if (status === "draft") return "draft";
  if (status === "retired") return "retired";
  return "info";
}

function RuleDetailContent({
  ruleId,
  jurisdictionCode,
  version,
}: {
  ruleId: string;
  jurisdictionCode: string;
  version: number;
}) {
  const router = useRouter();

  const [rule, setRule] = useState<RuleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tableJson, setTableJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );
  const [exampleResults, setExampleResults] = useState<
    Record<string, ExampleResult>
  >({});
  const [runningAll, setRunningAll] = useState(false);

  const identityQuery = `jurisdiction_code=${jurisdictionCode}&version=${version}`;

  useEffect(() => {
    fetch(`/api/admin/rules/${ruleId}?${identityQuery}`)
      .then((r) => r.json())
      .then((data: { rule?: RuleDetail; versions?: unknown[] }) => {
        setRule(data.rule ?? null);
        setTableJson(JSON.stringify(data.rule?.decisionTable, null, 2));
      })
      .catch(() => setRule(null))
      .finally(() => setLoading(false));
  }, [ruleId]);

  const showMsg = (type: "ok" | "err", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const handleSave = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(tableJson);
    } catch {
      showMsg("err", "JSON 格式错误，请检查");
      return;
    }
    setSaving(true);
    try {
      const res = await adminFetch(`/api/admin/rules/${ruleId}?${identityQuery}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionTable: parsed }),
      });
      const json = await res.json();
      if (res.ok) showMsg("ok", "已保存为草稿");
      else showMsg("err", json.error ?? "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleValidate = async () => {
    setValidating(true);
    try {
      const res = await adminFetch(
        `/api/admin/rules/${ruleId}/validate?${identityQuery}`,
        {
          method: "POST",
        },
      );
      const json = await res.json();
      if (res.ok && json.valid) showMsg("ok", "校验通过");
      else showMsg("err", json.error ?? JSON.stringify(json.errors));
    } finally {
      setValidating(false);
    }
  };

  const handlePromote = async () => {
    setPromoting(true);
    try {
      const res = await adminFetch(
        `/api/admin/rules/${ruleId}/promote?${identityQuery}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toStage: "staging" }),
        },
      );
      const json = await res.json();
      if (res.ok) showMsg("ok", "已晋级至预发布");
      else showMsg("err", json.error ?? "晋级失败");
    } finally {
      setPromoting(false);
    }
  };

  const runExample = async (ex: Example) => {
    try {
      const res = await adminFetch(
        `/api/admin/rules/${ruleId}/run-example?${identityQuery}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ example: ex }),
        },
      );
      const json = await res.json();
      setExampleResults((prev) => ({ ...prev, [ex.name]: json }));
    } catch {
      setExampleResults((prev) => ({
        ...prev,
        [ex.name]: { name: ex.name, passed: false, error: "请求失败" },
      }));
    }
  };

  const runAllExamples = async () => {
    if (!rule) return;
    setRunningAll(true);
    await Promise.all((rule.examples ?? []).map(runExample));
    setRunningAll(false);
  };

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">加载中...</div>;
  }

  if (!rule) {
    return <div className="p-8 text-sm text-red-600">规则未找到: {ruleId}</div>;
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push("/admin/rules")}
        className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-1 py-1 text-sm text-slate-600 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <ChevronLeft size={15} />
        返回规则列表
      </button>

      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{rule.name}</h1>
            <p className="mt-1 font-mono text-sm text-slate-500">{rule.ruleId}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              loading={saving}
              onClick={handleSave}
              className="cursor-pointer"
            >
              <Save size={13} className="mr-1.5" />
              保存草稿
            </Button>
            <Button
              variant="outline"
              size="sm"
              loading={validating}
              onClick={handleValidate}
              className="cursor-pointer"
            >
              <CheckCircle size={13} className="mr-1.5" />
              校验
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={promoting}
              onClick={handlePromote}
              className="cursor-pointer"
            >
              <ArrowUpCircle size={13} className="mr-1.5" />
              晋级预发布
            </Button>
          </div>
        </div>
      </section>

      {msg && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm shadow-sm ${
            msg.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <CardContent className="pt-5">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">地区</dt>
                <dd className="font-mono text-slate-900">{rule.jurisdictionCode ?? "-"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">模块</dt>
                <dd className="text-slate-900">{formatAdminModule(rule.module)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">优先级</dt>
                <dd className="text-slate-900">{rule.priority}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">状态</dt>
                <dd>
                  <Badge variant={statusVariant(rule.status)}>
                    {formatAdminStatus(rule.status)}
                  </Badge>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">生效日期</dt>
                <dd className="text-slate-900">{rule.effectiveFrom}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">版本</dt>
                <dd className="text-slate-900">v{rule.version}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <CardContent className="pt-5">
            <p className="mb-2 text-sm font-medium text-slate-900">参数引用</p>
            {!rule.parameterRefs || rule.parameterRefs.length === 0 ? (
              <p className="text-sm text-slate-500">无</p>
            ) : (
              <ul className="space-y-1">
                {rule.parameterRefs.map((p) => (
                  <li key={p.param_id} className="text-xs text-slate-900">
                    <span className="font-mono text-primary">{p.param_id}</span>
                    <span className="text-slate-500"> — {p.purpose}</span>
                  </li>
                ))}
              </ul>
            )}
            {rule.notes && (
              <p className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-500">{rule.notes}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle>决策表（JSON）</CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            className="h-80 w-full resize-y rounded-xl border border-slate-300 bg-slate-50 p-3 font-mono text-xs text-slate-700 shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            value={tableJson}
            onChange={(e) => setTableJson(e.target.value)}
            spellCheck={false}
          />
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>示例测试</CardTitle>
            <Button
              variant="outline"
              size="sm"
              loading={runningAll}
              onClick={runAllExamples}
              className="cursor-pointer"
            >
              <Play size={13} className="mr-1.5" />
              Run All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!rule.examples || rule.examples.length === 0 ? (
            <p className="text-sm text-slate-500">无示例</p>
          ) : (
            <div className="space-y-3">
              {rule.examples.map((ex) => {
                const result = exampleResults[ex.name];
                return (
                  <div
                    key={ex.name}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">{ex.name}</p>
                      {result && (
                        <div className="mt-1">
                          {result.passed ? (
                            <Badge variant="published">通过</Badge>
                          ) : (
                            <Badge variant="error">失败</Badge>
                          )}
                          {result.error && <p className="mt-1 text-xs text-red-600">{result.error}</p>}
                          {Boolean(result.diff) && (
                            <pre className="mt-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-600">
                              {JSON.stringify(result.diff as Record<string, unknown>, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => runExample(ex)}
                      className="cursor-pointer"
                    >
                      <Play size={12} className="mr-1" />
                      Run
                    </Button>
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

function RuleDetailWrapper() {
  const params = useParams();
  const search = useSearchParams();
  const ruleId = params.ruleId as string;
  const jurisdictionCode = search.get("jurisdiction_code") ?? "";
  const version = Number(search.get("version") ?? "0");
  return (
    <RuleDetailContent
      ruleId={ruleId}
      jurisdictionCode={jurisdictionCode}
      version={version}
    />
  );
}

export default function RuleDetailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-500">加载中...</div>}>
      <RuleDetailWrapper />
    </Suspense>
  );
}
