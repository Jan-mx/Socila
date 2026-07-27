"use client";

import { adminFetch } from "@/lib/client/admin-fetch";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Upload, Search, X } from "lucide-react";

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
}

interface CasesResponse {
  cases: Case[];
  total: number;
  page: number;
  pageSize: number;
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

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">案例库</h1>
            <p className="mt-1 text-sm text-slate-600">管理用户社保问题案例数据</p>
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
              placeholder="搜索案例编号或内容..."
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
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-y border-slate-200 bg-slate-50/90">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">案例编号</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">创建者</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">主题</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">发布日期</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">回归</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cases.map((c) => (
                    <tr
                      key={c.id}
                      className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-cyan-50/40"
                      onClick={() => setSelectedCase(c)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-900">{c.caseUid ?? "-"}</td>
                      <td className="px-4 py-3 text-slate-800">{c.creator ?? "-"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(c.topics ?? []).map((t) => (
                            <Badge key={t} variant="info">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{c.postDate ?? "-"}</td>
                      <td className="px-4 py-3">
                        {c.isRegression && <Badge variant="warning">回归</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4">
          <div className="relative flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-base font-semibold text-slate-900">
                案例详情 — {selectedCase.caseUid ?? selectedCase.id}
              </h2>
              <button
                onClick={() => setSelectedCase(null)}
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              >
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 overflow-y-auto px-6 py-4 text-sm">
              <div>
                <p className="mb-1 font-medium text-slate-900">案例原文</p>
                <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  {selectedCase.caseText || "（无）"}
                </pre>
              </div>
              {selectedCase.transcriptText && (
                <div>
                  <p className="mb-1 font-medium text-slate-900">对话记录</p>
                  <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    {selectedCase.transcriptText}
                  </pre>
                </div>
              )}
              <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                <span>主题：{(selectedCase.topics ?? []).join("、") || "—"}</span>
                <span>标签：{(selectedCase.tags ?? []).join("、") || "—"}</span>
                <span>回归：{selectedCase.isRegression ? "是" : "否"}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
