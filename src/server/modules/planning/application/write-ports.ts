import type { cases, plans, showcaseCases } from "@/lib/db/schema";
import type { DbClient } from "@/lib/db";

export interface PlanningWriteRepository {
  savePlan(data: typeof plans.$inferInsert, tx?: DbClient): Promise<typeof plans.$inferSelect>;
  insertShowcaseCases(
    data: (typeof showcaseCases.$inferInsert)[],
    tx?: DbClient,
  ): Promise<(typeof showcaseCases.$inferSelect)[]>;
  insertCase(data: typeof cases.$inferInsert, tx?: DbClient): Promise<typeof cases.$inferSelect>;
  insertCases(
    data: (typeof cases.$inferInsert)[],
    tx?: DbClient,
  ): Promise<(typeof cases.$inferSelect)[]>;
}
