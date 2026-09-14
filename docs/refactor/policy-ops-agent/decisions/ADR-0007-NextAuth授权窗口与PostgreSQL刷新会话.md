# ADR-0007：NextAuth 15分钟授权声明 + PostgreSQL刷新会话

- 状态：Accepted
- 日期：2026-09-02
- 影响阶段：09-02-feature-user-admin-auth
- 替代范围：收窄 ADR-0004 中"JWT最长1小时、无Session表"的会话策略

## 背景

09-02 Feature 将入口从匿名规划改为登录后规划，要求：

- 账号禁用、角色变更、密码重置/修改后旧会话必须尽快失效；
- NextAuth v5 Credentials 与现有加密 JWT Cookie 必须保留，不引入数据库 Session Cookie；
- 刷新会话需要可撤销、可审计、可并发安全轮换（AUTH-FR-004、AUTH-NFR-005）。

ADR-0004 的纯 JWT 方案无法满足"撤销后立即失效"：JWT 在过期前始终可信，仅靠 authVersion 校验会迫使每个请求都读库。

## 决策

1. **双层会话结构**：NextAuth 加密 JWT Cookie 保存**15分钟授权声明**（`accessExpiresAt`）；数据库新增 `auth_refresh_sessions` 保存**长期刷新会话**（SHA-256 哈希，闲置7天、绝对30天）。
2. **授权窗口**：JWT 内 `accessExpiresAt = now + 15分钟`。窗口内请求不读库，沿用 ADR-0004 的零读库路径；窗口过期后由 jwt callback 触发 PostgreSQL 刷新会话验证与轮换，成功则续签 15 分钟授权声明并更新 Cookie，失败则视为未认证。
3. **刷新令牌轮换**：初始 Secret 为 32 字节 CSPRNG，库中仅存 `SHA-256(secret)`；轮换公式 `nextSecret = HMAC-SHA256(AUTH_REFRESH_PEPPER, oldSecret + "." + refreshSessionId + "." + nextRotationCounter)`；行锁串行化；首次轮换后将当前哈希移入 `previous_token_hash` 并给 30 秒宽限，宽限内并发旧 Secret 请求派生同一后继 Secret、不重复递增计数；宽限后的旧 Secret 或未知 Secret 撤销整个刷新会话并写审计。
4. **撤销即时性**：改密、强制改密、禁用、角色变更、登出（撤销当前会话）与安全审计在同一事务中递增 `authVersion` 并撤销该用户全部刷新会话；被撤销会话的下一个授权声明过期请求即被拒绝，最迟 15 分钟后旧 JWT 声明整体失效。
5. **敏感写不依赖 JWT**：管理用户写接口（状态/角色/重置）与刷新、改密路径一律经 `requireFreshAdmin` / 数据库回读校验 role、status、authVersion，不信任 JWT 声明（AUTH-NFR-005）。
6. **Secret 分离**：`NEXTAUTH_SECRET`（加密 Cookie）与 `AUTH_REFRESH_PEPPER`（HMAC 派生）必须为不同值，均来自部署环境。
7. **迁移纯新增**：新增 `users`、`auth_refresh_sessions`、`auth_audit_events` 三表及索引/CHECK/FK，不改动既有列；旧应用镜像可在保留新表的情况下继续运行（AUTH-NFR-008）。

## 备选方案

- **纯 JWT + authVersion 每请求读库**：撤销快但每个请求一次 DB 读，回到数据库 Session 的成本；否决。
- **NextAuth 数据库 Session 策略**：Cookie 即会话令牌，无法派生轮换 Secret 与宽限语义，审计粒度粗；否决。
- **15分钟改为滑动续签前端刷新**：需要前端心跳与额外端点，复杂度高于服务端透明刷新；否决。

## 后果

- 窗口内撤销感知延迟最长 15 分钟；敏感写路径通过数据库回读消除该窗口，页面级门禁可容忍。
- jwt callback 在授权声明过期时访问 PostgreSQL；数据库不可用时按 AUTH-AC-019 返回 503，不误撤销会话。
- 刷新并发正确性依赖行锁 + 确定性派生公式；单元测试用 Fake Clock/Crypto 覆盖宽限与复用分支，集成测试在真实 PostgreSQL 上并发验证。

## 复审触发

需要全设备即时退出（<15分钟页面级）、企业 SSO、多组织或正式合规审计时，重新评估数据库 Session 或外部身份服务。
