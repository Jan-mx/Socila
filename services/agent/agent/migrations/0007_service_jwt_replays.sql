-- 服务JWT重放表（09-03 SJWT-FR-008、PRD §7.2）：agent schema 内JTI唯一消费。
-- 字段/约束与 public.service_jwt_replays（Core，drizzle/0009）同构；
-- 仅保存UUID与claims元数据，不保存令牌或签名（§7.3）。
-- 重复执行安全（PRD §9）：IF NOT EXISTS；agent_app角色缺失时跳过GRANT
-- （角色由 --with-roles 引导，见0002_roles.sql；引导后重跑本迁移补齐授权）。
CREATE TABLE IF NOT EXISTS agent.service_jwt_replays (
  jti uuid PRIMARY KEY,
  issuer text NOT NULL,
  subject text NOT NULL,
  audience text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS service_jwt_replays_expires_at_idx ON agent.service_jwt_replays(expires_at);
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_app') THEN
    -- 最小读写：INSERT(JTI唯一插入)+SELECT(诊断)+DELETE(过期清理)；无UPDATE。
    -- agent_app不得因此获得Core表（public schema）任何权限（§7.2）。
    GRANT SELECT, INSERT, DELETE ON agent.service_jwt_replays TO agent_app;
  END IF;
END
$$;
