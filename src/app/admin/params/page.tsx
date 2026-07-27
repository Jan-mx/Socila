"use client";

import { adminFetch } from "@/lib/client/admin-fetch";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Save, CheckCircle } from "lucide-react";
import { formatAdminStatus } from "@/lib/client/admin-labels";

interface Param {
  id: number;
  paramId: string;
  policyPackId: string;
  type: string;
  value: unknown;
  unit: string | null;
  effectiveFrom: string;
  source: string | null;
  rows: unknown[] | null;
  keyFields: string[] | null;
  valueFields: string[] | null;
  note: string | null;
  version: number;
  status: string;
}

interface GroupedParams {
  [type: string]: Param[];
}

const TYPE_LABELS: Record<string, string> = {
  scalar: "标量参数",
  table: "表格参数",
  timeline: "时间线参数",
  array: "数组参数",
};

function statusVariant(s: string): "published" | "draft" | "retired" | "info" {
  if (s === "published") return "published";
  if (s === "draft") return "draft";
  if (s === "retired") return "retired";
  return "info";
}

export default function ParamsPage() {
  const [grouped, setGrouped] = useState<GroupedParams>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});
  const [msg, setMsg] = useState<{
    id: number;
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const fetchParams = () => {
    setLoading(true);
    fetch("/api/admin/params")
      .then((r) => r.json())
      .then((data: { params?: Param[] }) => {
        const g: GroupedParams = {};
        for (const p of data.params ?? []) {
          if (!g[p.type]) g[p.type] = [];
          g[p.type].push(p);
        }
        setGrouped(g);
      })
      .catch(() => setGrouped({}))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchParams();
  }, []);

  const getEditValue = (p: Param) => {
    if (p.id in editing) return editing[p.id];
    if (p.type === "scalar") return String(p.value ?? "");
    return JSON.stringify(
      p.type === "table" ? p.rows : p.type === "timeline" ? p.rows : p.value,
      null,
      2,
    );
  };

  const showMsg = (id: number, type: "ok" | "err", text: string) => {
    setMsg({ id, type, text });
    setTimeout(() => setMsg(null), 3000);
  };

  const handleSave = async (p: Param) => {
    const rawVal = editing[p.id];
    if (rawVal === undefined) return;
    let parsed: unknown = rawVal;
    if (p.type !== "scalar") {
      try {
        parsed = JSON.parse(rawVal);
      } catch {
        showMsg(p.id, "err", "JSON 格式错误");
        return;
      }
    }
    setSaving((prev) => ({ ...prev, [p.id]: true }));
    try {
      const body: Record<string, unknown> =
        p.type === "scalar" ? { value: parsed } : { rows: parsed };
      const res = await adminFetch(`/api/admin/params/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok) {
        showMsg(p.id, "ok", "已保存");
        setEditing((prev) => {
          const next = { ...prev };
          delete next[p.id];
          return next;
        });
        fetchParams();
      } else {
        showMsg(p.id, "err", json.error ?? "保存失败");
      }
    } finally {
      setSaving((prev) => ({ ...prev, [p.id]: false }));
    }
  };

  const handleValidate = async (p: Param) => {
    const res = await adminFetch(`/api/admin/params/${p.id}/validate`, {
      method: "POST",
    });
    const json = await res.json();
    showMsg(
      p.id,
      res.ok && json.valid ? "ok" : "err",
      res.ok && json.valid ? "校验通过" : (json.error ?? "校验失败"),
    );
  };

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
        <h1 className="text-2xl font-semibold text-slate-900">参数管理</h1>
        <p className="mt-1 text-sm text-slate-600">政策参数版本化维护（按类型分组）</p>
      </section>

      {Object.keys(TYPE_LABELS).map((type) => {
        const params = grouped[type];
        if (!params?.length) return null;
        return (
          <Card key={type} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>{TYPE_LABELS[type] ?? type}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {params.map((p) => {
                  const isEditing = p.id in editing;
                  const editVal = getEditValue(p);
                  const msgMatch = msg?.id === p.id;
                  return (
                    <div key={p.id} className="px-5 py-4 sm:px-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <span className="font-mono text-sm font-medium text-slate-900">{p.paramId}</span>
                            <Badge variant={statusVariant(p.status)}>
                              {formatAdminStatus(p.status)}
                            </Badge>
                            <span className="text-xs text-slate-500">v{p.version}</span>
                            {p.unit && <span className="text-xs text-slate-500">单位: {p.unit}</span>}
                          </div>
                          <p className="mb-2 text-xs text-slate-500">
                            生效日期：{p.effectiveFrom}
                            {p.note && ` · ${p.note}`}
                          </p>

                          {type === "scalar" ? (
                            <Input
                              value={editVal}
                              onChange={(e) =>
                                setEditing((prev) => ({
                                  ...prev,
                                  [p.id]: e.target.value,
                                }))
                              }
                              className="max-w-xs text-sm"
                            />
                          ) : (
                            <textarea
                              className="h-40 w-full resize-y rounded-xl border border-slate-300 bg-slate-50 p-2 font-mono text-xs text-slate-700 shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                              value={editVal}
                              onChange={(e) =>
                                setEditing((prev) => ({
                                  ...prev,
                                  [p.id]: e.target.value,
                                }))
                              }
                              spellCheck={false}
                            />
                          )}

                          {msgMatch && (
                            <p
                              className={`mt-1 text-xs ${
                                msg.type === "ok" ? "text-emerald-700" : "text-red-600"
                              }`}
                            >
                              {msg.text}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-col gap-2 pt-1 sm:pt-6">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!isEditing}
                            loading={saving[p.id]}
                            onClick={() => handleSave(p)}
                            className="cursor-pointer"
                          >
                            <Save size={12} className="mr-1" />
                            保存
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleValidate(p)}
                            className="cursor-pointer"
                          >
                            <CheckCircle size={12} className="mr-1" />
                            校验
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {Object.keys(grouped).length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">
          暂无参数数据
        </div>
      )}
    </div>
  );
}
