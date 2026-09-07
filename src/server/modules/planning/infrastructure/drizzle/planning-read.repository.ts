import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cases, plans, showcaseCases } from "@/lib/db/schema";
import type { PlanningReadRepository } from "../../application/ports";

/** planning 域只读仓储的 Drizzle 实现。 */
export class DrizzlePlanningReadRepository implements PlanningReadRepository {
  async getPlan(planId: string) {
    const rows = await db
      .select()
      .from(plans)
      .where(eq(plans.id, planId))
      .limit(1);

    return rows[0] ?? null;
  }

  async listPlans(limit = 50) {
    return db.select().from(plans).orderBy(desc(plans.createdAt)).limit(limit);
  }

  async listCases(filters?: { isRegression?: boolean }) {
    const conditions = [];
    if (filters?.isRegression !== undefined)
      conditions.push(eq(cases.isRegression, filters.isRegression));

    return db
      .select()
      .from(cases)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(cases.createdAt));
  }

  async searchCases(query: {
    q: string;
    topic: string;
    page: number;
    pageSize: number;
    /** CLG-FR-016：管理案例默认只显示active记录（治理后452条），
     *  显式传 null 可查看全部历史/隔离记录。 */
    qualityStatus?: string | null;
  }) {
    const whereClauses = [];

    // CLG-FR-016：默认只显示 quality_status='active' 的治理后活跃案例；
    // 显式 qualityStatus=null 时不做过滤（审计/维护视图）。
    if (query.qualityStatus !== null) {
      whereClauses.push(eq(cases.qualityStatus, query.qualityStatus ?? "active"));
    }

    if (query.q) {
      whereClauses.push(
        or(
          ilike(cases.caseUid, `%${query.q}%`),
          ilike(cases.caseText, `%${query.q}%`),
          ilike(cases.creator, `%${query.q}%`),
        ),
      );
    }

    if (query.topic) {
      whereClauses.push(
        sql`${cases.topics}::text ilike ${"%" + query.topic + "%"}`,
      );
    }

    const whereExpr =
      whereClauses.length === 0
        ? undefined
        : whereClauses.length === 1
          ? whereClauses[0]
          : or(...whereClauses);

    const offset = (query.page - 1) * query.pageSize;
    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(cases)
        .where(whereExpr)
        .orderBy(desc(cases.updatedAt))
        .limit(query.pageSize)
        .offset(offset),
      db
        .select({ total: sql<number>`count(*)` })
        .from(cases)
        .where(whereExpr),
    ]);

    return { rows, total: Number(totalRows[0]?.total ?? 0) };
  }

  async listShowcaseCases() {
    // CLG-FR-016：公开入口只返回36条 selected + published 展示案例。
    return db
      .select()
      .from(showcaseCases)
      .where(
        and(
          eq(showcaseCases.isPublished, true),
          sql`${showcaseCases.qualityStatus} = 'selected'`,
        ),
      )
      .orderBy(asc(showcaseCases.sortOrder), desc(showcaseCases.createdAt));
  }

  async countShowcaseCases() {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(showcaseCases);
    return Number(result[0].count);
  }
}
