"use client";

/**
 * 发布中心（APR-FR-013～016、APR-AC-009/010/011）：
 * - 继续统一管理规则集、规则、参数三类资产的草稿→预发布→生产流水线；
 * - 每个阶段内部依次分为规则集、规则、参数三个可折叠分组（键盘可操作，aria-expanded），
 *   阶段显示总数、分组显示数量，空分组显示简洁空状态，分类数量之和等于阶段总数；
 * - 发布卡片以中文名称为主（displayName），编号/地区/版本/状态为辅；
 *   晋级与回滚操作继续使用实体类型+地区+编号+版本（稳定身份）；
 * - 发布历史显示按精确版本解析的名称；无法解析时显示"名称不可用"，
 *   绝不以当前名称冒充历史名称（APR-NFR-005）。
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
  ArrowRight,
  RotateCcw,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  formatAdminEntityType,
  formatAdminGateCheck,
  formatAdminStage,
  formatAdminStatus,
} from "@/lib/client/admin-labels";
import {
  NAME_PENDING_LABEL,
  NAME_UNAVAILABLE_LABEL,
  assetDisplayName,
  groupPipelineEntities,
  type PipelineGroup,
} from "@/lib/client/asset-display";

interface PublishEntity {
  entityType: string;
  jurisdictionCode: string | null;
  entityId: string;
  displayName: string | null;
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
  jurisdictionCode: string | null;
  entityVersion: number | null;
  displayName: string | null;
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
  // 阶段内分组的折叠状态（默认展开），key=`${stage}:${group}`。
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      fetch("/api/admin/publish/pipeline").then((r) => r.json()),
      fetch("/api/admin/publish/history").then((r) => r.json()),
    ])
      .then(([p, h]) => {
        setPipeline(p);
        setHistory(Array.isArray(h) ? h : []);
      })
      .catch(() => setActionError("发布流水线或历史加载失败，请刷新重试"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handlePromote = async (
    entityType: string,
    jurisdictionCode: string | null,
    entityId: string,
    entityVersion: number,
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
        body: JSON.stringify({
          entityType,
          jurisdiction_code: jurisdictionCode,
          entity_id: entityId,
          version: entityVersion,
          fromStage,
          toStage,
        }),
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

  const handleRollback = async (
    entityType: string,
    jurisdictionCode: string | null,
    entityId: string,
    entityVersion: number,
  ) => {
    const key = `${entityType}:${entityId}`;
    setRolling(key);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/publish/rollback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType,
          jurisdiction_code: jurisdictionCode,
          entity_id: entityId,
          version: entityVersion,
        }),
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

  const toggleGroup = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">加载中...</div>;
  }

  const stages = ["draft", "staging", "prod"] as const;

  const renderEntityCard = (
    stage: (typeof stages)[number],
    entity: PublishEntity,
  ) => {
    const key = `${entity.entityType}:${entity.entityId}`;
    const isPromoting = promoting === key;
    const isRolling = rolling === key;
    const display = assetDisplayName(entity.displayName, entity.entityId);
    return (
      <div
        key={`${entity.jurisdictionCode}-${key}-v${entity.version}`}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"
      >
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <p className="truncate text-sm text-slate-900">
              {display.primary}
              {display.pending ? (
                <span className="ml-1 text-xs text-slate-500">
                  （{NAME_PENDING_LABEL}）
                </span>
              ) : null}
            </p>
            <p className="truncate font-mono text-xs text-slate-500">
              {entity.entityId}
              {entity.jurisdictionCode && (
                <span className="ml-1 text-xs text-slate-400">
                  @{entity.jurisdictionCode}
                </span>
              )}
              <span className="ml-1 text-xs text-slate-400">
                · v{entity.version}
              </span>
            </p>
            <div className="mt-1 flex items-center gap-1">
              <Badge variant={statusVariant(entity.status)}>
                {formatAdminStatus(entity.status)}
              </Badge>
            </div>
          </div>
          <div className="shrink-0">
            {stage !== "prod" ? (
              <Button
                size="sm"
                variant="outline"
                loading={isPromoting}
                onClick={() =>
                  handlePromote(
                    entity.entityType,
                    entity.jurisdictionCode,
                    entity.entityId,
                    entity.version,
                    stage,
                  )
                }
                aria-label={`晋级 ${display.primary}（${entity.entityId}）`}
                className="cursor-pointer"
              >
                <ArrowRight size={11} />
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                loading={isRolling}
                onClick={() =>
                  handleRollback(
                    entity.entityType,
                    entity.jurisdictionCode,
                    entity.entityId,
                    entity.version,
                  )
                }
                aria-label={`回滚 ${display.primary}（${entity.entityId}）`}
                className="cursor-pointer"
              >
                <RotateCcw size={11} />
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
        <h1 className="text-2xl font-semibold text-slate-900">发布中心</h1>
        <p className="mt-1 text-sm text-slate-600">
          草稿 → 预发布 → 生产发布流水线（统一治理规则集、规则与参数）
        </p>
      </section>

      {actionError && (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm"
          role="alert"
        >
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
          role="status"
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
        {stages.map((stage, si) => {
          const entities = pipeline?.[stage] ?? [];
          const groups = groupPipelineEntities(entities);
          return (
            <div key={stage} className="relative">
              <div
                className={`rounded-2xl border-2 p-4 shadow-sm ${STAGE_COLORS[stage]}`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold text-slate-900">
                    {formatAdminStage(stage)}
                  </h2>
                  <span className="text-xs text-slate-500">
                    共 {entities.length} 项
                  </span>
                </div>

                <div className="space-y-3">
                  {groups.map((group) => {
                    const groupKey = `${stage}:${group.group as PipelineGroup}`;
                    const isCollapsed = collapsed[groupKey] ?? false;
                    return (
                      <div key={groupKey}>
                        <button
                          type="button"
                          onClick={() => toggleGroup(groupKey)}
                          aria-expanded={!isCollapsed}
                          aria-label={`${isCollapsed ? "展开" : "收起"}${formatAdminEntityType(group.group)}分组`}
                          className="flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-1 py-1 text-left text-xs font-medium text-slate-600 hover:bg-white/60"
                        >
                          {isCollapsed ? (
                            <ChevronRight size={13} />
                          ) : (
                            <ChevronDown size={13} />
                          )}
                          <span>{formatAdminEntityType(group.group)}</span>
                          <span className="text-slate-400">
                            （{group.items.length}）
                          </span>
                        </button>
                        {!isCollapsed ? (
                          group.items.length === 0 ? (
                            <p className="py-2 pl-5 text-xs text-slate-400">
                              暂无内容
                            </p>
                          ) : (
                            <div className="mt-1 space-y-2">
                              {group.items.map((entity) =>
                                renderEntityCard(stage, entity),
                              )}
                            </div>
                          )
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
              {si < 2 && (
                <div className="absolute top-1/2 -right-3 z-10 hidden text-slate-400 xl:block">
                  <ArrowRight size={18} />
                </div>
              )}
            </div>
          );
        })}
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
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-y border-slate-200 bg-slate-50/90">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">时间</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">资产</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">操作</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">操作人</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">备注</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => {
                    const display = assetDisplayName(h.displayName, h.entityId);
                    return (
                      <tr
                        key={h.id}
                        className="border-b border-slate-100 transition-colors hover:bg-cyan-50/40"
                      >
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {new Date(h.createdAt).toLocaleString("zh-CN")}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs text-slate-500">
                            {formatAdminEntityType(h.entityType)}
                          </p>
                          <p className="text-sm text-slate-900">
                            {display.primary}
                            {display.unavailable ? (
                              <span className="ml-1 text-xs text-slate-500">
                                （{NAME_UNAVAILABLE_LABEL}：该历史版本无法精确解析，不猜测）
                              </span>
                            ) : display.pending ? (
                              <span className="ml-1 text-xs text-slate-500">
                                （{NAME_PENDING_LABEL}）
                              </span>
                            ) : null}
                          </p>
                          <p className="font-mono text-xs text-slate-500">
                            {h.entityId}
                            {h.jurisdictionCode ? ` @ ${h.jurisdictionCode}` : ""}
                            {h.entityVersion !== null
                              ? ` · v${h.entityVersion}`
                              : " · 版本未记录"}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <span className="text-slate-500">
                            {formatAdminStage(h.fromStage)}
                          </span>
                          <ArrowRight
                            size={12}
                            className="mx-1 inline text-slate-400"
                          />
                          <span className="font-medium text-slate-900">
                            {formatAdminStage(h.toStage)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {h.actor}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">
                          {h.reason ?? "-"}
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
    </div>
  );
}
