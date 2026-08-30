-- 步骤02.5 资源所有权（CORE-FR-009）：会话与方案绑定 owner_user_id。
-- 可空列：匿名会话期间 owner 以 session_id 表示；认证用户出现后写入 owner_user_id
-- 并优先于 session_id 参与归属校验。旧行两列为 NULL，沿用各自的遗留语义。
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "owner_user_id" text;
ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "owner_user_id" text;
