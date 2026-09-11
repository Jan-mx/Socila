"use client";

import { adminFetch } from "@/lib/client/admin-fetch";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Upload, Search, X } from "lucide-react";
import type { CaseNature, PolicySource } from "@/lib/showcase/case-nature";
import { SYNTHETIC_CASE_LABEL, capabilityFromLabels, capabilityLabel, regionLabel } from "@/lib/showcase/labels";

interface Case {
  id: number;
  caseUid: string | null;
  creator: string | null;
  postDate: string | null;
  topics: string[] | null;
  caseText: string | null;
  transcriptText: string | null;
  isRegression: boolean;
  tags: string[] | null;
  jurisdictionCode?: string | null;
  scenarioKey?: string | null;
  generatorVersion?: string | null;
  asOfDate?: string | null;
  snapshotHash?: string | null;
  qualityScore?: number | null;
  qualityStatus?: string | null;
  multiLabels?: string[] | null;
  input?: Record<string, unknown> | null;
  expected?: Record<string, unknown> | null;
  assertions?: Array<{ path: string; operator: string; value: unknown }> | null;
  /** SHV2-FR-013/014：API装饰字段。 */
  caseNature?: CaseNature;
  policySources?: PolicySource[];
}

interface CasesResponse {
  cases: Case[];
  total: number;
  page: number;
  pageSize: number;
}

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return String(value);
  }
}

