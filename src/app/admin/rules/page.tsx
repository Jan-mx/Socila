"use client";

import { adminFetch } from "@/lib/client/admin-fetch";
import { formatAdminModule, formatAdminStatus } from "@/lib/client/admin-labels";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Tabs } from "@/components/ui/Tabs";
import {
  Search,
  Save,
  ChevronUp,
  ChevronDown,
  Plus,
  Trash2,
} from "lucide-react";

interface Rule {
  id: number;
  ruleId: string;
  name: string;
  module: string;
  status: string;
  priority: number;
  effectiveFrom: string;
  version: number;
}

interface RulesResponse {
  rules: Rule[];
  total: number;
}

interface RuleSet {
  id: number;
  ruleSetId: string;
  description: string | null;
  status: string;
  effectiveFrom: string;
  rules: string[];
  conflictResolution: unknown;
  version: number;
}

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "published", label: formatAdminStatus("published") },
  { value: "draft", label: formatAdminStatus("draft") },
  { value: "retired", label: formatAdminStatus("retired") },
];

const MODULE_OPTIONS = [
  { value: "", label: "全部模块" },
  { value: "normalization", label: formatAdminModule("normalization") },
  { value: "retirement", label: formatAdminModule("retirement") },
  { value: "pension", label: formatAdminModule("pension") },
  { value: "medical_insurance", label: formatAdminModule("medical_insurance") },
  { value: "unemployment", label: formatAdminModule("unemployment") },
  { value: "subsidy", label: formatAdminModule("subsidy") },
  { value: "contribution", label: formatAdminModule("contribution") },
  { value: "plan", label: formatAdminModule("plan") },
  { value: "gate", label: formatAdminModule("gate") },
];

function statusVariant(
  status: string,
): "published" | "draft" | "retired" | "info" {
  if (status === "published") return "published";
  if (status === "draft") return "draft";
  if (status === "retired") return "retired";
  return "info";
}

