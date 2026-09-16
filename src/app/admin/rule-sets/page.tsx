"use client";

/**
 * 规则集独立管理页（APR-FR-003～009、APR-AC-003～007）。
 *
 * - 侧边栏唯一规则集入口（FR-001）；列表/详情以rule_set_id+jurisdiction_code+version
 *   精确实体身份读取与更新（FR-006），不跨地区猜测；
 * - 成员按持久化rule_id[]顺序显示中文名称（FR-004/005），编号、来源地区、解析版本、
 *   状态为辅；解析日期明确回显（FR-007）；页面绝不按名称/编号重排成员；
 * - 调整顺序前confirm提示影响计算结果（FR-005）；
 * - 成员可展开只读查看规则内容，无法友好渲染的DSL节点用格式化JSON回退（FR-008）；
 * - 新增成员使用名称/编号搜索选择器，最终保存稳定编号（FR-009）；
 * - 折叠/展开支持键盘与aria标签，错误状态为文本（非仅颜色）（APR-NFR-003）。
 */
import { adminFetch } from "@/lib/client/admin-fetch";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Save, ChevronUp, ChevronDown, Plus, Trash2, Search, ChevronRight, ChevronDown as ChevronDownIcon } from "lucide-react";
import { formatAdminStatus } from "@/lib/client/admin-labels";
import {
  NAME_PENDING_LABEL,
  NAME_UNAVAILABLE_LABEL,
  assetDisplayName,
} from "@/lib/client/asset-display";

interface RuleSetSummary {
  id: number;
  ruleSetId: string;
  jurisdictionCode: string | null;
  name: string;
  description: string | null;
  status: string;
  effectiveFrom: string;
  rules: string[];
  conflictResolution: unknown;
  version: number;
}

interface MemberView {
  position: number;
  ruleId: string;
  name: string | null;
  jurisdictionCode: string | null;
  version: number | null;
  status: string | null;
  operation: string | null;
  missing: boolean;
}

interface RuleSetDetailResponse {
  rule_set: RuleSetSummary;
  rules: string[];
  members: MemberView[];
  asOfDate: string;
}

interface CandidateRule {
  ruleId: string;
  name: string;
  jurisdictionCode: string;
  version: number;
  status: string;
}

type RuleContent = Record<string, unknown>;

const OPERATION_LABELS: Record<string, string> = {
  baseline: "国家基线",
  add: "地区新增",
  replace: "地区替换",
  restrict: "地区限制",
  exempt: "地区豁免",
};

function statusVariant(s: string): "published" | "draft" | "retired" | "info" {
  if (s === "published") return "published";
  if (s === "draft") return "draft";
  if (s === "retired") return "retired";
  return "info";
}

function identityPath(locator: { ruleSetId: string; jurisdictionCode: string; version: number }) {
  return `/api/admin/rule-sets/${locator.ruleSetId}?jurisdiction_code=${locator.jurisdictionCode}&version=${locator.version}`;
}

