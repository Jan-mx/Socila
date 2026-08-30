-- 角色与权限（AGT-FR-010 / AGT-AC-004）：Agent 服务使用专用角色，对 core（public）
-- schema 无任何权限；仅授予 agent schema 的读写。需以管理员身份执行
-- （python -m agent.migrate --with-roles），agent_app 口令经环境变量 AGENT_DB_PASSWORD 注入。
DO $$
DECLARE
  pwd text := COALESCE(NULLIF(current_setting('agent.db_password', true), ''), 'change-me');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'agent_app') THEN
    EXECUTE format('CREATE ROLE agent_app LOGIN PASSWORD %L', pwd);
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
