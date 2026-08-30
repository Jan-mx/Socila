-- 步骤03.1 地区树（POL-FR-001/002）：国家、省、市、区县层级与稳定代码。
-- 基础种子（国家 + 上海/广东/四川省级路径）直接随 migration 落库，幂等可重复。
CREATE TABLE IF NOT EXISTS "jurisdictions" (
  "code" text PRIMARY KEY,
  "name" text NOT NULL,
  "level" text NOT NULL,
  "parent_code" text,
  "path" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "jurisdictions_level_check" CHECK ("level" IN ('national','province','city','district')),
  CONSTRAINT "jurisdictions_parent_fk" FOREIGN KEY ("parent_code") REFERENCES "jurisdictions"("code")
);

INSERT INTO "jurisdictions" ("code", "name", "level", "parent_code", "path") VALUES
  ('CN',     '中国',   'national', NULL,     '/CN/'),
  ('310000', '上海市', 'province', 'CN',     '/CN/310000/'),
  ('440000', '广东省', 'province', 'CN',     '/CN/440000/'),
  ('510000', '四川省', 'province', 'CN',     '/CN/510000/')
ON CONFLICT ("code") DO NOTHING;
