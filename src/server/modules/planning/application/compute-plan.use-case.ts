/**
 * 规划计算用例（CORE-FR-005，步骤02.6 自 src/lib/engine/plan-service.ts 正位迁移）。
 *
 * 归属 planning 模块：编排规则引擎（rules 域）→ 抽取追问/警告/提示 → 场景与补贴富化
 * → 经 PlanningWriteRepository 落库并绑定归属（ownerUserId/sessionId）。
 * 引擎端口与落库端口可注入——单元测试无需框架与数据库（CORE-AC-006 前置）。
 * 旧入口 `src/lib/engine/plan-service.ts` 在 02.9 清理前作为垫片转发到本用例。
 */

import { orchestrate, type OrchestratorResult } from "@/lib/engine/orchestrator";
import { buildScenarios, type Scenario } from "@/lib/engine/scenario-builder";
import { adviseSubsidies, type SubsidyRecommendation } from "@/lib/engine/subsidy-advisor";
import { getDeep } from "@/lib/engine/actions";
import {
  extractNeedsAgent,
  extractQuestions,
  extractWarnings,
  extractCaveats,
  type AgentQuestion,
  type Caveat,
} from "@/lib/engine/calc-extractors";
import type { PlanningWriteRepository } from "./write-ports";
import { DrizzlePlanningWriteRepository } from "../infrastructure/drizzle/planning-write.repository";

export type { AgentQuestion, Caveat } from "@/lib/engine/calc-extractors";

export interface ComputePlanInput {
  /** 规范化后的用户画像（basic/social/status/subsidy/mi/objective） */
  user: Record<string, unknown>;
  asOfDate?: string;
  ruleSetId?: string;
  policyPackId?: string;
  /** 是否落库（工具与 API 都需要；测试可关闭） */
  persist?: boolean;
  /** 归属用户 id（09-02 AUTH-FR-005）：持久化时必须提供；session_id 恒为 NULL */
  ownerUserId?: string;
}

export interface ComputePlanResult {
  planId: string | null;
  needsAgent: boolean;
  questions: AgentQuestion[];
  warnings: string[];
  caveats: Caveat[];
  plan: Record<string, unknown>;
  calc: Record<string, unknown>;
  meta: OrchestratorResult["meta"];
}

export interface ComputePlanDeps {
  runEngine?: typeof orchestrate;
  savePlan?: PlanningWriteRepository["savePlan"];
}

/**
 * 计算社保规划方案：统一的编排 + 富化 + 落库流程。
 */
export async function computePlan(
  input: ComputePlanInput,
  deps: ComputePlanDeps = {},
): Promise<ComputePlanResult> {
  const runEngine = deps.runEngine ?? orchestrate;
  const savePlan =
    deps.savePlan ??
    new DrizzlePlanningWriteRepository().savePlan.bind(
      new DrizzlePlanningWriteRepository(),
    );

  const result = await runEngine({
    user: input.user,
    as_of_date: input.asOfDate,
    rule_set_id: input.ruleSetId,
    policy_pack_id: input.policyPackId,
  });

  const needsAgent = extractNeedsAgent(result.calc);
  const questions = extractQuestions(result.calc);
  const warnings = extractWarnings(result.calc);
  const caveats = extractCaveats(result.calc);

  const enrichedCalc = enrichCalc(result, input.user, needsAgent);

  let planId: string | null = null;
  if (input.persist ?? true) {
    // 09-02 AUTH-FR-005：新建业务资源只绑定 owner_user_id，session_id 必须为 NULL。
    if (!input.ownerUserId) {
      throw new Error("owner_user_id is required to persist a plan");
    }
    const saved = await savePlan({
      userInput: input.user as Record<string, unknown>,
      calcResult: enrichedCalc as Record<string, unknown>,
      planOutput: result.plan as Record<string, unknown>,
      trace: result.trace as unknown[],
      ruleSetVersion: result.meta.rule_set_id,
      policyPackVersion: result.meta.policy_pack_id,
      asOfDate: result.meta.as_of_date,
      ownerUserId: input.ownerUserId,
    });
    planId = saved?.id ?? null;
  }

  return {
    planId,
    needsAgent,
    questions,
    warnings,
    caveats,
    plan: result.plan,
    calc: enrichedCalc,
    meta: result.meta,
  };
}

// ─── 富化：场景对比 + 补贴建议 ────────────────────────────────────────────────

/**
 * 在引擎原始 calc 基础上补充 scenarios（退休方案对比）与 subsidy_recommendations（补贴建议）。
 * 仅在信息齐全（不需要继续追问且已知性别）时构建场景，避免半成品输入产出误导性对比。
 */
function enrichCalc(
  result: OrchestratorResult,
  user: Record<string, unknown>,
  needsAgent: boolean,
): Record<string, unknown> {
  const enriched: Record<string, unknown> & {
    scenarios?: Scenario[];
    subsidy_recommendations?: SubsidyRecommendation[];
  } = { ...result.calc };

  const gender = getDeep(user, "basic.gender");

  if (!needsAgent && result.effectiveRules && result.flatParams && gender) {
    const scenarios = buildScenarios(
      result,
      result.effectiveRules,
      result.flatParams,
      user,
      result.meta.as_of_date,
    );
    if (scenarios.length > 0) {
      enriched.scenarios = scenarios;
    }
  }

  const subsidyRecommendations = adviseSubsidies(result.calc, user);
  if (subsidyRecommendations.length > 0) {
    enriched.subsidy_recommendations = subsidyRecommendations;
  }

  return enriched;
}
