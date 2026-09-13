"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Files, MessageSquareQuote, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MessageBubble } from "@/components/chat/MessageBubble";
import type { CaseNature, PolicySource } from "@/lib/showcase/case-nature";
import { PENDING_V2_DOC_LABEL, SYNTHETIC_CASE_LABEL, SYNTHETIC_DISCLAIMER } from "@/lib/showcase/labels";
import { cn } from "@/lib/utils/cn";

const PAGE_SIZE = 10;
type PaginationToken = number | "ellipsis";

/** 公开案例视图模型（服务端由数据行派生；页面层不推断、不虚构任何正文）。 */
export interface ShowcaseCaseView {
  id: string;
  title: string;
  tags: string[];
  /** 可读问答；不可读（V1占位/空）时为空串并由 readable=false 标记。 */
  userMessage: string;
  aiResponse: string;
  readable: boolean;
  category?: string;
  regionLabel: string;
  capabilityLabel: string;
  personaSummary: string;
  asOfDate: string | null;
  needsAgent: boolean;
  caseNature: CaseNature;
  policySources: PolicySource[];
}

function buildPaginationTokens(totalPages: number, currentPage: number): PaginationToken[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const anchors = new Set<number>([
    1,
    totalPages,
    currentPage - 1,
    currentPage,
    currentPage + 1,
  ]);

  if (currentPage <= 3) {
    anchors.add(2);
    anchors.add(3);
    anchors.add(4);
  }

  if (currentPage >= totalPages - 2) {
    anchors.add(totalPages - 1);
    anchors.add(totalPages - 2);
    anchors.add(totalPages - 3);
  }

  const sortedPages = Array.from(anchors)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);

  const tokens: PaginationToken[] = [];
  let previous = 0;

  for (const page of sortedPages) {
    if (previous > 0 && page - previous > 1) {
      tokens.push("ellipsis");
    }
    tokens.push(page);
    previous = page;
  }

  return tokens;
}

function NatureBadge({ nature }: { nature: CaseNature }) {
  return (
    <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
      {nature === "synthetic" ? SYNTHETIC_CASE_LABEL : "人工维护案例"}
    </span>
  );
}

function CaseCard({
  caseData,
  onSelect,
  index,
}: {
  caseData: ShowcaseCaseView;
  onSelect: (c: ShowcaseCaseView) => void;
  index: number;
}) {
  const visibleTags = caseData.tags.filter((t) => !/^\d{6}$/.test(t) && !t.startsWith("capability:")).slice(0, 4);

  return (
    <button
      type="button"
      onClick={() => onSelect(caseData)}
      data-case-card
      className="group relative w-full cursor-pointer overflow-hidden rounded-3xl border border-border/80 bg-card px-5 py-5 text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-6 sm:py-6"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-primary/10 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
      />

      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center rounded-full border border-border bg-background-elevated px-3 py-1 text-xs text-muted-foreground">
            第 {index + 1} 条
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <span data-case-region className="inline-flex items-center rounded-full border border-border bg-background-elevated px-2.5 py-0.5 text-xs text-foreground">
              地区：{caseData.regionLabel}
            </span>
            <span data-case-capability className="inline-flex items-center rounded-full border border-border bg-background-elevated px-2.5 py-0.5 text-xs text-foreground">
              能力：{caseData.capabilityLabel}
            </span>
            <NatureBadge nature={caseData.caseNature} />
          </div>
        </div>

        <h3 className="mt-4 text-lg font-semibold leading-7 text-foreground">{caseData.title}</h3>

        <p className="mt-2 text-xs text-muted-foreground">
          人物条件：<span data-case-persona className="text-foreground">{caseData.personaSummary}</span>
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {visibleTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-full border border-border bg-background-elevated px-2.5 py-1 text-xs text-muted-foreground transition-colors group-hover:border-primary/25 group-hover:text-foreground"
            >
              {tag}
            </span>
          ))}
        </div>

        {caseData.readable ? (
          <p data-case-question className="mt-4 line-clamp-4 text-sm leading-7 text-muted-foreground">
            {caseData.userMessage}
          </p>
        ) : (
          <p data-case-pending className="mt-4 rounded-xl border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
            {PENDING_V2_DOC_LABEL}：该案例尚未写入可读问答文档，页面不展示占位内容。
          </p>
        )}

        <div className="mt-5 flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors group-hover:text-primary-hover">
            查看完整问答与政策依据
            <MessageSquareQuote className="h-4 w-4" />
          </span>
        </div>
      </div>
    </button>
  );
}

