/**
 * RCL-FR-016、RCL-AC-006 快照重放（可比较断言）：
 * 场景携带显式断言（path/operator/value），重放必须对**至少一个**声明断言
 * 实际计算并比对——全部断言都不可比（路径不存在/operator不支持/空列表）
 * → 重放失败，不得获得重放分（修复旧实现"无可比expected仍判match"的P1缺陷）。
 *
 * snapshotMembersToReplayInput：把 policy_snapshot_members 行转换为
 * orchestrateInMemory 可执行的 RuleDefinition[] 与扁平参数。
 */
import type { RuleDefinition } from "@/types/engine";

export interface ScenarioAssertion {
  path: string;
  operator: "eq" | "contains" | "is_null";
  value?: unknown;
}

export interface ReplayComparison {
  match: boolean;
  differences: string[];
  /** 实际可比对并执行的断言数（至少1才算可比较重放）。 */
  comparableAssertions: number;
  /** 无可比较断言时的稳定原因。 */
  reason?: string;
}

export interface SnapshotReplayEnv {
  rules: RuleDefinition[];
  params: Record<string, unknown>;
}

/** 快照成员行 → 引擎重放环境。 */
export function snapshotMembersToReplayInput(
  members: Array<{ entity_type: string; payload: unknown }>,
): SnapshotReplayEnv {
  const rules: RuleDefinition[] = [];
  const params: Record<string, unknown> = {};

  for (const member of members) {
    const payload = member.payload as Record<string, unknown>;
    if (member.entity_type === "rule") {
      const definition = rowToRuleDefinition(payload);
      if (definition) rules.push(definition);
    } else if (member.entity_type === "param") {
      const type = String(payload.type ?? "");
      const paramId = String(payload.param_id ?? payload.paramId ?? "");
      if (!paramId) continue;
      if (type === "table" || type === "timeline") {
        params[paramId] = payload.rows ?? [];
      } else {
        params[paramId] = payload.value ?? null;
      }
    }
  }
  return { rules, params };
}

function rowToRuleDefinition(row: Record<string, unknown>): RuleDefinition | null {
  const ruleId = String(row.rule_id ?? row.ruleId ?? "");
  if (!ruleId) return null;
  return {
    dsl_version: String(row.dsl_version ?? row.dslVersion ?? "SOCILA-DSL-1.0"),
    rule_id: ruleId,
    name: String(row.name ?? ruleId),
    module: row.module ? String(row.module) : undefined,
    status: (row.status as RuleDefinition["status"]) ?? "published",
    priority: typeof row.priority === "number" ? row.priority : 0,
    effective_from: String(row.effective_from ?? row.effectiveFrom ?? ""),
    effective_to: (row.effective_to ?? row.effectiveTo ?? null) as string | null,
    supersedes: (row.supersedes ?? []) as string[],
    notes: row.notes ? String(row.notes) : undefined,
    inputs: (row.inputs ?? []) as RuleDefinition["inputs"],
    parameter_refs: (row.parameter_refs ?? row.parameterRefs ?? []) as RuleDefinition["parameter_refs"],
    decision_table: (row.decision_table ?? row.decisionTable ?? {}) as RuleDefinition["decision_table"],
    outputs: (row.outputs ?? []) as RuleDefinition["outputs"],
    examples: (row.examples ?? []) as RuleDefinition["examples"],
    evidence: (row.evidence ?? undefined) as RuleDefinition["evidence"],
  };
}

/** 按路径取值（calc.retirement.legal_retire_date → 嵌套查找）。 */
function getByPath(root: Record<string, unknown>, path: string): unknown {
  let acc: unknown = root;
  for (const key of path.split(".")) {
    if (acc === null || acc === undefined || typeof acc !== "object") return undefined;
    acc = (acc as Record<string, unknown>)[key];
  }
  return acc;
}

/** 数值与字符串相互归一化比较（引擎输出 2412 与断言 2412 一致；"60" 与 60 一致）。 */
function comparable(value: unknown): unknown {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    const numeric = Number(trimmed);
    if (trimmed !== "" && !Number.isNaN(numeric)) return numeric;
    return trimmed;
  }
  return value;
}

/**
 * 断言重放：至少一个断言必须实际计算并比对（RCL-FR-016）。
 * - eq：路径值（数值归一化）等于断言值；
 * - contains：路径值（数组或字符串）包含断言值；
 * - is_null：路径值为 null 或 undefined。
 * 全部断言不可比 → match=false + reason="无可比较断言"。
 */
export function compareReplayWithAssertions(
  replayResult: { plan: Record<string, unknown>; calc: Record<string, unknown>; user?: Record<string, unknown> },
  assertions: ScenarioAssertion[],
): ReplayComparison {
  const differences: string[] = [];
  let comparableAssertions = 0;

  for (const assertion of assertions) {
    const actual = getByPath(replayResult, assertion.path);
    if (actual === undefined) continue; // 该断言不可比，跳过。

    comparableAssertions++;
    let ok = false;
    switch (assertion.operator) {
      case "eq":
        ok = comparable(actual) === comparable(assertion.value);
        break;
      case "contains":
        if (Array.isArray(actual)) {
          ok = actual.some((item) => comparable(item) === comparable(assertion.value));
        } else if (typeof actual === "string") {
          ok = actual.includes(String(assertion.value ?? ""));
        } else {
          ok = false;
        }
        break;
      case "is_null":
        ok = actual === null || actual === undefined;
        break;
      default:
        comparableAssertions--; // 不支持的operator不计入可比断言
        continue;
    }
    if (!ok) {
      differences.push(
        `${assertion.path}: 期望 ${assertion.operator}(${JSON.stringify(assertion.value)})，实际 ${JSON.stringify(actual)}`,
      );
    }
  }

  if (comparableAssertions === 0) {
    return {
      match: false,
      differences: [],
      comparableAssertions: 0,
      reason: "无可比较断言：断言列表为空或全部路径在重放结果中不存在（RCL-FR-016）",
    };
  }
  return { match: differences.length === 0, differences, comparableAssertions };
}
