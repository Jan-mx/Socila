/**
 * APR-FR-009/AC-007：规则集成员选择器过滤（纯函数）。
 *
 * 输入是已在目标继承链上解析成功的候选规则（服务器批量装载，含名称）：
 * - 支持中文名称与稳定编号搜索（大小写不敏感）；
 * - 排除已加入成员；
 * - 名称与编号同时命中同一实体时按稳定rule_id去重（失败模式表）；
 * - 同编号多版本只保留最新版本候选；
 * - 输出按rule_id稳定排序；最终保存值仍是稳定编号。
 */

export interface SelectableRuleCandidate {
  ruleId: string;
  name: string;
  jurisdictionCode: string;
  version: number;
  status: string;
}

export function filterSelectableRules(
  candidates: SelectableRuleCandidate[],
  memberRuleIds: string[],
  q: string,
): SelectableRuleCandidate[] {
  const memberSet = new Set(memberRuleIds);
  const needle = q.trim().toLowerCase();

  // 按稳定实体身份去重：同rule_id保留最新版本（地区差异由装载方链解析保证）。
  const latest = new Map<string, SelectableRuleCandidate>();
  for (const c of candidates) {
    if (memberSet.has(c.ruleId)) continue;
    if (needle.length > 0) {
      const hitName = c.name.toLowerCase().includes(needle);
      const hitId = c.ruleId.toLowerCase().includes(needle);
      if (!hitName && !hitId) continue;
    }
    const existing = latest.get(c.ruleId);
    if (!existing || c.version >= existing.version) {
      latest.set(c.ruleId, c);
    }
  }

  return [...latest.values()].sort((a, b) =>
    a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0,
  );
}
