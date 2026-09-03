# 09-03 本地运行配置与凭据整改阶段验收报告

> Author: Jan
> Executor: Agent
> Status: PASS
> Date: 2026-09-03
> PRD: `docs/prd/09-03-stage-runtime-configuration-remediation.md`（CFG-FR-001～010、CFG-NFR-001～007、CFG-AC-001～013）
> 分支：`refactor/policy-ops-agent-platform`

## 1. 结论

本地运行配置与凭据管理已统一：宿主与Compose各自持有单一私有env源，共享加载器语义一致（`.env.local`优先、`.env`回退、进程变量永不覆盖）；模板与入口收口完成；管理员引导一次性化；PostgreSQL口令在新鲜备份经PG17+pgvector真实恢复对账后完成轮换，轮换前后逐表数据对账一致（34表/1610行）。全部PRD规定门禁取得本地新鲜结果，全部退出0、零skip；2026-09-03复审确认本阶段演练容器无残留。**阶段判定：PASS，PRD状态Approved→Active。**

## 2. 需求映射（CFG-FR/NFR → 实现与证据）

| 需求 | 实现 | 证据 |
| --- | --- | --- |
| CFG-FR-001 单一活动配置源 | 宿主仅`.env.local`（localhost:5432），Compose仅`infra/prod/.env`（postgres:5432）；Neon不再被任何活动宿主配置引用 | `config-contract.test.ts`（neon/vercel口径扫描） |
| CFG-FR-002 统一加载语义 | 新增`scripts/lib/load-environment.mjs`（显式调用，无import副作用）；`run-migrations.mjs`、`bootstrap-admin.mjs`、`drizzle.config.ts`全部切换，移除`dotenv/config` | `src/lib/env/scripts-load-environment.test.ts`（5个行为用例+3个源码契约） |
| CFG-FR-003 根环境清理 | 根`.env`删除前验证无独有键；宿主所需值已归并到`.env.local`，不保留第二份活动Secret或数据库连接 | `git status`确认根`.env`已删；`config-contract.test.ts` |
| CFG-FR-004 管理员引导一次性 | `bootstrap-admin.mjs`只读显式进程变量（bcrypt cost 12校验）；Compose web env、`playwright.config.ts`、全部模板移除`ADMIN_*`；运行时登录只查`users`表 | `config-contract.test.ts`（compose web env无ADMIN_*、模板无字面量）；引导×2实测（创建+幂等no-op） |
| CFG-FR-005/006 备份与恢复演练 | 新鲜`pg_dump -Fc`+SHA-256清单+临时PG17+pgvector容器真实恢复+逐表对账 | §3备份/恢复证据 |
| CFG-FR-007/008 口令轮换 | ≥32随机字节URL安全口令内存生成；stdin执行`ALTER ROLE`（不进argv）；新口令成功/旧口令拒绝验证；`infra/prod/.env`与`.env.local`原子替换（同目录临时文件+rename，替换前内容校验） | §4轮换证据 |
| CFG-FR-009 最小权限门禁例外 | 宿主脚本保留loopback门禁；Compose仅`migrate`服务持有`ALLOW_REMOTE_DATABASE=1`（内部DNS `postgres`被视为远程的既成事实），其余8服务零例外 | `config-contract.test.ts`（逐服务断言） |
| CFG-FR-010 活动入口与模板收口 | 根`.env.example`仅7个活动宿主变量；`infra/prod/.env.example`仅17个Compose插值变量；`runtime.env.example`仅Agent实际消费变量；`vercel.json`删除；`next.config.ts`/README去除Vercel/Neon口径 | `config-contract.test.ts`（键集精确断言） |
| CFG-NFR-001 最小权限 | 见CFG-FR-009；`agent_app`角色仅经`agent.migrate --with-roles`（强制口令）创建 | DB集成门禁中角色路径执行 |
| CFG-NFR-002 Secret安全 | 全程日志/报告仅出现sha256[:12]指纹与长度；口令不经argv、不进env文件以外的持久位置 | 本报告的证据格式即执行格式；Secret扫描 |
| CFG-NFR-003 可恢复 | 恢复演练在临时实例完成，不触碰生产卷；runbook写入OPERATIONS | §3；`OPERATIONS.md`轮换runbook |
| CFG-NFR-004 幂等 | migration×2、引导×2、agent migrate×2均幂等no-op | §6门禁记录 |
| CFG-NFR-005 可审计 | 需求、实现、测试、恢复对账和提交均记录到traceability、PROGRESS与本报告 | `reports/traceability.md`、`PROGRESS.md`、本报告 |
| CFG-NFR-006 零数据漂移 | 轮换前后live库及恢复库34表/1610行逐表一致 | §3～4逐表对账 |
| CFG-NFR-007 演练资源清理 | 2026-09-03复审枚举Docker对象，本阶段恢复、DB门禁、E2E演练容器均无残留；`socila-*`容器与持久卷保留 | `docker ps -a`、`docker volume ls`、`docker network ls`复核 |

