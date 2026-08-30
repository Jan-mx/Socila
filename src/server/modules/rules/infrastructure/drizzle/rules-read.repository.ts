import { and, eq, lte, desc, asc, isNull, or, sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  params,
  ruleSets,
  rules,
  tests,
  workflows,
} from "@/lib/db/schema";
import type { RulesReadRepository } from "../../application/ports";

/** rules 域只读仓储的 Drizzle 实现（自 queries.ts 逐域迁移，行为保持一致）。 */
export class DrizzleRulesReadRepository implements RulesReadRepository {
  async getEffectiveRules(
    ruleSetId: string,
    asOfDate: string,
  ): Promise<{ ruleSet: typeof ruleSets.$inferSelect | null; rules: (typeof rules.$inferSelect)[] }> {
    const ruleSet = await this.getRuleSet(ruleSetId);
    if (!ruleSet) return { ruleSet: null, rules: [] };

    const ruleIds = ruleSet.rules as string[];
    if (ruleIds.length === 0) return { ruleSet, rules: [] };

    const allRows = await db
      .select()
      .from(rules)
      .where(
        and(
          inArray(rules.ruleId, ruleIds),
          eq(rules.status, "published"),
          lte(rules.effectiveFrom, asOfDate),
          or(
            isNull(rules.effectiveTo),
            lte(sql`${asOfDate}`, rules.effectiveTo!),
          ),
        ),
      )
      .orderBy(desc(rules.effectiveFrom), desc(rules.version));

    // 去重：每个 rule_id 仅保留最新有效版本。
    const seen = new Set<string>();
    const result: (typeof rules.$inferSelect)[] = [];
    for (const row of allRows) {
      if (!seen.has(row.ruleId)) {
        seen.add(row.ruleId);
        result.push(row);
      }
    }

    return { ruleSet, rules: result };
  }

  async getRule(ruleId: string, version?: number) {
    const conditions = [eq(rules.ruleId, ruleId)];
    if (version !== undefined) {
      conditions.push(eq(rules.version, version));
    }

    const rows = await db
      .select()
      .from(rules)
      .where(and(...conditions))
      .orderBy(desc(rules.version))
      .limit(1);

    return rows[0] ?? null;
  }

  async listRules(filters?: { module?: string; status?: string }) {
    const conditions = [];
    if (filters?.module) conditions.push(eq(rules.module, filters.module));
    if (filters?.status) conditions.push(eq(rules.status, filters.status));

    return db
      .select()
      .from(rules)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(rules.priority));
  }

  async listRuleVersions(ruleId: string) {
    return db
      .select()
      .from(rules)
      .where(eq(rules.ruleId, ruleId))
      .orderBy(desc(rules.version));
  }

  async getEffectiveParams(policyPackId: string, asOfDate: string) {
    const allParams = await db
      .select()
      .from(params)
      .where(
        and(
          eq(params.policyPackId, policyPackId),
          eq(params.status, "published"),
          lte(params.effectiveFrom, asOfDate),
        ),
      )
      .orderBy(desc(params.effectiveFrom), desc(params.version));

    // 去重：每个 param_id 仅保留最新版本。
    const seen = new Set<string>();
    const result = [];
    for (const row of allParams) {
      if (!seen.has(row.paramId)) {
        seen.add(row.paramId);
        result.push(row);
      }
    }

    return result;
  }

  async listParams(filters?: {
    policyPackId?: string;
    type?: string;
    status?: string;
  }) {
    const conditions = [];
    if (filters?.policyPackId)
      conditions.push(eq(params.policyPackId, filters.policyPackId));
    if (filters?.type) conditions.push(eq(params.type, filters.type));
    if (filters?.status) conditions.push(eq(params.status, filters.status));

    return db
      .select()
      .from(params)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(params.paramId));
  }

  async getRuleSet(ruleSetId: string) {
    const rows = await db
      .select()
      .from(ruleSets)
      .where(
        and(
          eq(ruleSets.ruleSetId, ruleSetId),
          eq(ruleSets.status, "published"),
        ),
      )
      .orderBy(desc(ruleSets.version))
      .limit(1);

    return rows[0] ?? null;
  }

  async getLatestRuleSetVersion(ruleSetId: string) {
    const rows = await db
      .select()
      .from(ruleSets)
      .where(eq(ruleSets.ruleSetId, ruleSetId))
      .orderBy(desc(ruleSets.version))
      .limit(1);

    return rows[0] ?? null;
  }

  async listRuleSets() {
    return db.select().from(ruleSets).orderBy(asc(ruleSets.ruleSetId));
  }

  async getWorkflow(workflowId: string) {
    const rows = await db
      .select()
      .from(workflows)
      .where(eq(workflows.workflowId, workflowId))
      .limit(1);

    return rows[0] ?? null;
  }

  async listTests(filters?: { ruleId?: string; source?: string }) {
    const conditions = [];
    if (filters?.ruleId) conditions.push(eq(tests.ruleId, filters.ruleId));
    if (filters?.source) conditions.push(eq(tests.source, filters.source));

    return db
      .select()
      .from(tests)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(tests.name));
  }

  async getTest(id: number) {
    const rows = await db.select().from(tests).where(eq(tests.id, id)).limit(1);

    return rows[0] ?? null;
  }

  async countRules(status?: string) {
    const conditions = status ? [eq(rules.status, status)] : [];
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(rules)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    return Number(result[0].count);
  }

  async countParams(status?: string) {
    const conditions = status ? [eq(params.status, status)] : [];
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(params)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    return Number(result[0].count);
  }

  async countTests() {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(tests);
    return Number(result[0].count);
  }
}
