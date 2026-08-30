-- 步骤03.2 版本化政策实体（POL-FR-003～006）：地区归属、业务键、有效期约束。
-- 现有行全部属于上海overlay（03.7正式迁移前先归位），business_key 初始等于业务标识。
ALTER TABLE "rules" ADD COLUMN IF NOT EXISTS "jurisdiction_code" text;
--> statement-breakpoint
ALTER TABLE "rules" ADD COLUMN IF NOT EXISTS "business_key" text;
--> statement-breakpoint
UPDATE "rules" SET "jurisdiction_code" = '310000', "business_key" = "rule_id" WHERE "jurisdiction_code" IS NULL;
--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_jurisdiction_fk" FOREIGN KEY ("jurisdiction_code") REFERENCES "jurisdictions"("code");
--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_interval_check" CHECK ("effective_to" IS NULL OR "effective_from" <= "effective_to");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rules_jurisdiction_bizkey_version_idx" ON "rules" ("jurisdiction_code", "business_key", "version");
--> statement-breakpoint
ALTER TABLE "params" ADD COLUMN IF NOT EXISTS "jurisdiction_code" text;
--> statement-breakpoint
ALTER TABLE "params" ADD COLUMN IF NOT EXISTS "business_key" text;
--> statement-breakpoint
ALTER TABLE "params" ADD COLUMN IF NOT EXISTS "effective_to" date;
--> statement-breakpoint
UPDATE "params" SET "jurisdiction_code" = '310000', "business_key" = "param_id" WHERE "jurisdiction_code" IS NULL;
--> statement-breakpoint
ALTER TABLE "params" ADD CONSTRAINT "params_jurisdiction_fk" FOREIGN KEY ("jurisdiction_code") REFERENCES "jurisdictions"("code");
--> statement-breakpoint
ALTER TABLE "params" ADD CONSTRAINT "params_interval_check" CHECK ("effective_to" IS NULL OR "effective_from" <= "effective_to");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "params_jurisdiction_bizkey_version_idx" ON "params" ("jurisdiction_code", "business_key", "version");
--> statement-breakpoint
ALTER TABLE "rule_sets" ADD COLUMN IF NOT EXISTS "jurisdiction_code" text;
--> statement-breakpoint
UPDATE "rule_sets" SET "jurisdiction_code" = '310000' WHERE "jurisdiction_code" IS NULL;
--> statement-breakpoint
ALTER TABLE "rule_sets" ADD CONSTRAINT "rule_sets_jurisdiction_fk" FOREIGN KEY ("jurisdiction_code") REFERENCES "jurisdictions"("code");
--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN IF NOT EXISTS "jurisdiction_code" text;
--> statement-breakpoint
UPDATE "tests" SET "jurisdiction_code" = '310000' WHERE "jurisdiction_code" IS NULL;
--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_jurisdiction_fk" FOREIGN KEY ("jurisdiction_code") REFERENCES "jurisdictions"("code");
--> statement-breakpoint
ALTER TABLE "policy_pack_versions" ADD COLUMN IF NOT EXISTS "jurisdiction_code" text;
--> statement-breakpoint
ALTER TABLE "policy_pack_versions" ADD COLUMN IF NOT EXISTS "pack_kind" text;
--> statement-breakpoint
UPDATE "policy_pack_versions" SET "jurisdiction_code" = '310000', "pack_kind" = 'overlay' WHERE "jurisdiction_code" IS NULL;
--> statement-breakpoint
ALTER TABLE "policy_pack_versions" ADD CONSTRAINT "policy_pack_versions_jurisdiction_fk" FOREIGN KEY ("jurisdiction_code") REFERENCES "jurisdictions"("code");
--> statement-breakpoint
ALTER TABLE "policy_pack_versions" ADD CONSTRAINT "policy_pack_versions_kind_check" CHECK ("pack_kind" IN ('baseline','overlay'));
