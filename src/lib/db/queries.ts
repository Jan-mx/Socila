import { and, eq, lte, desc, asc, isNull, or, sql, inArray } from "drizzle-orm";
import { db } from "./index";
import {
  rules,
  params,
  ruleSets,
  workflows,
  publishes,
  policyPackVersions,
  plans,
  cases,
  tests,
  conversations,
  showcaseCases,
} from "./schema";

// ─── Rules ──────────────────────────────────────────────────────────────────

/**
 * Get effective rules for a rule set at a given date.
 * For each rule_id referenced by the rule set, returns the latest version
 * whose effective_from <= asOfDate and status = 'published'.
 */
export async function getEffectiveRules(
  ruleSetId: string,
  asOfDate: string,
): Promise<{
  ruleSet: typeof ruleSets.$inferSelect | null;
  rules: (typeof rules.$inferSelect)[];
}> {
  const ruleSet = await getRuleSet(ruleSetId);
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

  // Deduplicate: keep only the latest effective version per ruleId
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

/** Get a single rule by rule_id and optional version */
export async function getRule(ruleId: string, version?: number) {
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

/** List all rules with optional filters */
export async function listRules(filters?: {
  module?: string;
  status?: string;
}) {
  const conditions = [];
  if (filters?.module) conditions.push(eq(rules.module, filters.module));
  if (filters?.status) conditions.push(eq(rules.status, filters.status));

  return db
    .select()
    .from(rules)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(rules.priority));
}

/** List all versions of a specific rule_id */
export async function listRuleVersions(ruleId: string) {
  return db
    .select()
    .from(rules)
    .where(eq(rules.ruleId, ruleId))
    .orderBy(desc(rules.version));
}

/** Insert a new rule */
export async function insertRule(data: typeof rules.$inferInsert) {
  const rows = await db.insert(rules).values(data).returning();
  return rows[0];
}

/** Update an existing rule by id */
export async function updateRule(
  id: number,
  data: Partial<typeof rules.$inferInsert>,
) {
  const rows = await db
    .update(rules)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(rules.id, id))
    .returning();
  return rows[0] ?? null;
}

// ─── Params ─────────────────────────────────────────────────────────────────

/**
 * Get effective params for a policy pack at a given date.
 * For each param_id, returns the latest version whose effective_from <= asOfDate.
 */
