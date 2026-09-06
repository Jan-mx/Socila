# 需求追踪矩阵

> Author: Jan
> Status: Active
> Updated: 2026-09-05

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
| 09-03 本地运行配置/凭据整改 | CFG-FR-001～010、CFG-NFR-001～007 | 共享加载器、模板与入口收口、引导一次性化、门禁例外收口、新鲜备份+真实恢复对账、PostgreSQL口令轮换与对账、演练资源无条件清理 | CFG-AC-001～013 | `scripts/lib/load-environment.mjs`、`scripts/run-migrations.mjs`、`scripts/bootstrap-admin.mjs`、`drizzle.config.ts`、`infra/prod/docker-compose.yml`、`.env.example`、`infra/prod/.env.example`、`docs/refactor/policy-ops-agent/config/runtime.env.example`、`README.md`、`next.config.ts`、`playwright.config.ts`、`scripts/run-auth-e2e.mjs`、`src/lib/db/guard.ts`、`.gitignore`、`vercel.json`（删除） | `docs/refactor/policy-ops-agent/reports/stage-09-03-runtime-config-remediation/acceptance-report.md` |

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
| 09-03 Core与Agent双向服务JWT鉴权 | SJWT-FR-001～009、SJWT-NFR-001～007、SJWT-AC-001～019 | `src/lib/security/{service-jwt.ts,service-jwt-provider.ts,service-jwt-startup-node.ts}`、`src/instrumentation.ts`、`src/server/modules/agent-integration/infrastructure/drizzle/service-jwt-replay.repository.ts`、`src/server/modules/agent-integration/application/materialize.ts`、`src/app/api/admin/proposals/route.ts`、`src/app/api/admin/proposals/[proposalId]/review/route.ts`、`src/app/api/internal/v1/draft-imports/route.ts`、`src/lib/db/schema.ts`、`drizzle/0009_service_jwt_replays.sql`、`drizzle/meta/_journal.json`、`services/agent/agent/security/{service_jwt.py,replay.py}`、`services/agent/agent/api/{app.py,main.py}`、`services/agent/agent/{config.py,core_client.py,repositories.py}`、`services/agent/agent/worker/tasks.py`、`services/agent/agent/migrations/0007_service_jwt_replays.sql`、`services/agent/pyproject.toml`、`infra/prod/docker-compose.yml`、`.env.example`、`playwright.config.ts`、`.github/workflows/ci.yml` | `src/lib/security/{service-jwt.test.ts,service-jwt-vectors.contract.test.ts,service-jwt-startup.test.ts,service-jwt-startup-node.test.ts,service-jwt-startup-runtime-contract.test.ts}`、`src/lib/env/service-jwt-config-contract.test.ts`、`src/server/modules/agent-integration/__tests__/service-jwt-replay.integration.test.ts`、`src/server/modules/agent-integration/__tests__/draft-imports-route.integration.test.ts`、`services/agent/tests/{test_service_jwt.py,test_service_jwt_vectors.py,test_service_jwt_replay_integration.py}`、`testdata/service-jwt-vectors.json`、`.github/workflows/ci.yml`、`e2e/auth.spec.ts`；SJWT-NFR-007/AC-019由Docker对象零残留复核覆盖 | `docs/refactor/policy-ops-agent/reports/feature-09-03-service-jwt/acceptance-report.md`；ADR：`docs/refactor/policy-ops-agent/archive/decisions/ADR-0005-内网服务JWT.md`；主体提交`35d673c`，修复提交`fix: 补齐服务JWT复审缺漏`，二次复查修复提交`fix: 收紧服务JWT占位符与连接超时`（2026-09-04：模板占位符空值+启动强制校验防回归、`PostgresReplayGuard`确定性连接超时），三次复查修复提交`fix: 隔离服务JWT启动校验运行时`（2026-09-04：Edge运行时隔离——Node专用启动模块+async register动态import，构建零警告） | Accepted |
| 09-02 用户与管理员双角色鉴权 | AUTH-FR-001～013、AUTH-NFR-001～008、AUTH-AC-001～020 | `drizzle/0008_auth_identity.sql`、`src/server/modules/identity/*`、`src/lib/auth/*`、`src/proxy.ts`、`src/app/{login,register,account,admin/users}`、`src/app/api/{auth,account,admin/users}`、`src/app/api/{chat,conversations,plan}`、`src/lib/ai/{agent,tools}.ts`、`scripts/bootstrap-admin.mjs` | `src/server/modules/identity/__tests__/{domain,application,identity-repository.integration}.test.ts`、`__tests__/fakes.ts`、`src/server/modules/__tests__/use-cases.test.ts`、`e2e/auth.spec.ts`、`playwright.config.ts` | `docs/refactor/policy-ops-agent/reports/feature-09-02-auth/acceptance-report.md`；ADR：`docs/refactor/policy-ops-agent/decisions/ADR-0007-NextAuth授权窗口与PostgreSQL刷新会话.md` | Accepted |

