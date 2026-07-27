"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { ArrowRight, RotateCcw, CheckCircle, XCircle } from "lucide-react";
import {
  formatAdminEntityType,
  formatAdminGateCheck,
  formatAdminStage,
  formatAdminStatus,
} from "@/lib/client/admin-labels";

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

interface PublishHistoryItem {
  id: number;
  entityType: string;
  entityId: string;
  fromStage: string;
  toStage: string;
  actor: string;
  reason: string | null;
  gateResults: unknown;
  createdAt: string;
}

interface GateResult {
  passed: boolean;
  checks: { name: string; passed: boolean; detail?: string }[];
}

const STAGE_COLORS: Record<string, string> = {
  draft: "border-amber-200 bg-amber-50",
  staging: "border-cyan-200 bg-cyan-50",
  prod: "border-emerald-200 bg-emerald-50",
};

function statusVariant(s: string): "published" | "draft" | "retired" | "info" {
  if (s === "published") return "published";
  if (s === "draft") return "draft";
  if (s === "retired") return "retired";
  return "info";
}

export default function PublishPage() {
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [history, setHistory] = useState<PublishHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [rolling, setRolling] = useState<string | null>(null);
  const [gateResult, setGateResult] = useState<{
    entity: string;
    result: GateResult;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/admin/publish/pipeline").then((r) => r.json()),
      fetch("/api/admin/publish/history").then((r) => r.json()),
    ])
      .then(([p, h]) => {
        setPipeline(p);
        setHistory(h);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handlePromote = async (
    entityType: string,
    entityId: string,
    fromStage: string,
  ) => {
    const key = `${entityType}:${entityId}`;
    setPromoting(key);
    setGateResult(null);
    setActionError(null);
    try {
      const toStage = fromStage === "draft" ? "staging" : "prod";
      const res = await fetch("/api/admin/publish/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, fromStage, toStage }),
      });
      const json = await res.json();
      if (json.gateResults) {
        setGateResult({ entity: key, result: json.gateResults });
      }
      if (res.ok) {
        fetchAll();
      } else if (!json.gateResults) {
        setActionError(json.error || "晋级失败，请重试");
      }
    } finally {
      setPromoting(null);
    }
  };

  const handleRollback = async (entityType: string, entityId: string) => {
    const key = `${entityType}:${entityId}`;
    setRolling(key);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/publish/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId }),
      });
      if (res.ok) {
        fetchAll();
      } else {
        const j = await res.json().catch(() => ({}));
        setActionError(j.error || "回滚失败，请重试");
      }
    } finally {
      setRolling(null);
    }
  };

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">加载中...</div>;
  }

  const stages = ["draft", "staging", "prod"] as const;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
        <h1 className="text-2xl font-semibold text-slate-900">发布中心</h1>
        <p className="mt-1 text-sm text-slate-600">草稿 → 预发布 → 生产发布流水线</p>
      </section>

      {actionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
          {actionError}
        </div>
      )}

      {gateResult && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm shadow-sm ${
            gateResult.result.passed
              ? "border-emerald-200 bg-emerald-50"
              : "border-red-200 bg-red-50"
          }`}
        >
          <div className="mb-2 flex items-center gap-2 font-medium text-slate-900">
            {gateResult.result.passed ? (
              <CheckCircle size={15} className="text-emerald-700" />
            ) : (
              <XCircle size={15} className="text-red-700" />
            )}
            门禁检查结果：{gateResult.result.passed ? "通过" : "失败"}
          </div>
          <ul className="space-y-1">
            {gateResult.result.checks?.map((c) => (
              <li key={c.name} className="flex items-center gap-2 text-xs text-slate-700">
                {c.passed ? (
                  <CheckCircle size={12} className="text-emerald-600" />
                ) : (
                  <XCircle size={12} className="text-red-600" />
                )}
                <span className="font-medium">{formatAdminGateCheck(c.name)}</span>
                {c.detail && <span className="text-slate-500">— {c.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {stages.map((stage, si) => (
          <div key={stage} className="relative">
            <div className={`rounded-2xl border-2 p-4 shadow-sm ${STAGE_COLORS[stage]}`}>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold text-slate-900">{formatAdminStage(stage)}</h2>
                <span className="text-xs text-slate-500">{pipeline?.[stage]?.length ?? 0} 项</span>
              </div>

              {!pipeline?.[stage]?.length ? (
                <p className="py-4 text-center text-xs text-slate-500">暂无内容</p>
              ) : (
                <div className="space-y-2">
                  {pipeline[stage].map((entity) => {
                    const key = `${entity.entityType}:${entity.entityId}`;
                    const isPromoting = promoting === key;
                    const isRolling = rolling === key;
                    return (
                      <div
                        key={key}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0">
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                              {formatAdminEntityType(entity.entityType)}
                            </p>
                            <p className="truncate font-mono text-sm text-slate-900">{entity.entityId}</p>
                            <div className="mt-1 flex items-center gap-1">
                              <Badge variant={statusVariant(entity.status)}>
                                {formatAdminStatus(entity.status)}
                              </Badge>
                              <span className="text-xs text-slate-500">v{entity.version}</span>
                            </div>
                          </div>
                          <div className="shrink-0">
                            {stage !== "prod" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                loading={isPromoting}
                                onClick={() =>
                                  handlePromote(entity.entityType, entity.entityId, stage)
                                }
                                className="cursor-pointer"
                              >
                                <ArrowRight size={11} />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                loading={isRolling}
                                onClick={() => handleRollback(entity.entityType, entity.entityId)}
                                className="cursor-pointer"
                              >
                                <RotateCcw size={11} />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {si < 2 && (
              <div className="absolute top-1/2 -right-3 z-10 hidden text-slate-400 xl:block">
                <ArrowRight size={18} />
              </div>
            )}
          </div>
        ))}
      </div>

      <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle>发布历史</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!history.length ? (
            <div className="p-6 text-center text-sm text-slate-500">暂无发布记录</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="border-y border-slate-200 bg-slate-50/90">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">时间</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">实体</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">操作</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">操作人</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b border-slate-100 transition-colors hover:bg-cyan-50/40">
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {new Date(h.createdAt).toLocaleString("zh-CN")}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-900">
                        <span className="text-slate-500">
                          {formatAdminEntityType(h.entityType)}/
                        </span>
                        {h.entityId}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span className="text-slate-500">{formatAdminStage(h.fromStage)}</span>
                        <ArrowRight size={12} className="mx-1 inline text-slate-400" />
                        <span className="font-medium text-slate-900">
                          {formatAdminStage(h.toStage)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{h.actor}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{h.reason ?? "-"}</td>
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
