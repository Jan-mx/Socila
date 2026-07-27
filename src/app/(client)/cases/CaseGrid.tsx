"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Files, MessageSquareQuote, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { cn } from "@/lib/utils/cn";

const PAGE_SIZE = 10;
type PaginationToken = number | "ellipsis";

interface ShowcaseCase {
  id: string;
  title: string;
  tags: string[];
  userMessage: string;
  aiResponse: string;
  category?: string;
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

function CaseCard({
  caseData,
  onSelect,
  index,
}: {
  caseData: ShowcaseCase;
  onSelect: (c: ShowcaseCase) => void;
  index: number;
}) {
  const visibleTags = caseData.tags.slice(0, 4);
  const hiddenTagCount = Math.max(caseData.tags.length - visibleTags.length, 0);

  return (
    <button
      type="button"
      onClick={() => onSelect(caseData)}
      className="group relative w-full cursor-pointer overflow-hidden rounded-3xl border border-border/80 bg-card px-5 py-5 text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-6 sm:py-6"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-primary/10 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
      />

      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            第 {index + 1} 条
          </span>
          {caseData.category ? (
            <span className="inline-flex items-center rounded-full border border-border bg-background-elevated px-3 py-1 text-xs text-muted-foreground">
              {caseData.category}
            </span>
          ) : null}
        </div>

        <h3 className="mt-4 text-lg font-semibold leading-7 text-foreground">{caseData.title}</h3>

        <div className="mt-3 flex flex-wrap gap-2">
          {visibleTags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-full border border-border bg-background-elevated px-2.5 py-1 text-xs text-muted-foreground transition-colors group-hover:border-primary/25 group-hover:text-foreground"
            >
              {tag}
            </span>
          ))}
          {hiddenTagCount > 0 ? (
            <span className="inline-flex items-center rounded-full border border-border bg-background-elevated px-2.5 py-1 text-xs text-muted-foreground">
              +{hiddenTagCount}
            </span>
          ) : null}
        </div>

        <p className="mt-4 line-clamp-4 text-sm leading-7 text-muted-foreground">{caseData.userMessage}</p>

        <div className="mt-5 flex items-center justify-between">
          <span
            className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors group-hover:text-primary-hover"
          >
            查看完整问答
            <MessageSquareQuote className="h-4 w-4" />
          </span>
        </div>
      </div>
    </button>
  );
}

function CaseDetail({
  caseData,
  onClose,
}: {
  caseData: ShowcaseCase;
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
            <p className="mt-1 text-xs text-muted-foreground">案例编号：{caseData.id}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {caseData.tags.map((tag) => (
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

        <div className="max-h-[72vh] overflow-y-auto bg-background-elevated/45 px-5 py-6 sm:px-6 sm:py-7">
          <div className="space-y-6 rounded-2xl border border-border/70 bg-card/80 p-4 sm:p-5">
            <MessageBubble role="user" content={caseData.userMessage} />
            <MessageBubble role="assistant" content={caseData.aiResponse} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function CaseGrid({ cases }: { cases: ShowcaseCase[] }) {
  const [selected, setSelected] = useState<ShowcaseCase | null>(null);
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
            当前显示第 {rangeStart}-{rangeEnd} 条，共 {cases.length} 条记录
          </span>
        </div>
        <p className="text-xs text-muted-foreground sm:text-sm">
          每页 {PAGE_SIZE} 条 · 第 {currentPage} / {totalPages} 页
        </p>
      </div>

      {cases.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card/80 px-6 py-12 text-center">
          <p className="text-base text-muted-foreground">暂无可展示的案例记录</p>
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
