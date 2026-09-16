import { and, eq, lte, gte, desc, asc, isNull, or, sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  params,
  ruleSets,
  rules,
  tests,
  workflows,
} from "@/lib/db/schema";
import type {
  RulesReadRepository,
  RuleRow,
  RuleCandidateRow,
} from "../../application/ports";
import type { OverlayOperation } from "@/server/modules/policy/domain/overlay";

/** date列（node-postgres返回Date或YYYY-MM-DD字符串）规范化为ISO日期字符串。 */
function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : text;
}

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

  async listRules(filters?: {
    module?: string;
    status?: string;
    jurisdictionCode?: string;
    q?: string;
  }) {
    const conditions = [];
    if (filters?.module) conditions.push(eq(rules.module, filters.module));
    if (filters?.status) conditions.push(eq(rules.status, filters.status));
    if (filters?.jurisdictionCode) {
      conditions.push(eq(rules.jurisdictionCode, filters.jurisdictionCode));
    }
    if (filters?.q && filters.q.trim().length > 0) {
      const pattern = `%${filters.q.trim()}%`;
      conditions.push(
        sql`(${rules.ruleId} ilike ${pattern} or ${rules.name} ilike ${pattern})`,
      );
    }

    return db
      .select()
      .from(rules)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(rules.priority));
  }

  /** NRP-FR-021：按jurisdiction_code+entity_id+version精确定位，不跨地区猜测。 */
  async getRuleExact(locator: {
    ruleId: string;
    jurisdictionCode: string;
    version: number;
  }): Promise<RuleRow | null> {
    const rows = await db
      .select()
      .from(rules)
      .where(
        and(
          eq(rules.ruleId, locator.ruleId),
          eq(rules.jurisdictionCode, locator.jurisdictionCode),
          eq(rules.version, locator.version),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async listRuleVersions(ruleId: string, jurisdictionCode?: string) {
    const conditions = [eq(rules.ruleId, ruleId)];
    if (jurisdictionCode) {
      conditions.push(eq(rules.jurisdictionCode, jurisdictionCode));
    }
    return db
      .select()
      .from(rules)
      .where(and(...conditions))
      .orderBy(desc(rules.version));
  }

  /** NRP审查缺陷5：地区预览参数——国家baseline（published）+目标地区
   * （published与draft预览），按as_of_date过滤有效期，不混入其他省份。 */
  async listParamsForPreview(
    jurisdictionCode: string,
    asOfDate: string,
  ) {
    return db
      .select()
      .from(params)
      .where(
        and(
          or(
            eq(params.jurisdictionCode, "CN"),
            eq(params.jurisdictionCode, jurisdictionCode),
          ),
          or(
            eq(params.status, "published"),
            and(
              eq(params.status, "draft"),
              eq(params.jurisdictionCode, jurisdictionCode),
            ),
          ),
          lte(params.effectiveFrom, asOfDate),
          or(
            isNull(params.effectiveTo),
            gte(params.effectiveTo, asOfDate),
          ),
        ),
      )
      .orderBy(desc(params.effectiveFrom), desc(params.version));
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
    jurisdictionCode?: string;
  }) {
    const conditions = [];
    if (filters?.policyPackId)
      conditions.push(eq(params.policyPackId, filters.policyPackId));
    if (filters?.type) conditions.push(eq(params.type, filters.type));
    if (filters?.status) conditions.push(eq(params.status, filters.status));
    if (filters?.jurisdictionCode) {
      conditions.push(eq(params.jurisdictionCode, filters.jurisdictionCode));
    }

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

  /** APR-FR-006：三元素精确身份，任何一项不符返回null（不跨地区/版本猜测）。 */
  async getRuleSetExact(locator: {
    ruleSetId: string;
    jurisdictionCode: string;
    version: number;
  }): Promise<(typeof ruleSets.$inferSelect) | null> {
    const rows = await db
      .select()
      .from(ruleSets)
      .where(
        and(
          eq(ruleSets.ruleSetId, locator.ruleSetId),
          eq(ruleSets.jurisdictionCode, locator.jurisdictionCode),
          eq(ruleSets.version, locator.version),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  /** APR-FR-007/NFR-002：成员解析/选择器候选的批量装载——
   * 单查询取回继承链内、有效期覆盖asOfDate的published规则行。 */
  async listRuleCandidates(locator: {
    ruleIds: string[] | null;
    jurisdictionCodes: string[];
    asOfDate: string;
  }): Promise<RuleCandidateRow[]> {
    if (locator.jurisdictionCodes.length === 0) return [];
    const conditions = [
      eq(rules.status, "published"),
      inArray(rules.jurisdictionCode, locator.jurisdictionCodes),
      lte(rules.effectiveFrom, locator.asOfDate),
      or(isNull(rules.effectiveTo), gte(sql`${locator.asOfDate}`, rules.effectiveTo!)),
    ];
    if (locator.ruleIds !== null) {
      if (locator.ruleIds.length === 0) return [];
      conditions.push(inArray(rules.ruleId, locator.ruleIds));
    }
    const rows = await db
      .select()
      .from(rules)
      .where(and(...conditions));
    return rows.map((row) => ({
      ruleId: row.ruleId,
      jurisdictionCode: row.jurisdictionCode ?? "",
      // rules无policy_pack_id列：同地区同业务键的多版本行是版本更替而非跨包冲突
      // （与getEffectiveRules去重语义一致），以地区为逻辑包标识。
      policyPackId: `RULES:${row.jurisdictionCode ?? ""}`,
      version: row.version,
      name: row.name,
      status: row.status,
      operation: row.operation as OverlayOperation,
      targetBusinessKey: row.targetBusinessKey ?? null,
      effectiveFrom: toIsoDate(row.effectiveFrom) ?? "",
      effectiveTo: toIsoDate(row.effectiveTo),
    }));
  }

  /** APR-FR-012：参数引用反查索引——单查询取回全部规则的身份与parameter_refs。 */
  async listRuleParamReferenceIndex() {
    const rows = await db
      .select({
        ruleId: rules.ruleId,
        name: rules.name,
        jurisdictionCode: rules.jurisdictionCode,
        version: rules.version,
        parameterRefs: rules.parameterRefs,
      })
      .from(rules);
    return rows.map((row) => ({
      ruleId: row.ruleId,
      name: row.name,
      jurisdictionCode: row.jurisdictionCode,
      version: row.version,
      parameterRefs: row.parameterRefs,
    }));
  }

  async listRuleSets(filters?: { jurisdictionCode?: string }) {
    const conditions = [];
    if (filters?.jurisdictionCode) {
      conditions.push(eq(ruleSets.jurisdictionCode, filters.jurisdictionCode));
    }
    return db
      .select()
      .from(ruleSets)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(ruleSets.ruleSetId));
  }

  async getWorkflow(workflowId: string) {
    const rows = await db
      .select()
      .from(workflows)
      .where(eq(workflows.workflowId, workflowId))
      .limit(1);

    return rows[0] ?? null;
  }

  async listTests(filters?: {
    ruleId?: string;
    source?: string;
    jurisdictionCode?: string;
    jurisdictionCodes?: string[];
  }) {
    const conditions = [];
    if (filters?.ruleId) conditions.push(eq(tests.ruleId, filters.ruleId));
    if (filters?.source) conditions.push(eq(tests.source, filters.source));
    if (filters?.jurisdictionCode) {
      conditions.push(eq(tests.jurisdictionCode, filters.jurisdictionCode));
    }
    if (filters?.jurisdictionCodes && filters.jurisdictionCodes.length > 0) {
      conditions.push(inArray(tests.jurisdictionCode, filters.jurisdictionCodes));
    }

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
