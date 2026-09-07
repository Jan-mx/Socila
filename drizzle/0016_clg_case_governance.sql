-- 0016: 案例库治理Schema（CLG-FR-002/003/004/013，09-05-feature-case-library-governance）
-- - cases: 地区/内容哈希/质量分/质量状态/原因/治理时间；
-- - showcase_cases: 地区/来源案例UID/候选快照ID/质量信息/内容哈希/策展时间/策展人；
-- - tests: source_case_uid（500条回归回填，28条规则示例允许为空）；
-- - 归档元数据表 case_archive_batches / case_archive_entries（只存UID/哈希/原因，不复制正文）。
-- 幂等：全部 IF NOT EXISTS / DROP CONSTRAINT IF EXISTS，可重复执行。

-- ─── cases 治理字段（CLG-FR-002）───────────────────────────────────────────
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "jurisdiction_code" text DEFAULT '310000';
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "content_hash" text;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "quality_score" integer;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "quality_status" text;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "governance_reason" text;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "governed_at" timestamp(3) with time zone;

ALTER TABLE "cases" DROP CONSTRAINT IF EXISTS "cases_quality_status_check";
ALTER TABLE "cases" ADD CONSTRAINT "cases_quality_status_check"
  CHECK ("quality_status" IN ('eligible', 'active', 'archive_candidate', 'quarantined'));

CREATE INDEX IF NOT EXISTS "cases_jurisdiction_quality_status_idx"
  ON "cases" ("jurisdiction_code", "quality_status");
CREATE INDEX IF NOT EXISTS "cases_content_hash_idx" ON "cases" ("content_hash");

-- ─── showcase_cases 治理字段（CLG-FR-003）──────────────────────────────────
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "jurisdiction_code" text DEFAULT '310000';
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "source_case_uid" text;
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "snapshot_id" uuid;
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "quality_score" integer;
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "quality_status" text;
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "content_hash" text;
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "curated_at" timestamp(3) with time zone;
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "curated_by" text;

ALTER TABLE "showcase_cases" DROP CONSTRAINT IF EXISTS "showcase_cases_quality_status_check";
ALTER TABLE "showcase_cases" ADD CONSTRAINT "showcase_cases_quality_status_check"
  CHECK ("quality_status" IN ('selected', 'archive_candidate', 'quarantined'));

-- 展示案例绑定任务2上海候选快照（CLG-FR-003：候选快照ID）；快照不可变，
-- RESTRICT 防止引用中的快照被删除。
ALTER TABLE "showcase_cases" DROP CONSTRAINT IF EXISTS "showcase_cases_snapshot_id_fkey";
ALTER TABLE "showcase_cases" ADD CONSTRAINT "showcase_cases_snapshot_id_fkey"
  FOREIGN KEY ("snapshot_id") REFERENCES "policy_snapshots" ("id") ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS "showcase_cases_quality_status_idx"
  ON "showcase_cases" ("quality_status");
CREATE INDEX IF NOT EXISTS "showcase_cases_source_case_uid_idx"
  ON "showcase_cases" ("source_case_uid");
CREATE INDEX IF NOT EXISTS "showcase_cases_snapshot_id_idx"
  ON "showcase_cases" ("snapshot_id");

-- ─── tests 来源链（CLG-FR-004）──────────────────────────────────────────────
ALTER TABLE "tests" ADD COLUMN IF NOT EXISTS "source_case_uid" text;
CREATE INDEX IF NOT EXISTS "tests_source_case_uid_idx" ON "tests" ("source_case_uid");

-- ─── 归档元数据表（CLG-FR-011/013）──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "case_archive_batches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "status" text NOT NULL,
  "source_counts" jsonb NOT NULL,
  "retained_counts" jsonb NOT NULL,
  "deleted_counts" jsonb NOT NULL,
  "table_hashes" jsonb NOT NULL DEFAULT '{}',
  "manifest_hash" text NOT NULL,
  "storage_path" text NOT NULL,
  "created_at" timestamp(3) with time zone NOT NULL DEFAULT now(),
  "created_by" text NOT NULL
);

ALTER TABLE "case_archive_batches" DROP CONSTRAINT IF EXISTS "case_archive_batches_status_check";
ALTER TABLE "case_archive_batches" ADD CONSTRAINT "case_archive_batches_status_check"
  CHECK ("status" IN ('prepared', 'restore_verified', 'applied', 'rolled_back'));

-- 同一manifest只能有一个可执行批次（prepared批次可被新批次替代）。
CREATE UNIQUE INDEX IF NOT EXISTS "case_archive_batches_manifest_hash_active_idx"
  ON "case_archive_batches" ("manifest_hash")
  WHERE "status" IN ('restore_verified', 'applied');

CREATE TABLE IF NOT EXISTS "case_archive_entries" (
  "id" serial PRIMARY KEY,
  "archive_batch_id" uuid NOT NULL
    REFERENCES "case_archive_batches" ("id") ON DELETE CASCADE,
  "entity_type" text NOT NULL,
  "entity_id" integer NOT NULL,
  "case_uid" text,
  "content_hash" text NOT NULL,
  "archive_reason" text NOT NULL
);

ALTER TABLE "case_archive_entries" DROP CONSTRAINT IF EXISTS "case_archive_entries_entity_type_check";
ALTER TABLE "case_archive_entries" ADD CONSTRAINT "case_archive_entries_entity_type_check"
  CHECK ("entity_type" IN ('case', 'showcase_case'));

CREATE INDEX IF NOT EXISTS "case_archive_entries_batch_idx"
  ON "case_archive_entries" ("archive_batch_id");
