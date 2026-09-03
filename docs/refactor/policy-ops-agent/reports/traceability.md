# 需求追踪矩阵

> Author: Jan
> Status: Active
> Updated: 2026-09-03

## 用途

确保每个阶段需求都能映射到实施步骤和验收证据。实现中应把“实现位置”和“验收报告”列补充为真实链接；任何没有映射的需求都不能关闭阶段。

| 阶段 | 需求范围 | 实施步骤 | 验收范围 | 实现位置 | 验收报告 |
| --- | --- | --- | --- | --- | --- |
| 01 Foundation | FND-FR-001～010 | 01.1～01.7 | FND-AC-001～005 | `src/lib/api/contracts.ts`、`drizzle/0000_thick_dorian_gray.sql`、`scripts/run-migrations.mjs`、`scripts/scan-secrets.mjs`、`scripts/validate-siliconflow.mjs`、`scripts/schema-inventory.sql`、`.github/workflows/ci.yml`、`src/lib/engine/__tests__/golden-fixtures.ts`、`golden-snapshot.test.ts` | `docs/refactor/policy-ops-agent/reports/stage-01/acceptance-report.md` |
| 02 Next Core | CORE-FR-001～010 | 02.1～02.10 | CORE-AC-001～006 | `src/server/modules/*`、`src/lib/db/index.ts`（pg.Pool）、`src/lib/api/route-errors.ts`、`src/lib/engine/test-runner.ts` | `docs/refactor/policy-ops-agent/reports/stage-02/acceptance-report.md` |
| 03 Policy Model | POL-FR-001～012 | 03.1～03.9 | POL-AC-001～006 | `src/server/modules/{jurisdiction,policy}/*`、`drizzle/0003~0005`、`src/lib/db/seed/seed-regional.ts`、`legacy-bridge.ts` | `docs/refactor/policy-ops-agent/reports/stage-03/acceptance-report.md` |
| 04 Agent Runtime | AGT-FR-001～014 | 04.1～04.10 | AGT-AC-001～008 | `services/agent/agent/{api,worker,graph,repositories.py,migrate.py}`、`services/agent/agent/migrations/`、`src/server/modules/agent-integration/` | `docs/refactor/policy-ops-agent/reports/stage-04/acceptance-report.md` |
| 05 Ingestion/RAG | RAG-FR-001～016 | 05.1～05.11 | RAG-AC-001～009 | `services/agent/agent/rag/`、`services/agent/agent/migrations/0003/0006` | `docs/refactor/policy-ops-agent/reports/stage-05/acceptance-report.md` |
| 06 Drafting | DRF-FR-001～014 | 06.1～06.9 | DRF-AC-001～007 | `services/agent/agent/drafting/`、`src/server/modules/agent-integration/application/materialize.ts`、`src/app/admin/review/` | `docs/refactor/policy-ops-agent/reports/stage-06/acceptance-report.md` |
| 07 Migration/Release | REL-FR-001～014 | 07.1～07.12 | REL-AC-001～008 | `infra/prod/`、`services/agent/scripts/neon_drill.py`、`src/app/api/health/` | `docs/refactor/policy-ops-agent/reports/stage-07/acceptance-report.md` |
| 09-03 P0合并门禁/发布准备 | PMG-FR-001～041、PMG-NFR-001～009 | E2E Red/Green、测试分层、Python工具链、角色migration、六job CI、安全门禁、镜像加固、配置与版本、文档与发布治理 | PMG-AC-001～014 | `src/lib/ai/agent.ts`、`e2e/{auth.spec.ts,mock-openai.mjs}`、`scripts/run-auth-e2e.mjs`、`vitest{,.integration}.config.ts`、`src/server/**/__tests__/*.integration.test.ts`、`src/server/modules/identity/infrastructure/identity-container.ts`、`services/agent/{pyproject.toml,uv.lock}`、`services/agent/agent/**`、`services/agent/tests/**`、`.github/workflows/ci.yml`、`Dockerfile`、`services/agent/Dockerfile`、`infra/prod/docker-compose.yml`、`.gitleaksignore`、`package.json`、`package-lock.json` | `docs/refactor/policy-ops-agent/reports/stage-09-03-pre-merge-release/acceptance-report.md` |
| 09-03 本地运行配置/凭据整改 | CFG-FR-001～010、CFG-NFR-001～006 | 共享加载器、模板与入口收口、引导一次性化、门禁例外收口、新鲜备份+真实恢复对账、PostgreSQL口令轮换与对账 | CFG-AC-001～012 | `scripts/lib/load-environment.mjs`、`scripts/run-migrations.mjs`、`scripts/bootstrap-admin.mjs`、`drizzle.config.ts`、`infra/prod/docker-compose.yml`、`.env.example`、`infra/prod/.env.example`、`docs/refactor/policy-ops-agent/config/runtime.env.example`、`README.md`、`next.config.ts`、`playwright.config.ts`、`scripts/run-auth-e2e.mjs`、`src/lib/db/guard.ts`、`.gitignore`、`vercel.json`（删除） | `docs/refactor/policy-ops-agent/reports/stage-09-03-runtime-config-remediation/acceptance-report.md` |

