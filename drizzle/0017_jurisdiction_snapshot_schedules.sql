-- 0017: 快照区间调度（JRP-FR-024/025/026、JRP-AC-004/005/012，ADR-0011）。
-- - jurisdiction_planning_releases 增加 effective_from/effective_to 区间列：
--   每地区可有多条发布记录（撤销0015的每地区唯一索引），active 区间必须
--   闭合定义（effective_from 非空）且同地区 active 区间不得重叠（EXCLUDE）；
-- - plans 增加 snapshot_content_hash（历史重放按 snapshot ID+hash+as_of_date，
--   JRP-FR-014/028）；
-- - 0015/0016 历史 SQL 不在此迁移改写（ADR-0011 决策10）。
-- 幂等：全部 IF NOT EXISTS / DROP ... IF EXISTS / UPDATE 按条件约束，可重复执行。
-- 不修改历史快照内容与任何既有业务负载。

-- 区间列（可空：inactive/历史行无区间语义；active 必须闭合定义）。
ALTER TABLE "jurisdiction_planning_releases" ADD COLUMN IF NOT EXISTS "effective_from" date;
ALTER TABLE "jurisdiction_planning_releases" ADD COLUMN IF NOT EXISTS "effective_to" date;

-- 老的 active 行回填区间：以激活日期为起点，上界开放（历史兼容，幂等）。
UPDATE "jurisdiction_planning_releases"
SET "effective_from" = COALESCE("activated_at"::date, "updated_at"::date)
WHERE "effective_from" IS NULL AND "status" = 'active';

-- active 必须闭合定义：起点非空且终点不早于起点。
ALTER TABLE "jurisdiction_planning_releases" DROP CONSTRAINT IF EXISTS "jurisdiction_planning_releases_effective_range_check";
ALTER TABLE "jurisdiction_planning_releases" ADD CONSTRAINT "jurisdiction_planning_releases_effective_range_check"
  CHECK (
    ("status" <> 'active')
    OR ("effective_from" IS NOT NULL AND ("effective_to" IS NULL OR "effective_to" >= "effective_from"))
  );

-- 每地区允许多条发布记录：撤销 0015 的每地区唯一索引（区间重叠由下方 EXCLUDE 裁决）。
DROP INDEX IF EXISTS "jurisdiction_planning_releases_jurisdiction_unique";

-- 同地区同起始日唯一：upsert/切换按 (jurisdiction_code, effective_from) 定位；
-- NULL（历史 inactive 行）不参与唯一。
CREATE UNIQUE INDEX IF NOT EXISTS "jurisdiction_planning_releases_interval_unique"
  ON "jurisdiction_planning_releases" ("jurisdiction_code", "effective_from");

-- 同地区 active 区间不重叠（JRP-FR-024/JRP-NFR-010）：数据库级 EXCLUDE 约束，
-- 并发激活最多一组成功；无匹配或多匹配均由应用层映射 409 POLICY_SNAPSHOT_UNAVAILABLE。
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE "jurisdiction_planning_releases" DROP CONSTRAINT IF EXISTS "jurisdiction_planning_releases_active_no_overlap";
ALTER TABLE "jurisdiction_planning_releases" ADD CONSTRAINT "jurisdiction_planning_releases_active_no_overlap"
  EXCLUDE USING gist (
    "jurisdiction_code" WITH =,
    daterange("effective_from", "effective_to", '[]') WITH &&
  ) WHERE ("status" = 'active');

-- plans 历史重放 hash（JRP-FR-014/028：按保存的快照 ID/hash/日期重放）。
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "snapshot_content_hash" text;