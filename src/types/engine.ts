// Rule engine types

export interface RuleContext {
  user: Record<string, unknown>;
  params: Record<string, unknown>;
  calc: Record<string, unknown>;
  plan?: Record<string, unknown>;
}

export interface DecisionTable {
  hit_policy: "first" | "all";
  rows: DecisionRow[];
}

export interface DecisionRow {
  row_id: string;
  when: Record<string, unknown>;
  then: {
    actions: Action[];
  };
}

export interface SetAction {
  type: "set";
  path: string;
  value: unknown;
}

export interface LookupAction {
  type: "lookup";
  table_param_id: string;
  key: Record<string, unknown>;
  into: string;
  into_map?: Record<string, string>;
}

export interface CallAction {
  type: "call";
  fn: string;
  args: Record<string, unknown>;
  into: string;
}

export interface EmitQuestionAction {
  type: "emit_question";
  value: {
    question_id: string;
    text: string;
    field?: string;
  };
}

export interface EmitWarningAction {
  type: "emit_warning";
  value: {
    warning_id: string;
    text: string;
  };
}

export interface EmitCaveatAction {
  type: "emit_caveat";
  value: {
    caveat_id: string;
    text: string;
    confidence: "high" | "medium" | "low";
    source?: string;
  };
}

export type Action =
  | SetAction
  | LookupAction
  | CallAction
  | EmitQuestionAction
  | EmitWarningAction
  | EmitCaveatAction;

export interface RuleDefinition {
  dsl_version: string;
  rule_id: string;
  name: string;
  module?: string;
  status: "draft" | "published" | "retired";
  priority: number;
  effective_from: string;
  effective_to?: string | null;
  supersedes?: string[];
  notes?: string;
  inputs: Input[];
  parameter_refs: ParameterRef[];
  decision_table: DecisionTable;
  outputs: Output[];
  examples: Example[];
  evidence?: Record<string, unknown>[];
}

export interface Input {
  key: string;
  type: string;
  required: boolean;
  desc?: string;
  enum?: string[];
}

export interface Output {
  key: string;
  type: string;
  desc?: string;
}

export interface ParameterRef {
  param_id: string;
  purpose?: string;
}

export interface Example {
  name: string;
  input: Record<string, unknown>;
  params?: Record<string, unknown>;
  expected: Record<string, unknown>;
}

export interface TraceEntry {
  rule_id: string;
  row_id: string;
  matched: boolean;
  actions_executed: Action[];
  timestamp?: number;
}

export interface EngineResult {
  context: RuleContext;
  trace: TraceEntry[];
  questions: EmitQuestionAction["value"][];
  warnings: EmitWarningAction["value"][];
  caveats: EmitCaveatAction["value"][];
  needs_agent: boolean;
}
