/**
 * rules 模块只读端口（CORE-FR-004）。
 * 实现见 infrastructure/drizzle/rules-read.repository.ts。
 * 覆盖 queries.ts 中归属 rules 域的全部只读调用（rules/params/rule_sets/workflows/tests）。
 */
import type {
  params,
  ruleSets,
  rules,
  tests,
  workflows,
} from "@/lib/db/schema";

export type RuleRow = typeof rules.$inferSelect;
export type ParamRow = typeof params.$inferSelect;
export type RuleSetRow = typeof ruleSets.$inferSelect;
export type WorkflowRow = typeof workflows.$inferSelect;
export type TestRow = typeof tests.$inferSelect;

export interface RulesReadRepository {
  getEffectiveRules(
    ruleSetId: string,
    asOfDate: string,
  ): Promise<{ ruleSet: RuleSetRow | null; rules: RuleRow[] }>;
  getRule(ruleId: string, version?: number): Promise<RuleRow | null>;
  listRules(filters?: { module?: string; status?: string }): Promise<RuleRow[]>;
  listRuleVersions(ruleId: string): Promise<RuleRow[]>;
  getEffectiveParams(policyPackId: string, asOfDate: string): Promise<ParamRow[]>;
  listParams(filters?: {
    policyPackId?: string;
    type?: string;
    status?: string;
  }): Promise<ParamRow[]>;
  getRuleSet(ruleSetId: string): Promise<RuleSetRow | null>;
  /** 最新版本规则集（不限状态）——管理后台草稿编辑入口使用。 */
  getLatestRuleSetVersion(ruleSetId: string): Promise<RuleSetRow | null>;
  listRuleSets(): Promise<RuleSetRow[]>;
  getWorkflow(workflowId: string): Promise<WorkflowRow | null>;
  listTests(filters?: { ruleId?: string; source?: string }): Promise<TestRow[]>;
  getTest(id: number): Promise<TestRow | null>;
  countRules(status?: string): Promise<number>;
  countParams(status?: string): Promise<number>;
  countTests(): Promise<number>;
}
