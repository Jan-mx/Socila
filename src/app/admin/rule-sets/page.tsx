"use client";

import { adminFetch } from "@/lib/client/admin-fetch";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Save, ChevronUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import { formatAdminStatus } from "@/lib/client/admin-labels";

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

function statusVariant(s: string): "published" | "draft" | "retired" | "info" {
  if (s === "published") return "published";
  if (s === "draft") return "draft";
  if (s === "retired") return "retired";
  return "info";
}

export default function RuleSetsPage() {
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
        showMsg("err", json.error ?? "保存失败");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
        <h1 className="text-2xl font-semibold text-slate-900">规则集</h1>
        <p className="mt-1 text-sm text-slate-600">管理规则执行顺序和冲突解决策略</p>
      </section>

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
                      <div className="flex items-center justify-between">
                        <span className="truncate text-sm font-medium text-slate-900">
                          {rs.ruleSetId}
                        </span>
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
    </div>
  );
}
