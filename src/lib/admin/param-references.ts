/**
 * APR-FR-012：参数引用反查索引（纯函数）。
 *
 * 输入为仓储单查询取回的全部规则身份与parameter_refs（禁止逐参数查询）；
 * 输出 param_id → 引用规则（同编号多版本去重保留最新版本，按ruleId稳定排序）。
 * parameter_refs兼容字符串与{param_id,...}对象两种形状。
 */

export interface RuleReferenceRow {
  ruleId: string;
  name: string;
  jurisdictionCode: string | null;
  version?: number;
  parameterRefs: unknown;
}

export interface ReferencingRule {
  ruleId: string;
  name: string;
  jurisdictionCode: string | null;
  version: number;
}

function refParamIds(parameterRefs: unknown): string[] {
  if (!Array.isArray(parameterRefs)) return [];
  const ids: string[] = [];
  for (const ref of parameterRefs) {
    if (typeof ref === "string" && ref.trim().length > 0) {
      ids.push(ref.trim());
    } else if (
      ref !== null &&
      typeof ref === "object" &&
      typeof (ref as { param_id?: unknown }).param_id === "string"
    ) {
      ids.push(((ref as { param_id: string }).param_id).trim());
    }
  }
  return [...new Set(ids)];
}

export function buildParamReferenceIndex(
  rules: RuleReferenceRow[],
): Map<string, ReferencingRule[]> {
  const byParam = new Map<string, Map<string, ReferencingRule>>();
  for (const rule of rules) {
    const version = Number.isInteger(rule.version) ? (rule.version as number) : 1;
    for (const paramId of refParamIds(rule.parameterRefs)) {
      const perRule = byParam.get(paramId) ?? new Map<string, ReferencingRule>();
      const existing = perRule.get(rule.ruleId);
      if (!existing || version >= existing.version) {
        perRule.set(rule.ruleId, {
          ruleId: rule.ruleId,
          name: rule.name,
          jurisdictionCode: rule.jurisdictionCode,
          version,
        });
      }
      byParam.set(paramId, perRule);
    }
  }
  const out = new Map<string, ReferencingRule[]>();
  for (const [paramId, perRule] of byParam) {
    out.set(
      paramId,
      [...perRule.values()].sort((a, b) =>
        a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0,
      ),
    );
  }
  return out;
}

/**
 * 按参数行的地区过滤引用规则（APR-FR-012）：
 * - CN参数：只算CN规则引用；
 * - 地区参数：CN baseline规则 + 本地区规则（继承链可见）；
 * - 地区缺失（历史行）：不过滤（保持全局反查，引用项自含@地区标注）。
 */
export function filterRefsForJurisdiction(
  refs: ReferencingRule[],
  paramJurisdictionCode: string | null,
): ReferencingRule[] {
  if (paramJurisdictionCode === null || paramJurisdictionCode === undefined) {
    return refs;
  }
  return refs.filter(
    (r) =>
      r.jurisdictionCode === paramJurisdictionCode ||
      r.jurisdictionCode === "CN",
  );
}
