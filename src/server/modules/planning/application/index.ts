/** planning 模块仓储访问器（进程级单例）。 */
import { DrizzlePlanningReadRepository } from "../infrastructure/drizzle/planning-read.repository";
import { DrizzlePlanningWriteRepository } from "../infrastructure/drizzle/planning-write.repository";

export const planningReads = new DrizzlePlanningReadRepository();
export const planningWrites = new DrizzlePlanningWriteRepository();
