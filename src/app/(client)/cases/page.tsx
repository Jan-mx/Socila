import { planningReads } from "@/server/modules/planning/application";
import { decorateShowcaseCase } from "@/lib/showcase/case-nature";
import {
  SYNTHETIC_CASE_LABEL,
  SYNTHETIC_DISCLAIMER,
  capabilityFromLabels,
  capabilityLabel,
  hasReadableQa,
  isNeedsAgent,
  regionLabel,
  summarizePersona,
} from "@/lib/showcase/labels";
import { CaseGrid, type ShowcaseCaseView } from "./CaseGrid";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { MarketingFooter } from "@/components/layout/MarketingFooter";
import { PaperBackdrop } from "@/components/layout/PaperBackdrop";

export const metadata = {
  title: `${SYNTHETIC_CASE_LABEL} - 社保规划助手`,
  description: "查看由规则引擎确定性生成的合成政策案例，了解不同人物条件下的社保测算结论与政策依据。",
};

export const dynamic = "force-dynamic";

export default async function CasesPage() {
  const dbCases = await planningReads.listShowcaseCases();

  const cases: ShowcaseCaseView[] = dbCases.map((raw) => {
    const c = decorateShowcaseCase(raw as unknown as Record<string, unknown>);
    const capability = capabilityFromLabels(c.multiLabels);
    const readable = hasReadableQa(c.userMessage, c.aiResponse);
    return {
      id: String(c.id),
      title: String(c.title ?? ""),
      tags: (Array.isArray(c.tags) ? c.tags : []) as string[],
      userMessage: readable ? String(c.userMessage) : "",
      aiResponse: readable ? String(c.aiResponse) : "",
      readable,
      category: typeof c.category === "string" ? c.category : undefined,
      regionLabel: regionLabel(c.jurisdictionCode),
      capabilityLabel: capability ? capabilityLabel(capability) : typeof c.category === "string" ? c.category : "—",
      personaSummary: summarizePersona(c.inputData),
      asOfDate: c.asOfDate instanceof Date ? c.asOfDate.toISOString().slice(0, 10) : typeof c.asOfDate === "string" ? c.asOfDate : null,
      needsAgent: isNeedsAgent(c.assertions, c.expectedData),
      caseNature: c.caseNature,
      policySources: c.policySources,
    };
  });

  const uniqueCategories = new Set(
    cases
      .map((item) => item.capabilityLabel)
      .filter((label): label is string => Boolean(label) && label !== "—"),
  );
  const uniqueRegions = new Set(cases.map((item) => item.regionLabel));
  const readableCount = cases.filter((c) => c.readable).length;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <PaperBackdrop />
      <MarketingNav active="cases" />

      <section className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-10 pt-10 sm:pt-14 lg:px-10">
        <div className="relative overflow-hidden rounded-[2rem] border border-primary/25 bg-card/90 px-6 py-8 shadow-lg backdrop-blur-md sm:px-10 sm:py-10">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-20 -left-20 h-72 w-72 rounded-full bg-cta/15 blur-3xl"
          />

          <div className="relative text-center">
            <p className="text-xs uppercase tracking-[0.22em] text-primary">
              规则引擎确定性生成 · 无真实个人数据
            </p>
            <h1 className="mt-4 font-display text-4xl font-semibold text-foreground sm:text-5xl">
              {SYNTHETIC_CASE_LABEL}
            </h1>
            <p className="mx-auto mt-5 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              {cases.length > 0
                ? `已收录 ${cases.length} 个合成政策案例，覆盖退休年龄、养老缴费缺口、医保年限与等待期、失业保险金、灵活就业缴费与就业补贴等典型场景。每条案例的人物均为合成画像，数值与资格结论全部来自规则引擎在指定计算日期的测算，并附官方政策依据。每页展示 10 条，点击卡片查看完整问答。`
                : "案例正在生成中，请稍后刷新页面。"}
            </p>
            <p className="mx-auto mt-3 max-w-3xl text-xs leading-6 text-muted-foreground">
              {SYNTHETIC_DISCLAIMER}；办理以经办机构核定为准。
            </p>
          </div>

          <div className="relative mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <div className="rounded-2xl border border-border/80 bg-background-elevated/75 px-4 py-3 backdrop-blur-sm">
              <p className="text-xs text-muted-foreground">案例总数</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{cases.length}</p>
            </div>
            <div className="rounded-2xl border border-border/80 bg-background-elevated/75 px-4 py-3 backdrop-blur-sm">
              <p className="text-xs text-muted-foreground">覆盖地区</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{uniqueRegions.size}</p>
            </div>
            <div className="rounded-2xl border border-border/80 bg-background-elevated/75 px-4 py-3 backdrop-blur-sm">
              <p className="text-xs text-muted-foreground">能力类别</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{uniqueCategories.size}</p>
            </div>
            <div className="rounded-2xl border border-border/80 bg-background-elevated/75 px-4 py-3 backdrop-blur-sm">
              <p className="text-xs text-muted-foreground">可读问答</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{readableCount}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-24 lg:px-10">
        <div className="rounded-[2rem] border border-border/80 bg-card/90 p-4 shadow-md backdrop-blur-sm sm:p-6 lg:p-8">
          <CaseGrid cases={cases} />
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