function RulesTab() {
  const router = useRouter();
  const [data, setData] = useState<RulesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const fetchRules = (q = "", mod = "", status = "") => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (mod) params.set("module", mod);
    if (status) params.set("status", status);
    fetch(`/api/admin/rules?${params}`)
      .then((r) => r.json())
      .then((d: { rules?: Rule[] }) =>
        setData({ rules: d.rules ?? [], total: d.rules?.length ?? 0 }),
      )
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleSearch = () => fetchRules(search, moduleFilter, statusFilter);

  return (
    <>
      <Card className="mb-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardContent className="pt-5">
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="搜索规则编号或名称..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="max-w-xs"
            />
            <Select
              options={MODULE_OPTIONS}
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="max-w-[180px]"
            />
            <Select
              options={STATUS_OPTIONS}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="max-w-[160px]"
            />
            <Button onClick={handleSearch} variant="outline" className="cursor-pointer">
              <Search size={14} className="mr-1.5" />
              搜索
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle>
            规则{" "}
            {data && (
              <span className="text-sm font-normal text-slate-500">共 {data.total} 条</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">加载中...</div>
          ) : !data?.rules?.length ? (
            <div className="p-8 text-center text-sm text-slate-500">暂无规则</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-y border-slate-200 bg-slate-50/90">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">规则编号</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">名称</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">模块</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">状态</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">优先级</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">生效日期</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">版本</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rules.map((rule) => (
                    <tr
                      key={rule.id}
                      className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-cyan-50/40"
                      onClick={() => router.push(`/admin/rules/${rule.ruleId}`)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-primary underline-offset-2 hover:underline">
                        {rule.ruleId}
                      </td>
                      <td className="px-4 py-3 text-slate-900">{rule.name}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {formatAdminModule(rule.module)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusVariant(rule.status)}>
                          {formatAdminStatus(rule.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{rule.priority}</td>
                      <td className="px-4 py-3 text-slate-600">{rule.effectiveFrom}</td>
                      <td className="px-4 py-3 text-slate-600">v{rule.version}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function RuleSetsTab() {
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RuleSet | null>(null);
  const [editRules, setEditRules] = useState<string[]>([]);
  const [newRuleId, setNewRuleId] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  const fetchSets = () => {
    setLoading(true);
    fetch("/api/admin/rule-sets")
      .then((r) => r.json())
      .then((data: { rule_sets?: RuleSet[] }) => setRuleSets(data.rule_sets ?? []))
      .catch(() => setRuleSets([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSets();
  }, []);

  const openSet = (rs: RuleSet) => {
    setSelected(rs);
    setEditRules([...rs.rules]);
    setMsg(null);
  };

  const showMsg = (type: "ok" | "err", text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3000);
  };

  const moveUp = (i: number) => {
    if (i === 0) return;
    const next = [...editRules];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    setEditRules(next);
  };

  const moveDown = (i: number) => {
    if (i === editRules.length - 1) return;
    const next = [...editRules];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    setEditRules(next);
  };

  const addRule = () => {
    const id = newRuleId.trim();
    if (!id || editRules.includes(id)) return;
    setEditRules((prev) => [...prev, id]);
    setNewRuleId("");
  };

  const removeRule = (i: number) => {
    setEditRules((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await adminFetch(`/api/admin/rule-sets/${selected.ruleSetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules: editRules }),
      });
      const json = await res.json();
      if (res.ok) {
        showMsg("ok", "规则集已保存");
        fetchSets();
      } else {
        showMsg("err", (json as { error?: string }).error ?? "保存失败");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="xl:col-span-1">
        <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>规则集列表</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 text-sm text-slate-500">加载中...</div>
            ) : ruleSets.length === 0 ? (
              <div className="p-4 text-sm text-slate-500">暂无数据</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {ruleSets.map((rs) => (
                  <li
                    key={rs.id}
                    className={`cursor-pointer px-4 py-3 transition-colors hover:bg-slate-50 ${
                      selected?.id === rs.id ? "bg-cyan-50/70" : ""
                    }`}
                    onClick={() => openSet(rs)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-900">{rs.ruleSetId}</span>
                      <Badge variant={statusVariant(rs.status)}>
                        {formatAdminStatus(rs.status)}
                      </Badge>
                    </div>
                    {rs.description && (
                      <p className="mt-0.5 truncate text-xs text-slate-500">{rs.description}</p>
                    )}
                    <p className="mt-0.5 text-xs text-slate-500">{rs.rules.length} 条规则 · v{rs.version}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="xl:col-span-2">
        {!selected ? (
          <div className="flex h-56 items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white text-sm text-slate-500">
            选择左侧规则集进行编辑
          </div>
        ) : (
          <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle>{selected.ruleSetId}</CardTitle>
                  <p className="mt-0.5 text-sm text-slate-500">{selected.description}</p>
                </div>
                <Button size="sm" loading={saving} onClick={handleSave} className="cursor-pointer">
                  <Save size={13} className="mr-1.5" />
                  保存
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {msg && (
                <div
                  className={`mb-4 rounded-xl border px-3 py-2 text-sm ${
                    msg.type === "ok"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-red-200 bg-red-50 text-red-800"
                  }`}
                >
                  {msg.text}
                </div>
              )}

              <p className="mb-3 text-sm font-medium text-slate-900">规则顺序（共 {editRules.length} 条）</p>

              <div className="mb-4 max-h-96 space-y-2 overflow-y-auto pr-1">
                {editRules.map((ruleId, i) => (
                  <div
                    key={`${ruleId}-${i}`}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2"
                  >
                    <span className="w-6 text-right text-xs text-slate-500">{i + 1}</span>
                    <span className="flex-1 font-mono text-xs text-slate-900">{ruleId}</span>
                    <button
                      onClick={() => moveUp(i)}
                      disabled={i === 0}
                      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      onClick={() => moveDown(i)}
                      disabled={i === editRules.length - 1}
                      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      onClick={() => removeRule(i)}
                      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-red-600"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  placeholder="输入规则编号..."
                  value={newRuleId}
                  onChange={(e) => setNewRuleId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addRule()}
                  className="h-9 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-mono text-slate-900 shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <Button variant="outline" size="sm" onClick={addRule} className="cursor-pointer">
                  <Plus size={13} className="mr-1" />
                  添加
                </Button>
              </div>

              {Boolean(selected.conflictResolution) && (
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <p className="mb-1 text-xs font-medium text-slate-500">冲突解决策略</p>
                  <pre className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                    {JSON.stringify(
                      selected.conflictResolution as Record<string, unknown>,
                      null,
                      2,
                    )}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default function RulesPage() {
  const tabs = [
    { key: "rules", label: "规则列表", content: <RulesTab /> },
    { key: "rule-sets", label: "规则集", content: <RuleSetsTab /> },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
        <h1 className="text-2xl font-semibold text-slate-900">规则管理</h1>
        <p className="mt-1 text-sm text-slate-600">查看和管理所有决策表规则及规则集</p>
      </section>
      <Tabs tabs={tabs} defaultKey="rules" />
    </div>
  );
}
