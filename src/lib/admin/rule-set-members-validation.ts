/**
 * APR-FR-007/AC-006：规则集成员数组完整性校验（创建与编辑共用）。
 *
 * - 重复编号拒绝（duplicateRuleIds）；
 * - 在目标继承链+解析日期上无法解析的编号拒绝（invalidRuleIds）；
 * - 校验只读，不落库；POST与PATCH共用，防止创建面绕过缺失成员约束。
 */
import { rulesReads } from "@/server/modules/rules/application";
import { resolveRuleSetMembers } from "@/server/modules/rules/domain/rule-set-members";
import { resolveJurisdictionChain } from "@/server/modules/rules/application/rule-set-view";

export interface MemberValidationResult {
  duplicateRuleIds: string[];
  invalidRuleIds: string[];
}

export async function validateRuleSetMembers(
  locator: { ruleSetId: string; jurisdictionCode: string; version: number },
  nextRules: string[],
  asOf: string,
): Promise<MemberValidationResult> {
  const duplicateRuleIds = [
    ...new Set(nextRules.filter((r, i) => nextRules.indexOf(r) !== i)),
  ];
  if (duplicateRuleIds.length > 0) {
    return { duplicateRuleIds, invalidRuleIds: [] };
  }
  const chain = await resolveJurisdictionChain(locator.jurisdictionCode);
  if (chain === null) {
    // 继承链不可解析：全部编号视为无法解析（fail-closed）。
    return { duplicateRuleIds, invalidRuleIds: [...nextRules] };
  }
  const candidates = await rulesReads.listRuleCandidates({
    ruleIds: nextRules,
    jurisdictionCodes: chain,
    asOfDate: asOf,
  });
  const members = resolveRuleSetMembers(nextRules, candidates, chain, asOf);
  return {
    duplicateRuleIds,
    invalidRuleIds: members.filter((m) => m.missing).map((m) => m.ruleId),
  };
}
