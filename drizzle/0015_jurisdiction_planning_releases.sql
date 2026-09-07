-- 任务3（JRP-FR-005/006/007/009，09-05-feature-jurisdiction-aware-planning）：
-- 地区规划发布记录表 + plans 地区留痕列。
-- - jurisdiction_planning_releases：每地区最多一条当前发布记录、一个活动快照；
--   active 必须具有非空快照、激活人、激活时间；状态只允许经 publishing 应用
--   用例修改，禁止直接 SQL 改状态（用例层强制，本迁移只提供结构约束）。
-- - plans：新增 jurisdiction_code / resolved_jurisdiction_path / snapshot_id
--   留痕列（JRP-FR-009）；历史 plan 行保持 NULL，创建后不随活动快照切换变化。
-- 幂等：全部语句 IF NOT EXISTS / DROP IF EXISTS，可重复执行。
-- 不修改历史快照内容与任何既有业务负载。

CREATE TABLE IF NOT EXISTS "jurisdiction_planning_releases" (
  "id" serial PRIMARY KEY NOT NULL,
  "jurisdiction_code" text NOT NULL,
  "active_snapshot_id" uuid,
  "status" text NOT NULL DEFAULT 'inactive',
  "gate_results" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "activated_at" timestamp,
  "activated_by" text,
  "updated_at" timestamp NOT NULL DEFAULT now()
);

ALTER TABLE "jurisdiction_planning_releases" DROP CONSTRAINT IF EXISTS "jurisdiction_planning_releases_active_snapshot_fk";
ALTER TABLE "jurisdiction_planning_releases" ADD CONSTRAINT "jurisdiction_planning_releases_active_snapshot_fk"
  FOREIGN KEY ("active_snapshot_id") REFERENCES "policy_snapshots"("id");

ALTER TABLE "jurisdiction_planning_releases" DROP CONSTRAINT IF EXISTS "jurisdiction_planning_releases_status_check";
ALTER TABLE "jurisdiction_planning_releases" ADD CONSTRAINT "jurisdiction_planning_releases_status_check"
  CHECK ("status" IN ('inactive', 'active'));

-- active 必须携带快照、激活人与激活时间；inactive 允许保留历史快照引用（可回退）。
ALTER TABLE "jurisdiction_planning_releases" DROP CONSTRAINT IF EXISTS "jurisdiction_planning_releases_active_required_check";
ALTER TABLE "jurisdiction_planning_releases" ADD CONSTRAINT "jurisdiction_planning_releases_active_required_check"
  CHECK (
    ("status" = 'active' AND "active_snapshot_id" IS NOT NULL
      AND "activated_at" IS NOT NULL AND "activated_by" IS NOT NULL)
    OR ("status" = 'inactive')
  );

CREATE UNIQUE INDEX IF NOT EXISTS "jurisdiction_planning_releases_jurisdiction_unique"
  ON "jurisdiction_planning_releases" ("jurisdiction_code");

-- NULL 不参与唯一：inactive 记录（无活动快照）可多条；active 快照全局唯一。
CREATE UNIQUE INDEX IF NOT EXISTS "jurisdiction_planning_releases_active_snapshot_unique"
  ON "jurisdiction_planning_releases" ("active_snapshot_id");

ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "jurisdiction_code" text;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "resolved_jurisdiction_path" text;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "snapshot_id" uuid;

ALTER TABLE "plans" DROP CONSTRAINT IF EXISTS "plans_snapshot_id_fk";
ALTER TABLE "plans" ADD CONSTRAINT "plans_snapshot_id_fk"
  FOREIGN KEY ("snapshot_id") REFERENCES "policy_snapshots"("id");