AUTH-AC 对应：AC-001/004/005/008/013/015/016/006/007 由 E2E 与单元覆盖；AC-002/003/010/011/012/014/018/019 由单元、集成与引导执行覆盖；AC-017 由集成（旧行不变）与路由 404 语义覆盖；AC-020 为门禁汇总（见验收报告 §4）。AC-009 由 15 分钟窗口单元（domain/application）与 NextAuth jwt 集成路径覆盖。

SJWT-AC对应：AC-001～009由Node/Python单元测试与`testdata/service-jwt-vectors.json`跨语言契约向量覆盖；AC-010由Python模块级配置校验、Node provider校验与Web Node运行时启动入口`src/instrumentation.ts`fail-fast覆盖（2026-09-04运行时隔离：启动校验与退出码1终止位于Node专用模块`src/lib/security/service-jwt-startup-node.ts`，`register`为async且仅`NEXT_RUNTIME=nodejs`分支动态导入该模块，instrumentation本体零Node专用API引用——源码契约测试防回归、Edge构建零警告；无效Secret时进程退出1，standalone真实启动拒绝D2/E2及2026-09-04四场景复验收），Compose`AGENT_SERVICE_JWT_CURRENT`必填插值使缺失/空值时`docker compose config`失败；AC-011～014由Node/Python数据库集成覆盖（Python重放SQL阶段缺表/权限不足/连接中断/连接超时（确定性`connect_timeout`默认5秒、测试1秒）统一映射`ServiceAuthStoreUnavailable`→503，`JtiReplayConflict`单独传播→401，业务阶段异常原样传播不包装，JTI与业务写同事务回滚）；AC-015由集成路由矩阵覆盖（`/internal/docs`/`/docs`/`/redoc`/`/openapi.json`全部404、`/internal/health`唯一豁免、`/internal/ready`与业务端点必须JWT）；AC-016由零泄漏约定（日志/响应/测试产物无Token/Secret）与Secret扫描门禁覆盖；AC-017由完整隔离Compose双向真实TCP冒烟覆盖（本地演练+CI container-gates同构步骤）；AC-018为全项目门禁新鲜复现（验收报告§7.4）；AC-019由2026-09-03复审删除`sjwt-drill-pg`及匿名卷、以及本轮修复演练资源（`sjwfx-pg`容器/卷/网络）创建前清单记录与最终零残留复核覆盖（验收报告§7.1/§7.5）。最终状态见验收报告§7。

