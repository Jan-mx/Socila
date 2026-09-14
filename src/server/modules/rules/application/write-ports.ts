import type {
  params,
  ruleSets,
  rules,
  tests,
  workflows,
} from "@/lib/db/schema";
import type { DbClient } from "@/lib/db";

/** rules 模块写端口（CORE-FR-004/005）：可选事务执行器，由 application 用例开启。 */
export interface RulesWriteRepository {
  insertRule(data: typeof rules.$inferInsert, tx?: DbClient): Promise<typeof rules.$inferSelect>;
  updateRule(
    id: number,
    data: Partial<typeof rules.$inferInsert>,
    tx?: DbClient,
  ): Promise<typeof rules.$inferSelect | null>;
  insertParam(data: typeof params.$inferInsert, tx?: DbClient): Promise<typeof params.$inferSelect>;
  updateParam(
    id: number,
    data: Partial<typeof params.$inferInsert>,
    tx?: DbClient,
  ): Promise<typeof params.$inferSelect | null>;
  insertRuleSet(data: typeof ruleSets.$inferInsert, tx?: DbClient): Promise<typeof ruleSets.$inferSelect>;
  updateRuleSet(
    id: number,
    data: Partial<typeof ruleSets.$inferInsert>,
    tx?: DbClient,
  ): Promise<typeof ruleSets.$inferSelect | null>;
  insertWorkflow(data: typeof workflows.$inferInsert, tx?: DbClient): Promise<typeof workflows.$inferSelect>;
  insertTest(data: typeof tests.$inferInsert, tx?: DbClient): Promise<typeof tests.$inferSelect>;
  insertTests(data: (typeof tests.$inferInsert)[], tx?: DbClient): Promise<(typeof tests.$inferSelect)[]>;
  updateTestResult(id: number, result: unknown, tx?: DbClient): Promise<typeof tests.$inferSelect | null>;
}
