# identity 模块

> Status: Active
> Updated: 2026-09-02

职责：用户、密码、刷新会话、账号状态、固定双角色与资源所有权（identity 可被其他模块读取；业务模块不得修改认证内部表）。

09-02 Feature（`docs/prd/09-02-feature-user-admin-auth.md`）交付了持久化用户与双角色鉴权；会话决策见 [ADR-0007](../../../../../docs/refactor/policy-ops-agent/decisions/ADR-0007-NextAuth授权窗口与PostgreSQL刷新会话.md)。

## 层边界

- `domain/`：纯领域模型与规则。禁止导入 `next/*`、`react`、`@ai-sdk/*`、`ai`、`drizzle-orm`、`pg` 与 `src/lib/db`（CORE-FR-003）。
  - `username.ts`：trim + NFKC + lowercase 规范化、3-32 位 ASCII 字符集、保留名。
  - `password.ts`：UTF-8 字节 12-72，禁止超限截断。
  - `roles.ts`：固定 `user/admin` 角色与 `active/disabled` 状态、最后管理员判定。
  - `refresh-session.ts`：15 分钟授权声明、30 秒轮换宽限、闲置 7 天/绝对 30 天、HMAC 后继派生公式与刷新决策。
  - `access.ts`：`AuthenticatedActor` 白名单字段与页面/API 门禁决策（匿名 401、强制改密 403、角色 403）。
  - `owner.ts`：OwnerKey 与资源归属判定（认证用户优先）。
- `application/`：用例编排、事务边界、权限检查与错误映射（CORE-FR-005）。框架无关。
  - `register.use-case.ts`（角色固定 user）、`login.use-case.ts`（抗枚举 dummy 比较 + 刷新会话创建）、`change-password.use-case.ts`、`refresh.use-case.ts`（行锁轮换 + 复用撤销 + 审计）、`logout.use-case.ts`、`admin-users.use-case.ts`（`requireFreshAdmin` 数据库回读 + 列表/状态/角色/重置）。
  - `ports.ts`：时钟/随机数/哈希/HMAC/仓储/事务端口与审计事件枚举；`errors.ts`：§9.4 稳定错误。
- `infrastructure/`：Drizzle Repository 实现与外部服务适配。允许 `drizzle-orm`/`pg`。
  - `crypto/bcrypt-password-hasher.ts`（cost 12 + 抗枚举 dummy 哈希）、`crypto/node-crypto-ports.ts`、`drizzle/*`、`identity-container.ts`（`AUTH_REFRESH_PEPPER` 首次使用时校验）。
- `contracts/`：Zod 输入/输出/错误契约，供 Route Handler 与跨服务消费。
  - `identity.contracts.ts`：注册/改密 strict Schema（未登记字段 400）、管理查询与枚举契约。

## 依赖规则

- 全模块所有层禁止导入 `next/*`、`react`、`react-dom`、`@ai-sdk/*`、`ai`（扫描：`src/server/modules/__tests__/module-boundaries.test.ts`）。
- 跨模块读取优先经目标模块的 application 查询用例；禁止循环依赖与深路径导入。
- 依赖方向：contracts → application → domain；infrastructure 实现 application 定义的端口。
- NextAuth 适配层位于 `src/lib/auth/`（claims/callback/会话 Cookie 读取/require-actor），不回灌进本模块。

## 测试

- 单元（无框架/数据库）：`__tests__/domain.test.ts`、`__tests__/application.test.ts`（Fake 时钟/随机数/哈希/HMAC，AUTH-NFR-007）。
- PostgreSQL 集成（需 `SOCILA_TEST_DATABASE_URL` 指向已迁移演练库，否则整组跳过）：`__tests__/identity-repository.integration.test.ts`——并发注册唯一性（AUTH-AC-003）、刷新轮换并发宽限（AUTH-AC-010）、最后管理员并发保护（AUTH-AC-014）、审计无 Secret（AUTH-AC-015）。
- Chromium E2E：`e2e/auth.spec.ts`（运行方式见 `scripts/run-auth-e2e.sh` 与 [验收报告](../../../../../docs/refactor/policy-ops-agent/reports/feature-09-02-auth/acceptance-report.md)）。
