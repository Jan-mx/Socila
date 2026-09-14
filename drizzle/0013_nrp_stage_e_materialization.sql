-- 09-05 Stage 阶段E（NRP-FR-017～022、NRP-NFR-009～012、NRP-AC-011～016）：
-- 权威资产受控物化所需的审计结构、参数证据列与发布地区身份。
-- 只新增结构，不改写任何既有行（NRP-FR-018：published实体不得原地修改）。
-- 幂等：全部语句使用 IF NOT EXISTS，可重复执行。

-- 1) 参数证据（NRP-FR-020）：params保存完整结构化evidence（document_id、
--    artifact、content_sha256、locator、excerpt等），与规则负载中的evidence对齐。
ALTER TABLE "params" ADD COLUMN IF NOT EXISTS "evidence" jsonb;

-- 2) 物化批次审计（NRP-FR-019 / PRD §7 PolicyImportBatch）：
--    按地区记录manifest哈希、来源提交、非敏感目标指纹、实体计数、
--    就绪状态、阻断原因、操作者与时间。不得存储连接串、口令或完整URL。
CREATE TABLE IF NOT EXISTS "policy_import_batches" (
  "id" serial PRIMARY KEY,
  "jurisdiction_code" text NOT NULL,
  "manifest_hash" text NOT NULL,
  "source_commit" text NOT NULL,
  "target_fingerprint" text NOT NULL,
  "status" text NOT NULL DEFAULT 'prepared',
  "readiness" text NOT NULL,
  "blocking_reasons" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "entity_counts" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "actor" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- 3) 批次成员（PRD §7 PolicyImportBatchMember）：实体类型、行ID、业务键、
--    版本与内容哈希，回溯每次物化写入的具体行。
CREATE TABLE IF NOT EXISTS "policy_import_batch_members" (
  "id" serial PRIMARY KEY,
  "batch_id" integer NOT NULL REFERENCES "policy_import_batches"("id"),
  "entity_type" text NOT NULL,
  "entity_row_id" integer NOT NULL,
  "business_key" text NOT NULL,
  "version" integer NOT NULL,
  "content_hash" text NOT NULL
);
CREATE INDEX IF NOT EXISTS "policy_import_batch_members_batch_idx"
  ON "policy_import_batch_members" ("batch_id");

-- 4) 发布流水线地区身份（NRP-FR-021）：历史发布记录允许地区与版本为空；
--    新发布记录必须完整携带jurisdiction_code与entity_version（由服务层强制）。
ALTER TABLE "publishes" ADD COLUMN IF NOT EXISTS "jurisdiction_code" text;
ALTER TABLE "publishes" ADD COLUMN IF NOT EXISTS "entity_version" integer;
