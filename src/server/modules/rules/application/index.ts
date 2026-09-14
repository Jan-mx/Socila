/**
 * rules 模块仓储访问器（进程级单例，Route Handler 与用例使用）。
 * 仓储方法接受可选事务执行器；写事务由 application 用例经 withTransaction 开启。
 */
import { DrizzleRulesReadRepository } from "../infrastructure/drizzle/rules-read.repository";
import { DrizzleRulesWriteRepository } from "../infrastructure/drizzle/rules-write.repository";

export const rulesReads = new DrizzleRulesReadRepository();
export const rulesWrites = new DrizzleRulesWriteRepository();
