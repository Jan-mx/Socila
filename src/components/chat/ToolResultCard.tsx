"use client";

import { cn } from "@/lib/utils/cn";

interface ScenarioPhase {
  from_age: number;
  to_age: number;
  action: string;
  monthly_amount?: number;
  notes?: string;
}

interface Scenario {
  scenario_id: string;
  label: string;
  retire_age: number;
  retire_age_months: number;
  retire_date: string | null;
  total_contrib_cost: number | null;
  subsidy_savings: number | null;
  pension_gap_months: number | null;
  phases: ScenarioPhase[];
}

interface SubsidyRecommendation {
  subsidy_name: string;
  eligible: boolean | null;
  prerequisites: string[];
  timing: string;
  estimated_amount: number | null;
  action_steps: string[];
}

interface AgentQuestionOption {
  value: string;
  label: string;
}

interface AgentQuestion {
  question_id: string;
  field: string;
  label: string;
  hint?: string;
  options?: AgentQuestionOption[];
}

interface WarningItem {
  warning_id?: string;
  text: string;
}

interface CaveatItem {
  caveat_id?: string;
  text: string;
  confidence?: "high" | "medium" | "low" | string;
  source?: string;
}

interface ComputePlanResult {
  success?: boolean;
  plan_id?: string;
  needs_agent?: boolean;
  questions?: AgentQuestion[];
  warnings?: string[];
  caveats?: CaveatItem[];
  plan?: {
    conclusion_level?: string;
    primary_strategy?: string;
    summary?: string;
  };
  calc?: {
    pension_months_needed?: number;
    pension_eligible_date?: string;
    pension?: {
      gap_months?: number;
    };
    medical_gap_end_date?: string;
    subsidy_window_end?: string;
    subsidy_total_amount?: number;
    unemployment_benefit_months?: number;
    mi?: {
      lifetime_gap_months?: number;
    };
    unemployment?: {
      eligible?: boolean;
      duration_months?: number;
    };
    retirement?: {
      legal_retire_date?: string;
      legal_retire_age_years?: number;
      legal_retire_age_months?: number;
    };
    scenarios?: Scenario[];
    subsidy_recommendations?: SubsidyRecommendation[];
    warnings?: WarningItem[];
    caveats?: CaveatItem[];
    [key: string]: unknown;
  };
  meta?: Record<string, unknown>;
}

interface ValidateFieldResult {
  valid?: boolean;
  error?: string;
  field?: string;
}

interface ToolResultCardProps {
  toolName: string;
  result: unknown;
}

const levelColors: Record<string, string> = {
  green: "border-emerald-200 bg-emerald-50/90 text-emerald-800",
  yellow: "border-amber-200 bg-amber-50/90 text-amber-800",
  red: "border-red-200 bg-red-50/90 text-red-800",
  blue: "border-border bg-primary-light text-accent-foreground",
};

