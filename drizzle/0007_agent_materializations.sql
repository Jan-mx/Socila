-- 步骤06.7（DRF-FR-013/014）：Agent DraftBundle 幂等物化台账。
-- idempotency_key 全局唯一——重复物化按键返回首次结果（AC-005）。
CREATE TABLE IF NOT EXISTS agent_materializations (
  idempotency_key text PRIMARY KEY,
  proposal_id text NOT NULL,
  run_id text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  draft_ids jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS agent_materializations_proposal_idx ON agent_materializations(proposal_id);
