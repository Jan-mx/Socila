# 09-02 用户与管理员双角色鉴权 验收报告

> Author: Jan
> Status: Active
> Updated: 2026-09-02
> PRD: `docs/prd/09-02-feature-user-admin-auth.md`
> ADR: `docs/refactor/policy-ops-agent/decisions/ADR-0007-NextAuth授权窗口与PostgreSQL刷新会话.md`

## 1. 验收环境

- 开发机 Windows 11 / PowerShell + Git Bash，Node v22.23.1，Next.js 16.3.3（Turbopack 构建）。
- 验收数据库：**全新** PostgreSQL 17（Docker `postgres:17-alpine`，一次性容器 `socila-pg-auth-acceptance`，本地端口 5434，库 `auth_acceptance`）。
- E2E 浏览器：Playwright Chromium（headless shell 151.0.7922.34），对 `next start` 生产构建执行。
- 对话流依赖的 OpenAI 兼容服务以本地 mock（`e2e/mock-openai.mjs`）替代，不访问任何外部 LLM。
- 全部 Secret 为本地一次性测试值；`NEXTAUTH_SECRET` 与 `AUTH_REFRESH_PEPPER` 使用不同值（§12.2）。

## 2. 实现范围（AUTH-FR）

| 需求 | 实现 |
| --- | --- |
| AUTH-FR-001 公开注册 | `POST /api/auth/register` + `/register` 页面；strict Schema 拒绝未登记字段；角色固定 `user`/`active`（`register.use-case.ts`） |
| AUTH-FR-002 统一登录 | `/login` 页面 + NextAuth Credentials `authorize`；状态/角色/密码全部由数据库事实决定（`login.use-case.ts`） |
| AUTH-FR-003 固定双角色鉴权 | `identity/domain/roles.ts` + `access.ts` 门禁决策；`src/proxy.ts` 服务端执行（页面 redirect、API 401/403） |
| AUTH-FR-004 会话刷新 | 15 分钟授权声明（`accessExpiresAt`）+ `rotateRefreshSession` 行锁轮换 + 30 秒宽限 + HMAC 确定性派生（ADR-0007） |
| AUTH-FR-005 资源所有权 | `computePlan` 强制 `owner_user_id`、`session_id` 恒 NULL；conversation 创建/读取/删除全部按 owner 过滤 |
| AUTH-FR-006 匿名入口关闭 | proxy matcher 覆盖规划/对话/管理 API；匿名一律 401；新流程不创建/传递 `session_id`；客户端移除 legacy session id |
| AUTH-FR-007 本人改密 | `POST /api/account/change-password` + `/account/security`；成功后 `authVersion+1`、撤销全部刷新会话、清除 Cookie、要求重登 |
| AUTH-FR-008 账号状态 | `PATCH /api/admin/users/:id/status`；禁用后不可登录、刷新会话失效（AUTH-AC-013） |
| AUTH-FR-009 角色变更 | `PATCH /api/admin/users/:id/role`；仅 active 账号；最后 active admin 保护（AUTH-AC-014） |
| AUTH-FR-010 密码重置 | `POST /api/admin/users/:id/reset-password`；20 位 base64url 临时密码、`Cache-Control: no-store`、24h 失效、强制改密 |
| AUTH-FR-011 审计 | `auth_audit_events`：注册/改密/重置/状态/角色/会话撤销/复用检测同事务写入，metadata 无 Secret |
| AUTH-FR-012 管理员引导 | `scripts/bootstrap-admin.mjs`：幂等创建 Jan；同名普通用户冲突失败；不输出凭据 |
| AUTH-FR-013 兼容入口 | `next.config.ts` 308 重定向 `/admin/login` → `/login?callbackUrl=%2Fadmin`；旧登录页已删除 |