const levelLabels: Record<string, string> = {
  green: "方案优秀",
  yellow: "需要关注",
  red: "需要补缴",
  blue: "计算完成",
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toNumber(value: unknown): number | null {
  return isFiniteNumber(value) ? value : null;
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "暂无数据";
  return `¥${value.toLocaleString("zh-CN")}`;
}

function formatRetireAge(years?: number | null, months?: number | null): string {
  if (!isFiniteNumber(years)) return "暂无数据";
  if (isFiniteNumber(months) && months > 0) return `${years}岁${months}个月`;
  return `${years}岁`;
}

function formatMonths(value: number | null | undefined): string {
  if (value == null) return "暂无数据";
  if (value <= 0) return "已满足";
  return `${value}个月`;
}

function pickRecommendedScenario(scenarios: Scenario[]): Scenario | null {
  if (scenarios.length === 0) return null;
  const ranked = [...scenarios].sort((a, b) => {
    const gapA = a.pension_gap_months ?? Number.POSITIVE_INFINITY;
    const gapB = b.pension_gap_months ?? Number.POSITIVE_INFINITY;
    if (gapA !== gapB) return gapA - gapB;

    const costA = a.total_contrib_cost ?? Number.POSITIVE_INFINITY;
    const costB = b.total_contrib_cost ?? Number.POSITIVE_INFINITY;
    if (costA !== costB) return costA - costB;

    const ageA = a.retire_age * 12 + a.retire_age_months;
    const ageB = b.retire_age * 12 + b.retire_age_months;
    return ageA - ageB;
  });
  return ranked[0] ?? null;
}

function buildNextActions(
  result: ComputePlanResult,
  recommended: Scenario | null,
): string[] {
  const actions: string[] = [];
  const pensionGap =
    recommended?.pension_gap_months ?? toNumber(result.calc?.pension?.gap_months);
  const miGap = toNumber(result.calc?.mi?.lifetime_gap_months);
  const unemploymentEligible = result.calc?.unemployment?.eligible === true;
  const unemploymentMonths = toNumber(result.calc?.unemployment?.duration_months);
  const subsidyRecs = result.calc?.subsidy_recommendations ?? [];
  const eligibleRecs = subsidyRecs.filter((r) => r.eligible === true);
  const pending4050 = subsidyRecs.find(
    (r) => r.subsidy_name.includes("4050") && r.eligible !== true,
  );

  if (pensionGap != null && pensionGap > 0) {
    actions.push(`先补足养老缺口 ${pensionGap} 个月，避免影响退休办理。`);
  }

  if (unemploymentEligible && unemploymentMonths != null && unemploymentMonths > 0) {
    actions.push(`30天内办理失业登记，失业金预计可领 ${unemploymentMonths} 个月。`);
  }

  for (const rec of eligibleRecs.slice(0, 2)) {
    const step = rec.action_steps[0];
    actions.push(step ? `优先申请${rec.subsidy_name}：${step}` : `优先申请${rec.subsidy_name}。`);
  }

  if (pending4050 && eligibleRecs.length === 0) {
    actions.push("先完成就业困难认定，再走 4050 补贴路径。");
  }

  if (miGap != null && miGap > 0) {
    actions.push(`核对医保终身待遇缺口（当前约 ${miGap} 个月），提前安排补缴节奏。`);
  }

  if (result.needs_agent && (result.questions?.length ?? 0) > 0) {
    const labels = (result.questions ?? [])
      .map((q) => q.label || q.field)
      .filter(Boolean)
      .slice(0, 2);
    if (labels.length > 0) {
      actions.push(`先补充关键信息：${labels.join("；")}。`);
    }
  }

  if (actions.length === 0) {
    actions.push("按当前推荐路径持续缴费，并每年复核一次基数和补贴资格。");
  }

  return Array.from(new Set(actions)).slice(0, 4);
}

function collectWarnings(result: ComputePlanResult): string[] {
  const fromCalc = (result.calc?.warnings ?? [])
    .map((w) => w?.text)
    .filter((w): w is string => typeof w === "string" && w.trim().length > 0);
  const fromTool = (result.warnings ?? []).filter((w) => w.trim().length > 0);
  return Array.from(new Set([...fromCalc, ...fromTool])).slice(0, 4);
}

function collectCaveats(result: ComputePlanResult): CaveatItem[] {
  const merged = [...(result.caveats ?? []), ...(result.calc?.caveats ?? [])];
  const filtered = merged.filter(
    (item): item is CaveatItem =>
      typeof item?.text === "string" && item.text.trim().length > 0,
  );
  const seen = new Set<string>();
  const deduped: CaveatItem[] = [];

  for (const item of filtered) {
    const key = item.caveat_id ?? item.text;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped.slice(0, 4);
}

function normalizeRetireDate(
  result: ComputePlanResult,
  recommended: Scenario | null,
): string | null {
  return (
    result.calc?.retirement?.legal_retire_date ??
    recommended?.retire_date ??
    null
  );
}

function TopMetrics({
  result,
  recommended,
}: {
  result: ComputePlanResult;
  recommended: Scenario | null;
}) {
  const retireDate = normalizeRetireDate(result, recommended);
  const retireAge = formatRetireAge(
    recommended?.retire_age ?? result.calc?.retirement?.legal_retire_age_years,
    recommended?.retire_age_months ?? result.calc?.retirement?.legal_retire_age_months,
  );
  const pensionGap =
    recommended?.pension_gap_months ?? toNumber(result.calc?.pension?.gap_months);
  const miGap = toNumber(result.calc?.mi?.lifetime_gap_months);
  const uiMonths =
    result.calc?.unemployment?.eligible === true
      ? toNumber(result.calc?.unemployment?.duration_months)
      : null;

  const items = [
    { label: "退休节点", value: retireDate ?? "暂无数据", sub: retireAge },
    { label: "养老缺口", value: formatMonths(pensionGap), sub: "按月计算" },
    { label: "医保终身缺口", value: formatMonths(miGap), sub: "现行政策标准" },
    { label: "失业金窗口", value: formatMonths(uiMonths), sub: "可领月数" },
  ];

  return (
    <div className="mt-3 grid grid-cols-2 gap-2.5">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-border bg-background-elevated px-3 py-2.5 shadow-sm"
        >
          <p className="text-[11px] text-muted-foreground">{item.label}</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{item.value}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{item.sub}</p>
        </div>
      ))}
    </div>
  );
}

