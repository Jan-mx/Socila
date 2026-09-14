import { db, type DbClient } from "@/lib/db";
import { cases, plans, showcaseCases } from "@/lib/db/schema";
import type { PlanningWriteRepository } from "../../application/write-ports";

/** planning 域写仓储的 Drizzle 实现。 */
export class DrizzlePlanningWriteRepository implements PlanningWriteRepository {
  async savePlan(data: typeof plans.$inferInsert, tx?: DbClient) {
    const rows = await (tx ?? db).insert(plans).values(data).returning();
    return rows[0];
  }

  async insertShowcaseCases(
    data: (typeof showcaseCases.$inferInsert)[],
    tx?: DbClient,
  ) {
    if (data.length === 0) return [];
    return (tx ?? db).insert(showcaseCases).values(data).returning();
  }

  async insertCase(data: typeof cases.$inferInsert, tx?: DbClient) {
    const rows = await (tx ?? db).insert(cases).values(data).returning();
    return rows[0];
  }

  async insertCases(data: (typeof cases.$inferInsert)[], tx?: DbClient) {
    if (data.length === 0) return [];
    return (tx ?? db).insert(cases).values(data).returning();
  }
}
