"use client";

/**
 * 任务3（JRP-FR-010/021、JRP-AC-010）：直接规划页面 /plan/new。
 *
 * 与聊天使用同一地区确认契约（JRP-FR-010）：
 * - 会话先经 POST /api/conversations 认证预创建（JRP-FR-021/AC-001）；
 * - 地区确认复用 JurisdictionSelector（同一 POST /:id/jurisdiction 接口与
 *   选择器逻辑，JRP-AC-010 双入口同一契约）；
 * - 提交 /api/plan/compute（与 AI computePlan 同一服务端入口与稳定错误）。
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { JurisdictionSelector } from "@/components/chat/JurisdictionSelector";
import { readJurisdictionFromProfile } from "@/components/chat/jurisdiction-selector-logic";

interface ComputeResult {
  plan_id?: string | null;
  needs_agent?: boolean;
  warnings?: Array<{ warning_id?: string; text?: string }>;
  questions?: Array<{ question_id?: string; text?: string }>;
  plan?: Record<string, unknown>;
  calc?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

const EMPTY_FORM = {
  birthYear: "",
  gender: "",
  pensionMonths: "",
  medicalMonths: "",
  unemploymentYears: "",
  claimCityCode: "",
};

export default function PlanNewPage() {
  const router = useRouter();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown>>({});
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ComputeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  // JRP-FR-021/AC-001：先经认证 API 预创建会话，再允许地区确认。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error(`create-failed:${res.status}`);
        const data = (await res.json()) as { conversation: { id: string } };
        if (!cancelled) setConversationId(data.conversation.id);
      } catch {
        if (!cancelled) setInitError("会话初始化失败，请稍后重试");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleJurisdictionConfirmed = useCallback(
    (jurisdiction: { code: string; name: string }) => {
      setProfile((prev) => ({
        ...prev,
        jurisdiction: {
          code: jurisdiction.code,
          name: jurisdiction.name,
          confirmed: true,
          confirmedAt: new Date().toISOString(),
          source: "selector",
        },
      }));
    },
    [],
  );

  const confirmed = readJurisdictionFromProfile(profile);

  const setField = (key: keyof typeof EMPTY_FORM, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const canSubmit =
    conversationId !== null &&
    confirmed !== null &&
    form.birthYear !== "" &&
    form.gender !== "" &&
    !busy;

  const handleSubmit = async () => {
    if (!canSubmit || !conversationId) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const user: Record<string, unknown> = {
        basic: {
          birth_year: Number(form.birthYear),
          gender: form.gender,
        },
        social: {
          ...(form.pensionMonths
            ? { pension_contrib_months: Number(form.pensionMonths) }
            : {}),
          ...(form.medicalMonths
            ? { medical_contrib_months: Number(form.medicalMonths) }
            : {}),
          ...(form.unemploymentYears
            ? { unemployment_insurance_years: Number(form.unemploymentYears) }
            : {}),
        },
        // JRP-FR-022/023：公开画像只接受六位地级市代码，服务端规范化。
        ...(form.claimCityCode ? { profile: { claim_city_code: form.claimCityCode } } : {}),
      };
      const res = await fetch("/api/plan/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user,
          jurisdiction_code: confirmed.code,
        }),
      });
      const body = (await res.json()) as ComputeResult & { error?: string };
      if (!res.ok) {
        setError(body.error ?? "计算失败，请稍后重试");
        return;
      }
      setResult(body);
    } catch {
      setError("计算失败，请稍后重试");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">直接规划</h1>
        <button
          type="button"
          onClick={() => router.push("/chat")}
          className="cursor-pointer rounded-full border border-border px-4 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/35 hover:text-primary"
        >
          返回对话
        </button>
      </div>

      {initError && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
          {initError}
        </p>
      )}

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          1. 选择规划地区
        </h2>
        {conversationId ? (
          <JurisdictionSelector
            conversationId={conversationId}
            profile={profile}
            onConfirmed={handleJurisdictionConfirmed}
          />
        ) : (
          <p className="text-sm text-muted-foreground">正在初始化会话…</p>
        )}
      </section>

      <section className="mt-5 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-sm font-medium text-muted-foreground">
          2. 填写基本信息
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            出生年份
            <input
              type="number"
              min={1940}
              max={2010}
              value={form.birthYear}
              onChange={(e) => setField("birthYear", e.target.value)}
              placeholder="如 1973"
              className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            性别
            <select
              value={form.gender}
              onChange={(e) => setField("gender", e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
            >
              <option value="">请选择</option>
              <option value="male">男</option>
              <option value="female">女</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            养老已缴月数（可选）
            <input
              type="number"
              min={0}
              max={600}
              value={form.pensionMonths}
              onChange={(e) => setField("pensionMonths", e.target.value)}
              placeholder="如 180"
              className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            医保已缴月数（可选）
            <input
              type="number"
              min={0}
              max={600}
              value={form.medicalMonths}
              onChange={(e) => setField("medicalMonths", e.target.value)}
              placeholder="如 120"
              className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            失业险已缴年数（可选）
            <input
              type="number"
              min={0}
              max={50}
              value={form.unemploymentYears}
              onChange={(e) => setField("unemploymentYears", e.target.value)}
              placeholder="如 3"
              className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            广东领取地市代码（可选，如 440100=广州）
            <input
              type="text"
              maxLength={6}
              value={form.claimCityCode}
              onChange={(e) => setField("claimCityCode", e.target.value)}
              placeholder="六位行政代码"
              className="rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
            />
          </label>
        </div>
      </section>

      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => void handleSubmit()}
        className={`mt-5 w-full cursor-pointer rounded-xl px-6 py-3 text-sm font-medium transition-colors ${
          canSubmit
            ? "bg-primary text-white hover:bg-primary-hover"
            : "cursor-not-allowed bg-muted text-muted-foreground"
        }`}
      >
        {busy ? "计算中…" : "开始规划"}
      </button>

      {error && (
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {result && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            规划结果
          </h2>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-4 text-xs leading-6 text-foreground">
            {JSON.stringify(result, null, 2)}
          </pre>
          <p className="mt-3 text-xs text-muted-foreground">
            结果可复核：meta 含 jurisdiction / snapshot_id / as_of_date。
          </p>
        </section>
      )}
    </div>
  );
}