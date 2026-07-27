/**
 * 从引擎 ctx.calc 中抽取结构化结果。
 *
 * 引擎在执行 emit_question / emit_warning / emit_caveat 动作时，把内容写入
 * `ctx.calc.agent_questions` / `ctx.calc.warnings` / `ctx.calc.caveats`
 * （见 `engine/actions.ts`），而**不是** trace。trace 只记录"哪条规则的哪一行命中"。
 *
 * 历史上 `ai/tools.ts` 误从 `trace.actions` 读取（该字段在引擎 trace 上根本不存在），
 * 导致 needs_agent 恒为 false、questions/warnings 恒为空。这里把抽取逻辑收敛为纯函数，
 * 既供 `plan-service` 复用，也便于单测覆盖。
 */

export interface AgentQuestion {
  question_id: string;
  field: string;
  label: string;
  hint?: string;
  options?: { value: string; label: string }[];
}

export interface Caveat {
  caveat_id: string;
  text: string;
  confidence: "high" | "medium" | "low";
  source?: string;
}

/**
 * 是否仍需追问用户。等价于「calc.agent_questions 非空」，并兼容规则显式写入的
 * `calc.needs_agent === true` 标记。
 */
export function extractNeedsAgent(calc: Record<string, unknown>): boolean {
  if (!calc) return false;
  const questions = calc.agent_questions;
  if (Array.isArray(questions) && questions.length > 0) return true;
  return calc.needs_agent === true;
}

export function extractQuestions(
  calc: Record<string, unknown>,
): AgentQuestion[] {
  if (!calc || !Array.isArray(calc.agent_questions)) return [];

  return (calc.agent_questions as Array<Record<string, unknown>>).map((q) => ({
    question_id: String(q.question_id ?? q.id ?? ""),
    field: String(q.field ?? ""),
    label: String(q.label ?? q.question ?? q.text ?? ""),
    hint: q.hint ? String(q.hint) : undefined,
    options: Array.isArray(q.options)
      ? (q.options as Array<{ value: string; label: string }>)
      : undefined,
  }));
}

export function extractWarnings(calc: Record<string, unknown>): string[] {
  if (!calc || !Array.isArray(calc.warnings)) return [];

  return (calc.warnings as unknown[]).map((warning) => {
    if (typeof warning === "string") return warning;
    if (
      typeof warning === "object" &&
      warning !== null &&
      "text" in warning &&
      typeof (warning as { text?: unknown }).text === "string"
    ) {
      return (warning as { text: string }).text;
    }
    return String(warning);
  });
}

export function extractCaveats(calc: Record<string, unknown>): Caveat[] {
  if (!calc || !Array.isArray(calc.caveats)) return [];
  return calc.caveats as Caveat[];
}