## 总体需求映射

| 总体需求 | 主要阶段 | 验收方式 |
| --- | --- | --- |
| PRD-FR-001～006 来源与文档 | 05 | 格式、OCR、来源安全与回溯测试 |
| PRD-FR-010～014 全国政策 | 03 | 地区继承、冲突、快照和历史复算 |
| PRD-FR-020～024 RAG | 05 | 过滤、混合召回、Rerank、引用和版本 |
| PRD-FR-030～036 Agent与草案 | 04、06 | Checkpoint、审核、草案和幂等物化 |
| PRD-FR-040～043 发布与审计 | 01、02、03、06 | Core二次校验、门禁、不可变和审计 |
| PRD-NFR-001 安全 | 01～07 | 每阶段安全矩阵和最终独立审查 |
| PRD-NFR-002 隐私 | 02、04、05、06、07 | 数据流与外部请求检查 |
| PRD-NFR-003 可恢复 | 04、07 | Checkpoint和空服务器恢复 |
| PRD-NFR-004 幂等 | 01、02、04、05、06 | 重复请求/任务/审核/物化测试 |
| PRD-NFR-005 可观测 | 01、02、04、05、06、07 | 关联ID、指标、审计和告警 |
| PRD-NFR-006 可测试 | 01、04、05、06 | Fake模型、黄金集和独立验收 |
| PRD-NFR-007 兼容 | 01、02、03、07 | 完整Node回归、黄金规划和迁移对账 |

## Feature

