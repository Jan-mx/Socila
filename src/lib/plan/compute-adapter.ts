import { PlanComputeRequestSchema } from "@/lib/validators/plan-input";
import type { ComputePlanServiceInput, ComputePlanServiceResult } from "@/lib/engine/plan-service";

export function createPlanComputeAdapter(
  service: (input: ComputePlanServiceInput) => Promise<ComputePlanServiceResult>,
  dependencies: { now?: () => Date; persist?: boolean; captureResult?: (result: ComputePlanServiceResult) => void } = {},
) {
  return {
    async handle(body: unknown, sessionId?: string): Promise<{ status: number; body: Record<string, unknown> }> {
      const parsed = PlanComputeRequestSchema.safeParse(body);
      if (!parsed.success) return { status: 400, body: { error: "输入内容无效", details: parsed.error.flatten() } };
      const { user, as_of_date, rule_set_id = "RS-SHANGHAI-PLAN-V1", policy_pack_id = "SHANGHAI_BASE" } = parsed.data;
      const asOfDate = as_of_date ?? (dependencies.now ?? (() => new Date()))().toISOString().slice(0, 10);
      try {
        const result = await service({ user: user as Record<string, unknown>, asOfDate, ruleSetId: rule_set_id, policyPackId: policy_pack_id, sessionId, persist: dependencies.persist });
        dependencies.captureResult?.(result);
        return { status: 200, body: { plan_id: result.planId, plan: result.plan, calc: result.calc, meta: result.meta, needs_agent: result.needsAgent, questions: result.questions, warnings: result.warnings, caveats: result.caveats } };
      } catch {
        return { status: 500, body: { error: "计算规划方案失败" } };
      }
    },
  };
}