AUTH-NFR-001～008 对应实现：Secret 不落库/日志/响应（NFR-001）；dummy bcrypt 抗枚举 + 不可枚举 404（NFR-002）；注册 5/h/IP、登录 20/15min/IP + 5/15min/IP+用户名（NFR-003，`rate-limit.ts`）；同源 Origin + JSON Content-Type 校验、Cookie HttpOnly/SameSite=Lax/生产 Secure（NFR-004）；登出与安全变更撤销刷新会话、管理写 `requireFreshAdmin` 数据库回读（NFR-005）；结构化日志仅含 requestId/事件/脱敏 ID（NFR-006）；时钟/随机数/哈希/HMAC 全端口注入（NFR-007，`__tests__/fakes.ts`）；迁移纯新增（NFR-008，`drizzle/0008_auth_identity.sql`）。

## 3. TDD 执行

- Red 先行：`identity/__tests__/domain.test.ts`（31 用例）与 `application.test.ts`（32 用例）在实现前运行失败（模块不存在/断言失败）；`use-cases.test.ts` 中"无 owner 拒绝持久化"先失败后实现。
- 实现路径与测试路径见 `reports/traceability.md` 的 09-02 行。

## 4. 验收证据（新鲜执行）

### 4.1 Node 单元/契约（AUTH-FR-001/003/007-011，刷新与门禁分支）

```
npm test
Test Files  27 passed | 6 skipped (33)
Tests       230 passed | 25 skipped (255)
```

其中 identity 专项：domain 31、application 32、use-cases/planning 所有权 3、契约与模块边界扫描通过。

### 4.2 全新 PostgreSQL 17 库（migration / 引导 / seed / 集成）

```
DATABASE_URL=... node scripts/run-migrations.mjs     # 第 1 次：migrations applied
node scripts/run-migrations.mjs                       # 第 2 次：migrations applied（幂等）
node scripts/bootstrap-admin.mjs                      # admin user created (normalized_username=jan)
node scripts/bootstrap-admin.mjs                      # admin already present (status=active); no-op
npm run seed                                          # Seed complete（851 cases + 500 regression tests）
```

- 同名普通用户冲突：预置 `jan2` 普通用户后引导以 exit=1 失败，不提升不覆盖；清理后继续。
- identity repository 集成测试（`SSP_TEST_DATABASE_URL` 指向该库）：

```
npx vitest run src/server/modules/identity/__tests__/identity-repository.integration.test.ts \
  src/server/modules/__tests__/write-repository.test.ts
Test Files  2 passed (2)  Tests  10 passed (10)
```

覆盖：并发同规范化注册仅 1 成功 1 个 409（AUTH-AC-003）；行锁串行化并发刷新轮换——两请求获同一后继 Secret 且 `rotation_counter=1`（AUTH-AC-010）；并发互降 admin 不可能同时提交且至少保留 1 个 active admin（AUTH-AC-014）；禁用后 authVersion+1、会话拒绝（AUTH-AC-013）；审计无 Secret（AUTH-AC-015）；事务回滚完整性（§7.1）。

### 4.3 Chromium E2E（真实 Next 生产构建 + 上述 PostgreSQL 17）

```
bash scripts/run-auth-e2e.sh
10 passed (50.0s)
```

覆盖：匿名 /chat 重定向 /login 与 API 401（AUTH-AC-001）；`/admin/login` 308（AUTH-FR-013）；注册成功跳转 `login?registered=1` 不自动登录（AUTH-AC-002）；重复用户名 409 文案；用户登录进 `/chat`、对话按 owner 持久化且刷新后仍在（AUTH-AC-004/008、AUTH-US-002）；user 携带 admin callback → `/chat?error=forbidden`（AUTH-AC-005）；管理员统一入口进后台、搜索/禁用/启用/一次性临时密码（AUTH-US-004、AUTH-AC-015）；临时密码登录被强制改密、访问 `/chat` 被弹回（AUTH-AC-016、AUTH-US-005）；改密后新密码重登恢复权限 + 他人/随机资源 404、user 访问管理 API 403（AUTH-FR-007、AUTH-AC-006/007）；被禁用账号登录统一"用户名或密码错误"（AUTH-AC-013、AUTH-NFR-002）。

