/**
 * 实体载荷规范化形状（任务2增量物化，NRP-AC-013增量语义）：
 * - 同一政策的"内容"在Git payload与已落库行之间往返时，必须规范化到同一形状，
 *   增量计划器才能判定"内容未变化→零新增"；
 * - 形状只取物化器写入的业务列（与materialize.insertEntity字段一一对应），
 *   排除版本/状态/基础设施列以及Git文件中的`status`声明（仓库资产一律强制draft）；
 * - 日期统一为 YYYY-MM-DD（node-postgres对date列返回Date，Git文件为字符串）；
 * - 缺省值与insertEntity写入一致（如rule.dsl_version缺省SOCILA-DSL-1.0、
 *   module缺省""、jsonb数组缺省[]），保证往返稳定。
 */
import { canonicalJson, sha256 } from "./target";

export type EntityPayloadKind = "rule" | "param" | "rule_set";

function asDate(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string" && v.length > 0) return v;
  return null;
}

function orNull<T>(v: T | undefined): T | null {
  return v === undefined ? null : v;
}

function orArr(v: unknown): unknown {
  return Array.isArray(v) ? v : [];
}

/** 规则形状：与insertEntity(rule)写入的业务列一致。 */
export function rulePayloadShape(p: Record<string, unknown>): Record<string, unknown> {
  return {
    rule_id: orNull(p.rule_id),
    name: orNull(p.name),
    module: (p.module as string | undefined) ?? "",
    dsl_version: (p.dsl_version as string | undefined) ?? "SOCILA-DSL-1.0",
    priority: (p.priority as number | undefined) ?? 0,
    effective_from: asDate(p.effective_from ?? "2024-01-01"),
    effective_to: asDate(orNull(p.effective_to)),
    supersedes: orArr(p.supersedes),
    inputs: orArr(p.inputs),
    parameter_refs: orArr(p.parameter_refs),
    decision_table: orNull(p.decision_table),
    outputs: orArr(p.outputs),
    examples: orArr(p.examples),
    evidence: orArr(p.evidence),
    notes: orNull(p.notes),
    operation: (p.operation as string | undefined) ?? "add",
    target_business_key: orNull(p.target_business_key),
  };
}

/** 参数形状：与insertEntity(param)写入的业务列一致。 */
export function paramPayloadShape(p: Record<string, unknown>): Record<string, unknown> {
  return {
    param_id: orNull(p.param_id),
    type: (p.type as string | undefined) ?? "number",
    value: orNull(p.value),
    unit: orNull(p.unit),
    effective_from: asDate(p.effective_from ?? "2024-01-01"),
    effective_to: asDate(orNull(p.effective_to)),
    source: orNull(p.source),
    key_fields: orNull(p.key_fields),
    value_fields: orNull(p.value_fields),
    rows: orNull(p.rows),
    note: orNull(p.note),
    evidence: orNull(p.evidence),
    operation: (p.operation as string | undefined) ?? "add",
    target_business_key: orNull(p.target_business_key),
  };
}

/** 规则集形状：与insertEntity(rule_set)写入的业务列一致。 */
export function ruleSetPayloadShape(
  p: Record<string, unknown>,
): Record<string, unknown> {
  return {
    rule_set_id: orNull(p.rule_set_id),
    description: orNull(p.description),
    effective_from: asDate(p.effective_from ?? "2024-01-01"),
    rules: orArr(p.rules),
    conflict_resolution: orNull(p.conflict_resolution),
    operation: (p.operation as string | undefined) ?? "add",
    target_business_key: orNull(p.target_business_key),
  };
}

/** 载荷形状哈希：同一内容（Git侧或落库行侧）必须得到同一哈希。 */
export function payloadShapeHash(
  kind: EntityPayloadKind,
  payload: Record<string, unknown>,
): string {
  const shape =
    kind === "rule"
      ? rulePayloadShape(payload)
      : kind === "param"
        ? paramPayloadShape(payload)
        : ruleSetPayloadShape(payload);
  return sha256(canonicalJson(shape));
}