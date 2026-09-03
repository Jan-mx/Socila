-- 服务JWT重放表（09-03 SJWT-FR-008、PRD §7.1）：public schema内JTI唯一消费。
-- 字段/约束与 agent.service_jwt_replays（Agent，migrations/0007）同构；
-- 仅保存UUID与claims元数据，不保存令牌或签名（§7.3）。
-- 重复执行安全（PRD §9）：纯新增对象。
CREATE TABLE "service_jwt_replays" (
	"jti" uuid PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"audience" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "service_jwt_replays_expires_at_idx" ON "service_jwt_replays" USING btree ("expires_at");
