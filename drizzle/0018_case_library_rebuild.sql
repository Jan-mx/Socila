-- 0018: 地区化政策案例库重建Schema（RCL-FR-022、RCL-AC-014，ADR-0011）。
-- - cases/showcase_cases 移除 jurisdiction_code 默认值（地区由生成器显式写入）；
-- - cases/showcase_cases 新增场景/生成元数据/断言/覆盖义务/证据/质量分解/多标签列；
-- - case_archive_batches CHECK 增加 applying（restore_verified→applying→applied）；
-- - case_archive_entries 增加 (batch_id, entity_type, entity_id) 唯一约束。
-- 幂等：全部 IF NOT EXISTS / DROP ... IF EXISTS / 可重复执行。
-- 不修改 0016 历史 SQL（0016 哈希不变）。

-- ─── 移除地区默认值（RCL-FR-012/022：地区只由生成器显式写入）──────────────
ALTER TABLE "cases" ALTER COLUMN "jurisdiction_code" DROP DEFAULT;
ALTER TABLE "showcase_cases" ALTER COLUMN "jurisdiction_code" DROP DEFAULT;

-- ─── cases 重建字段（RCL-FR-006/007/015/017）───────────────────────────────
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "scenario_key" text;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "generator_version" text;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "as_of_date" date;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "snapshot_hash" text;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "coverage_obligations" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "evidence" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "quality_breakdown" jsonb;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "multi_labels" jsonb DEFAULT '[]'::jsonb;
-- RCL-FR-006/018/AC-011：cases 必须保存完整场景事实（input/expected/assertions），
-- apply 时逐字节落库，禁止 null/空对象/空数组占位（2026-09-09复审P0修复）。
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "input" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "expected" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "cases" ADD COLUMN IF NOT EXISTS "assertions" jsonb DEFAULT '[]'::jsonb;

-- ─── showcase_cases 重建字段（RCL-FR-007/015/016/017）─────────────────────
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "scenario_key" text;
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "generator_version" text;
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "as_of_date" date;
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "snapshot_hash" text;
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "coverage_obligations" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "evidence" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "quality_breakdown" jsonb;
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "multi_labels" jsonb DEFAULT '[]'::jsonb;
-- RCL-FR-016：可比较断言（path/operator/value），重放必须实际计算并比对。
ALTER TABLE "showcase_cases" ADD COLUMN IF NOT EXISTS "assertions" jsonb DEFAULT '[]'::jsonb;

-- ─── 批次状态增加 applying（RCL-FR-019）────────────────────────────────────
ALTER TABLE "case_archive_batches" DROP CONSTRAINT IF EXISTS "case_archive_batches_status_check";
ALTER TABLE "case_archive_batches" ADD CONSTRAINT "case_archive_batches_status_check"
  CHECK ("status" IN ('prepared', 'restore_verified', 'applying', 'applied', 'rolled_back'));

-- ─── 归档条目唯一约束（RCL-FR-019：同批次同实体只允许一条）────────────────
DROP INDEX IF EXISTS "case_archive_entries_batch_entity_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "case_archive_entries_batch_entity_unique"
  ON "case_archive_entries" ("archive_batch_id", "entity_type", "entity_id");

-- ─── 归档条目实体类型扩展（RCL-FR-002/019：cases/showcase/tests 三实体）──
ALTER TABLE "case_archive_entries" DROP CONSTRAINT IF EXISTS "case_archive_entries_entity_type_check";
ALTER TABLE "case_archive_entries" ADD CONSTRAINT "case_archive_entries_entity_type_check"
  CHECK ("entity_type" IN ('case', 'showcase_case', 'test'));