### 4.4 回归与部署门禁

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| Node 全量测试 | `npm test` | PASS（230 passed / 25 skipped） |
| Lint | `npx eslint src` | PASS（0 error 0 warning） |
| TypeScript | `npx tsc --noEmit` | PASS |
| 生产构建 | `npm run build` | PASS（含 Proxy 编译与 /admin/login 308） |
| Python 回归 | `uv run --project services/agent pytest -q` | PASS（37 passed / 6 skipped） |
| Secret 扫描 | `node scripts/scan-secrets.mjs --all` | PASS（475 个候选文件无命中） |
| Docker 构建 | `docker build -f Dockerfile -t socila-web:auth-acceptance .` | PASS（404MB；构建期占位 ENV 告警为既有模式，非真实 Secret） |
| Compose 配置 | `docker compose -f infra/prod/docker-compose.yml config` | PASS（新增 `AUTH_REFRESH_PEPPER` 注入） |

## 5. 匿名数据兼容（AUTH-AC-017）

- 迁移纯新增，未改动 `plans.session_id`/`conversations.session_id` 及其数据；验收库 seed 产生的历史形态数据原行不变。
- 新入口（`/api/plan/[id]`、`/api/chat/[id]`、`/api/conversations`）只按 `owner_user_id` 过滤，旧 `session_id`/遗留无主行对新用户不可见（404/空列表）。
- 回退旧镜像后旧 Cookie 入口可继续按原逻辑工作（未破坏任何列）。

## 6. 交付物清单

- `drizzle/0008_auth_identity.sql`（users / auth_refresh_sessions / auth_audit_events，纯新增）
- identity 模块：`domain/{username,password,roles,refresh-session,access,owner}.ts`、`application/*`（注册/登录/改密/刷新/登出/管理 + 端口 + 稳定错误）、`infrastructure/*`（bcrypt、node crypto、Drizzle 仓储、容器）、`contracts/identity.contracts.ts`
- NextAuth 集成：`src/lib/auth/{index,claims,session-cookie,require-actor,callback-url}.ts`、`src/types/next-auth.d.ts`、`src/proxy.ts`
- API：`/api/auth/register`、`/api/auth/logout`、`/api/account/change-password`、`/api/admin/users`（列表/状态/角色/重置）
- 页面：`/login`、`/register`、`/account/security`、`/admin/users`、`/post-login`
- 所有权改造：`/api/chat`、`/api/chat/[id]`、`/api/conversations*`、`/api/plan/compute`、`/api/plan/[id]`、AI 工具上下文、客户端组件去匿名化
- 引导脚本：`scripts/bootstrap-admin.mjs`；E2E：`playwright.config.ts`、`e2e/auth.spec.ts`、`e2e/mock-openai.mjs`、`scripts/run-auth-e2e.sh`
- 文档：ADR-0007、本文、traceability、PROGRESS、ARCHITECTURE、TESTING、OPERATIONS、identity README、runtime.env.example

## 7. 遗留风险与需用户授权事项

- 生产（远程）migration、`AUTH_REFRESH_PEPPER` Secret 配置、首次引导执行与入口切换需用户单独授权；本 Feature 仅完成本地/验收库验证。
- 授权声明窗口内（≤15 分钟）页面级撤销感知有延迟；管理敏感写与刷新路径已通过数据库回读消除该窗口。
- 登录/注册限流为进程内存实现，单机 Demo 规模（≤100 用户、≤5 并发）下满足 PRD；多实例部署需外置存储。
- E2E 对话流使用本地 OpenAI 兼容 mock；真实 LLM 闭环验收属于后续"真实 Agent 闭环"路线图项。