/** 决策表等DSL节点的友好渲染回退：无法识别的结构统一用格式化JSON。 */
function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="max-h-56 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function RuleExpandedContent({ content }: { content: RuleContent }) {
  const notes = typeof content.notes === "string" ? content.notes : null;
  const inputs = Array.isArray(content.inputs) ? content.inputs : [];
  const outputs = Array.isArray(content.outputs) ? content.outputs : [];
  const parameterRefs = Array.isArray(content.parameterRefs)
    ? content.parameterRefs
    : [];
  const evidence = Array.isArray(content.evidence) ? content.evidence : [];
  const decisionTable = content.decisionTable as
    | { hit_policy?: string; rows?: unknown[] }
    | undefined;
  const dtRows =
    Array.isArray(decisionTable?.rows) && decisionTable
      ? (decisionTable.rows as unknown[])
      : null;

  return (
    <div className="space-y-3 border-t border-slate-100 bg-slate-50/60 p-4 text-sm">
      <div>
        <p className="text-xs font-medium text-slate-500">说明与备注</p>
        <p className="mt-1 text-slate-800">
          {notes ?? "（该规则未填写备注说明）"}
        </p>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500">输入</p>
        {inputs.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {inputs.map((input, i) => {
              const item = input as Record<string, unknown>;
              if (typeof item.key === "string") {
                return (
                  <li key={i} className="text-xs text-slate-700">
                    <code className="font-mono">{item.key}</code>
                    <span className="ml-2 text-slate-500">
                      {typeof item.type === "string" ? item.type : ""}
                      {item.required === true ? "（必填）" : ""}
                    </span>
                    {typeof item.desc === "string" ? (
                      <span className="ml-2 text-slate-500">{item.desc}</span>
                    ) : null}
                  </li>
                );
              }
              return (
                <li key={i}>
                  <JsonBlock value={input} />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-slate-500">（无输入声明）</p>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500">
          决策条件与动作
          {typeof decisionTable?.hit_policy === "string"
            ? `（命中策略：${decisionTable.hit_policy}）`
            : ""}
        </p>
        {dtRows ? (
          <ol className="mt-1 space-y-2">
            {dtRows.map((row, i) => {
              const r = row as Record<string, unknown>;
              if (
                r &&
                typeof r === "object" &&
                "when" in r &&
                "then" in r
              ) {
                return (
                  <li
                    key={i}
                    className="rounded-lg border border-slate-200 bg-white p-2"
                  >
                    <p className="text-xs font-medium text-slate-600">
                      {typeof r.row_id === "string" ? r.row_id : `第 ${i + 1} 行`}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">条件（when）</p>
                    <JsonBlock value={r.when} />
                    <p className="mt-1 text-xs text-slate-500">动作（then）</p>
                    <JsonBlock value={r.then} />
                  </li>
                );
              }
              return (
                <li key={i}>
                  <JsonBlock value={row} />
                </li>
              );
            })}
          </ol>
        ) : decisionTable ? (
          <div className="mt-1">
            <JsonBlock value={decisionTable} />
          </div>
        ) : (
          <p className="mt-1 text-xs text-slate-500">（无决策表）</p>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500">输出</p>
        {outputs.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {outputs.map((output, i) => {
              const item = output as Record<string, unknown>;
              if (typeof item.key === "string") {
                return (
                  <li key={i} className="text-xs text-slate-700">
                    <code className="font-mono">{item.key}</code>
                    <span className="ml-2 text-slate-500">
                      {typeof item.type === "string" ? item.type : ""}
                    </span>
                  </li>
                );
              }
              return (
                <li key={i}>
                  <JsonBlock value={output} />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-slate-500">（无输出声明）</p>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500">参数引用</p>
        {parameterRefs.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {parameterRefs.map((ref, i) => {
              const item = ref as Record<string, unknown>;
              if (typeof item.param_id === "string") {
                return (
                  <li key={i} className="text-xs text-slate-700">
                    <code className="font-mono">{item.param_id}</code>
                    {typeof item.purpose === "string" ? (
                      <span className="ml-2 text-slate-500">{item.purpose}</span>
                    ) : null}
                  </li>
                );
              }
              return (
                <li key={i}>
                  <JsonBlock value={ref} />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-slate-500">（无参数引用）</p>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500">证据</p>
        {evidence.length > 0 ? (
          <ul className="mt-1 space-y-1">
            {evidence.map((item, i) => {
              const ev = item as Record<string, unknown>;
              const title = typeof ev.title === "string" ? ev.title : String(ev.document_id ?? "证据");
              const url = typeof ev.official_url === "string" ? ev.official_url : null;
              const excerpt = typeof ev.excerpt === "string" ? ev.excerpt : null;
              return (
                <li key={i} className="text-xs text-slate-700">
                  {url ? (
                    <a
                      className="text-primary underline underline-offset-2"
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {title}
                    </a>
                  ) : (
                    <span>{title}</span>
                  )}
                  {excerpt ? (
                    <p className="mt-0.5 border-l-2 border-slate-300 pl-2 text-slate-500">
                      {excerpt}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-slate-500">（无证据记录）</p>
        )}
      </div>
    </div>
  );
}

export default function RuleSetsPage() {
  const [ruleSets, setRuleSets] = useState<RuleSetSummary[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [locator, setLocator] = useState<{
    ruleSetId: string;
    jurisdictionCode: string;
    version: number;
  } | null>(null);
  const [detail, setDetail] = useState<RuleSetDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // 编辑态：orderRules 严格保持持久化顺序，绝不在客户端排序（APR-FR-005）。
  const [orderRules, setOrderRules] = useState<string[]>([]);
  const [nameDraft, setNameDraft] = useState("");
  const [asOfDraft, setAsOfDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [ruleContents, setRuleContents] = useState<
    Record<number, { state: "loading" | "ok" | "err"; content?: RuleContent; error?: string }>
  >({});

  const [candidateQuery, setCandidateQuery] = useState("");
  const [candidates, setCandidates] = useState<CandidateRule[] | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);

  const fetchSets = () => {
    setLoading(true);
    setListError(null);
    fetch("/api/admin/rule-sets")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { rule_sets?: RuleSetSummary[] }) =>
        setRuleSets(data.rule_sets ?? []),
      )
      .catch(() => {
        setRuleSets([]);
        setListError("规则集列表加载失败，请重试");
      })
      .finally(() => setLoading(false));
  };

  const fetchDetail = (
    target: { ruleSetId: string; jurisdictionCode: string; version: number },
    asOf?: string,
  ) => {
    setDetailLoading(true);
    setDetailError(null);
    const query = asOf && asOf.length > 0 ? `&as_of_date=${encodeURIComponent(asOf)}` : "";
    adminFetch(`${identityPath(target)}${query}`, { method: "GET" })
      .then(async (r) => {
        const json = (await r.json()) as
          | RuleSetDetailResponse
          | { error?: string };
        if (!r.ok) {
          throw new Error(
            (json as { error?: string }).error ?? "规则集详情加载失败",
          );
        }
        return json as RuleSetDetailResponse;
      })
      .then((body) => {
        setDetail(body);
        setOrderRules([...body.rules]);
        setNameDraft(body.rule_set.name ?? "");
        setAsOfDraft(body.asOfDate);
        setExpandedIndex(null);
        setRuleContents({});
      })
      .catch((err: unknown) => {
        setDetail(null);
        setDetailError(err instanceof Error ? err.message : "规则集详情加载失败");
      })
      .finally(() => setDetailLoading(false));
  };

  useEffect(() => {
    fetchSets();
  }, []);

  const selectSet = (rs: RuleSetSummary) => {
    if (!rs.jurisdictionCode) {
      setDetailError("该规则集缺少地区身份（历史数据），无法精确定位（APR-FR-006）");
      setDetail(null);
      setLocator(null);
      return;
    }
    const next = {
      ruleSetId: rs.ruleSetId,
      jurisdictionCode: rs.jurisdictionCode,
      version: rs.version,
    };
    setLocator(next);
    setMsg(null);
    fetchDetail(next);
  };

  const memberByRuleId = new Map<string, MemberView>();
  if (detail) {
    for (const m of detail.members) memberByRuleId.set(m.ruleId, m);
  }

  const reorder = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= orderRules.length) return;
    // APR-FR-005：调整顺序前必须提示该操作会影响计算结果。
    const confirmed = window.confirm(
      "规则按此顺序执行，前序结果可能被后序规则读取。调整顺序会影响计算结果，确认调整？",
    );
    if (!confirmed) return;
    const next = [...orderRules];
    [next[index], next[target]] = [next[target], next[index]];
    setOrderRules(next);
  };

  const removeAt = (index: number) => {
    setOrderRules((prev) => prev.filter((_, i) => i !== index));
  };

  const searchCandidates = () => {
    if (!locator) return;
    setCandidateLoading(true);
    setCandidateError(null);
    adminFetch(
      `/api/admin/rule-sets/${locator.ruleSetId}/candidates?jurisdiction_code=${locator.jurisdictionCode}&version=${locator.version}&q=${encodeURIComponent(candidateQuery)}`,
      { method: "GET" },
    )
      .then(async (r) => {
        const json = (await r.json()) as
          | { candidates: CandidateRule[] }
          | { error?: string };
        if (!r.ok) {
          throw new Error(
            (json as { error?: string }).error ?? "候选规则加载失败",
          );
        }
        setCandidates((json as { candidates: CandidateRule[] }).candidates ?? []);
      })
      .catch((err: unknown) => {
        setCandidates(null);
        setCandidateError(
          err instanceof Error ? err.message : "候选规则加载失败",
        );
      })
      .finally(() => setCandidateLoading(false));
  };

  const addCandidate = (candidate: CandidateRule) => {
    // 保存值仍为稳定编号（APR-FR-009/AC-007）；同时登记成员展示信息避免闪烁。
    setOrderRules((prev) =>
      prev.includes(candidate.ruleId) ? prev : [...prev, candidate.ruleId],
    );
    if (detail && !memberByRuleId.has(candidate.ruleId)) {
      const appended: MemberView = {
        position: detail.members.length,
        ruleId: candidate.ruleId,
        name: candidate.name,
        jurisdictionCode: candidate.jurisdictionCode,
        version: candidate.version,
        status: candidate.status,
        operation: null,
        missing: false,
      };
      setDetail({
        ...detail,
        members: [...detail.members, appended],
      });
    }
  };

  const toggleExpand = (index: number) => {
    if (expandedIndex === index) {
      setExpandedIndex(null);
      return;
    }
    setExpandedIndex(index);
    const ruleId = orderRules[index];
    const member = memberByRuleId.get(ruleId);
    if (!member || member.missing || ruleContents[index]?.state === "ok") return;
    setRuleContents((prev) => ({
      ...prev,
      [index]: { state: "loading" },
    }));
    adminFetch(
      `/api/admin/rules/${member.ruleId}?jurisdiction_code=${member.jurisdictionCode}&version=${member.version}`,
      { method: "GET" },
    )
      .then(async (r) => {
        const json = (await r.json()) as { rule?: RuleContent; error?: string };
        if (!r.ok) throw new Error(json.error ?? "规则内容加载失败");
        setRuleContents((prev) => ({
          ...prev,
          [index]: { state: "ok", content: json.rule ?? {} },
        }));
      })
      .catch((err: unknown) => {
        setRuleContents((prev) => ({
          ...prev,
          [index]: {
            state: "err",
            error: err instanceof Error ? err.message : "规则内容加载失败",
          },
        }));
      });
  };

  const dirty =
    detail !== null &&
    (orderRules.join(",") !== detail.rules.join(",") ||
      nameDraft !== (detail.rule_set.name ?? ""));

  const editorMissingRuleIds = orderRules.filter(
    (id) => memberByRuleId.get(id)?.missing ?? false,
  );

  const handleSave = async () => {
    if (!locator || !detail) return;
    if (editorMissingRuleIds.length > 0) {
      setMsg({
        type: "err",
        text: `存在无法解析的成员（${editorMissingRuleIds.join(", ")}），禁止保存（APR-AC-006）`,
      });
      return;
    }
    setSaving(true);
    try {
      const res = await adminFetch(identityPath(locator), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameDraft, rules: orderRules }),
      });
      const json = (await res.json()) as {
        rule_set?: RuleSetSummary;
        error?: string;
        invalidRuleIds?: string[];
        duplicateRuleIds?: string[];
      };
      if (res.ok) {
        setMsg({ type: "ok", text: "规则集已保存" });
        fetchDetail(locator, asOfDraft);
        fetchSets();
      } else {
        const problem = [
          ...(json.duplicateRuleIds ?? []).map((id) => `重复：${id}`),
          ...(json.invalidRuleIds ?? []).map((id) => `无法解析：${id}`),
        ].join("；");
        setMsg({
          type: "err",
          text: problem.length > 0
            ? `保存被拒绝（${problem}）`
            : (json.error ?? "保存失败"),
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const draftEditable = detail?.rule_set.status === "draft";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
        <h1 className="text-2xl font-semibold text-slate-900">规则集</h1>
        <p className="mt-1 text-sm text-slate-600">
          按执行顺序管理参与计算的规则；成员以中文名称为主显示，编号仅作辅助
        </p>
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
              ) : listError ? (
                <div className="p-4 text-sm text-slate-600" role="alert">
                  {listError}
                </div>
              ) : ruleSets.length === 0 ? (
                <div className="p-4 text-sm text-slate-500">暂无规则集</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {ruleSets.map((rs) => {
                    const display = assetDisplayName(rs.name, rs.ruleSetId);
                    const isSelected =
                      locator?.ruleSetId === rs.ruleSetId &&
                      locator?.jurisdictionCode === rs.jurisdictionCode &&
                      locator?.version === rs.version;
                    return (
                      <li key={rs.id}>
                        <button
                          type="button"
                          className={`flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                            isSelected ? "bg-cyan-50/70" : ""
                          }`}
                          onClick={() => selectSet(rs)}
                          aria-label={`选择规则集 ${display.primary}（${rs.ruleSetId}，地区 ${rs.jurisdictionCode ?? "未知"}，版本 v${rs.version}）`}
                        >
                          <span className="flex w-full items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium text-slate-900">
                              {display.primary}
                              {display.pending ? (
                                <span className="ml-2 text-xs text-slate-500">
                                  （{NAME_PENDING_LABEL}）
                                </span>
                              ) : null}
                            </span>
                            <Badge variant={statusVariant(rs.status)}>
                              {formatAdminStatus(rs.status)}
                            </Badge>
                          </span>
                          <span className="font-mono text-xs text-slate-500">
                            {rs.ruleSetId} @ {rs.jurisdictionCode ?? "-"} · v
                            {rs.version}
                          </span>
                          <span className="text-xs text-slate-500">
                            {rs.rules.length} 条规则
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="xl:col-span-2">
          {!locator ? (
            <div className="flex h-56 items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white text-sm text-slate-500">
              选择左侧规则集进行查看与编辑
            </div>
          ) : detailLoading ? (
            <div className="flex h-56 items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white text-sm text-slate-500">
              加载中...
            </div>
          ) : detailError || !detail ? (
            <div
              className="flex h-56 items-center justify-center rounded-2xl border-2 border-dashed border-red-300 bg-white px-6 text-center text-sm text-slate-600"
              role="alert"
            >
              {detailError ?? "规则集详情加载失败"}
            </div>
          ) : (
            <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="flex flex-wrap items-center gap-2">
                      <span>{detail.rule_set.name || NAME_UNAVAILABLE_LABEL}</span>
                      <span className="font-mono text-xs font-normal text-slate-500">
                        {detail.rule_set.ruleSetId} @{" "}
                        {detail.rule_set.jurisdictionCode} · v
                        {detail.rule_set.version}
                      </span>
                      <Badge variant={statusVariant(detail.rule_set.status)}>
                        {formatAdminStatus(detail.rule_set.status)}
                      </Badge>
                    </CardTitle>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {detail.rule_set.description}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      成员解析日期：{detail.asOfDate}（默认服务器当前日期；历史精确执行内容以不可变快照为准）
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <label className="text-xs text-slate-500">
                      解析日期
                      <input
                        type="date"
                        value={asOfDraft}
                        onChange={(e) => setAsOfDraft(e.target.value)}
                        className="ml-2 rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-700"
                        aria-label="成员解析日期（as_of_date）"
                      />
                      <button
                        type="button"
                        onClick={() => locator && fetchDetail(locator, asOfDraft)}
                        className="ml-2 cursor-pointer rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        重新解析
                      </button>
                    </label>
                    <Button
                      size="sm"
                      loading={saving}
                      disabled={!dirty || !draftEditable}
                      onClick={handleSave}
                      className="cursor-pointer"
                    >
                      <Save size={13} className="mr-1.5" />
                      保存
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div
                  className="mb-3 text-xs text-slate-500"
                  role="status"
                  aria-live="polite"
                >
                  {msg?.text ?? (dirty ? "存在未保存的调整" : "")}
                </div>
                {msg && (
                  <p
                    className={`mb-3 rounded-xl border px-3 py-2 text-sm ${
                      msg.type === "ok"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-red-200 bg-red-50 text-red-800"
                    }`}
                    role={msg.type === "err" ? "alert" : undefined}
                  >
                    {msg.text}
                  </p>
                )}

                {draftEditable && (
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <label className="text-xs text-slate-500" htmlFor="rule-set-name">
                      正式中文名称
                    </label>
                    <Input
                      id="rule-set-name"
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      className="max-w-sm"
                      placeholder="如：上海规划主规则集"
                    />
                    <span className="text-xs text-slate-400">
                      编号 {detail.rule_set.ruleSetId} 继续作为业务身份
                    </span>
                  </div>
                )}

                <p className="mb-1 text-sm font-medium text-slate-900">
                  规则执行顺序（共 {orderRules.length} 条，页面顺序=持久化顺序=执行顺序）
                </p>
                <p className="mb-3 text-xs text-slate-500">
                  调整顺序会影响计算结果（前序结果可能被后序规则读取），保存后生效
                </p>

                <div className="mb-4 max-h-[32rem] space-y-2 overflow-y-auto pr-1">
                  {orderRules.map((ruleId, i) => {
                    const member = memberByRuleId.get(ruleId);
                    const display = assetDisplayName(
                      member?.name ?? null,
                      ruleId,
                    );
                    const isMissing = member?.missing ?? true;
                    const contentState = ruleContents[i];
                    const expanded = expandedIndex === i;
                    return (
                      <div
                        key={`${ruleId}-${i}`}
                        className="rounded-xl border border-slate-200 bg-slate-50/80"
                      >
                        <div className="flex items-center gap-2 px-3 py-2">
                          <span className="w-6 text-right text-xs text-slate-500">
                            {i + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleExpand(i)}
                            disabled={isMissing}
                            aria-expanded={expanded}
                            aria-label={`${expanded ? "收起" : "展开"}规则 ${ruleId} 的内容`}
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left disabled:cursor-not-allowed"
                          >
                            {expanded ? (
                              <ChevronDownIcon size={14} className="shrink-0 text-slate-500" />
                            ) : (
                              <ChevronRight size={14} className="shrink-0 text-slate-500" />
                            )}
                            <span className="truncate text-sm text-slate-900">
                              {display.primary}
                              {display.pending ? (
                                <span className="ml-2 text-xs text-slate-500">
                                  （{NAME_PENDING_LABEL}）
                                </span>
                              ) : null}
                            </span>
                            <span className="shrink-0 font-mono text-xs text-slate-500">
                              {ruleId}
                            </span>
                            {isMissing ? (
                              <span className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-1.5 py-0.5 text-xs text-red-700">
                                规则无法解析（保留原位置，禁止保存前请处理）
                              </span>
                            ) : (
                              <>
                                <span className="shrink-0 font-mono text-xs text-slate-400">
                                  {`@ ${member?.jurisdictionCode} · v${member?.version}`}
                                </span>
                                {member?.operation ? (
                                  <span className="shrink-0 text-xs text-slate-500">
                                    {OPERATION_LABELS[member.operation] ?? member.operation}
                                  </span>
                                ) : null}
                                {member?.status ? (
                                  <Badge variant={statusVariant(member.status)}>
                                    {formatAdminStatus(member.status)}
                                  </Badge>
                                ) : null}
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => reorder(i, -1)}
                            disabled={i === 0 || !draftEditable}
                            aria-label={`上移规则 ${ruleId}`}
                            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => reorder(i, 1)}
                            disabled={i === orderRules.length - 1 || !draftEditable}
                            aria-label={`下移规则 ${ruleId}`}
                            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <ChevronDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeAt(i)}
                            disabled={!draftEditable}
                            aria-label={`移除规则 ${ruleId}`}
                            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        {expanded ? (
                          <div className="px-3 pb-3">
                            {isMissing ? null : contentState?.state === "loading" ? (
                              <p className="p-4 text-xs text-slate-500">
                                规则内容加载中...
                              </p>
                            ) : contentState?.state === "err" ? (
                              <p className="p-4 text-xs text-slate-600" role="alert">
                                规则内容加载失败：{contentState.error}
                              </p>
                            ) : contentState?.state === "ok" && contentState.content ? (
                              <div className="overflow-hidden rounded-xl border border-slate-200">
                                <RuleExpandedContent content={contentState.content} />
                                <div className="border-t border-slate-100 bg-white px-4 py-2">
                                  <Link
                                    href={`/admin/rules/${ruleId}?jurisdiction_code=${member?.jurisdictionCode ?? ""}&version=${member?.version ?? 1}`}
                                    className="text-xs text-primary underline underline-offset-2"
                                  >
                                    查看完整规则详情（只读）
                                  </Link>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {orderRules.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-500">
                      该规则集暂无成员，请使用下方选择器添加规则
                    </p>
                  ) : null}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="mb-2 text-sm font-medium text-slate-900">
                    添加规则（支持中文名称与编号搜索，最终保存稳定编号）
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      value={candidateQuery}
                      onChange={(e) => setCandidateQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && searchCandidates()}
                      placeholder="输入规则中文名称或编号..."
                      aria-label="规则搜索关键词"
                      className="max-w-xs"
                      disabled={!draftEditable}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={searchCandidates}
                      disabled={!draftEditable || candidateLoading}
                      className="cursor-pointer"
                    >
                      <Search size={13} className="mr-1" />
                      搜索
                    </Button>
                  </div>
                  {candidateError ? (
                    <p className="mt-2 text-xs text-slate-600" role="alert">
                      候选规则无法加载：{candidateError}（可继续使用编号维护，保存仍按编号）
                    </p>
                  ) : null}
                  {candidateLoading ? (
                    <p className="mt-2 text-xs text-slate-500">候选规则加载中...</p>
                  ) : candidates ? (
                    candidates.length === 0 ? (
                      <p className="mt-2 text-xs text-slate-500">
                        未找到可添加的候选规则（继承链内已解析且未加入本规则集的规则）
                      </p>
                    ) : (
                      <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                        {candidates.map((candidate) => (
                          <li
                            key={candidate.ruleId}
                            className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5"
                          >
                            <span className="min-w-0 truncate text-sm text-slate-900">
                              {candidate.name}
                              <span className="ml-2 font-mono text-xs text-slate-500">
                                {candidate.ruleId} @ {candidate.jurisdictionCode} · v
                                {candidate.version}
                              </span>
                              <span className="ml-2 text-xs text-slate-500">
                                {formatAdminStatus(candidate.status)}
                              </span>
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => addCandidate(candidate)}
                              disabled={!draftEditable}
                              className="cursor-pointer"
                              aria-label={`添加规则 ${candidate.name}（${candidate.ruleId}）`}
                            >
                              <Plus size={13} className="mr-1" />
                              添加
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : null}
                </div>

                {Boolean(detail.rule_set.conflictResolution) && (
                  <div className="mt-4 border-t border-slate-200 pt-4">
                    <p className="mb-1 text-xs font-medium text-slate-500">
                      冲突解决策略
                    </p>
                    <pre className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                      {JSON.stringify(
                        detail.rule_set.conflictResolution as Record<string, unknown>,
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
