/**
 * CLG-FR-006 快照重放：用任务2上海候选快照成员（规则+参数）对展示案例input
 * 进行in-memory重放，与expected比较核心结论字段；无未解释差异视为一致。
 *
 * snapshotMembersToReplayInput：把policy_snapshot_members行（entity_type +
 * payload行）转换为orchestrateInMemory可执行的RuleDefinition[]与扁平参数。
 */
import type { RuleDefinition } from "@/types/engine";
import type { ReplayComparison } from "./types";

export interface SnapshotReplayEnv {
  rules: RuleDefinition[];
  params: Record<string, unknown>;
}

/**
 * 快照成员行 → 引擎重放环境。规则行按RuleDefinition字段映射；
 * 参数行按type映射（table/timeline取rows，标量取value）。
 */
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

/** 规范化数字：保留原始值的字符串提取（用于比较退休年龄等文本/数字）。 */
function toComparable(value: unknown): unknown {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    const numeric = Number(trimmed.replace(/[^\d.-]/g, ""));
    if (!Number.isNaN(numeric) && trimmed.replace(/[^\d.-]/g, "").length > 0) {
      return numeric;
    }
    return trimmed;
  }
  return value;
}

/** 日期归一化到月级："2030-02-01" 与 "2030-02" 视为同一月。 */
function toMonthKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!m) return null;
  return `${m[1]}-${m[2]}`;
}

/** 两个月键相差不超过1个月（出生月份默认导致的退休日期偏差）。 */
function monthDiffLe1(a: string, b: string): boolean {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  const diff = Math.abs(ay * 12 + am - (by * 12 + bm));
  return diff <= 1;
}

/** 引擎caveat列表（如出生月份默认C-BIRTH-MONTH-DEFAULT解释日期偏差）。 */
function hasCaveat(calc: Record<string, unknown>, caveatId: string): boolean {
  const caveats = calc.caveats;
  if (!Array.isArray(caveats)) return false;
  return caveats.some(
    (c) => (c as { caveat_id?: string }).caveat_id === caveatId,
  );
}

/**
 * 比较重放结果与expected：只比较重放结果中**存在对应语义**的字段，
 * 且仅在值不一致时记为未解释差异；expected字段在重放中无对应值
 * （如案例叙述数字"37岁开始领失业金"）时跳过，不构成差异（可解释）。
 * 映射顺序：calc顶层 → plan顶层 → calc.retirement嵌套。
 */
export function compareReplayToExpected(
  replayResult: { plan: Record<string, unknown>; calc: Record<string, unknown>; user?: Record<string, unknown> },
  expected: Record<string, unknown>,
): ReplayComparison {
  const differences: string[] = [];
  const retirement = (replayResult.calc.retirement ?? {}) as Record<string, unknown>;

  // retire_age在展示语料中语义混杂（叙述年龄如"37岁开始领失业金"vs法定退休年龄），
  // 不参与嵌套映射；仅retire_date等引擎确定字段参与快照重放验证。
  const RETIREMENT_KEY_MAP: Record<string, string[]> = {
    retire_date: ["legal_retire_date"],
  };

  for (const [key, expectedValue] of Object.entries(expected)) {
    const expectedClean = toComparable(expectedValue);
    if (expectedClean === null || expectedClean === undefined || expectedClean === "") continue;

    // 依次尝试：calc顶层、plan顶层、retirement嵌套（退休年龄/日期）
    const candidates: unknown[] = [replayResult.calc[key], replayResult.plan[key]];
    for (const nestedKey of RETIREMENT_KEY_MAP[key] ?? []) {
      candidates.push(retirement[nestedKey]);
    }
    const actual = candidates.map(toComparable).find((v) => v !== undefined && v !== null);

    // 重放结果无对应语义值：跳过（不可验证，不构成未解释差异）
    if (actual === undefined) continue;
    if (actual !== expectedClean) {
      // 可解释豁免：retire_date差异<=1个月且引擎有出生月份默认caveat
      // （birth_month缺失时默认1月的已知偏差，caveat已提示用户补充月份）
      if (key === "retire_date") {
        const expectedMonth = toMonthKey(expectedValue);
        const actualMonth = toMonthKey(
          candidates.find((v) => toMonthKey(v) !== null),
        );
        if (
          expectedMonth &&
          actualMonth &&
          monthDiffLe1(expectedMonth, actualMonth) &&
          hasCaveat(replayResult.calc, "C-BIRTH-MONTH-DEFAULT")
        ) {
          continue;
        }
      }
      differences.push(`${key}: 期望${String(expectedClean)}, 实际${String(actual)}`);
    }
  }

  return { match: differences.length === 0, differences };
}
