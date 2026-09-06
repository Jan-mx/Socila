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
  /** NRP-FR-021：地区精确身份定位（jurisdiction_code + entity_id + version）。 */
  getRuleExact(locator: {
    ruleId: string;
    jurisdictionCode: string;
    version: number;
  }): Promise<RuleRow | null>;
  listRules(filters?: {
    module?: string;
    status?: string;
    jurisdictionCode?: string;
    /** q检索规则编号与名称（NRP-FR-021）。 */
    q?: string;
  }): Promise<RuleRow[]>;
  listRuleVersions(
    ruleId: string,
    jurisdictionCode?: string,
  ): Promise<RuleRow[]>;
  getEffectiveParams(policyPackId: string, asOfDate: string): Promise<ParamRow[]>;
  /** NRP审查缺陷5：地区预览参数——CN published + 目标地区published与draft，按有效期过滤。 */
  listParamsForPreview(
    jurisdictionCode: string,
    asOfDate: string,
  ): Promise<ParamRow[]>;
  listParams(filters?: {
    policyPackId?: string;
    type?: string;
    status?: string;
    jurisdictionCode?: string;
  }): Promise<ParamRow[]>;
  getRuleSet(ruleSetId: string): Promise<RuleSetRow | null>;
  /** 最新版本规则集（不限状态）——管理后台草稿编辑入口使用。 */
  getLatestRuleSetVersion(ruleSetId: string): Promise<RuleSetRow | null>;
  listRuleSets(filters?: { jurisdictionCode?: string }): Promise<RuleSetRow[]>;
  getWorkflow(workflowId: string): Promise<WorkflowRow | null>;
  listTests(filters?: {
    ruleId?: string;
    source?: string;
    jurisdictionCode?: string;
    /** NRP审查缺陷10：继承链地区集合（目标地区+CN）。 */
    jurisdictionCodes?: string[];
  }): Promise<TestRow[]>;
  getTest(id: number): Promise<TestRow | null>;
  countRules(status?: string): Promise<number>;
  countParams(status?: string): Promise<number>;
  countTests(): Promise<number>;
}
