-- Agent schema（AGT-FR-004/008/009）：run/artifact/proposal/review/event。
-- 全部对象位于 agent schema；Core 表位于 public schema，agent 角色无权限（AGT-FR-010）。
CREATE SCHEMA IF NOT EXISTS agent;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agent.agent_runs (
  id uuid PRIMARY KEY,
  thread_id uuid NOT NULL UNIQUE,
  workflow_version text NOT NULL,
  input_hash text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'queued',
  current_node text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agent.agent_artifacts (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES agent.agent_runs(id),
  type text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  content jsonb NOT NULL,
  content_hash text NOT NULL,
  source_node text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agent.agent_proposals (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES agent.agent_runs(id),
  base_snapshot_id uuid,
  jurisdiction_code text NOT NULL,
  status text NOT NULL DEFAULT 'generated',
  draft_bundle jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agent.human_reviews (
  id uuid PRIMARY KEY,
  proposal_id uuid NOT NULL REFERENCES agent.agent_proposals(id),
  decision text NOT NULL,
  patch jsonb,
  reason text NOT NULL DEFAULT '',
  actor_id text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS agent.agent_events (
  id uuid PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES agent.agent_runs(id),
  node text NOT NULL,
  event_type text NOT NULL,
  duration_ms integer,
  model text,
  tokens integer,
  trace_id text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS agent_events_run_idx ON agent.agent_events(run_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS agent_artifacts_run_idx ON agent.agent_artifacts(run_id);
