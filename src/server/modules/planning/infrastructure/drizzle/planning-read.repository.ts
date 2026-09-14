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
  }) {
    // RCL-FR-020：管理查询必须是 `active AND filters`——搜索/主题过滤
    // 不得返回非 active 记录（修复旧实现用 OR 合并搜索条件的P2缺陷）。
    const whereClauses: ReturnType<typeof eq>[] = [
      eq(cases.qualityStatus, "active"),
    ];

    if (query.q) {
      whereClauses.push(
        or(
          ilike(cases.caseUid, `%${query.q}%`),
          ilike(cases.caseText, `%${query.q}%`),
          ilike(cases.creator, `%${query.q}%`),
        )!,
      );
    }

    if (query.topic) {
      whereClauses.push(
        sql`${cases.topics}::text ilike ${"%" + query.topic + "%"}`,
      );
    }

    const whereExpr = and(...whereClauses);
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
    return db
      .select()
      .from(showcaseCases)
      .where(eq(showcaseCases.isPublished, true))
      .orderBy(asc(showcaseCases.sortOrder), desc(showcaseCases.createdAt));
  }

  async countShowcaseCases() {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(showcaseCases);
    return Number(result[0].count);
  }
}