function PolicySourceList({ sources }: { sources: PolicySource[] }) {
  if (sources.length === 0) {
    return <p className="text-sm text-muted-foreground">该案例未附带结构化政策来源。</p>;
  }
  return (
    <ol className="space-y-3">
      {sources.map((p, i) => (
        <li key={`${p.documentId}-${i}`} className="rounded-xl border border-border/70 bg-background-elevated/60 px-3 py-2 text-sm">
          <p className="font-medium text-foreground">《{p.title}》</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            发布机关：{p.authority} · 条款定位：{p.locator.type} / {p.locator.reference}
          </p>
          <p className="mt-1 text-xs leading-6 text-muted-foreground">原文摘录：{p.excerpt}</p>
          <a
            href={p.officialUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block break-all text-xs text-primary underline-offset-2 hover:underline"
          >
            {p.officialUrl}
          </a>
        </li>
      ))}
    </ol>
  );
}

function CaseDetail({
  caseData,
  onClose,
}: {
  caseData: ShowcaseCaseView;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    dialogRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/30 p-3 sm:p-8"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`case-dialog-title-${caseData.id}`}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="relative my-4 w-full max-w-5xl overflow-hidden rounded-3xl border border-border bg-card shadow-lg"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-5 py-4 backdrop-blur-sm sm:px-6">
          <div className="mr-4 min-w-0 flex-1 pr-1">
            <h2
              id={`case-dialog-title-${caseData.id}`}
              className="truncate text-lg font-semibold text-foreground sm:text-xl"
            >
              {caseData.title}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              案例编号：{caseData.id} · 地区：{caseData.regionLabel} · 能力：{caseData.capabilityLabel} · 人物条件：{caseData.personaSummary}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <NatureBadge nature={caseData.caseNature} />
              {caseData.tags.filter((t) => !/^\d{6}$/.test(t)).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full border border-border bg-background-elevated px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border bg-background-elevated transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[72vh] space-y-5 overflow-y-auto bg-background-elevated/45 px-5 py-6 sm:px-6 sm:py-7">
          <div className="rounded-2xl border border-border/70 bg-card/80 p-4 sm:p-5">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">完整问答</p>
            {caseData.readable ? (
              <div className="space-y-6">
                <MessageBubble role="user" content={caseData.userMessage} />
                <MessageBubble role="assistant" content={caseData.aiResponse} />
              </div>
            ) : (
              <p data-case-pending className="rounded-xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                {PENDING_V2_DOC_LABEL}：该案例尚未写入可读问答文档，页面不展示占位或虚构内容。
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">计算日期</p>
              <p data-case-asof className="mt-1 text-sm text-foreground">
                {caseData.asOfDate ?? "—"}
                <span className="ml-2 text-xs text-muted-foreground">（政策参数按该日期生效版本执行）</span>
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">风险提示</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-foreground">
                <li>{SYNTHETIC_DISCLAIMER}；人物为合成画像，不含真实个人数据。</li>
                <li>
                  {caseData.needsAgent
                    ? "结论级别：需人工补充确认（needs_agent）——存在待补充字段，规则引擎不估算相关数值。"
                    : "结论级别：确定性结论——只在上述输入与计算日期有效政策参数下成立，条件变化需重新测算。"}
                </li>
                <li>办理以经办机构核定为准。</li>
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-card/80 p-4 sm:p-5">
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">政策依据</p>
            <PolicySourceList sources={caseData.policySources} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function CaseGrid({ cases }: { cases: ShowcaseCaseView[] }) {
  const [selected, setSelected] = useState<ShowcaseCaseView | null>(null);
  const listTopRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const totalPages = Math.max(1, Math.ceil(cases.length / PAGE_SIZE));
  const rawPage = Number.parseInt(searchParams.get("page") ?? "1", 10);
  const currentPage = Number.isFinite(rawPage)
    ? Math.min(Math.max(rawPage, 1), totalPages)
    : 1;

  const updatePageInUrl = useCallback(
    (targetPage: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (targetPage <= 1) {
        params.delete("page");
      } else {
        params.set("page", String(targetPage));
      }

      const nextQuery = params.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  const paginatedCases = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return cases.slice(start, start + PAGE_SIZE);
  }, [cases, currentPage]);
  const pageTokens = useMemo(
    () => buildPaginationTokens(totalPages, currentPage),
    [totalPages, currentPage],
  );

  useEffect(() => {
    if (rawPage !== currentPage) {
      updatePageInUrl(currentPage);
    }
  }, [currentPage, rawPage, updatePageInUrl]);

  const closeDetail = useCallback(() => setSelected(null), []);
  const handlePageChange = useCallback(
    (nextPage: number) => {
      if (nextPage < 1 || nextPage > totalPages || nextPage === currentPage) {
        return;
      }

      updatePageInUrl(nextPage);
      const shouldReduceMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      listTopRef.current?.scrollIntoView({
        behavior: shouldReduceMotion ? "auto" : "smooth",
        block: "start",
      });
    },
    [currentPage, totalPages, updatePageInUrl],
  );

  const rangeStart = cases.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, cases.length);

  return (
    <>
      <div
        ref={listTopRef}
        className="mb-5 flex flex-col gap-3 rounded-2xl border border-border/80 bg-background-elevated/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
      >
        <div className="flex items-center gap-2 text-sm text-foreground">
          <Files className="h-4 w-4 text-primary" />
          <span className="font-medium">
            当前显示第 {rangeStart}-{rangeEnd} 条，共 {cases.length} 条{SYNTHETIC_CASE_LABEL}
          </span>
        </div>
        <p className="text-xs text-muted-foreground sm:text-sm">
          每页 {PAGE_SIZE} 条 · 第 {currentPage} / {totalPages} 页
        </p>
      </div>

      {cases.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/80 px-6 py-12 text-center">
          <p className="text-base text-muted-foreground">暂无可展示的案例</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {paginatedCases.map((item, index) => (
              <CaseCard
                key={item.id}
                caseData={item}
                onSelect={setSelected}
                index={(currentPage - 1) * PAGE_SIZE + index}
              />
            ))}
          </div>

          <nav
            className="mt-8 flex flex-wrap items-center justify-center gap-2"
            aria-label="案例分页导航"
          >
            <button
              type="button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="inline-flex h-10 items-center gap-1 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/35 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              上一页
            </button>

            {pageTokens.map((token, index) =>
              token === "ellipsis" ? (
                <span
                  key={`ellipsis-${index}`}
                  className="inline-flex h-10 min-w-10 items-center justify-center px-1 text-sm text-muted-foreground"
                >
                  ...
                </span>
              ) : (
                <button
                  key={`page-${token}`}
                  type="button"
                  aria-current={token === currentPage ? "page" : undefined}
                  onClick={() => handlePageChange(token)}
                  className={cn(
                    "inline-flex h-10 min-w-10 items-center justify-center rounded-xl border px-3 text-sm font-medium transition-colors",
                    token === currentPage
                      ? "border-primary/35 bg-primary text-primary-foreground shadow-sm"
                      : "border-border bg-card text-foreground hover:border-primary/35 hover:text-primary",
                  )}
                >
                  {token}
                </button>
              ),
            )}

            <button
              type="button"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="inline-flex h-10 items-center gap-1 rounded-xl border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/35 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              下一页
              <ChevronRight className="h-4 w-4" />
            </button>
          </nav>
        </>
      )}

      {selected && <CaseDetail caseData={selected} onClose={closeDetail} />}
    </>
  );
}