| Feature | 需求范围 | 实现位置 | 测试路径 | 验收证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 09-03 Core与Agent双向服务JWT鉴权 | SJWT-FR-001～009、SJWT-NFR-001～006、SJWT-AC-001～018 | `src/lib/security/{service-jwt.ts,service-jwt-provider.ts}`、`src/server/modules/agent-integration/infrastructure/drizzle/service-jwt-replay.repository.ts`、`src/server/modules/agent-integration/application/materialize.ts`、`src/app/api/admin/proposals/route.ts`、`src/app/api/admin/proposals/[proposalId]/review/route.ts`、`src/app/api/internal/v1/draft-imports/route.ts`、`src/lib/db/schema.ts`、`drizzle/0009_service_jwt_replays.sql`、`drizzle/meta/_journal.json`、`services/agent/agent/security/{service_jwt.py,replay.py}`、`services/agent/agent/api/{app.py,main.py}`、`services/agent/agent/{config.py,core_client.py,repositories.py}`、`services/agent/agent/worker/tasks.py`、`services/agent/agent/migrations/0007_service_jwt_replays.sql`、`services/agent/pyproject.toml`、`infra/prod/docker-compose.yml`、`.github/workflows/ci.yml` | `src/lib/security/{service-jwt.test.ts,service-jwt-vectors.contract.test.ts}`、`src/server/modules/agent-integration/__tests__/service-jwt-replay.integration.test.ts`、`src/server/modules/agent-integration/__tests__/draft-imports-route.integration.test.ts`（draft-imports路由级矩阵，Agent→Core方向）、`services/agent/tests/{test_service_jwt.py,test_service_jwt_vectors.py,test_service_jwt_replay_integration.py}`、`testdata/service-jwt-vectors.json`（跨语言契约向量）、`.github/workflows/ci.yml`（container-gates SJWT-AC-017冒烟）、`e2e/auth.spec.ts`（Auth E2E回归） | `docs/refactor/policy-ops-agent/reports/feature-09-03-service-jwt/acceptance-report.md`；ADR：`docs/refactor/policy-ops-agent/archive/decisions/ADR-0005-内网服务JWT.md` | Accepted |
| 09-02 用户与管理员双角色鉴权 | AUTH-FR-001～013、AUTH-NFR-001～008、AUTH-AC-001～020 | `drizzle/0008_auth_identity.sql`、`src/server/modules/identity/*`、`src/lib/auth/*`、`src/proxy.ts`、`src/app/{login,register,account,admin/users}`、`src/app/api/{auth,account,admin/users}`、`src/app/api/{chat,conversations,plan}`、`src/lib/ai/{agent,tools}.ts`、`scripts/bootstrap-admin.mjs` | `src/server/modules/identity/__tests__/{domain,application,identity-repository.integration}.test.ts`、`__tests__/fakes.ts`、`src/server/modules/__tests__/use-cases.test.ts`、`e2e/auth.spec.ts`、`playwright.config.ts` | `docs/refactor/policy-ops-agent/reports/feature-09-02-auth/acceptance-report.md`；ADR：`docs/refactor/policy-ops-agent/decisions/ADR-0007-NextAuth授权窗口与PostgreSQL刷新会话.md` | Accepted |

AUTH-AC 对应：AC-001/004/005/008/013/015/016/006/007 由 E2E 与单元覆盖；AC-002/003/010/011/012/014/018/019 由单元、集成与引导执行覆盖；AC-017 由集成（旧行不变）与路由 404 语义覆盖；AC-020 为门禁汇总（见验收报告 §4）。AC-009 由 15 分钟窗口单元（domain/application）与 NextAuth jwt 集成路径覆盖。

SJWT-AC对应：AC-001～009由Node/Python单元测试与`testdata/service-jwt-vectors.json`跨语言契约向量（Node `jose`/Python `PyJWT`互验固定claims、拒绝向量双向失败、协议常量漂移守卫）覆盖；AC-010由Python模块级配置校验（`agent/api/main.py`强装配、`worker/tasks.py`导入期校验）与Node provider校验覆盖；AC-011～014由Node/Python数据库集成覆盖（首次消费行内容、8路并发同JTI恰好一个成功、业务回滚JTI同回滚、重放表不可用503 `SERVICE_AUTH_STORE_UNAVAILABLE`+no-store）；AC-015由集成路由矩阵覆盖（`/internal/health`唯一豁免、`/internal/ready`与业务端点必须JWT）；AC-016由零泄漏约定（日志/响应/测试产物无Token/Secret）与Secret扫描门禁覆盖；AC-017由完整隔离Compose双向真实TCP冒烟覆盖（本地演练+CI container-gates同构步骤）；AC-018为全项目门禁新鲜复现（见验收报告§4）。

## 当前Work Item

| Work Item | 规格 | 实现位置 | 测试路径 | 验收证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| WI-20260901-01 | `docs/work-items/WI-20260901-01-docs-reorganization.md` | `docs/README.md`、`docs/prd/`、`docs/standards/`、`docs/refactor/policy-ops-agent/`、`AGENTS.md`、`.gitignore` | 文档任务无新增业务测试文件；执行链接、状态、ignore、Secret和项目回归命令 | `docs/refactor/policy-ops-agent/PROGRESS.md` | Accepted |

## 更新规则

- 任务完成后填入实现文件、实际测试路径、验证证据和提交链接。
- PRD或Work Item验收后链接对应acceptance report或PROGRESS证据。
- 需求增加、删除或拆分时，同步更新当前PRD、Work Item、架构和本矩阵。
- 不允许用一个泛化测试链接替代未实际覆盖的需求。
