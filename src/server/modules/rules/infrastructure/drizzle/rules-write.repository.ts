import { eq } from "drizzle-orm";
import { db, type DbClient } from "@/lib/db";
import { params, ruleSets, rules, tests, workflows } from "@/lib/db/schema";
import type { RulesWriteRepository } from "../../application/write-ports";

/** rules 域写仓储的 Drizzle 实现（自 queries.ts 逐域迁移，行为保持一致）。 */
export class DrizzleRulesWriteRepository implements RulesWriteRepository {
  async insertRule(data: typeof rules.$inferInsert, tx?: DbClient) {
    const rows = await (tx ?? db).insert(rules).values(data).returning();
    return rows[0];
  }

  async updateRule(id: number, data: Partial<typeof rules.$inferInsert>, tx?: DbClient) {
    const rows = await (tx ?? db)
      .update(rules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(rules.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async insertParam(data: typeof params.$inferInsert, tx?: DbClient) {
    const rows = await (tx ?? db).insert(params).values(data).returning();
    return rows[0];
  }

  async updateParam(id: number, data: Partial<typeof params.$inferInsert>, tx?: DbClient) {
    const rows = await (tx ?? db)
      .update(params)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(params.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async insertRuleSet(data: typeof ruleSets.$inferInsert, tx?: DbClient) {
    const rows = await (tx ?? db).insert(ruleSets).values(data).returning();
    return rows[0];
  }

  async updateRuleSet(id: number, data: Partial<typeof ruleSets.$inferInsert>, tx?: DbClient) {
    const rows = await (tx ?? db)
      .update(ruleSets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(ruleSets.id, id))
      .returning();
    return rows[0] ?? null;
  }

  async insertWorkflow(data: typeof workflows.$inferInsert, tx?: DbClient) {
    const rows = await (tx ?? db).insert(workflows).values(data).returning();
    return rows[0];
  }

  async insertTest(data: typeof tests.$inferInsert, tx?: DbClient) {
    const rows = await (tx ?? db).insert(tests).values(data).returning();
    return rows[0];
  }

  async insertTests(data: (typeof tests.$inferInsert)[], tx?: DbClient) {
    if (data.length === 0) return [];
    return (tx ?? db).insert(tests).values(data).returning();
  }

  async updateTestResult(id: number, result: unknown, tx?: DbClient) {
    const rows = await (tx ?? db)
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
}
