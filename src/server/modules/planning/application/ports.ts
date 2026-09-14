/**
 * planning 模块只读端口（CORE-FR-004）。
 * 覆盖 queries.ts 中归属 planning 域的只读调用（plans/cases/showcase_cases）。
 */
import type { cases, plans, showcaseCases } from "@/lib/db/schema";

export type PlanRow = typeof plans.$inferSelect;
export type CaseRow = typeof cases.$inferSelect;
export type ShowcaseCaseRow = typeof showcaseCases.$inferSelect;

export interface PlanningReadRepository {
  getPlan(planId: string): Promise<PlanRow | null>;
  listPlans(limit?: number): Promise<PlanRow[]>;
  listCases(filters?: { isRegression?: boolean }): Promise<CaseRow[]>;
  /** 管理后台案例搜索：关键词（uid/正文/创建者）+ 主题 ilike + 分页。 */
  searchCases(query: {
    q: string;
    topic: string;
    page: number;
    pageSize: number;
  }): Promise<{ rows: CaseRow[]; total: number }>;
  listShowcaseCases(): Promise<ShowcaseCaseRow[]>;
  countShowcaseCases(): Promise<number>;
}
