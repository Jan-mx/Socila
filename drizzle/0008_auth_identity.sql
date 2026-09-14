-- 09-02 用户与管理员双角色鉴权（AUTH-FR-001～013，ADR-0007）。
-- 纯新增迁移（AUTH-NFR-008）：不删除、不重命名、不改变既有列类型；
-- 固定双角色 role ∈ {user, admin}，role/status 由 CHECK 约束兜底。
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"normalized_username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"auth_version" integer DEFAULT 1 NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"temporary_password_expires_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_check" CHECK ("users"."role" IN ('user', 'admin')),
	CONSTRAINT "users_status_check" CHECK ("users"."status" IN ('active', 'disabled')),
	CONSTRAINT "users_auth_version_check" CHECK ("users"."auth_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "auth_refresh_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"current_token_hash" text NOT NULL,
	"previous_token_hash" text,
	"previous_valid_until" timestamp with time zone,
	"rotation_counter" integer DEFAULT 0 NOT NULL,
	"auth_version" integer NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" text,
	CONSTRAINT "auth_refresh_sessions_rotation_counter_check" CHECK ("auth_refresh_sessions"."rotation_counter" >= 0)
);
--> statement-breakpoint
CREATE TABLE "auth_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"target_user_id" uuid,
	"event_type" text NOT NULL,
	"request_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_refresh_sessions" ADD CONSTRAINT "auth_refresh_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_normalized_username_key" ON "users" USING btree ("normalized_username");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_refresh_sessions_current_token_hash_key" ON "auth_refresh_sessions" USING btree ("current_token_hash");--> statement-breakpoint
CREATE INDEX "auth_refresh_sessions_user_id_idx" ON "auth_refresh_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_audit_events_created_at_idx" ON "auth_audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "auth_audit_events_target_user_id_idx" ON "auth_audit_events" USING btree ("target_user_id");