## 3. 备份与真实恢复对账证据（轮换前）

- 备份前基线：PostgreSQL 17.11；34张表（public 19 / agent 6 / rag 8 / drizzle 1），总计1610行（users=4、cases=851、tests=528、showcase_cases=117、rules=24、params=29、auth_refresh_sessions=10、auth_audit_events=6、drizzle.__drizzle_migrations=8、agent.schema_migrations=4，其余为0）。
- 新鲜dump：`backup/db/policyops-cfg-remediation-20260903-163603.dump`，664,231字节；SHA-256 `8b7586a67260187c0302d9a71020ee6333b506281b0f2853f859afd8531d66c8`（`.sha256`清单一致；验收末复核仍一致，文件未被改动）。
- TOC核对：34个`TABLE DATA`项，与基线34表一一对应。
- 真实恢复：临时容器`pgvector/pgvector:pg17`（`restore_verify`库，`agent_app NOLOGIN`角色），`pg_restore`退出0、stderr 0 ERROR / 0 WARNING。
- 逐表对账（CFG-AC-004）：恢复库34表计数与基线逐表完全一致（diff为空），总计1610行。
- 执行顺序说明：dump、SHA清单、TOC、干净恢复（退出0/0错误）与抽查在口令轮换**之前**完成；逐表计数diff因一次stdin管道故障（简单`-c`查询正常、管道计数查询返回空文件）改为文件方式（`docker cp`+`psql -f`）在轮换后立即对**同一份dump**（SHA复核未变）重跑并通过。期间生产卷未发生任何数据写入（仅角色口令变更），且轮换后live库独立对账同样通过（§4），恢复可信度完整。

## 4. 口令轮换与轮换后对账证据

- 新口令：48随机字节hex（96字符，URL安全），仅内存/临时文件持有；sha256[:12]=`e9d6c5bcf12e`（旧口令长度10，sha256[:12]=`2f9550bb10a8`，轮换后已不可用）。
- 三个目标连接串（compose `DATABASE_URL`、`AGENT_DATABASE_URL`、宿主`DATABASE_URL`）构造后逐项校验（主机/端口/库名/口令位）再落临时文件。
- `ALTER ROLE`经`docker exec -i` stdin执行（不出现在进程列表/argv）；随后TCP验证：新口令`127.0.0.1:5432`连接成功（CFG-AC-005），旧口令被密码认证拒绝。
- 原子替换：`infra/prod/.env`（sha256[:12]=`39068079afa6`）、`.env.local`（sha256[:12]=`1116e26137d9`）；无临时文件残留。
- 服务重建：`docker compose up -d`重建web/agent/worker/beat与postgres容器（数据卷`socila_pg-data`未删除、未重建；未执行`down -v`）；全部服务healthy。
- 迁移幂等（CFG-AC-007）：Compose `run --rm migrate`与宿主`npm run db:migrate`各重复执行，全部退出0、无重复应用。
- 健康检查（CFG-AC-010）：`/api/health`=`{"status":"ok","database":"ok"}`（经Caddy :80）；agent `/internal/health`（容器内8100端口）=`{"status":"ok"}`。
- 轮换后逐表对账（CFG-AC-006）：live库34表计数与备份前基线逐表一致，总计1610行（diff为空）。
- Compose config：`docker compose config --quiet`零插值告警。

## 5. 决策记录

