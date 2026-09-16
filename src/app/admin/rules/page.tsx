"use client";

import { formatAdminModule, formatAdminStatus } from "@/lib/client/admin-labels";
import { RegionCoverageBanner } from "@/components/admin/RegionCoverageBanner";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Search } from "lucide-react";

interface Rule {
  id: number;
  ruleId: string;
  jurisdictionCode: string | null;
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

const JURISDICTION_OPTIONS = [
  { value: "", label: "全部地区" },
  { value: "CN", label: "国家 baseline" },
  { value: "310000", label: "上海" },
  { value: "440000", label: "广东" },
  { value: "510000", label: "四川" },
];

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

/**
 * APR-FR-001：规则集入口去重——本页仅保留规则列表；
 * 规则集管理唯一入口为侧边栏独立页面 /admin/rule-sets。
 * APR-FR-002：搜索、筛选、行跳转与详情页行为保持不变。
 */
export default function RulesPage() {
  const router = useRouter();
  const [data, setData] = useState<RulesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [jurisdictionFilter, setJurisdictionFilter] = useState("");

  const fetchRules = (q = "", mod = "", status = "", jur = "") => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (mod) params.set("module", mod);
    if (status) params.set("status", status);
    if (jur) params.set("jurisdiction_code", jur);
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

  const handleSearch = () =>
    fetchRules(search, moduleFilter, statusFilter, jurisdictionFilter);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
        <h1 className="text-2xl font-semibold text-slate-900">规则管理</h1>
        <p className="mt-1 text-sm text-slate-600">
          查看和管理所有决策表规则（规则集请在侧边栏“规则集”页面维护）
        </p>
      </section>

      <div className="mb-4">
        <RegionCoverageBanner />
      </div>
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
            <Select
              options={JURISDICTION_OPTIONS}
              value={jurisdictionFilter}
              onChange={(e) => setJurisdictionFilter(e.target.value)}
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
                    <th className="px-4 py-3 text-left font-medium text-slate-500">地区</th>
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
                      onClick={() =>
                        router.push(
                          `/admin/rules/${rule.ruleId}?jurisdiction_code=${rule.jurisdictionCode ?? ""}&version=${rule.version}`,
                        )
                      }
                    >
                      <td className="px-4 py-3 font-mono text-xs text-primary underline-offset-2 hover:underline">
                        {rule.ruleId}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {rule.jurisdictionCode ?? "-"}
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
    </div>
  );
}
