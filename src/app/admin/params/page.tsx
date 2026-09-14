"use client";

import { adminFetch } from "@/lib/client/admin-fetch";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Save, CheckCircle } from "lucide-react";
import { RegionCoverageBanner } from "@/components/admin/RegionCoverageBanner";
import { formatAdminStatus } from "@/lib/client/admin-labels";

interface Param {
  id: number;
  paramId: string;
  jurisdictionCode: string | null;
  policyPackId: string;
  type: string;
  value: unknown;
  unit: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
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
  number: "数值参数",
  boolean: "布尔参数",
  string: "字符串参数",
  array: "数组参数",
  table: "表格参数",
  timeline: "时间线参数",
};

/** 行式参数（编辑用textarea渲染JSON）；其余读取value（审查缺陷3）。 */
function isRowType(type: string): boolean {
  return type === "table" || type === "timeline";
}

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

  const [jurisdictionFilter, setJurisdictionFilter] = useState("");

  const fetchParams = (jur = "") => {
    setLoading(true);
    const query = jur ? `?jurisdiction_code=${jur}` : "";
    fetch(`/api/admin/params${query}`)
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

  // 审查缺陷3：类型契约——number/boolean/string/array读取value；
  // table/timeline读取rows。标量数值直显，其余JSON序列化。
  const getEditValue = (p: Param) => {
    if (p.id in editing) return editing[p.id];
    if (isRowType(p.type)) {
      return JSON.stringify(p.rows ?? [], null, 2);
    }
    if (p.type === "number" || p.type === "boolean") {
      return String(p.value ?? "");
    }
    return JSON.stringify(p.value ?? null, null, 2);
  };

  const showMsg = (id: number, type: "ok" | "err", text: string) => {
    setMsg({ id, type, text });
    setTimeout(() => setMsg(null), 3000);
  };

  const handleSave = async (p: Param) => {
    const rawVal = editing[p.id];
    if (rawVal === undefined) return;
    let parsed: unknown = rawVal;
    if (isRowType(p.type) || p.type === "array") {
      try {
        parsed = JSON.parse(rawVal);
      } catch {
        showMsg(p.id, "err", "JSON 格式错误");
        return;
      }
    }
    setSaving((prev) => ({ ...prev, [p.id]: true }));
    try {
      // 审查缺陷3+6：按类型契约写字段；携带jurisdiction_code+version精确身份。
      const body: Record<string, unknown> = isRowType(p.type)
        ? { rows: parsed }
        : { value: parsed };
      const res = await adminFetch(
        `/api/admin/params/${p.paramId}?jurisdiction_code=${p.jurisdictionCode ?? ""}&version=${p.version}`,
        {
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
    const res = await adminFetch(
      `/api/admin/params/${p.paramId}/validate?jurisdiction_code=${p.jurisdictionCode ?? ""}&version=${p.version}`,
      {
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
      <RegionCoverageBanner />
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={jurisdictionFilter}
          onChange={(e) => {
            setJurisdictionFilter(e.target.value);
            fetchParams(e.target.value);
          }}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
        >
          <option value="">全部地区</option>
          <option value="CN">国家 baseline</option>
          <option value="310000">上海</option>
          <option value="440000">广东</option>
          <option value="510000">四川</option>
        </select>
      </div>
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
                            <span className="font-mono text-xs text-slate-400">@{p.jurisdictionCode ?? "-"}</span>
                            {p.unit && <span className="text-xs text-slate-500">单位: {p.unit}</span>}
                          </div>
                          <p className="mb-2 text-xs text-slate-500">
                            有效期：{p.effectiveFrom} ~ {p.effectiveTo ?? "长期"}
                            {p.note && ` · ${p.note}`}
                          </p>

                          {!isRowType(type) ? (
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