| 09-05 Socila命名统一与地区DSL分层 | SDL-FR-001～014、SDL-NFR-001～007、SDL-AC-001～010 | `dsl/protocol/socila_dsl_v1/`（Socila Schema+发布工作流+README）、`dsl/README.md`、`dsl/regions/shanghai_dsl_v1/`（24规则SOCILA-DSL-1.0+params+rule_sets+tests+rules_manifest.json）、`src/lib/dsl/region-manifest.ts`、`src/lib/db/seed/{index.ts,seed-rules.ts,seed-params.ts,seed-misc.ts}`（删除seed-regional.ts）、`drizzle/0010_sdl_dsl_normalization_example_cleanup.sql`+journal、`src/server/modules/policy/__tests__/fixtures/regional-examples.ts`、`src/lib/{security/service-jwt.ts,security/anon-session.ts,security/rate-limit.ts,client/session.ts}`、`services/agent/agent/security/service_jwt.py`、`testdata/service-jwt-vectors.json`（重签）、`package.json`/`package-lock.json`（socila-web）、`scripts/run-auth-e2e.mjs`、`playwright.config.ts`、`infra/dev/docker-compose.dev.yml`、`data/shanghai-test-cases-from-transcripts.xlsx`（git mv）、`.github/workflows/ci.yml`、`.gitleaks.toml`、各SSP/SSRP活动标识硬切换（约40文件） | `src/lib/naming/socila-naming-contract.test.ts`、`src/lib/dsl/{region-manifest.test.ts,dsl-layout.test.ts}`、`src/lib/data/data-file-contract.test.ts`、`src/lib/db/seed/index.test.ts`、`src/lib/documentation-copy.test.ts`、`src/lib/ui-copy.test.ts`、`src/lib/security/{service-jwt.test.ts,service-jwt-vectors.contract.test.ts}`、`services/agent/tests/{test_service_jwt.py,test_service_jwt_vectors.py}`、`src/server/modules/policy/__tests__/{sdl-0010-migration.integration.test.ts,regional-isolation.integration.test.ts,seed-regional-clean.integration.test.ts}` | `docs/refactor/policy-ops-agent/reports/feature-09-05-socila-naming/acceptance-report.md`（§8复审发现、§9纠正与重新验收）；ADR：`ADR-0009-Gitleaks目标规则allowlist与哨兵回归.md`（替代ADR-0008） | Accepted（2026-09-05复审纠正后重新验收：命名契约`src/lib/naming/socila-naming-contract.ts`精确片段语义、`.gitleaks.toml` [[allowlists]]+targetRules+哨兵回归`scripts/verify-gitleaks-allowlist.mjs`、多地区Seed地区作用域+`multi-region-seed.integration.test.ts`+`drizzle/0011_sdl_tests_jurisdiction_backfill.sql`） |

第二次复审补充：`src/lib/naming/socila-naming-contract.ts`注释自扫描修复、`.gitleaksignore`单条历史误报fingerprint、`next.config.ts`构建worker限制；新鲜证据见同一验收报告§10（`npm test` 359/359、Gitleaks 43提交零发现、2-worker生产Build退出0）。

## 当前Work Item

| Work Item | 规格 | 实现位置 | 测试路径 | 验收证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| WI-20260901-01 | `docs/work-items/WI-20260901-01-docs-reorganization.md` | `docs/README.md`、`docs/prd/`、`docs/standards/`、`docs/refactor/policy-ops-agent/`、`AGENTS.md`、`.gitignore` | 文档任务无新增业务测试文件；执行链接、状态、ignore、Secret和项目回归命令 | `docs/refactor/policy-ops-agent/PROGRESS.md` | Accepted |

## 更新规则

- 任务完成后填入实现文件、实际测试路径、验证证据和提交链接。
- PRD或Work Item验收后链接对应acceptance report或PROGRESS证据。
- 需求增加、删除或拆分时，同步更新当前PRD、Work Item、架构和本矩阵。
- 不允许用一个泛化测试链接替代未实际覆盖的需求。

## 09-05 Stage 国家baseline及广东四川权威overlay（2026-09-05）

| 需求范围 | 实现位置 | 测试路径 | 验收证据 | 状态 |
| --- | --- | --- | --- | --- |
| NRP-FR-001～016、NRP-NFR-001～008、NRP-AC-001～010 | `drizzle/0012_nrp_explicit_overlay_operation.sql`、`src/lib/db/schema.ts`、`src/server/modules/policy/domain/overlay.ts`、`src/server/modules/policy/application/snapshot-service.ts`、`src/lib/dsl/{overlay-operation.ts,region-manifest.ts,citation-contract.test.ts}`、`src/lib/db/seed/{seed-rules,seed-params,seed-misc}.ts`、`src/lib/engine/{test-runner.ts,orchestrator.ts}`、`dsl/regions/cn_dsl_v1/`（16规则+CN-BASELINE）、`dsl/regions/guangdong_dsl_v1/`、`dsl/regions/sichuan_dsl_v1/`、`dsl/regions/shanghai_dsl_v1/`（重分类后8规则+显式replace）、`docs/refactor/policy-ops-agent/reports/stage-09-05-national-baseline-overlays/evidence/`（CN/GD/SC官方原件+HTTP元数据+SHA-256+逐字摘录） | `src/server/modules/policy/__tests__/{overlay.test.ts,nrp-explicit-overlay.integration.test.ts,nrp-gd-overlay.integration.test.ts,nrp-sc-overlay.integration.test.ts,snapshot-service.integration.test.ts}`、`src/lib/engine/__tests__/{cn-baseline-golden.test.ts,guangdong-overlay-golden.test.ts,sichuan-overlay-golden.test.ts,shanghai-reclassification-drift.test.ts,golden.test.ts,golden-snapshot.test.ts}`、`src/lib/dsl/{overlay-operation.test.ts,dsl-layout.test.ts,region-manifest.test.ts}` | `docs/refactor/policy-ops-agent/reports/stage-09-05-national-baseline-overlays/acceptance-report.md`；提交`500db14`（里程碑A国家baseline）、`b4cba62`（里程碑B上海重分类零漂移）、`8779e02`（里程碑C广东overlay）、`2c4c19e`（里程碑D四川overlay），均已推送上游 | 里程碑A/B/C/D交付并验证；候选快照管理员批准与待办裁决为后续人工动作 |

