// DSL types matching ssp_rule_dsl.schema.json

export interface RuleDSL {
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
  inputs: DSLInput[];
  parameter_refs: DSLParameterRef[];
  decision_table: DSLDecisionTable;
  outputs: DSLOutput[];
  examples: DSLExample[];
  evidence?: Record<string, unknown>[];
}

export interface DSLInput {
  key: string;
  type: string;
  required: boolean;
  desc?: string;
  enum?: string[];
}

export interface DSLOutput {
  key: string;
  type: string;
  desc?: string;
}

export interface DSLParameterRef {
  param_id: string;
  purpose?: string;
}

export interface DSLDecisionTable {
  hit_policy: "first" | "all";
  rows: DSLDecisionRow[];
}

export interface DSLDecisionRow {
  row_id: string;
  when: Record<string, unknown>;
  then: {
    actions: DSLAction[];
  };
}

export type DSLAction =
  | DSLSetAction
  | DSLLookupAction
  | DSLCallAction
  | DSLEmitQuestionAction
  | DSLEmitWarningAction;

export interface DSLSetAction {
  type: "set";
  path: string;
  value: unknown;
}

export interface DSLLookupAction {
  type: "lookup";
  table_param_id: string;
  key: Record<string, unknown>;
  into: string;
}

export interface DSLCallAction {
  type: "call";
  fn: string;
  args: Record<string, unknown>;
  into: string;
}

export interface DSLEmitQuestionAction {
  type: "emit_question";
  value: {
    question_id: string;
    text: string;
    field?: string;
  };
}

export interface DSLEmitWarningAction {
  type: "emit_warning";
  value: {
    warning_id: string;
    text: string;
  };
}

export interface DSLExample {
  name: string;
  input: Record<string, unknown>;
  params?: Record<string, unknown>;
  expected: Record<string, unknown>;
}
