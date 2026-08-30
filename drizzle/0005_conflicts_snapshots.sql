-- 步骤03.4/03.5：同级冲突模型（POL-FR-008）与不可变政策快照（POL-FR-009/010）。
CREATE TABLE "policy_conflicts" (
  "id" serial PRIMARY KEY,
  "jurisdiction_code" text NOT NULL REFERENCES "jurisdictions"("code"),
  "business_key" text NOT NULL,
  "kind" text NOT NULL,
  "member_versions" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "resolution" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "resolved_at" timestamp,
  "resolved_by" text,
  CONSTRAINT "policy_conflicts_status_check" CHECK ("status" IN ('open','resolved','dismissed'))
);
--> statement-breakpoint
CREATE TABLE "policy_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "jurisdiction_code" text NOT NULL REFERENCES "jurisdictions"("code"),
  "as_of_date" date NOT NULL,
  "resolved_path" text NOT NULL,
  "content_hash" text NOT NULL,
  "created_by" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "policy_snapshot_members" (
  "id" serial PRIMARY KEY,
  "snapshot_id" uuid NOT NULL REFERENCES "policy_snapshots"("id"),
  "entity_type" text NOT NULL,
  "business_key" text NOT NULL,
  "payload" jsonb NOT NULL,
  "provenance" jsonb NOT NULL,
  CONSTRAINT "policy_snapshot_members_type_check" CHECK ("entity_type" IN ('rule','param','rule_set')),
  CONSTRAINT "policy_snapshot_members_unique" UNIQUE ("snapshot_id", "entity_type", "business_key")
);
--> statement-breakpoint
-- 不可变性（POL-AC-004）：快照与其成员禁止 UPDATE/DELETE。
CREATE OR REPLACE FUNCTION "policy_snapshots_immutable"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'policy snapshots are immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "policy_snapshots_no_update" BEFORE UPDATE OR DELETE ON "policy_snapshots"
  FOR EACH ROW EXECUTE FUNCTION "policy_snapshots_immutable"();
--> statement-breakpoint
CREATE TRIGGER "policy_snapshot_members_no_update" BEFORE UPDATE OR DELETE ON "policy_snapshot_members"
  FOR EACH ROW EXECUTE FUNCTION "policy_snapshots_immutable"();
--> statement-breakpoint
-- POL-FR-010：规划记录引用快照与解析路径。
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "snapshot_id" uuid REFERENCES "policy_snapshots"("id");
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "resolved_jurisdiction_path" text;
