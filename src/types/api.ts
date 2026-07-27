// API request/response types

import type { UserProfile } from "./user-profile";
import type { EngineResult } from "./engine";
import type { RuleDSL } from "./dsl";
import type { PolicyPack } from "./params";

export interface PlanComputeRequest {
  user_profile: UserProfile;
  policy_pack_id?: string;
  rule_set_id?: string;
  trace?: boolean;
}

export interface PlanComputeResponse {
  success: boolean;
  result?: EngineResult;
  error?: string;
}

export interface TestRunRequest {
  rule_id: string;
  example_name?: string;
  input?: Record<string, unknown>;
  params?: Record<string, unknown>;
  policy_pack_id?: string;
}

export interface TestRunResponse {
  success: boolean;
  rule_id: string;
  example_name?: string;
  passed?: boolean;
  result?: EngineResult;
  expected?: Record<string, unknown>;
  diff?: Record<string, unknown>;
  error?: string;
}

export interface PublishPromoteRequest {
  rule_id?: string;
  rule_set_id?: string;
  target_env: "staging" | "production";
  comment?: string;
}

export interface PublishPromoteResponse {
  success: boolean;
  publish_record_id?: string;
  error?: string;
}

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

export interface RuleDetailResponse {
  rule: RuleDSL;
  policy_pack?: PolicyPack;
}