export async function getEffectiveParams(
  policyPackId: string,
  asOfDate: string,
) {
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

  // Deduplicate: keep only the latest version per param_id
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

/** List all params with optional filters */
export async function listParams(filters?: {
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

/** Insert a new param */
export async function insertParam(data: typeof params.$inferInsert) {
  const rows = await db.insert(params).values(data).returning();
  return rows[0];
}

/** Update an existing param by id */
export async function updateParam(
  id: number,
  data: Partial<typeof params.$inferInsert>,
) {
  const rows = await db
    .update(params)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(params.id, id))
    .returning();
  return rows[0] ?? null;
}

// ─── Rule Sets ──────────────────────────────────────────────────────────────

/** Get a rule set by its rule_set_id (latest version) */
export async function getRuleSet(ruleSetId: string) {
  const rows = await db
    .select()
    .from(ruleSets)
    .where(
      and(eq(ruleSets.ruleSetId, ruleSetId), eq(ruleSets.status, "published")),
    )
    .orderBy(desc(ruleSets.version))
    .limit(1);

  return rows[0] ?? null;
}

/** List all rule sets */
export async function listRuleSets() {
  return db.select().from(ruleSets).orderBy(asc(ruleSets.ruleSetId));
}

/** Insert a new rule set */
export async function insertRuleSet(data: typeof ruleSets.$inferInsert) {
  const rows = await db.insert(ruleSets).values(data).returning();
  return rows[0];
}

/** Update an existing rule set */
export async function updateRuleSet(
  id: number,
  data: Partial<typeof ruleSets.$inferInsert>,
) {
  const rows = await db
    .update(ruleSets)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(ruleSets.id, id))
    .returning();
  return rows[0] ?? null;
}

// ─── Workflows ──────────────────────────────────────────────────────────────

/** Get a workflow by workflow_id */
export async function getWorkflow(workflowId: string) {
  const rows = await db
    .select()
    .from(workflows)
    .where(eq(workflows.workflowId, workflowId))
    .limit(1);

  return rows[0] ?? null;
}

/** Insert a new workflow */
export async function insertWorkflow(data: typeof workflows.$inferInsert) {
  const rows = await db.insert(workflows).values(data).returning();
  return rows[0];
}

// ─── Policy Pack Versions ───────────────────────────────────────────────────

/** Get the latest policy pack version */
export async function getLatestPolicyPackVersion(policyPackId: string) {
  const rows = await db
    .select()
    .from(policyPackVersions)
    .where(
      and(
        eq(policyPackVersions.policyPackId, policyPackId),
        eq(policyPackVersions.status, "published"),
      ),
    )
    .orderBy(desc(policyPackVersions.version))
    .limit(1);

  return rows[0] ?? null;
}

/** Insert a new policy pack version */
export async function insertPolicyPackVersion(
  data: typeof policyPackVersions.$inferInsert,
) {
  const rows = await db.insert(policyPackVersions).values(data).returning();
  return rows[0];
}

// ─── Publishes ──────────────────────────────────────────────────────────────

/** Record a publish event */
export async function insertPublish(data: typeof publishes.$inferInsert) {
  const rows = await db.insert(publishes).values(data).returning();
  return rows[0];
}

/** List recent publishes */
export async function listPublishes(limit = 50) {
  return db
    .select()
    .from(publishes)
    .orderBy(desc(publishes.createdAt))
    .limit(limit);
}

// ─── Plans ──────────────────────────────────────────────────────────────────

/** Save a computed plan */
export async function savePlan(data: typeof plans.$inferInsert) {
  const rows = await db.insert(plans).values(data).returning();
  return rows[0];
}

/** Get a plan by ID */
export async function getPlan(planId: string) {
  const rows = await db
    .select()
    .from(plans)
    .where(eq(plans.id, planId))
    .limit(1);

  return rows[0] ?? null;
}

/** List recent plans */
export async function listPlans(limit = 50) {
  return db.select().from(plans).orderBy(desc(plans.createdAt)).limit(limit);
}

// ─── Showcase Cases ────────────────────────────────────────────────────────

/** List published showcase cases */
export async function listShowcaseCases() {
  return db
    .select()
    .from(showcaseCases)
    .where(eq(showcaseCases.isPublished, true))
    .orderBy(asc(showcaseCases.sortOrder), desc(showcaseCases.createdAt));
}

/** Insert multiple showcase cases */
export async function insertShowcaseCases(
  data: (typeof showcaseCases.$inferInsert)[],
) {
  if (data.length === 0) return [];
  return db.insert(showcaseCases).values(data).returning();
}

/** Count showcase cases */
export async function countShowcaseCases() {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(showcaseCases);
  return Number(result[0].count);
}

// ─── Cases ──────────────────────────────────────────────────────────────────

/** List cases with optional filters */
export async function listCases(filters?: { isRegression?: boolean }) {
  const conditions = [];
  if (filters?.isRegression !== undefined)
    conditions.push(eq(cases.isRegression, filters.isRegression));

  return db
    .select()
    .from(cases)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(cases.createdAt));
}

/** Insert a case */
export async function insertCase(data: typeof cases.$inferInsert) {
  const rows = await db.insert(cases).values(data).returning();
  return rows[0];
}

/** Insert multiple cases */
export async function insertCases(data: (typeof cases.$inferInsert)[]) {
  if (data.length === 0) return [];
  return db.insert(cases).values(data).returning();
}

// ─── Tests ──────────────────────────────────────────────────────────────────