export default function CasesPage() {
  const [data, setData] = useState<CasesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [topicFilter, setTopicFilter] = useState("");
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchCases = (q = "", topic = "") => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (topic) params.set("topic", topic);
    fetch(`/api/admin/cases?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCases();
  }, []);

  const handleSearch = () => fetchCases(search, topicFilter);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportMsg(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await adminFetch("/api/admin/import/cases", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      setImportMsg(
        res.ok
          ? `导入成功：${json.imported ?? 0} 条`
          : `导入失败：${json.error ?? "未知错误"}`,
      );
      if (res.ok) fetchCases(search, topicFilter);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const selectedIsSynthetic = selectedCase?.caseNature === "synthetic";
  const selectedCapability = selectedCase ? capabilityFromLabels(selectedCase.multiLabels) : null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">案例库</h1>
            <p className="mt-1 text-sm text-slate-600">
              管理{SYNTHETIC_CASE_LABEL}与人工维护案例；列表只显示active案例并叠加筛选条件。
            </p>
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleImport}
            />
            <Button
              variant="outline"
              loading={importing}
              onClick={() => fileRef.current?.click()}
              className="cursor-pointer"
            >
              <Upload size={14} className="mr-1.5" />
              导入 xlsx
            </Button>
          </div>
        </div>
      </section>

      {importMsg && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm shadow-sm ${
            importMsg.startsWith("导入成功")
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {importMsg}
        </div>
      )}

      <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardContent className="pt-5">
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="搜索案例编号或文档内容..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="max-w-xs"
            />
            <Input
              placeholder="按主题筛选..."
              value={topicFilter}
              onChange={(e) => setTopicFilter(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="max-w-xs"
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
            案例列表{" "}
            {data && (
              <span className="text-sm font-normal text-slate-500">共 {data.total} 条</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">加载中...</div>
          ) : !data?.cases?.length ? (
            <div className="p-8 text-center text-sm text-slate-500">暂无数据</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="border-y border-slate-200 bg-slate-50/90">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">案例编号</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">性质</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">地区</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">能力</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">生成器</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">文档</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">主题</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">回归</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cases.map((c) => {
                    const cap = capabilityFromLabels(c.multiLabels);
                    return (
                      <tr
                        key={c.id}
                        className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-cyan-50/40"
                        onClick={() => setSelectedCase(c)}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-slate-900">{c.caseUid ?? "-"}</td>
                        <td className="px-4 py-3">
                          <Badge variant={c.caseNature === "synthetic" ? "info" : "retired"}>
                            {c.caseNature === "synthetic" ? "合成" : "人工"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-800">{regionLabel(c.jurisdictionCode)}</td>
                        <td className="px-4 py-3 text-slate-800">{cap ? capabilityLabel(cap) : "-"}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{c.generatorVersion ?? "-"}</td>
                        <td className="px-4 py-3 text-xs">
                          {c.caseText && c.caseText.trim().length > 0 ? (
                            <Badge variant="published">已生成</Badge>
                          ) : (
                            <Badge variant="warning">待生成V2案例文档</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(c.topics ?? []).map((t) => (
                              <Badge key={t} variant="info">
                                {t}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {c.isRegression && <Badge variant="warning">回归</Badge>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4">
          <div className="relative flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  案例详情 — {selectedCase.caseUid ?? selectedCase.id}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  性质：{selectedIsSynthetic ? SYNTHETIC_CASE_LABEL : "人工维护案例"} · 地区：{regionLabel(selectedCase.jurisdictionCode)} · 能力：
                  {selectedCapability ? capabilityLabel(selectedCapability) : "—"} · 生成器：{selectedCase.generatorVersion ?? "—"}
                </p>
              </div>
              <button
                onClick={() => setSelectedCase(null)}
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 overflow-y-auto px-6 py-4 text-sm">
              <div>
                <p className="mb-1 font-medium text-slate-900">{selectedIsSynthetic ? "合成案例文档" : "案例文档"}</p>
                {selectedCase.caseText && selectedCase.caseText.trim().length > 0 ? (
                  <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    {selectedCase.caseText}
                  </pre>
                ) : (
                  <p
                    data-pending-v2
                    className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-800"
                  >
                    待生成V2案例文档：该记录的case_text为空（V1生成器未写入文档），页面不虚构正文；待受控原位改写为V2后显示。
                  </p>
                )}
              </div>
              {selectedCase.transcriptText && (
                <div>
                  <p className="mb-1 font-medium text-slate-900">对话记录</p>
                  <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    {selectedCase.transcriptText}
                  </pre>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-xs font-medium text-slate-500">生成器版本（generatorVersion）</p>
                  <p className="mt-1 font-mono text-xs text-slate-800">{selectedCase.generatorVersion ?? "—"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-xs font-medium text-slate-500">计算日期（asOfDate）</p>
                  <p className="mt-1 font-mono text-xs text-slate-800">{selectedCase.asOfDate ? String(selectedCase.asOfDate).slice(0, 10) : "—"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3 sm:col-span-2">
                  <p className="text-xs font-medium text-slate-500">快照hash（snapshotHash）</p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-800">{selectedCase.snapshotHash ?? "—"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-xs font-medium text-slate-500">场景键（scenarioKey）</p>
                  <p className="mt-1 font-mono text-xs text-slate-800">{selectedCase.scenarioKey ?? "—"}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-xs font-medium text-slate-500">质量分（qualityScore / qualityStatus）</p>
                  <p className="mt-1 font-mono text-xs text-slate-800">
                    {selectedCase.qualityScore ?? "—"} / {selectedCase.qualityStatus ?? "—"}
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-1 font-medium text-slate-900">结构化输入（input）</p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  {pretty(selectedCase.input)}
                </pre>
              </div>
              <div>
                <p className="mb-1 font-medium text-slate-900">期望输出（expected）</p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  {pretty(selectedCase.expected)}
                </pre>
              </div>
              <div>
                <p className="mb-1 font-medium text-slate-900">断言（assertions）</p>
                {selectedCase.assertions && selectedCase.assertions.length > 0 ? (
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-2 py-1 text-left">路径</th>
                        <th className="px-2 py-1 text-left">操作</th>
                        <th className="px-2 py-1 text-left">期望值</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCase.assertions.map((a, i) => (
                        <tr key={`${a.path}-${i}`} className="border-t border-slate-100">
                          <td className="px-2 py-1 font-mono">{a.path}</td>
                          <td className="px-2 py-1">{a.operator}</td>
                          <td className="px-2 py-1 font-mono">{JSON.stringify(a.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-xs text-slate-500">—</p>
                )}
              </div>
              <div>
                <p className="mb-1 font-medium text-slate-900">政策来源（policySources）</p>
                {selectedCase.policySources && selectedCase.policySources.length > 0 ? (
                  <ol className="space-y-2">
                    {selectedCase.policySources.map((p, i) => (
                      <li key={`${p.documentId}-${i}`} className="rounded-xl border border-slate-200 p-3 text-xs">
                        <p className="font-medium text-slate-900">《{p.title}》</p>
                        <p className="mt-0.5 text-slate-600">
                          {p.documentId} · {p.authority} · {p.locator.type} / {p.locator.reference}
                        </p>
                        <p className="mt-1 text-slate-600">原文摘录：{p.excerpt}</p>
                        <a
                          href={p.officialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block break-all text-primary underline-offset-2 hover:underline"
                        >
                          {p.officialUrl}
                        </a>
                        <p className="mt-1 break-all font-mono text-[10px] text-slate-500">SHA-256：{p.contentSha256}</p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-xs text-slate-500">
                    {selectedIsSynthetic ? "V1记录未携带结构化政策来源；V2改写后显示。" : "人工维护案例，无结构化来源。"}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                <span>主题：{(selectedCase.topics ?? []).join("、") || "—"}</span>
                <span>标签：{(selectedCase.tags ?? []).join("、") || "—"}</span>
                <span>回归：{selectedCase.isRegression ? "是" : "否"}</span>
                <span>caseNature：{selectedCase.caseNature ?? "—"}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
