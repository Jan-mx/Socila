import Link from "next/link";
import {
  ArrowRight,
  Bot,
  FileCheck,
  Coins,
  ShieldCheck,
  Layers3,
} from "lucide-react";
import { MarketingNav } from "@/components/layout/MarketingNav";
import { MarketingFooter } from "@/components/layout/MarketingFooter";
import { PaperBackdrop } from "@/components/layout/PaperBackdrop";

const featureCards = [
  {
    title: "规则引擎 + 智能解读",
    desc: "结合政策规则与对话式分析，结论可追踪、可解释，不做黑箱回答。",
    icon: Bot,
  },
  {
    title: "完整证据链",
    desc: "每个结论都附带计算路径与关键依据，便于复核和后续办理。",
    icon: FileCheck,
  },
  {
    title: "补贴机会识别",
    desc: "自动识别 4050、就业补贴等窗口，给出行动顺序与时间节点。",
    icon: Coins,
  },
  {
    title: "风险预警",
    desc: "对断缴风险、资格缺口、时间窗口进行提醒，减少临界点误判。",
    icon: ShieldCheck,
  },
];

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <PaperBackdrop />
      <MarketingNav active="home" />

      <section className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-16 px-6 pb-20 pt-12 sm:pt-16 lg:grid lg:grid-cols-[1.15fr_0.85fr] lg:items-end lg:gap-20 lg:px-10 lg:pt-24">
        <div className="space-y-10">
          <p className="anim-fade-up text-sm font-medium uppercase tracking-[0.2em] text-primary/90">
            社保规划助手 · 2026
          </p>

          <h1 className="anim-fade-up anim-d1 font-display text-4xl font-bold leading-[1.12] text-foreground sm:text-6xl lg:text-7xl">
            把复杂社保路径
            <br />
            变成清晰行动清单
          </h1>

          <p className="anim-fade-up anim-d2 max-w-2xl text-lg leading-9 text-muted-foreground sm:text-xl">
            输入基础信息后，系统会生成退休节点、缺口测算、补贴机会与执行顺序。
            你看到的不只是答案，而是可复核的策略过程。
          </p>

          <div className="anim-fade-up anim-d3 flex flex-wrap items-center gap-4">
            <Link
              href="/chat"
              className="group inline-flex cursor-pointer items-center gap-3 rounded-xl bg-primary px-7 py-4 text-base font-semibold text-white shadow-md transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-8 sm:text-[1.06rem]"
            >
              立即开始对话
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>

            <Link
              href="/cases"
              className="inline-flex cursor-pointer items-center rounded-xl border border-border bg-background-elevated px-7 py-4 text-base font-medium text-foreground transition-colors hover:border-primary/35 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:text-[1.05rem]"
            >
              浏览真实案例
            </Link>
          </div>

          <p className="text-sm text-muted-foreground sm:text-base">
            无需注册 · 仅用于计算与策略建议 · 支持多轮补充信息
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
          <article className="rounded-2xl border border-border bg-card p-6 shadow-md">
            <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">交付结构</p>
            <p className="mt-3 text-3xl font-semibold text-foreground">结论 + 依据 + 动作</p>
            <p className="mt-3 text-base leading-8 text-muted-foreground">
              同时给出时间节点、缺口、补贴窗口和先后顺序，适合直接执行。
            </p>
          </article>

          <article className="rounded-2xl border border-border bg-card p-6 shadow-md">
            <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">策略能力</p>
            <div className="mt-3 space-y-3 text-base text-foreground">
              <p className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                多路径方案对比
              </p>
              <p className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                补贴资格匹配
              </p>
              <p className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                风险窗口预警
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-24 lg:px-10">
        <div className="mb-10 flex items-end justify-between gap-6">
          <div>
            <p className="text-sm uppercase tracking-[0.16em] text-primary">能力矩阵</p>
            <h2 className="mt-3 font-display text-4xl font-semibold text-foreground sm:text-5xl">
              专业工具感的决策界面
            </h2>
          </div>
          <span className="hidden rounded-xl border border-border bg-card px-4 py-2 text-sm text-muted-foreground sm:inline-flex">
            <Layers3 className="mr-1.5 h-3.5 w-3.5" />
            统一客户端设计
          </span>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {featureCards.map((item) => {
            const Icon = item.icon;
            return (
              <article
                key={item.title}
                className="group rounded-2xl border border-border bg-card p-7 shadow-md transition-colors hover:border-primary/35"
              >
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background-elevated text-primary transition-colors group-hover:border-primary/35 group-hover:text-primary-hover">
                  <Icon className="h-5.5 w-5.5" />
                </div>
                <h3 className="mt-5 text-xl font-semibold text-foreground">{item.title}</h3>
                <p className="mt-3 text-base leading-8 text-muted-foreground">{item.desc}</p>
              </article>
            );
          })}
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}
