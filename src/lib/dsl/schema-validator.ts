import Ajv from "ajv";
import addFormats from "ajv-formats";
import { rules } from "@/lib/db/schema";
import ruleDslSchema from "../../../dsl/protocol/socila_dsl_v1/schema/socila_rule_dsl.schema.json";

/**
 * DSL JSON-Schema 校验。
 *
 * 此前发布门禁和 validate 路由只做 `ruleId && name && rows.length>0` 的浅检查，
 * 而项目里的 `ajv` + 完整 JSON-Schema（`dsl/protocol/socila_dsl_v1/schema/*.json`）从未被引用。
 * 本模块把 schema 真正接到 ajv 上，让畸形规则（缺字段、hit_policy 非法、行缺 when/then 等）
 * 在进 staging / production 前被拦下。
 */

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const validateRuleFn = ajv.compile(ruleDslSchema as object);

/**
 * DSL schema 里 status 的合法取值。发布流水线还会把 DB status 写成 "staging" 等
 * 生命周期状态——它与 DSL 的"结构是否合法"正交，不应让结构校验因生命周期状态而误判。
 */
const SCHEMA_RULE_STATUSES = new Set(["draft", "published", "retired"]);

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

type DbRuleRow = typeof rules.$inferSelect;

/**
 * 校验一条 DB 规则行是否符合 Socila Rule DSL JSON-Schema。
 * DB 用 camelCase，DSL/Schema 用 snake_case —— 这里做一次形态转换后再校验。
 */
export function validateRuleAgainstSchema(
  rule: DbRuleRow,
): SchemaValidationResult {
  const dsl: Record<string, unknown> = {
    dsl_version: rule.dslVersion,
    rule_id: rule.ruleId,
    name: rule.name,
    module: rule.module,
    // 生命周期状态（如 staging）映射回 DSL 合法值，避免结构校验被生命周期状态误伤。
    status: SCHEMA_RULE_STATUSES.has(rule.status) ? rule.status : "draft",
    priority: rule.priority,
    effective_from: rule.effectiveFrom,
    supersedes: rule.supersedes ?? [],
    inputs: rule.inputs ?? [],
    parameter_refs: rule.parameterRefs ?? [],
    decision_table: rule.decisionTable,
    outputs: rule.outputs ?? [],
    examples: rule.examples ?? [],
    evidence: rule.evidence ?? [],
  };
  if (rule.effectiveTo) dsl.effective_to = rule.effectiveTo;
  if (rule.notes) dsl.notes = rule.notes;

  const ok = validateRuleFn(dsl);
  return {
    valid: Boolean(ok),
    errors: (validateRuleFn.errors ?? []).map(
      (e) => `${e.instancePath || "(root)"}: ${e.message ?? "invalid"}`,
    ),
  };
}
