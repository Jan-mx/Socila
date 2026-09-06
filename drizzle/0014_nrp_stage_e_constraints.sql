-- 审查缺陷11（NRP-FR-019/NRP-AC-014）：物化批次与成员的约束强化。
-- - 批次(jurisdiction_code, manifest_hash)唯一：并发apply只允许一个事务成功；
-- - 成员唯一(batch_id, entity_type, business_key, version)与entity_type CHECK：
--   不得生成重复draft版本或部分批次；
-- - status/readiness枚举CHECK（status含'repaired'用于包快照修复审计）。
-- 幂等：IF NOT EXISTS / DROP IF EXISTS，可重复执行。

CREATE UNIQUE INDEX IF NOT EXISTS "policy_import_batches_jurisdiction_manifest_idx"
  ON "policy_import_batches" ("jurisdiction_code", "manifest_hash");

ALTER TABLE "policy_import_batches" DROP CONSTRAINT IF EXISTS "policy_import_batches_status_check";
ALTER TABLE "policy_import_batches" ADD CONSTRAINT "policy_import_batches_status_check"
  CHECK ("status" IN ('prepared', 'applied', 'verified', 'failed', 'repaired'));

ALTER TABLE "policy_import_batches" DROP CONSTRAINT IF EXISTS "policy_import_batches_readiness_check";
ALTER TABLE "policy_import_batches" ADD CONSTRAINT "policy_import_batches_readiness_check"
  CHECK ("readiness" IN ('awaiting_approval', 'blocked'));

CREATE UNIQUE INDEX IF NOT EXISTS "policy_import_batch_members_unique_idx"
  ON "policy_import_batch_members" ("batch_id", "entity_type", "business_key", "version");

ALTER TABLE "policy_import_batch_members" DROP CONSTRAINT IF EXISTS "policy_import_batch_members_entity_type_check";
ALTER TABLE "policy_import_batch_members" ADD CONSTRAINT "policy_import_batch_members_entity_type_check"
  CHECK ("entity_type" IN ('rule', 'param', 'rule_set', 'policy_pack_version'));
