/**
 * 审查缺陷2：管理端编辑字段白名单（NRP-FR-021/NRP-FR-022）。
 *
 * PATCH/PUT/POST不得接受任意body直接写Repository：
 * - 受控字段（status/version/jurisdictionCode/businessKey/ruleId/paramId/
 *   policyPackId/createdAt/updatedAt及其蛇形变体）出现即拒绝（400），
 *   不得静默忽略——状态转换只能走publishing用例；
 * - 白名单之外的字段同样拒绝；
 * - 只允许编辑草稿业务内容。
 */

/** 受控字段：客户端一律不得提交（含蛇形变体）。 */
export const CONTROLLED_FIELDS = [
  "status",
  "version",
  "jurisdictionCode",
  "jurisdiction_code",
  "businessKey",
  "business_key",
  "ruleId",
  "rule_id",
  "paramId",
  "param_id",
  "ruleSetId",
  "rule_set_id",
  "policyPackId",
  "policy_pack_id",
  "createdAt",
  "created_at",
  "updatedAt",
  "updated_at",
  "id",
  "operation",
  "targetBusinessKey",
  "target_business_key",
] as const;

export type EditSanitizeResult =
  | { ok: true; fields: Record<string, unknown> }
  | {
      ok: false;
      controlledFields: string[];
      unknownFields: string[];
    };

function sanitize(
  body: Record<string, unknown>,
  allowed: readonly string[],
): EditSanitizeResult {
  const controlledFields: string[] = [];
  const unknownFields: string[] = [];
  const fields: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(body)) {
    if ((CONTROLLED_FIELDS as readonly string[]).includes(key)) {
      controlledFields.push(key);
      void value;
      continue;
    }
    if (!allowed.includes(key)) {
      unknownFields.push(key);
      continue;
    }
    fields[key] = value;
  }

  if (controlledFields.length > 0 || unknownFields.length > 0) {
    return { ok: false, controlledFields, unknownFields };
  }
  if (Object.keys(fields).length === 0) {
    return { ok: false, controlledFields, unknownFields: ["(空编辑)"] };
  }
  return { ok: true, fields };
}

/** 规则草稿可编辑业务字段。 */
const RULE_EDITABLE = [
  "name",
  "module",
  "priority",
  "effectiveFrom",
  "effective_from",
  "effectiveTo",
  "effective_to",
  "supersedes",
  "inputs",
  "parameterRefs",
  "parameter_refs",
  "decisionTable",
  "decision_table",
  "outputs",
  "examples",
  "evidence",
  "notes",
  "dslVersion",
  "dsl_version",
] as const;

/** 参数草稿可编辑业务字段。 */
const PARAM_EDITABLE = [
  "type",
  "value",
  "unit",
  "rows",
  "keyFields",
  "key_fields",
  "valueFields",
  "value_fields",
  "effectiveFrom",
  "effective_from",
  "effectiveTo",
  "effective_to",
  "source",
  "note",
  "evidence",
] as const;

/** 规则集草稿可编辑业务字段。 */
const RULE_SET_EDITABLE = [
  "description",
  "rules",
  "conflictResolution",
  "conflict_resolution",
  "effectiveFrom",
  "effective_from",
] as const;

export function sanitizeRuleEdit(
  body: Record<string, unknown>,
): EditSanitizeResult {
  return sanitize(body, RULE_EDITABLE);
}

export function sanitizeParamEdit(
  body: Record<string, unknown>,
): EditSanitizeResult {
  return sanitize(body, PARAM_EDITABLE);
}

export function sanitizeRuleSetEdit(
  body: Record<string, unknown>,
): EditSanitizeResult {
  return sanitize(body, RULE_SET_EDITABLE);
}