/** List tests with optional filters */
export async function listTests(filters?: {
  ruleId?: string;
  source?: string;
}) {
  const conditions = [];
  if (filters?.ruleId) conditions.push(eq(tests.ruleId, filters.ruleId));
  if (filters?.source) conditions.push(eq(tests.source, filters.source));

  return db
    .select()
    .from(tests)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(tests.name));
}

/** Insert a test */
export async function insertTest(data: typeof tests.$inferInsert) {
  const rows = await db.insert(tests).values(data).returning();
  return rows[0];
}

/** Insert multiple tests */
export async function insertTests(data: (typeof tests.$inferInsert)[]) {
  if (data.length === 0) return [];
  return db.insert(tests).values(data).returning();
}

/** Update test run result */
export async function updateTestResult(id: number, result: unknown) {
  const rows = await db
    .update(tests)
    .set({
      lastRunResult: result as typeof tests.$inferInsert.lastRunResult,
      lastRunAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tests.id, id))
    .returning();
  return rows[0] ?? null;
}

/** Get test by id */
export async function getTest(id: number) {
  const rows = await db.select().from(tests).where(eq(tests.id, id)).limit(1);

  return rows[0] ?? null;
}

// ─── Conversations ─────────────────────────────────────────────────────────

/** Create a new conversation */
export async function createConversation(data?: {
  id?: string;
  sessionId?: string;
  messages?: unknown[];
  userProfile?: Record<string, unknown>;
}) {
  const values: typeof conversations.$inferInsert = {
    messages: (data?.messages ??
      []) as typeof conversations.$inferInsert.messages,
    userProfile: (data?.userProfile ??
      {}) as typeof conversations.$inferInsert.userProfile,
  };
  if (data?.id) values.id = data.id;
  if (data?.sessionId) values.sessionId = data.sessionId;

  const rows = await db
    .insert(conversations)
    .values(values)
    .onConflictDoNothing()
    .returning();

  // If conflict (already exists), fetch the existing row.
  if (rows.length === 0 && data?.id) {
    const existing = await getConversation(data.id);
    if (existing) {
      // Only hand back a conflicting row if it belongs to the requesting session.
      // Otherwise an attacker could claim someone else's conversation id by losing
      // the insert race (the read-path ownership check is bypassed here). Returning
      // null makes the caller respond 403 instead of writing into a foreign row.
      if (!data.sessionId || existing.sessionId === data.sessionId) {
        return existing;
      }
      return null;
    }
  }

  return rows[0];
}

/** Get a conversation by ID */
export async function getConversation(conversationId: string) {
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  return rows[0] ?? null;
}

/** Update conversation messages and profile */
export async function updateConversation(
  conversationId: string,
  data: {
    messages?: unknown[];
    userProfile?: Record<string, unknown>;
  },
) {
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (data.messages !== undefined) updateData.messages = data.messages;
  if (data.userProfile !== undefined) updateData.userProfile = data.userProfile;

  const rows = await db
    .update(conversations)
    .set(updateData as typeof conversations.$inferInsert)
    .where(eq(conversations.id, conversationId))
    .returning();
  return rows[0] ?? null;
}

/** List conversations, optionally filtered by sessionId */
export async function listConversations(sessionId?: string) {
  const conditions = sessionId ? [eq(conversations.sessionId, sessionId)] : [];
  return db
    .select()
    .from(conversations)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(conversations.updatedAt))
    .limit(50);
}

/** Delete conversation by ID */
export async function deleteConversation(conversationId: string) {
  const rows = await db
    .delete(conversations)
    .where(eq(conversations.id, conversationId))
    .returning();
  return rows[0] ?? null;
}

// ─── Utility: Count helpers for dashboard ───────────────────────────────────

export async function countRules(status?: string) {
  const conditions = status ? [eq(rules.status, status)] : [];
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(rules)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  return Number(result[0].count);
}

export async function countParams(status?: string) {
  const conditions = status ? [eq(params.status, status)] : [];
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(params)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  return Number(result[0].count);
}

export async function countTests() {
  const result = await db.select({ count: sql<number>`count(*)` }).from(tests);
  return Number(result[0].count);
}
