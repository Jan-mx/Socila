# ADR-0004：NextAuth v5 JWT + authVersion

- 状态：Accepted
- 日期：2026-08-30
- 影响阶段：Stage 02、06、07

## 背景

现有项目已使用NextAuth v5 Credentials和JWT。个人Demo需要user/admin、资源归属和账号禁用，但不需要企业级SSO和复杂Session管理。

## 决策

- 保留NextAuth v5与JWT Session。
- 用户、role、状态和authVersion存PostgreSQL。
- JWT仅保存userId、role、authVersion，最长有效期1小时。
- 密码重置、角色变化和禁用账号时递增authVersion。
- 管理员审核和敏感写操作查询数据库校验账号状态与authVersion。

## 后果

- 复用现有认证路径，不增加Session表和每次请求数据库读取。
- 普通只读请求可能在JWT过期前保留旧role；敏感写操作通过authVersion校验解决。
- JWT禁止保存画像、方案和个人资料。

## 复审触发

需要全设备即时退出、企业SSO、多组织或正式安全合规时评估数据库Session或外部身份服务。
