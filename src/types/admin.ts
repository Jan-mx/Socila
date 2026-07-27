// Admin types

export interface RuleListItem {
  rule_id: string;
  name: string;
  module?: string;
  status: "draft" | "published" | "retired";
  priority: number;
  effective_from: string;
  effective_to?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ParamListItem {
  param_id: string;
  policy_pack_id: string;
  type: "number" | "boolean" | "string" | "array" | "table" | "timeline";
  value?: unknown;
  unit?: string;
  effective_from?: string;
  source?: string;
  created_at?: string;
  updated_at?: string;
}

export interface RuleSetListItem {
  rule_set_id: string;
  name: string;
  description?: string;
  rule_ids: string[];
  status: "draft" | "published" | "retired";
  created_at?: string;
  updated_at?: string;
}

export interface PublishRecord {
  publish_record_id: string;
  rule_id?: string;
  rule_set_id?: string;
  target_env: "staging" | "production";
  status: "pending" | "success" | "failed";
  comment?: string;
  published_by?: string;
  published_at?: string;
  created_at?: string;
}

export interface TestResult {
  test_result_id: string;
  rule_id: string;
  example_name?: string;
  passed: boolean;
  input?: Record<string, unknown>;
  expected?: Record<string, unknown>;
  actual?: Record<string, unknown>;
  diff?: Record<string, unknown>;
  error?: string;
  run_at?: string;
}
