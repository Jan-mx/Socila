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
import type { MemberRuleCandidate } from "../domain/rule-set-members";

export type RuleRow = typeof rules.$inferSelect;
export type ParamRow = typeof params.$inferSelect;
export type RuleSetRow = typeof ruleSets.$inferSelect;
export type WorkflowRow = typeof workflows.$inferSelect;
export type TestRow = typeof tests.$inferSelect;
/** 成员解析候选行（APR-FR-007）：仓储批量装载的规范化视图。 */
export type RuleCandidateRow = MemberRuleCandidate;

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
  // APR-FR-001/006：原getLatestRuleSetVersion（按id猜最新版、跨地区歧义）已删除——
  // 管理端读取/更新唯一入口是getRuleSetExact（rule_set_id+jurisdiction_code+version）。
  /** APR-FR-006：规则集精确实体身份（rule_set_id + jurisdiction_code + version），
   * 缺一项即拒绝，不猜测；调用方必须先校验三元身份齐备。 */
  getRuleSetExact(locator: {
    ruleSetId: string;
    jurisdictionCode: string;
    version: number;
  }): Promise<RuleSetRow | null>;
  /** APR-FR-007/NFR-002：成员/选择器候选的批量装载（单查询，禁止逐成员N+1）。 */
  listRuleCandidates(locator: {
    ruleIds: string[] | null;
    jurisdictionCodes: string[];
    asOfDate: string;
  }): Promise<RuleCandidateRow[]>;
  /** APR-FR-012：参数引用反查——单查询取回全部规则的编号/名称/参数引用。 */
  listRuleParamReferenceIndex(): Promise<
    Array<{
      ruleId: string;
      name: string;
      jurisdictionCode: string | null;
      parameterRefs: unknown;
    }>
  >;
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
