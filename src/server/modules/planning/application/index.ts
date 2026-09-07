/** planning 模块仓储访问器（进程级单例）。 */
import { DrizzlePlanningReadRepository } from "../infrastructure/drizzle/planning-read.repository";
import { DrizzlePlanningWriteRepository } from "../infrastructure/drizzle/planning-write.repository";
import { DrizzleJurisdictionPlanningReadRepository } from "../infrastructure/drizzle/jurisdiction-planning-read.repository";
import { computeJurisdictionPlan } from "./jurisdiction-compute.use-case";

export const planningReads = new DrizzlePlanningReadRepository();
export const planningWrites = new DrizzlePlanningWriteRepository();

/** 地区感知规划只读仓储（任务3 JRP-FR-004/005）。 */
export const jurisdictionPlanningReads =
  new DrizzleJurisdictionPlanningReadRepository();

/** 默认装配的地区感知规划入口（Route/AI 工具共用，JRP-FR-001/008）。 */
export function createJurisdictionComputePlan() {
  const reads = new DrizzleJurisdictionPlanningReadRepository();
  return (input: Parameters<typeof computeJurisdictionPlan>[0]) =>
    computeJurisdictionPlan(
      input,
      {
        resolveChain: async (code) => {
          const { createJurisdictionTreeService } = await import(
            "@/server/modules/jurisdiction/application/tree-service"
          );
          const { DrizzleJurisdictionReadRepository } = await import(
            "@/server/modules/jurisdiction/infrastructure/drizzle/jurisdiction-read.repository"
          );
          const tree = createJurisdictionTreeService({
            read: new DrizzleJurisdictionReadRepository(),
          });
          return (await tree.resolveChain(code)).map((n) => ({
            code: n.code,
            name: n.name,
            level: n.level,
            path: n.path,
          }));
        },
        getActiveRelease: (code) => reads.getActiveRelease(code),
        getSnapshot: (id) => reads.getSnapshot(id),
        listOpenConflicts: (code) => reads.listOpenConflicts(code),
        savePlan: new DrizzlePlanningWriteRepository().savePlan.bind(
          new DrizzlePlanningWriteRepository(),
        ),
      },
    );
}
