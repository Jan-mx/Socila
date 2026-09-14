-- NRP-FR-007 显式overlay操作（09-05 Stage 国家baseline及广东四川权威overlay）：
-- 规则、参数、规则集三张政策实体表增加 operation 与 target_business_key 列，
-- 并以CHECK约束强制PRD §7不变量：
--   1) CN实体只能使用baseline，地区实体不能使用baseline；
--   2) replace/restrict/exempt必须携带目标业务键，baseline/add不得携带；
--   3) 操作枚举封闭为 baseline/add/replace/restrict/exempt。
-- 存量行全部为上海add实体（09-05 SDL后生产Seed无粤川示例），默认'add'语义正确；
-- 防御性UPDATE把假想的CN 'add'行规范化为'baseline'后再加约束。
-- 幂等：全部语句使用 IF NOT EXISTS / DROP IF EXISTS，可重复执行。
-- 不得改写任何published业务负载、引用或有效期。

ALTER TABLE "rules" ADD COLUMN IF NOT EXISTS "operation" text NOT NULL DEFAULT 'add';
ALTER TABLE "rules" ADD COLUMN IF NOT EXISTS "target_business_key" text;
UPDATE "rules" SET "operation" = 'baseline' WHERE "jurisdiction_code" = 'CN' AND "operation" = 'add';
ALTER TABLE "rules" DROP CONSTRAINT IF EXISTS "rules_operation_check";
ALTER TABLE "rules" ADD CONSTRAINT "rules_operation_check"
  CHECK ("operation" IN ('baseline', 'add', 'replace', 'restrict', 'exempt'));
ALTER TABLE "rules" DROP CONSTRAINT IF EXISTS "rules_jurisdiction_operation_check";
ALTER TABLE "rules" ADD CONSTRAINT "rules_jurisdiction_operation_check"
  CHECK (
    ("jurisdiction_code" = 'CN' AND "operation" = 'baseline')
    OR ("jurisdiction_code" IS DISTINCT FROM 'CN' AND "operation" <> 'baseline')
  );
ALTER TABLE "rules" DROP CONSTRAINT IF EXISTS "rules_overlay_target_check";
ALTER TABLE "rules" ADD CONSTRAINT "rules_overlay_target_check"
  CHECK (
    ("operation" IN ('replace', 'restrict', 'exempt') AND "target_business_key" IS NOT NULL)
    OR ("operation" IN ('baseline', 'add') AND "target_business_key" IS NULL)
  );

ALTER TABLE "params" ADD COLUMN IF NOT EXISTS "operation" text NOT NULL DEFAULT 'add';
ALTER TABLE "params" ADD COLUMN IF NOT EXISTS "target_business_key" text;
UPDATE "params" SET "operation" = 'baseline' WHERE "jurisdiction_code" = 'CN' AND "operation" = 'add';
ALTER TABLE "params" DROP CONSTRAINT IF EXISTS "params_operation_check";
ALTER TABLE "params" ADD CONSTRAINT "params_operation_check"
  CHECK ("operation" IN ('baseline', 'add', 'replace', 'restrict', 'exempt'));
ALTER TABLE "params" DROP CONSTRAINT IF EXISTS "params_jurisdiction_operation_check";
ALTER TABLE "params" ADD CONSTRAINT "params_jurisdiction_operation_check"
  CHECK (
    ("jurisdiction_code" = 'CN' AND "operation" = 'baseline')
    OR ("jurisdiction_code" IS DISTINCT FROM 'CN' AND "operation" <> 'baseline')
  );
ALTER TABLE "params" DROP CONSTRAINT IF EXISTS "params_overlay_target_check";
ALTER TABLE "params" ADD CONSTRAINT "params_overlay_target_check"
  CHECK (
    ("operation" IN ('replace', 'restrict', 'exempt') AND "target_business_key" IS NOT NULL)
    OR ("operation" IN ('baseline', 'add') AND "target_business_key" IS NULL)
  );

ALTER TABLE "rule_sets" ADD COLUMN IF NOT EXISTS "operation" text NOT NULL DEFAULT 'add';
ALTER TABLE "rule_sets" ADD COLUMN IF NOT EXISTS "target_business_key" text;
UPDATE "rule_sets" SET "operation" = 'baseline' WHERE "jurisdiction_code" = 'CN' AND "operation" = 'add';
ALTER TABLE "rule_sets" DROP CONSTRAINT IF EXISTS "rule_sets_operation_check";
ALTER TABLE "rule_sets" ADD CONSTRAINT "rule_sets_operation_check"
  CHECK ("operation" IN ('baseline', 'add', 'replace', 'restrict', 'exempt'));
ALTER TABLE "rule_sets" DROP CONSTRAINT IF EXISTS "rule_sets_jurisdiction_operation_check";
ALTER TABLE "rule_sets" ADD CONSTRAINT "rule_sets_jurisdiction_operation_check"
  CHECK (
    ("jurisdiction_code" = 'CN' AND "operation" = 'baseline')
    OR ("jurisdiction_code" IS DISTINCT FROM 'CN' AND "operation" <> 'baseline')
  );
ALTER TABLE "rule_sets" DROP CONSTRAINT IF EXISTS "rule_sets_overlay_target_check";
ALTER TABLE "rule_sets" ADD CONSTRAINT "rule_sets_overlay_target_check"
  CHECK (
    ("operation" IN ('replace', 'restrict', 'exempt') AND "target_business_key" IS NOT NULL)
    OR ("operation" IN ('baseline', 'add') AND "target_business_key" IS NULL)
  );
