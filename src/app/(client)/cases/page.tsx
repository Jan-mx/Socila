import { planningReads } from "@/server/modules/planning/application";
import { CaseGrid } from "./CaseGrid";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { MarketingFooter } from "@/components/layout/MarketingFooter";
import { PaperBackdrop } from "@/components/layout/PaperBackdrop";

export const metadata = {
  title: "真实案例 - 社保规划助手",
  description: "查看真实社保规划案例，了解不同情况下的退休规划方案。",
};

export const dynamic = "force-dynamic";

export default async function CasesPage() {
  const dbCases = await planningReads.listShowcaseCases();

  const cases = dbCases.map((c) => ({
    id: String(c.id),
    title: c.title,
    tags: (c.tags ?? []) as string[],
    userMessage: c.userMessage,
    aiResponse: c.aiResponse,
    category: c.category ?? undefined,
  }));

  const uniqueCategories = new Set(
    cases
      .map((item) => item.category)
      .filter((category): category is string => Boolean(category)),
  );
  const uniqueTags = new Set(cases.flatMap((item) => item.tags));

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
              真实咨询记录
            </p>
            <h1 className="mt-4 font-display text-4xl font-semibold text-foreground sm:text-5xl">
              真实社保规划案例
            </h1>
            <p className="mx-auto mt-5 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              {cases.length > 0
                ? `已收录 ${cases.length} 个真实咨询样本，覆盖缴费缺口、补贴申请、退休年龄判定、医保断缴等典型场景。每页展示 10 条，点击卡片可查看完整问答。`
                : "案例正在生成中，请稍后刷新页面。"}
            </p>
          </div>

          <div className="relative mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            <div className="rounded-2xl border border-border/80 bg-background-elevated/75 px-4 py-3 backdrop-blur-sm">
              <p className="text-xs text-muted-foreground">案例总数</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{cases.length}</p>
            </div>
            <div className="rounded-2xl border border-border/80 bg-background-elevated/75 px-4 py-3 backdrop-blur-sm">
              <p className="text-xs text-muted-foreground">分类数</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {uniqueCategories.size}
              </p>
            </div>
            <div className="rounded-2xl border border-border/80 bg-background-elevated/75 px-4 py-3 backdrop-blur-sm">
              <p className="text-xs text-muted-foreground">标签数</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{uniqueTags.size}</p>
            </div>
            <div className="rounded-2xl border border-border/80 bg-background-elevated/75 px-4 py-3 backdrop-blur-sm">
              <p className="text-xs text-muted-foreground">分页规格</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">10 / 页</p>
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