## 09-05 Stage 阶段E 权威资产持久化与地区化管理（2026-09-06）

| 需求范围 | 实现位置 | 测试路径 | 验收证据 | 状态 |
| --- | --- | --- | --- | --- |
| NRP-FR-017～022、NRP-NFR-009～012、NRP-AC-011～016 | `drizzle/0013_nrp_stage_e_materialization.sql`、`src/lib/policy-materialization/{target.ts,manifest.ts,plan.ts,materialize.ts,git-reader.ts,no-env-fallback.ts}`、`scripts/materialize-policy-regions.ts`、`scripts/restore-reconcile.mjs`、`scripts/planning-regression.ts`、`src/lib/admin/publish-service.ts`、`src/lib/admin/params-service.ts`、`src/server/modules/rules/{application/ports.ts,infrastructure/drizzle/rules-read.repository.ts}`、`src/app/api/admin/**`（列表/详情/校验/示例/版本/发布地区身份）、`src/app/api/admin/policy-coverage/route.ts`、`src/components/admin/RegionCoverageBanner.tsx`、`src/app/admin/{rules,params,publish}` | `src/lib/policy-materialization/{materializer.unit.test.ts,materializer.integration.test.ts}`、`src/server/modules/policy/__tests__/nrp-0013-materialization-schema.integration.test.ts` | `reports/stage-09-05-national-baseline-overlays/acceptance-report.md` §10（备份/恢复对账/audit/apply/幂等/固定计数49-70-5-4/旧行哈希不变/规划回归一致/blocked语义） | 阶段E交付并验证；blocked地区待缺口消除，awaiting_approval待管理员批准 |

## 09-05 Stage 阶段E复审缺陷修复（2026-09-06）

| 需求范围 | 实现位置 | 测试路径 | 验收证据 | 状态 |
| --- | --- | --- | --- | --- |
| NRP-FR-017～022（缺陷修复）、NRP-NFR-009～012、NRP-AC-011～016 | `src/lib/policy-materialization/target.ts`（守卫加固+整行哈希）、`src/lib/admin/entity-edit-policy.ts`、`src/lib/admin/{publish-service.ts,params-service.ts}`、`src/server/modules/rules/{application/ports.ts,infrastructure/drizzle/rules-read.repository.ts}`（listParamsForPreview/listTests继承链）、`src/app/api/admin/**`（白名单+精确身份+GET）、`drizzle/0014_nrp_stage_e_constraints.sql`、`scripts/{materialize-policy-regions.ts,restore-reconcile.ts,planning-regression.ts}`、`src/components/admin/RegionCoverageBanner.tsx` | `src/lib/policy-materialization/target-guard.test.ts`（13）、`src/lib/admin/{entity-edit-policy.test.ts,params-service.test.ts}`（16）、`src/app/api/admin/__tests__/{nrp-identity-regional,nrp-stage-e-fix}.integration.test.ts`（8）、`drizzle/0014`迁移与并发测试 | `reports/stage-09-05-national-baseline-overlays/acceptance-report.md` §11（缺陷/Red证据/修复/纠正表述/持久库repair待授权） | 11项缺陷关闭并取得新鲜门禁；repair待用户授权；任务2保持Reopened |
