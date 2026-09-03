-- 角色与权限（AGT-FR-010 / AGT-AC-004，09-03 PMG-FR-019）：Agent 服务使用专用角色，
-- 对 core（public）schema 无任何权限；仅授予 agent schema 的读写。
-- 只能经管理员路径执行（python -m agent.migrate --with-roles）：agent_app 口令经
-- 环境变量 AGENT_DB_PASSWORD 注入（set_config agent.db_password）；
-- 缺失口令必须直接失败，禁止任何默认口令。
-- 幂等：每次执行时若 agent_app 不存在则创建，存在则更新口令与权限。
DO $$
DECLARE
  pwd text := NULLIF(current_setting('agent.db_password', true), '');
BEGIN
  IF pwd IS NULL THEN
    RAISE EXCEPTION 'agent.db_password 未设置：--with-roles 需要 AGENT_DB_PASSWORD（禁止默认口令）';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_app') THEN
    EXECUTE format('CREATE ROLE agent_app LOGIN PASSWORD %L', pwd);
  ELSE
    EXECUTE format('ALTER ROLE agent_app WITH LOGIN PASSWORD %L', pwd);
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA agent TO agent_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA agent TO agent_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA agent TO agent_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA agent GRANT SELECT, INSERT, UPDATE ON TABLES TO agent_app;
--> statement-breakpoint
REVOKE ALL ON SCHEMA public FROM agent_app;
