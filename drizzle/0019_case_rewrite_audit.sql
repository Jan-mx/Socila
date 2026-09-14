-- 0019: V1→V2受控原位改写审计结构（WI-20260911-03、SHV2-FR-017、SHV2-AC-014）。
-- 只创建审计表：case_rewrite_batches（一次改写计划的完整绑定与指纹）与
-- case_rewrite_entries（108行逐条before/after与hash链）。不在migration中更新
-- cases/showcase_cases/tests任何业务数据（SHV2-FR-017：纯Schema迁移）。
-- 幂等：全部IF NOT EXISTS / DROP ... IF EXISTS，可重复执行。
-- 外键不级联删除历史审计（删除批次前必须先清空entries）。

-- ─── 改写批次（plan_hash唯一；一次受控计划恰好一行）────────────────────────
CREATE TABLE IF NOT EXISTS "case_rewrite_batches" (
  "id" uuid PRIMARY KEY,
  "plan_hash" text NOT NULL,
  "code_sha" text NOT NULL,
  "source_fingerprint" text NOT NULL,
  "target_fingerprint" text NOT NULL,
  "final_fingerprint" text NOT NULL,
  "source_generator_version" text NOT NULL,
  "target_generator_version" text NOT NULL,
  "source_manifest" jsonb NOT NULL,
  "source_attestation" text NOT NULL,
  "snapshot_bindings" jsonb NOT NULL,
  "row_counts" jsonb NOT NULL,
  "status" text NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "applied_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "case_rewrite_batches_plan_hash_unique" UNIQUE ("plan_hash"),
  CONSTRAINT "case_rewrite_batches_code_sha_shape" CHECK ("code_sha" ~ '^[0-9a-f]{40,64}$'),
  CONSTRAINT "case_rewrite_batches_fingerprint_shape" CHECK (
    "source_fingerprint" ~ '^[0-9a-f]{64}$'
    AND "target_fingerprint" ~ '^[0-9a-f]{64}$'
    AND "final_fingerprint" ~ '^[0-9a-f]{64}$'
    AND "source_attestation" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "case_rewrite_batches_status_check" CHECK ("status" IN ('applied'))
);

-- ─── 改写条目（batch+实体唯一；新旧UID/hash/快照hash/evidence hash与完整前后JSON）──
CREATE TABLE IF NOT EXISTS "case_rewrite_entries" (
  "id" bigserial PRIMARY KEY,
  "batch_id" uuid NOT NULL REFERENCES "case_rewrite_batches"("id"),
  "entity_type" text NOT NULL,
  "entity_id" integer NOT NULL,
  "old_uid" text,
  "new_uid" text NOT NULL,
  "old_content_hash" text NOT NULL,
  "new_content_hash" text NOT NULL,
  "old_snapshot_hash" text,
  "new_snapshot_hash" text NOT NULL,
  "evidence_hash" text NOT NULL,
  "before" jsonb NOT NULL,
  "after" jsonb NOT NULL,
  CONSTRAINT "case_rewrite_entries_entity_unique" UNIQUE ("batch_id", "entity_type", "entity_id"),
  CONSTRAINT "case_rewrite_entries_entity_type_check" CHECK ("entity_type" IN ('case', 'showcase_case', 'test')),
  CONSTRAINT "case_rewrite_entries_hash_shape" CHECK (
    "old_content_hash" ~ '^[0-9a-f]{64}$'
    AND "new_content_hash" ~ '^[0-9a-f]{64}$'
    AND "new_snapshot_hash" ~ '^[0-9a-f]{64}$'
    AND "evidence_hash" ~ '^[0-9a-f]{64}$'
    AND ("old_snapshot_hash" IS NULL OR "old_snapshot_hash" ~ '^[0-9a-f]{64}$')
  )
);

CREATE INDEX IF NOT EXISTS "case_rewrite_entries_batch_idx" ON "case_rewrite_entries" ("batch_id");