- **AUTH_REFRESH_PEPPER对齐**：PRD §9要求两运行时共享`NEXTAUTH_SECRET`与`AUTH_REFRESH_PEPPER`，同时非目标禁止轮换`AUTH_REFRESH_PEPPER`。处置：将`.env.local`的pepper对齐为Compose运行时既有值（不生成新值）。Compose运行时值未变化→其会话不失效；宿主当时指向Neon、无本地库会话，无本地失效风险。如用户要求双值独立，需另行授权生成新pepper并接受宿主侧会话作废。
- **根`.env`删除**：删除前逐键核对，其全部键已被`.env.local`覆盖或已废弃，无独有键丢失。
- **`vercel.json`删除**：单机Compose为唯一部署形态（CFG-FR-010），Vercel活动入口移除；`next.config.ts`保留standalone输出（Compose冒烟依赖）。
- **服务JWT**：仅保留`AGENT_SERVICE_JWT_CURRENT/PREVIOUS`配置位，不实现签发/校验（用户约束）。
- **历史备份**：`backup/db/`中既有历史dump保留未动，不替代本次轮换前的新鲜dump。

## 6. 门禁执行记录（全部本地新鲜执行，2026-09-03）

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| TDD Red | `npx vitest run src/lib/env`（实施前） | 18失败/1通过（1通过为已成立的migrate例外断言），确认Red |
| Node单元 | `npm test` | PASS；31文件/256通过、skip 0 |
| TypeScript | `npx tsc --noEmit` | 退出0 |
| ESLint | `npx eslint src` | 退出0 |
| Build | `npm run build` | PASS；standalone产物（E2E复用） |
| Python单元 | `uv run ruff check .` / `mypy agent tests` / `pytest -q -m "not integration"` / `pip-audit` | 0问题；42源文件0错误；38通过5 deselected；无可知漏洞 |
| DB集成 | 全新PG17容器（`127.0.0.1:5436`，`dgate`库）：core migration×2 → Jan引导×2（幂等no-op）→ seed（851案例/500回归测试）→ `npm run test:db` → `agent.migrate --with-roles`×2 → `pytest -m integration`（含`SSP_TEST_DATABASE_URL`/`AGENT_DB_PASSWORD`） | 全部退出0；`test:db` 7文件/23通过skip 0；集成5通过skip 0 |
| Auth E2E | 全新PG17 `e2e`库：migration → Jan引导（显式进程变量）→ seed → `SSRP_E2E_DATABASE_URL/NEXTAUTH_SECRET/REFRESH_PEPPER`（secret≠pepper，一次性值）+ `npm run test:e2e:auth` | PASS；10通过（50.4s），含Jan管理员登录、双角色关键流程、被禁用账号拒绝 |
| Compose | `up -d`重建、`config --quiet`、容器健康 | 8容器全部running、健康检查全healthy；零插值告警 |
| Secret | `node scripts/scan-secrets.mjs --all` / 默认模式 | 534个跟踪文件无命中；18个候选文件无命中 |
| 演练资源清理 | Docker容器/卷/网络枚举（2026-09-03复审） | 本阶段任务专属演练容器零残留；保留的`socila-*`容器和持久卷未删除 |

## 7. 交付物与提交

- 代码/配置：`scripts/lib/load-environment.mjs`（新增）、`scripts/run-migrations.mjs`、`scripts/bootstrap-admin.mjs`、`drizzle.config.ts`、`infra/prod/docker-compose.yml`、`.env.example`、`infra/prod/.env.example`、`docs/refactor/policy-ops-agent/config/runtime.env.example`、`README.md`、`next.config.ts`、`playwright.config.ts`、`scripts/run-auth-e2e.mjs`、`src/lib/db/guard.ts`、`.gitignore`（`/backup/`）、`vercel.json`（删除）、根`.env`（删除）。
- 测试（新增）：`src/lib/env/scripts-load-environment.test.ts`、`src/lib/env/config-contract.test.ts`。
- 文档：`ARCHITECTURE.md`（运行配置与凭据节）、`OPERATIONS.md`（备份恢复+轮换runbook）、`PROGRESS.md`、`reports/README.md`、`reports/traceability.md`、`config/README.md`（Updating→Active）、本阶段PRD（Approved→Active）。
- 提交：`fix: 统一本地运行配置与凭据管理`（单提交，推送当前upstream；不创建PR、不合并main）。
- 未提交物（按约束保持本地）：`.env.local`、`infra/prod/.env`、`backup/db/`（dump+清单）、全部临时轮换文件（已删除）。

## 8. 用户文档修改隔离

工作区中用户自有的版本号文档修改（`docs/prd/09-03-stage-policyops-pre-merge-release.md`、`PROGRESS.md`、`README.md`、`reports/README.md`、`reports/stage-09-03-pre-merge-release/acceptance-report.md`）在执行前以独立stash保存，本阶段提交不含这些修改，提交后恢复至工作区。