function QualificationCard({
  result,
  recommended,
}: {
  result: ComputePlanResult;
  recommended: Scenario | null;
}) {
  const pensionGap =
    recommended?.pension_gap_months ??
    toNumber(result.calc?.pension_months_needed) ??
    toNumber(result.calc?.pension?.gap_months);
  const miGap = toNumber(result.calc?.mi?.lifetime_gap_months);
  const uiMonths =
    toNumber(result.calc?.unemployment_benefit_months) ??
    (result.calc?.unemployment?.eligible === true
      ? toNumber(result.calc?.unemployment?.duration_months)
      : null);
  const subsidyTotal = toNumber(result.calc?.subsidy_total_amount);

  const hasData =
    pensionGap != null ||
    miGap != null ||
    uiMonths != null ||
    subsidyTotal != null;
  if (!hasData) return null;

  return (
    <div className="mt-3 rounded-xl border border-border/75 bg-white/80 px-3 py-2.5">
      <p className="text-xs font-medium text-muted-foreground">资格与缺口</p>
      <dl className="mt-1.5 space-y-1.5 text-xs text-foreground">
        {pensionGap != null && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">养老保险缺口</dt>
            <dd>{formatMonths(pensionGap)}</dd>
          </div>
        )}
        {miGap != null && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">医保终身待遇缺口</dt>
            <dd>{formatMonths(miGap)}</dd>
          </div>
        )}
        {uiMonths != null && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">可领失业金</dt>
            <dd>{uiMonths > 0 ? `${uiMonths}个月` : "暂无"}</dd>
          </div>
        )}
        {subsidyTotal != null && subsidyTotal > 0 && (
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">预计可享补贴</dt>
            <dd className="text-emerald-700 font-medium">
              ¥{subsidyTotal.toLocaleString("zh-CN")}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function MilestonesCard({
  result,
  recommended,
}: {
  result: ComputePlanResult;
  recommended: Scenario | null;
}) {
  const items = [
    {
      date: normalizeRetireDate(result, recommended),
      label: "法定退休日期",
    },
    { date: result.calc?.pension_eligible_date, label: "养老金领取资格日" },
    { date: result.calc?.medical_gap_end_date, label: "医保断缴窗口截止" },
    { date: result.calc?.subsidy_window_end, label: "补贴申请窗口截止" },
  ].filter(
    (item): item is { date: string; label: string } =>
      typeof item.date === "string" && item.date.length > 0,
  );

  if (items.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-border/75 bg-white/80 px-3 py-2.5">
      <p className="text-xs font-medium text-muted-foreground">关键时间节点</p>
      <ul className="mt-1.5 space-y-1 text-xs text-foreground">
        {items.map((item) => (
          <li key={`${item.label}-${item.date}`} className="flex gap-2">
            <span className="text-muted-foreground">{item.date}</span>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScenarioCards({
  scenarios,
  recommendedId,
}: {
  scenarios: Scenario[];
  recommendedId?: string;
}) {
  if (scenarios.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">路径对比（按真实案例高频字段）</p>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {scenarios.map((s) => {
          const recommended = s.scenario_id === recommendedId;
          return (
            <div
              key={s.scenario_id}
              className={cn(
                "rounded-md border p-3",
                recommended
                  ? "border-primary/40 bg-primary-light/50"
                  : "border-border/75 bg-white/80",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{s.label}</p>
                {recommended && (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-white">
                    推荐
                  </span>
                )}
              </div>
              <dl className="mt-2 space-y-1 text-xs">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">退休年龄</dt>
                  <dd className="text-foreground">{formatRetireAge(s.retire_age, s.retire_age_months)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">退休日期</dt>
                  <dd className="text-foreground">{s.retire_date ?? "暂无数据"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">养老缺口</dt>
                  <dd className="text-foreground">{formatMonths(s.pension_gap_months)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">预估成本</dt>
                  <dd className="text-foreground">{formatCurrency(s.total_contrib_cost)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">补贴节省</dt>
                  <dd className="text-emerald-700">{formatCurrency(s.subsidy_savings)}</dd>
                </div>
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecommendedTimeline({ scenario }: { scenario: Scenario }) {
  if (scenario.phases.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-border/75 bg-white/80 p-3">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{scenario.label}推荐时间线</p>
      <ol className="space-y-1.5 text-xs text-foreground">
        {scenario.phases.map((phase, idx) => (
          <li key={`${scenario.scenario_id}-${idx}`} className="flex gap-2">
              <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-border/70 bg-primary-light text-[10px] font-medium text-primary">
                {idx + 1}
              </span>
            <span>
              <span className="font-medium">
                {phase.from_age === phase.to_age
                  ? `${phase.from_age}岁`
                  : `${phase.from_age}岁 → ${phase.to_age}岁`}
              </span>
              ：{phase.action}
              {phase.monthly_amount != null && `（约 ${formatCurrency(phase.monthly_amount)}/月）`}
              {phase.notes ? `，${phase.notes}` : ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SubsidyRecommendationsCard({
  recommendations,
}: {
  recommendations: SubsidyRecommendation[];
}) {
  if (recommendations.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">补贴机会</p>
      <div className="space-y-2">
        {recommendations.map((rec) => (
          <div key={rec.subsidy_name} className="rounded-xl border border-border/75 bg-white/80 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">{rec.subsidy_name}</p>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-medium",
                  rec.eligible === true
                    ? "bg-emerald-100 text-emerald-700"
                    : rec.eligible === false
                      ? "bg-slate-100 text-slate-600"
                      : "bg-amber-100 text-amber-700",
                )}
              >
                {rec.eligible === true ? "可申请" : rec.eligible === false ? "暂不符合" : "待确认"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{rec.timing}</p>
            {rec.estimated_amount != null && rec.estimated_amount > 0 && (
              <p className="mt-1 text-xs text-foreground">预估金额：{formatCurrency(rec.estimated_amount)}/月</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MissingInfoCard({ questions }: { questions: AgentQuestion[] }) {
  if (questions.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2.5">
      <p className="text-xs font-medium text-amber-700">还需补充信息（可直接回复）</p>
      <ol className="mt-1.5 space-y-1 text-xs text-amber-800">
        {questions.slice(0, 3).map((q) => (
          <li key={q.question_id}>{q.label || q.field}</li>
        ))}
      </ol>
    </div>
  );
}

function RiskCard({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2.5">
      <p className="text-xs font-medium text-amber-700">风险与提醒</p>
      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-amber-800">
        {warnings.map((w, idx) => (
          <li key={`${w}-${idx}`}>{w}</li>
        ))}
      </ul>
    </div>
  );
}

function CaveatCard({ caveats }: { caveats: CaveatItem[] }) {
  if (caveats.length === 0) return null;

  const confidenceMap: Record<string, string> = {
    high: "确定",
    medium: "参考",
    low: "估算",
  };

  const confidenceColor: Record<string, string> = {
    high: "bg-emerald-100 text-emerald-700",
    medium: "bg-amber-100 text-amber-700",
    low: "bg-red-100 text-red-700",
  };

  return (
    <div className="mt-3 rounded-xl border border-border/75 bg-white/80 px-3 py-2.5">
      <p className="text-xs font-medium text-muted-foreground">注意事项</p>
      <ul className="mt-1.5 space-y-1.5 text-xs text-foreground">
        {caveats.map((item, idx) => {
          const confidence = item.confidence ?? "medium";
          return (
            <li
              key={`${item.caveat_id ?? item.text}-${idx}`}
              className="flex items-start gap-2"
            >
              <span
                className={cn(
                  "mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium",
                  confidenceColor[confidence] ?? confidenceColor.medium,
                )}
              >
                {confidenceMap[confidence] ?? "参考"}
              </span>
              <span>
                {item.text}
                {item.source ? (
                  <span className="ml-1 text-muted-foreground">
                    ({item.source})
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ComputePlanCard({ result }: { result: ComputePlanResult }) {
  const level = result.plan?.conclusion_level ?? "blue";
  const colorClass = levelColors[level] ?? levelColors.blue;
  const label = levelLabels[level] ?? "计算完成";
  const strategy = result.plan?.primary_strategy ?? result.plan?.summary;

  const scenarios = result.calc?.scenarios ?? [];
  const recommended = pickRecommendedScenario(scenarios);
  const subsidyRecs = result.calc?.subsidy_recommendations ?? [];
  const warnings = collectWarnings(result);
  const caveats = collectCaveats(result);
  const nextActions = buildNextActions(result, recommended);
  const questions = result.questions ?? [];

  if (!result.success) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        计算服务暂时不可用，请稍后重试。
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-md">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">推荐结果</span>
        <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", colorClass)}>
          {label}
        </span>
      </div>

      <p className="text-sm font-medium text-foreground">
        {strategy ?? "已为你生成可执行的社保规划路径。"}
      </p>

      <TopMetrics result={result} recommended={recommended} />
      <QualificationCard result={result} recommended={recommended} />
      <MilestonesCard result={result} recommended={recommended} />

      <div className="mt-3 rounded-xl border border-border/75 bg-white/80 px-3 py-2.5">
        <p className="text-xs font-medium text-muted-foreground">你现在要做（0-30天）</p>
        <ol className="mt-1.5 space-y-1 text-xs text-foreground">
          {nextActions.map((action, idx) => (
            <li key={`${action}-${idx}`}>{idx + 1}. {action}</li>
          ))}
        </ol>
      </div>

      <ScenarioCards scenarios={scenarios} recommendedId={recommended?.scenario_id} />
      {recommended && <RecommendedTimeline scenario={recommended} />}
      <SubsidyRecommendationsCard recommendations={subsidyRecs} />
      <MissingInfoCard questions={questions} />
      <RiskCard warnings={warnings} />
      <CaveatCard caveats={caveats} />
    </div>
  );
}

function ValidateFieldCard({ result }: { result: ValidateFieldResult }) {
  const isValid = result.valid !== false;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm",
        isValid
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-red-200 bg-red-50 text-red-700",
      )}
    >
      <span>{isValid ? "✓" : "✗"}</span>
      <span>
        {isValid
          ? `字段${result.field ? ` ${result.field}` : ""}验证通过`
          : (result.error ?? "字段验证失败")}
      </span>
    </div>
  );
}

export function ToolResultCard({ toolName, result }: ToolResultCardProps) {
  if (toolName === "computePlan") {
    return <ComputePlanCard result={result as ComputePlanResult} />;
  }

  if (toolName === "validateField") {
    return <ValidateFieldCard result={result as ValidateFieldResult} />;
  }

  return (
    <div className="rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground">
      <span className="font-medium">{toolName}</span>：已完成
    </div>
  );
}
