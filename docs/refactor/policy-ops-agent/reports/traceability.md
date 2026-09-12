# 需求追踪矩阵

> Author: Jan
> Status: Active
> Updated: 2026-09-12

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
| WI-20260911-01（09-11 Feature上海政策纠偏与案例V2，阶段一） | SHV2-FR-001～007、SHV2-NFR-001/002/006/008、SHV2-AC-001～005 | `docs/refactor/policy-ops-agent/reports/stage-09-05-national-baseline-overlays/evidence/310000/`（23份官方原文）、`dsl/regions/shanghai_dsl_v1/`（参数包多窗口纠偏+10规则+11示例+manifest26规则集）、`src/lib/dsl/{param-windows.ts,shanghai-policy-v2.test.ts,citation-verifier.test.ts}`、`src/lib/dsl/citation-contract.test.ts`（上海纳入扫描）、`src/lib/case-governance/{dsl-examples.ts,manifest.ts,generator.ts,executor.ts}`（DSL_EXAMPLE_COUNT=44）、`src/lib/policy-materialization/{materialize.ts,shv2-shanghai-delta.integration.test.ts}`（expectedTotalCounts场景注入+AC-004测试）、`src/lib/engine/__tests__/shanghai-reclassification-drift.test.ts`（SHV2冻结基线46例） | `src/lib/dsl/shanghai-policy-v2.test.ts`（23例）、`citation-verifier.test.ts`（反例6例）、`citation-contract.test.ts`（上海100%覆盖）、`dsl-layout.test.ts`（10规则/31条目/26规则集）、`dsl-examples.test.ts`（44/沪11）、`golden.test.ts`/`golden-snapshot.test.ts`/`shanghai-reclassification-drift.test.ts`、`shv2-shanghai-delta.integration.test.ts`（隔离库上海delta隔离3例） | `docs/refactor/policy-ops-agent/reports/feature-09-11-shanghai-case-v2/acceptance-report.md` §1 | Accepted（2026-09-11） |
| WI-20260907-02 | `docs/work-items/WI-20260907-02-task3-temporal-entry-hardening.md` | `src/server/modules/publishing/application/release-gates.ts`（空黄金测试集fail-closed）、`src/server/modules/publishing/application/jurisdiction-release.use-case.ts`（停用地区绑定+`ReleaseJurisdictionMismatchError`）、`src/app/api/admin/jurisdictions/[code]/releases/[releaseId]/route.ts`（URL地区传入用例+409映射）、`src/server/modules/planning/application/replay-plan.use-case.ts`（三方hash+`ReplaySnapshotDriftError`）、`src/app/api/plan/[id]/replay/route.ts`（409 `REPLAY_SNAPSHOT_DRIFT`）、`src/server/modules/planning/application/jurisdiction-compute.use-case.ts`（plan保存snapshotContentHash，JRP-FR-009）、`scripts/e2e-task3-setup.ts`、`src/server/modules/identity/__tests__/identity-container.test.ts`（30秒显式超时稳定化） | `release-gates.test.ts`（空集合反例）、`jurisdiction-release.use-case.test.ts`（广东URL+上海releaseId拒绝且零修改）、`replay-plan.use-case.test.ts`（三方一致/保存hash漂移/重算hash漂移/缺保存hash）、`jurisdiction-compute.use-case.test.ts`（savePlan hash断言）、`jurisdiction-compute.integration.test.ts`（跨地区停用拒绝+2026/2030广东不同快照落库）、`e2e/task3-regional.spec.ts`（JRP-AC-008 replay/JRP-AC-009跨地区停用与停用后unsupported） | `reports/feature-09-05-jurisdiction-planning/acceptance-report.md`（2026-09-09第二轮修复验收） | Accepted（2026-09-09） |
| WI-20260907-03 | `docs/work-items/WI-20260907-03-regional-policy-case-rebuild.md` | 任务4代码、确定性案例、归档门禁及repair执行器 | Node/DB/E2E/Python/安全门禁及隔离repair演练 | 任务4验收报告§9～§11 | Accepted |
| WI-20260907-04 | `docs/work-items/WI-20260907-04-persistent-case-library-replacement.md` | repair-forward单事务修复账本与可信归档元数据 | 12项持久验证、repair no-op、pre/post恢复40表/20 sequence | R8执行证据及2026-09-11独立复审 | Accepted |
| WI-20260909-01 | `docs/work-items/WI-20260909-01-task34-final-integration.md` | 最终集成分支`39f0e2a`以显式merge commit合入`refactor/policy-ops-agent-platform`（目标原SHA/merge-base `57f051d`） | 祖先/父提交、137路径完整差异、Node/隔离DB/Chromium/Python/安全门禁、持久库只读零变化与远端SHA核对 | `reports/task34-final-integration/acceptance-report.md` | Accepted（2026-09-11） |
| WI-20260907-01 | `docs/work-items/WI-20260907-01-sichuan-policy-followup.md` | 计划：四川三项正式来源到位后的规则、参数、物化、审核和候选快照 | 计划：权威引用、黄金、隔离、物化、快照重放；不得提前填写PASS | ADR-0010；等待解锁后新增独立验收证据 | Blocked；不阻塞任务2首期 |
| WI-20260906-02 | `docs/work-items/WI-20260906-02-stage-e-persistent-repair.md` | 实际：持久库`socila-postgres/policyops`（0014迁移+`scripts/materialize-policy-regions.ts` repair一次）；证据`audit-policyops-wi-02.json`、`repair-policyops-wi-02.json`、备份`backup/db/policyops-wi-02-{pre,post}-*.dump`（Git忽略） | 无新增代码/测试；复用WI-01既有守卫与集成覆盖；只读验证`restore-reconcile.ts`/`planning-regression.ts` | 任务2验收报告§15/§17 | Accepted；任务2首期最终Accepted |
| WI-20260906-01 | `docs/work-items/WI-20260906-01-stage-e-pack-repair-hardening.md` | 实际：`src/lib/policy-materialization/target.ts`（PackTargetBinding+loadPackTargets+指纹绑定draft包）、`src/lib/policy-materialization/materialize.ts`（repair重写：事务内FOR UPDATE锁定重校验/REPAIR_TARGET_CHANGED/computeRepairBatchHash确定性repaired批次+新成员/原成员不可变/isJurisdictionBlocked纳入repaired）、`scripts/materialize-policy-regions.ts`（按实际数量输出）、`src/lib/db/index.ts`（池error监听） | 实际：`src/lib/policy-materialization/materializer.integration.test.ts`（+6场景：守卫/目标绑定/正常修复/回滚/并发/幂等零漂移）、`materializer.unit.test.ts`（+2：指纹绑定/CLI源码契约）、`target-guard.test.ts`、`src/lib/engine/__tests__/{guangdong,sichuan}-overlay-golden.test.ts`（既有any→unknown类型修复） | 任务2验收报告§14（Red/Green+全量门禁）；持久库执行见§15/WI-02 | Accepted |
| WI-20260901-01 | `docs/work-items/WI-20260901-01-docs-reorganization.md` | `docs/README.md`、`docs/prd/`、`docs/standards/`、`docs/refactor/policy-ops-agent/`、`AGENTS.md`、`.gitignore` | 文档任务无新增业务测试文件；执行链接、状态、ignore、Secret和项目回归命令 | `docs/refactor/policy-ops-agent/PROGRESS.md` | Accepted |

## 09-07 分地区交付与下游修复计划

| 任务 | 需求范围 | 计划实现 | 计划测试 | 状态 |
| --- | --- | --- | --- | --- |
| 任务2 CN/沪/GD首期 | NRP-FR-001～022、NRP-NFR-001～012、NRP-AC-001～016（ADR-0010范围） | 广东delta、失业金额规则、三地区审核与候选快照 | 已有任务2验收报告§17 | Accepted；保持不变 |
| 任务3 地区感知规划修复 | JRP-FR-001～029、JRP-NFR-001～010、JRP-AC-001～012 | 2026-09-09第二轮修复完成：空黄金测试集fail-closed、停用URL地区绑定、replay三方hash、plan保存快照hash、compute/replay/停用路由同步 | 2026-09-09第二轮验收：`release-gates.test.ts`空集合反例、`jurisdiction-release.use-case.test.ts`跨地区停用拒绝、`replay-plan.use-case.test.ts`三方hash反例、集成`jurisdiction-compute.integration.test.ts`（含2026/2030广东不同快照落库）、显式隔离DB 116/116零skip、Chromium E2E 19/19 | Accepted（2026-09-09）；证据见任务3验收报告§8 |
| 任务4 地区案例重建 | RCL-FR-001～022、RCL-NFR-001～008、RCL-AC-001～015 | 确定性沪粤案例、真实归档/恢复、manifest自校验、42 example原子同步、repair-forward执行器与持久验收均已闭环 | Node 75文件/740、隔离DB全集、Chromium 19/19、Python及安全门禁；持久repair独立复审通过 | Accepted（2026-09-11）；证据见任务4验收报告及WI-20260907-04 |

## 09-07 任务2首期：广东增量物化与地区就绪（2026-09-07）

| 需求范围 | 实现位置 | 测试路径 | 验收证据 | 状态 |
| --- | --- | --- | --- | --- |
| ADR-0010任务2首期（广东确定性delta：5参数+1规则+1规则集版本+1政策包版本；失业金额规则；地区就绪） | `src/lib/policy-materialization/shapes.ts`（新增：载荷规范化形状与内容哈希）、`target.ts`（existingEntityHashes/指纹绑定实体内容/EXPECTED 50-75-6-5）、`plan.ts`（增量跳过：规则/参数/规则集/政策包）、`materialize.ts`（零delta no-op守卫）、`manifest.ts`（regionReadiness 440000→awaiting_approval）、`dsl/regions/guangdong_dsl_v1/rules/R-GD-UI-AMOUNT.json`（新增：领取地市最低工资×90%，缺参needs_agent）、`dsl/regions/guangdong_dsl_v1/{rules_manifest.json,rule_sets/rule_set_guangdong_plan_v1.json,tests/rule_examples_as_tests.json}`（规则集下一版本含新规则） | `src/lib/policy-materialization/materializer.unit.test.ts`（增量计划2场景：持久库式delta 1/5/1/1与全量no-op）、`materializer.integration.test.ts`（seedPersistentMirror持久库镜像+audit delta+apply 50/75/6/5+复跑no-op+WI-repair全套回归）、`target-guard.test.ts`、`src/lib/engine/__tests__/guangdong-overlay-golden.test.ts`（2030前R-220守卫/2030男30女25/边界/失业金额编排）、`src/lib/dsl/dsl-layout.test.ts`（GD规则清单2条） | 任务2验收报告§17（Red：旧实现重放26/46/4/4与GD blocked；Green：delta 1/5/1/1、零新增、复跑no-op、能力边界golden、全量门禁） | 代码/测试已交付；持久库apply、管理员批准、候选快照分别待授权 |

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
| NRP-FR-017～022（缺陷修复）、NRP-NFR-009～012、NRP-AC-011～016 | `src/lib/policy-materialization/target.ts`（守卫加固+整行哈希）、`src/lib/admin/entity-edit-policy.ts`、`src/lib/admin/{publish-service.ts,params-service.ts}`、`src/server/modules/rules/{application/ports.ts,infrastructure/drizzle/rules-read.repository.ts}`（listParamsForPreview/listTests继承链）、`src/app/api/admin/**`（白名单+精确身份+GET）、`drizzle/0014_nrp_stage_e_constraints.sql`、`scripts/{materialize-policy-regions.ts,restore-reconcile.ts,planning-regression.ts}`、`src/components/admin/RegionCoverageBanner.tsx` | `src/lib/policy-materialization/target-guard.test.ts`（13）、`src/lib/admin/{entity-edit-policy.test.ts,params-service.test.ts}`（16）、`src/app/api/admin/__tests__/{nrp-identity-regional,nrp-stage-e-fix}.integration.test.ts`（8）、`drizzle/0014`迁移与并发测试 | `reports/stage-09-05-national-baseline-overlays/acceptance-report.md` §12（首轮缺陷修复）与§13（repair执行准备复审） | 11项首轮缺陷已有Green；repair加固转WI-20260906-01，任务2保持Reopened |

## 09-09 任务3第二轮修复：空黄金测试集/停用地区绑定/三方snapshot hash（2026-09-09）

> 当前运行事实更新：0017与日期快照已由WI-20260907-04执行；任务3代码验收保持Accepted，但迁移账本规范性属于当前repair-forward复审范围。下表末列的“尚未执行”为第二轮验收时点记录。

| 需求范围 | 实现位置 | 测试路径 | 验收证据 | 状态 |
| --- | --- | --- | --- | --- |
| JRP-FR-007/027/028/AC-007/008/009（2026-09-09复审三项P1） | `src/server/modules/publishing/application/release-gates.ts`（golden_tests：tests为空时fail-closed，不再记pass）、`src/server/modules/publishing/application/jurisdiction-release.use-case.ts`（`DeactivateReleaseInput.jurisdictionCode`+`ReleaseJurisdictionMismatchError`，地区不一致零写入）、`src/app/api/admin/jurisdictions/[code]/releases/[releaseId]/route.ts`（URL code传入用例+409+url/record代码）、`src/server/modules/planning/application/replay-plan.use-case.ts`（保存hash/快照行hash/重算hash三方一致，任一不一致抛`ReplaySnapshotDriftError` fail-closed）、`src/app/api/plan/[id]/replay/route.ts`（409 `REPLAY_SNAPSHOT_DRIFT`+drift详情）、`src/server/modules/planning/application/jurisdiction-compute.use-case.ts`（savePlan写入snapshotContentHash，JRP-FR-009）、`scripts/e2e-task3-setup.ts`（E2E沪粤快照+真实七道门禁激活）、`src/server/modules/identity/__tests__/identity-container.test.ts`（模块重载用例30秒显式超时，2026-09-09复审P2稳定化） | `src/server/modules/publishing/application/__tests__/release-gates.test.ts`（空黄金测试集必须拒绝）、`__tests__/jurisdiction-release.use-case.test.ts`（广东URL+上海releaseId→`ReleaseJurisdictionMismatchError`且deactivateById未调用）、`src/server/modules/planning/application/__tests__/replay-plan.use-case.test.ts`（三方一致成功/保存hash漂移拒绝/重算hash漂移拒绝/缺保存hash拒绝）、`__tests__/jurisdiction-compute.use-case.test.ts`（savePlan断言snapshotContentHash）、`__tests__/jurisdiction-compute.integration.test.ts`（停用经用例+跨地区拒绝且SH保持active+2026/2030广东命中不同snapshot并360月）、`e2e/task3-regional.spec.ts`（JRP-AC-008历史replay 200与三方一致、JRP-AC-009跨地区停用409且零修改、停用后409 POLICY_SNAPSHOT_UNAVAILABLE并恢复） | 任务3验收报告§8（Red/Green、显式隔离DB `task34r2_drill` 116/116零skip、E2E全套19/19、门禁汇总）；DB命令显式 `SOCILA_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5439/task34r2_drill` | Accepted（2026-09-09）；0017/持久库仍未执行，待WI-20260907-04授权 |


## 任务4第三轮修复（2026-09-10，WI-20260907-03重新Accepted）

| 需求 | 实现 | 测试 |
| --- | --- | --- |
| RCL-FR-002/AC-003 旧test完整内容hash | `src/lib/case-governance/hashes.ts`（TEST_INFRA_COLUMNS/testRowContentHash/Date规范化）、`executor.ts` planRclReplacement全行读取、`apply.ts` verifyOldTargets事务内重算 | `__tests__/hashes.test.ts`（8业务字段漂移/基础设施排除）、`rcl-apply.integration.test.ts`（8字段漂移拒绝）、`rcl-cli.integration.test.ts`（旧targets hash非空） |
| RCL-FR-005/006 manifest三方自校验 | `manifest.ts`（buildCoreFromInput/buildCoreFromBody/recomputeManifestHash/assertManifestContentHashes/assertRclCounts强制42）、`executor.ts` verifyRclArchive、`apply.ts` 事务内重算 | `manifest.test.ts`（正文篡改/createdAt不入hash/42强制/内容hash完整性）、`rcl-apply.integration.test.ts` |
| RCL-FR-003 SHA清单精确覆盖 | `archive.ts` verifySha256SumsFile（7文件各一次/安全basename/64位hex/不自包含/无重复额外） | `archive.test.ts`（删除行/重复/额外/路径穿越/非法hash/缺清单行） |
| RCL-FR-004/AC-004 restore真实验证 | `archive.ts` validateRestoreReport、`reconcile.ts` listSequences/tableDetailsWithHash/buildVerifiedRestoreReport | `archive.test.ts`（空明细拒绝/计数/明细/archiveFileHashes）、`rcl-cli.integration.test.ts`（真实报告生成） |
| RCL-FR-005/AC-008 selection真实计算 | `archive.ts` computeSelectionReport/verifySelectionReport、`rcl-case-library.ts` CLI接入 | `archive.test.ts`、`executor.test.ts`、`rcl-cli.integration.test.ts`（selection真实配额断言） |
| RCL-FR-018/AC-011 42 example原子同步 | `dsl-examples.ts` loadDslExampleTargets/buildExampleSync、`manifest.ts` exampleSync类型、`apply.ts` syncExamples | `dsl-examples.test.ts`（42条确定性/hash）、`rcl-apply.integration.test.ts`（同事务同步/回滚）、`rcl-cli.integration.test.ts` |
| RCL-FR-019/AC-010 批次状态 | `executor.ts` prepare事务化+重dump自包含、verify精确prepared匹配+0行失败、`apply.ts` applied更新returning | `rcl-apply.integration.test.ts`（batchId不存在/applied复跑不新增）、`rcl-cli.integration.test.ts` |
| Fix 8 新行hash核对 | `row-projections.ts`（新行DB行投影hash）、`apply.ts` verifyNewRowHashes、`executor.ts` verify per-row | `rcl-apply.integration.test.ts`（verifiedRows/漂移verify失败）、`rcl-cli.integration.test.ts`（verify检测漂移） |
| Fix 9 测试库端口 | `materializer.integration.test.ts`（DRILL_PORT解析）、`scripts/db-gate-task34.mjs`（随机端口容器编排） | 门禁：随机端口容器26文件/137零skip |

## 任务4第三轮只读审计与repair-forward（2026-09-10，WI-20260907-04保持Reopened）

- `scripts/rcl-audit-task34.mjs`：只读审计（持久库仅SELECT、pre/post dump隔离恢复、restore-reconcile对比、pre重建可信归档、当前attestation、账本/snapshot/batch审计）。
- 证据：`F:/Socila/backup/case-library/task34-r3-audit-2026-09-10T01-15-43/`（audit-summary.json、attestation-current.json、old-archive-manifest-pre.json、compare-current-vs-post.txt、repair-forward-plan.json）。
- 关键值：attestationManifestHash `3e081d594082e5cee5e2d05f82bae8cfb35db017a722d5cebbf2bd2dd40a84c4`；migrationLedgerFingerprint `205acb407afd2be5350f30bb40ca9190851d6124864e4c9e094d511398238f1b`；targetFingerprint `58cef928a52482e196f2bc102eb5247cef46c2e108f2f82091430e1fa090cfce`；pre重建旧归档manifestHash `da0ea94d4e8ce07b06dd50d2cdd4780110c256705fd7f024c83f5e4378cb32ef`。

## 任务4第四轮修复与只读审计（2026-09-10，WI-20260907-03 Reopened、WI-04 Reopened）

| 需求 | 实现 | 测试 |
| --- | --- | --- |
| RCL-FR-002/003/005 prepare-archive补偿 | `executor.ts` prepareRclArchive（写入跟踪/批次提交跟踪/DB补偿按batchId+status='prepared'守卫条件删除/文件补偿只删本次新建文件/`RclPrepareError`携带originalError+compensationErrors；`RclStorage.remove`新增） | `executor.test.ts`（第二次完整dump失败/写文件失败/最终SHA生成失败/补偿失败双错误，4条Red→Green） |
| RCL-NFR-006 applied幂等重验 | `apply.ts` checkFinalState（全表计数N/36/N+42+逐行hash+42 example目标集合）；executeRclApply对applied先完整重验再noop，漂移抛稳定错误零写入 | `rcl-apply.integration.test.ts`（首次apply后篡改case/showcase/regression/example复跑拒绝，4条Red→Green；noop测试保持Green） |
| RCL-NFR-001 migration换行契约 | 仓库根`.gitattributes`（`drizzle/*.sql text eol=lf`）；0010～0018 blob不变；Drizzle读取hash===Git blob LF SHA | `src/lib/db/migration-lf.contract.test.ts`（.gitattributes存在/autocrlf=true全新checkout LF/hash一致/blob LF，4例）；`jrp-0017-migration.integration.test.ts` 0015基线改为Git LF hash `3ae5b95f…` |
| 迁移审计语义 | `scripts/rcl-audit-task34.mjs`（Git blob SHA/工作树raw SHA/LF规范化SHA/CRLF规范化SHA/账本SHA/仅EOL差异/真实内容差异；journal与账本created_at严格单调核对；只报告不猜测） | 审计证据`task34-r4-audit-2026-09-10T06-59-14/audit-summary.json` migrationAudit/migrationJournal/migrationLedgerTimeCheck |
| 可信旧归档持久化 | `scripts/rcl-audit-task34.mjs`（pre恢复库→8文件归档到永久目录；452/36/500全逐行ID/UID/64位hash；verified restore-report 40表+20 sequence；sha256sums恰好7文件；第三库二次对账） | `task34-r4-trusted-old-2026-09-10T06-59-14/`（manifestHash `da0ea94d…`、dumpSha `0e3c3d8b…`、re-reconcile 40表/20 sequence ok） |
| 当前attestation+repair-forward | `scripts/rcl-audit-task34.mjs`（绑定codeSha的36/36/78 attestation：36 cases+36 showcase+36 regression+42 example逐行ID/UID/hash、10 snapshots、5 releases、3批次；10步SQL写集合计划含前置条件/事务边界/回退点/失败条件） | `task34-r4-audit-2026-09-10T06-59-14/attestation-current.json`（`eb6d8d9d…`）、`repair-forward-plan.json`（codeSha `579fed8…`、trustedArchiveManifestHash `da0ea94d…`、migrationLedgerFingerprint `492c5fbe…`、targetFingerprint `56c479de…`、预期最终账本18条`25d10e62…`） |

- 门禁（2026-09-10本地新鲜）：`npm test` 74文件/713零skip；`npm run test:db` 26文件/141零skip（随机端口全新PG17+pgvector）；tsc/eslint/build退出0；pytest非集成94、`-m integration` 20/20；pip-audit无已知漏洞；Gitleaks 8.29.1完整历史85提交零发现；scan-secrets 788文件零命中；allowlist哨兵3场景全过；Markdown相对链接与`git diff --check`通过。
- 边界：持久policyops仅SELECT；repair未执行；WI-20260909-01保持Blocked；临时容器/库finally清理；`task34-r4-trusted-old-*`目录永久保留。

## 任务4第五轮修复与只读审计（2026-09-10，WI-20260907-03恢复Accepted、WI-04保持Reopened、任务4验收报告等待独立复审）

| 需求 | 实现 | 测试 |
| --- | --- | --- |
| journal严格单调（RCL-NFR-001迁移账本规范） | `drizzle/meta/_journal.json`：0010～0014 when修正为1788560000000/1788600000000/1788640000000/1788680000000/1788705240000（0015～0018不变）；idx/tag不变、SQL零修改；全部18条按idx严格递增且max when===0018 | `migration-lf.contract.test.ts`第五轮新增3例（全部entry递增/0010～0018与预期一致/max when保证账本max下no-op） |
| migration账本回归 | `scripts/lib/task34-ledger-regression.mjs`（8项检查：首次no-op账本21→事务删18/19/20→migration×2 no-op→账本18条→保留行不变→ID 17缺号不补写→模拟0019只应用一次→EOL）、`scripts/rcl-ledger-regression-task34.mjs`（post dump隔离容器入口） | `task34-r5-ledger-regression-2026-09-10/ledger-regression.json`（ok:true）；Red：旧journal下0014（1788991200000>账本max）会被重新应用 |
| 迁移审计阻断门禁 | `scripts/rcl-audit-task34.mjs`：journal非单调/与预期不符→阻断throw；ID 10～16、21、22账本hash===Git blob LF SHA→阻断；隔离库删除重复行后migration×2 no-op→门禁；`--trusted-dir`只读复验既有可信归档（禁止覆盖） | 第五轮审计`task34-r4-audit-2026-09-10T10-12-35/audit-summary.json`（journalMonotonic=true、ledgerHashCheck 9/9、ledgerRegression.ok=true、reverifyDetail 8文件/SHA匹配/452/36/500/restore 40/20/0、thirdDbRestore 40表20 sequence零mismatch） |
| prepare-archive归档目录保护 | `executor.ts` prepareRclArchive：目标目录已包含历史归档专属文件（4 dump/selection/restore/sha256sums）时拒绝开始；manifest.json为plan-replacement合法产物不拒绝；补偿只删除本次新建文件 | `executor.test.ts`第五轮3条（dump存在拒绝零写入零批次/sha256sums存在拒绝/仅manifest允许且历史文件保留）；第二次dump/写文件/最终SHA/补偿失败4条保持零prepared批次/entries |
| 当前attestation+repair-forward（第五轮） | `scripts/rcl-audit-task34.mjs`（绑定`1fe702b…`；36/36/78全逐行ID/UID/hash、10 snapshots、5 releases、3批次；journalCheck.journalMonotonic=true；写集合只含删除账本18/19/20、prepared批次91d60c5f→rolled_back、新增restore_verified可信归档批次+988 entries；36/36/78/10/5零变化；含隔离库no-op证据；repair前强制新建备份） | `task34-r4-audit-2026-09-10T10-12-35/attestation-current.json`（attestationManifestHash `8941655b…`）、`repair-forward-plan.json`（codeSha `1fe702b…`、trustedArchiveManifestHash `da0ea94d…`、migrationLedgerFingerprint `492c5fbe…`、targetFingerprint `56c479de…`、预期最终账本18条`25d10e62…`） |

- 门禁（2026-09-10本地新鲜）：`npm test` 74文件/720零skip；`npm run test:db` 26文件/141零skip（随机端口全新PG17+pgvector，migration×2/bootstrap×2/seed×2幂等）；tsc/eslint/build退出0；agent.migrate --with-roles×2幂等；pytest -m integration 20/20；scan-secrets 788文件零命中；Gitleaks 8.29.1完整历史86提交零发现；allowlist哨兵3场景全过。
- 边界：持久policyops仅SELECT；repair未执行；WI-20260909-01保持Blocked；pre dump未恢复；`task34-r4-trusted-old-2026-09-10T06-59-14/`未覆盖未删除（第五轮只读复验通过）；临时容器/库finally清理。

## 任务4第六轮：repair-forward执行器与隔离验收（2026-09-10，代码提交`972b453`+`8b360c2`（可信归档校验移入事务内）；WI-20260907-03 Accepted、任务4 PRD/验收报告代码层Accepted、WI-04 Reopened等待授权、WI-09-01 Blocked）

| 需求 | 实现 | 测试/证据 |
| --- | --- | --- |
| RCL-FR-021/NFR-003 受控执行器与精确授权（repair-forward） | `scripts/rcl-repair-forward-task34.mjs`（audit默认只读/plan/apply/verify；无参数失败；apply必须`--i-am-authorized --plan-hash --target-fingerprint`；目标库policyops默认拒绝需`RCL_REPAIR_ALLOW_PERSISTENT=1`；工作树未提交拒绝）、`src/lib/case-repair/repair-forward.ts`（parseRepairArgs） | `repair-forward.test.ts`参数守卫4例；演练#2/#3/#4 |
| RCL-NFR-002 确定性 | `deriveTrustedBatchId`：sha256("task34-r4-trusted-archive:"+manifestHash)前16字节设v5位===`c8a7c104-8b8b-53f5-9bfd-1c8a8a6be141`；planHash=sha256(canonicalJson(核心))覆盖988 entries+批次ID+codeSha | `repair-forward.test.ts`确定性ID/planHash 5例；审计crossChecks.deterministicBatchId |
| RCL-NFR-005 原子性（单事务） | `runApply/applyOnce`：REPEATABLE READ+`pg_advisory_xact_lock`；事务内重算targetFingerprint、重建计划核对planHash、FOR UPDATE锁定核对账本18/19/20完整旧值与prepared批次、核对attestation/业务指纹/可信归档；精确条件删除RETURNING恰好18/19/20、批次条件更新恰好1行、新批次+988条参数化entries、COMMIT前终态核对；任一不一致回滚 | 演练#9～#14、#18（5故障点回滚）、#19（第三库恢复40/20/0） |
| RCL-NFR-006 幂等与并发 | `classifyRepairState`（pending/repaired/drift）；repaired→noop:true；drift→REPAIR_STATE_DRIFT禁止补写；40001重试后并发第二方noop | `repair-forward.test.ts`分类6例；演练#16、#17（c1 noop attempts=2/c2 applied） |
| RCL-NFR-007 fail-closed | `loadTrustedArchive`（8文件/sha256sums/manifest声明与正文重算/dump SHA/restore 40表20sequence/988条hex与去重）；`buildTrustedEntries`（ENTRY_HASH_INVALID/ENTRY_DUPLICATE/TRUSTED_ARCHIVE_MISMATCH） | `repair-forward.test.ts` entries 4例；演练#5～#8 |
| RCL-NFR-008 可审计 | `scripts/rcl-audit-task34.mjs`第六轮：调用执行器plan生成`executable-write-set.json`并与审计交叉核对10项；`--executor-test-report`绑定演练报告（19项必须全过）；repair-forward-plan.json改为单事务写集合（无VALUES占位）+executor节（apply命令/隔离级别/事务内检查/防误写/幂等） | `task34-r4-audit-2026-09-10T13-42-41/`五文件（attestation `3b7340c1…`、planHash `db55e4ab…`、targetFingerprint `56c479de…`、migrationLedgerFingerprint `492c5fbe…`） |
| RCL-AC-015 契约保持 | 执行器库放置于`src/lib/case-repair/`（只读attestation发布记录属于repair工具而非案例治理域） | `task3-isolation.test.ts`保持通过（npm test 75文件/740零skip） |

- 门禁（2026-09-10本地新鲜）：`npm test` 75文件/740零skip；随机端口全新PG17+pgvector `npm run test:db` 26文件/141零skip（migration×2/bootstrap×2/seed×2幂等、agent.migrate --with-roles×2、pytest -m integration 20/20）；tsc/eslint（0 error）/build退出0；scan-secrets 790文件零命中；Gitleaks 8.29.1完整历史91提交零发现；allowlist哨兵全过。
- 边界：持久policyops仅SELECT；未执行repair-forward；未恢复pre dump；未创建PR、未合并分支；可信归档与pre/post备份未覆盖；隔离容器/库/临时归档副本finally清理。

## WI-20260907-04 repair-forward持久执行（2026-09-10，用户明确授权；等待独立复审）

| 需求 | 执行 | 证据 |
| --- | --- | --- |
| RCL-NFR-003 精确授权 | 授权参数codeSha `aeb464f`/planHash `179507da…`/targetFingerprint `56c479de…`/attestation `ca4238a5…`；执行前fresh audit+plan逐项一致；`RCL_REPAIR_ALLOW_PERSISTENT=1`仅apply子进程 | `task34-r8-repair-exec-2026-09-10T15-41-40/pre-audit.json`、`pre-plan-summary.json`、`executable-write-set.fresh.json` |
| RCL-NFR-001 可恢复 | pre备份`policyops-rcl-repair-pre-20260910234300.dump`（`b190d1d1…`）全新实例恢复对账40表/20 sequence；post备份`policyops-rcl-repair-post-20260910234716.dump`（`8303a4c3…`）第三个全新实例恢复对账40表/20 sequence/账本18/988 entries | `pre-restore-reconcile.txt`、`post-restore-reconcile.txt`（exit 0，40 OK） |
| RCL-NFR-005 原子性 | `scripts/rcl-repair-forward-task34.mjs apply`单事务：ledgerDeleted [18,19,20]、91d60c5f→rolled_back、c8a7c104 restore_verified+988 entries、attempts=1 | `apply-result.json` |
| RCL-NFR-006 幂等 | 相同授权参数复跑`noop:true`；`run-migrations.mjs`×2账本持续18 | `apply-rerun.json`、`migration-run1.txt`/`migration-run2.txt` |
| RCL-NFR-008 可审计 | 执行后12项验证（账本18条=1～16/21/22原值、批次状态、988 entries hex无重复452/36/500、36/36/78、42/36、10/5、业务表规范化hash与计划一致、verify --plan ok） | `post-state.txt`、`post-verify.json`、`repair-execution-summary.json` |

- 边界：仅授权三项写入；snapshot/release/政策实体/远程库/Secret/部署零变化；未创建PR、未合并分支；临时验证容器清理；可信归档与pre/post备份未覆盖。

## WI-20260911-02 RCL-GEN-2.0案例、Markdown案例库、API与UI（2026-09-11，SHV2-FR-008～016/AC-006～013）

| 需求 | 实现 | 测试/证据 |
| --- | --- | --- |
| SHV2-FR-008 生成器版本/V2 UID | `src/lib/case-governance/generator-v2.ts`（`GENERATOR_VERSION_V2="RCL-GEN-2.0"`；`RPC/RPCT-<地区>-<场景键>-V2`；与V1并存） | `generator-v2.test.ts`（版本/UID 2例） |
| SHV2-FR-009/AC-006 策展配额 | 上海§8.2固定轮转矩阵（能力×状态，年龄段=(能力+状态)%3、性别=(能力+状态)%2）+广东既有组合；性别×年龄×就业18个唯一组合 | `generator-v2.test.ts`配额4例（36/18/18、9/9、6/6/6、唯一组合、出生年与band一致） |
| SHV2-FR-010/AC-007 能力一致 | 每能力显式assertionSpecs（退休3路径、养老3+1、医保4、失业4/2、灵活5/1、补贴3×3）；`eq`断言路径在引擎输出缺失→抛错；生成后断言自洽重放（`compareReplayWithAssertions`）fail-closed | `generator-v2.test.ts`能力矩阵/专属断言12例（含不适用输出、三档失业金、灵活缴费、补贴三场景、医保等待期） |
| SHV2-FR-011/AC-008 完整生日与人物契约 | `buildInput`：36条全部birth_year/month/day/birth_date一致；女性强制female_retire_type（worker50/cadre55）；失业带年限+阶段/已领月数+on_unemployment_benefit；灵活带基数；补贴带认定+距退休月数（与引擎退休日期推导一致校验） | `generator-v2.test.ts`人物契约5例+字段缺失needs_agent反例2例 |
| SHV2-FR-012/AC-009 可读文档 | `case-content-v2.ts`：case_text（≥200字，含合成声明/as-of/人物条件）、36条独立标题/问题/回答；能力不适用→"规则不适用"，needs_agent→"需补充字段"清单 | `generator-v2.test.ts`可读内容3例（互异、非占位、结构段） |
| SHV2-FR-013/AC-010 合成披露 | `src/lib/showcase/labels.ts`（SYNTHETIC_CASE_LABEL/DISCLAIMER/V1占位识别/PENDING_V2_DOC_LABEL）；公开页/首页/导航/工具卡文案替换；后台"合成案例文档" | `synthetic-copy.test.ts`源码契约5例；E2E `shv2-case-copy.spec.ts` 4例 |
| SHV2-FR-014 结构化来源 | `dsl-evidence-index.ts`（规则/参数→evidence索引；按as-of窗口+断言路径解析依赖来源，地区覆盖CN，去重排序）；`case-nature.ts` `toPolicySources`（12字段+64位hex+https校验，不完整丢弃） | `generator-v2.test.ts`来源5例（白名单、meta.json SHA/URL一致、来源-结论对应、无DOC-GD-POLICY-2026） |
| SHV2-FR-015/AC-011 数值单源 | `case-content-v2.ts`禁算术派生、无政策常量；expected只承载引擎输出（needs_agent/conclusion_level/warnings+details/agent_questions+7命名空间剔除`_`键） | `generator-v2.test.ts`数值单源2例（36条数字全溯源、expected逐命名空间=引擎） |
| SHV2-FR-016/AC-013 Markdown案例库 | `case-library-doc.ts`（manifest无时间戳、manifestHash正文重算；render确定性；check=manifestHash+逐案例contentHash+36/18/18+Markdown逐字节）；`scripts/rcl-case-library-v2-doc.ts`（render/--check，退出码0/2）；`scripts/rcl-case-library.ts generate-v2`（真实快照生成）；文档`docs/refactor/policy-ops-agent/case-library/shanghai-guangdong-v2.md`+`.manifest.json`（.gitattributes eol=lf） | `case-library-doc.test.ts` 10例（渲染/确定性/check漂移4反例/已提交文档通过+与内存生成逐条一致）；CLI隔离库生成后`--check`通过、篡改副本退出2 |
| SHV2-NFR-005 API兼容 | `src/lib/showcase/case-nature.ts` `decorateShowcaseCase`（RCL-GEN-*→synthetic；其余human_curated不改写）；`/api/showcase-cases`与`/api/admin/cases`附加caseNature/policySources，既有字段原样 | `synthetic-copy.test.ts` API装饰6例（mock仓储路由2例） |
| §8.4 广东保持 | 五类能力+as-of（2030场景2030-01-01）+广州440100+缺地市不估算+缺参needs_agent | `generator-v2.test.ts`广东5例 |
| 确定性/快照/quality | 重复生成逐字节一致；snapshot绑定（真实库=快照ID+contentHash）；quality=scoreCase真实分解；contentHash规范化SHA-256 | `generator-v2.test.ts`标签/绑定/确定性5例 |

- 门禁（2026-09-11本地新鲜）：`npm test` 80文件/829零skip；tsc退出0；eslint 0 error（既有10 warning未新增）；`npm run build`退出0；全新PG17+pgvector `test:db`（项目标准参数`--dangerouslyIgnoreUnhandledErrors`屏蔽Windows vitest worker teardown RPC竞态，测试失败仍非零退出）27文件/144零skip；agent.migrate --with-roles×2幂等；pytest -m integration 20/20零skip（补`SOCILA_TEST_DATABASE_URL`后RAG 3例不再skip）、非集成94、ruff/mypy 0问题；Chromium E2E 23/23（auth10+shv2 4+task3 5+task4 4）；scan-secrets --all 899文件零命中；Gitleaks 8.29.1完整历史96提交零发现（worktree经临时独立克隆扫描）；allowlist哨兵3场景全过；SHV2 delta集成3例（任务1）保持通过（重物化用例显式30秒超时，断言不变）。
- 隔离环境：任务专属容器`shv2-task2-pg`（pgvector/pgvector:pg17，随机端口54955）；`shv2_e2e`库（migration+bootstrap+seed+e2e-rcl-setup快照激活与V1替换演练后generate-v2）；`shv2_drill`库（test:db/migrate/pytest）；持久policyops全程未连接未写入。
- 已知环境事实：E2E管理员口令哈希与`scripts/db-gate-task34.mjs`内置哈希不匹配（bcrypt同盐重算确认），隔离库内将Jan口令哈希更新为与spec口令匹配的本地计算值（不写入仓库文件）。
- 边界：无持久库写入；无快照/release持久变更；非RCL人工案例未被改写；`transcript_text`不生成（V2改写时保持NULL属WI-03）。

## WI-20260911-03 0019审计迁移与受控原位改写（2026-09-11，SHV2-FR-017～025/AC-014～021）

| 需求 | 实现 | 测试/证据 |
| --- | --- | --- |
| SHV2-FR-017 纯Schema迁移 | `drizzle/0019_case_rewrite_audit.sql`（只建审计表；journal 0019=1788797000000严格单调） | `rcl-0019-migration.integration.test.ts`幂等/列全集/CHECK/唯一/RESTRICT 4例；migration-lf契约7/7 |
| SHV2-FR-018 精确计划 | `rewrite-v2.ts buildRewritePlan`：codeSha/来源工件指纹+attestation/前置指纹/finalFingerprint（含44 example行集与id序对齐）/3快照绑定/108条entries（整数ID、新旧UID、新旧内容hash、新旧快照hash、evidenceHash、完整before/after，日期归一化保证落盘复跑hash一致） | 单元5例（确定性/敏感性/verifyPlanBody）；CLI集成plan断言108 |
| SHV2-FR-019 原位改写 | 人物槽位匹配（V2按§8.2矩阵重新分配能力）；`projectRewritten*Row`保留整数ID、V2 UID、case_text、真实标题/问答/来源；test last_run清空 | 单元投影3例+匹配2例；集成apply断言ID集合不变/36条V2干净case/计数36/36/80 |
| SHV2-FR-020 完整审计 | `case_rewrite_entries` 108条before/after+hash链；批次1条applied绑定全部计划字段 | 集成断言1批次/108entries/before-after完整；演练第8步 |
| SHV2-FR-021 原子与并发 | REPEATABLE READ+advisory xact lock+FOR UPDATE锁定108行；逐行旧hash核对→UPDATE→新hash与行体核对；COMMIT前finalFingerprint；40001重试 | 集成并发（一执行一noop）+故障注入（after_lock/after_updates/after_entries整体回滚） |
| SHV2-FR-022 幂等 | applied+finalFingerprint+108条→noop:true；其余→`REWRITE_STATE_DRIFT`禁止补写 | 集成复跑noop/篡改drift/after恢复后noop；单元分类4例 |
| SHV2-FR-023 持久默认拒绝 | CLI在任何连接前拒绝policyops库名（需`RCL_REWRITE_ALLOW_PERSISTENT=1`）；DIRTY/注入变量仅隔离演练 | 集成policyops反例（退出2）；单元参数守卫 |
| SHV2-AC-020 恢复对账 | 演练post dump→第三实例pg_restore→`restore-reconcile`全表+sequence | 演练第7步OK（证据JSON） |

- 门禁（2026-09-11本地新鲜）：`test:db`（全新库）29文件/156零skip；tsc/eslint/build退出0；pytest integration 20/20零skip+非集成94；Chromium E2E 23/23（V2终态分支：shv2_e2e改写planHash `fe92d7d8…` verify ok）；scan-secrets 914零命中；gitleaks全历史98提交经ADR-0009精确allowlist（哨兵通过）复扫no leaks；隔离演练9步全ok。
- 边界：持久policyops未连接未写入；0019持久执行须另行fresh授权。

## SHV2独立审查修复映射（2026-09-12，Reopened→修复交付待独立复审）

| 审查需求 | 当前缺口 | 实际实现 | 测试/证据（2026-09-12本地新鲜执行） | 状态 |
| --- | --- | --- | --- | --- |
| SHV2-NFR-002/007 MinIO运行时原件 | Git evidence已提交，但未上传运行时MinIO，未登记/核对RAG `object_key` | `services/agent/agent/rag/evidence_sync.py`（`PolicyEvidenceSync` audit/plan/apply/verify；bucket固定`policy-originals`、键`originals/<sha256>`、桶/远程endpoint/policyops库名守卫、凭据redact）；CLI `python -m agent.rag.evidence_sync`；`scripts/rag-evidence-drill.mjs`（备份恢复对账编排） | `services/agent/tests/test_rag_evidence_sync.py` 18/18（零DB守卫7例+隔离DB集成10例+真实MinIO备份恢复1例；RED=ModuleNotFoundError）；真实23件原件演练12项全ok（audit预态23缺失→plan零写入→apply 23上传+RAG登记→verify→幂等noop→守卫反例→OBJECT_CONFLICT拒绝覆盖→pg_dump+逐对象备份→全新PG+全新MinIO恢复→恢复副本四方对账verify ok→输出零密钥；证据`rag-evidence-drill-2026-09-12T04-14-59-793Z.json`）；配置模板`runtime.env.example`默认bucket改`policy-originals` | 修复交付（待独立复审） |
| SHV2-FR-019/020 业务hash一致性 | rewrite计划/审计有`new_content_hash`，但业务表`cases.content_hash`和`showcase_cases.content_hash`未证明同步 | `rewrite-v2.ts`：buildRewritePlan先按排除`content_hash`的投影算目标hash再写入after投影（防循环）；apply同事务UPDATE业务`content_hash`并单独核对列值；verify逐条显式读取业务`content_hash`核对；verifyPlanBody校验before/after携带业务hash且test条目无该键 | 单元RED 2例失败→GREEN 17/17（after=目标hash/防循环列值无关/verifyPlanBody三反例）；CLI集成10/10（新增：36+36业务列逐行=entry.new_content_hash、tests无content_hash列schema契约、篡改case/showcase业务hash→verify退出5、注入回滚业务hash逐行不变）；隔离演练10步全ok（最终核对业务hash漂移0/0、36/36全写入；post dump恢复副本verify ok；证据`rewrite-drill-evidence-2026-09-12T04-56-15-244Z.json`） | 修复交付（待独立复审） |
| SHV2-NFR-008 完整Node门禁 | 完整`npm test`842/843，migration当前工作树用例默认5秒超时；单文件7/7通过 | `migration-lf.contract.test.ts`：blobBytes改为单次`git cat-file --batch`批量读取+缓存（60次git子进程→1次）；两个扫描用例加显式30秒超时（同文件既有策略）；断言零改动 | RED复现：完整套件842/843、目标用例5243ms超5s默认值；修复后单文件7/7（469ms）；标准完整`npm test`连续两次零失败零skip（见验收报告§5） | 修复交付（待独立复审） |
| 文档事实一致性 | PRD仍含“仅完成PRD”，WI/验收报告误标最终Accepted | 本轮同步PRD、三个WI、验收报告、架构、测试、运维和PROGRESS；状态统一为“Ready for independent review”，不自行标记最终Accepted | 文档状态/分支/SHA/阻塞项一致性检查与相对链接检查 | 本次docs更新 |

- 当前分支/远端（历史审查记录，2026-09-12 b5a8d13修复交付）：`codex/shanghai-case-v2`提交`b5a8d13`（f583adc为历史任务2/3交付SHA，d47dedf为审查缺口记录）；目标集成分支`refactor/policy-ops-agent-platform@0885613`未修改未合并。完整历史Gitleaks 100提交零发现（新增`test_rag_evidence_sync.py`脱敏哨兵`generic-api-key`误报经人工核实按ADR-0009登记精确allowlist，哨兵回归3场景全过）。
- 持久边界：修复全程仅隔离数据库（容器`shv2-fix-pg`:54956、`shv2-task2-pg`:54955）与隔离MinIO（`shv2-fix-minio-a/b`:54960/54961）；生产MinIO、持久policyops、政策物化、快照/release及案例回填均需未来fresh授权。

## SHV2控制契约复审修复映射（2026-09-12第二轮，本修复提交HEAD）

起点`b5a8d13`（上一轮b5a8d13交付的MinIO接入/业务content_hash/Node超时修复不推翻）。f583adc为历史任务2/3交付SHA。

| 复审需求 | 修复前缺口 | 实际实现 | 测试/证据 | 状态 |
| --- | --- | --- | --- | --- |
| apply绑定fresh授权计划 | apply可经环境开关直接执行，无计划/planHash/targetFingerprint/codeSha绑定 | `evidence_sync.py`：`build_plan`（确定性计划：schema/version、codeSha、jurisdiction、固定bucket、evidenceManifestHash、MinIO+RAG目标状态指纹与终态指纹、完整对象清单、plannedUploads/Fetches/Versions/noopObjects/conflicts、规范化planHash）；`apply(plan, plan_hash, target_fingerprint, i_am_authorized)`——写入前校验计划结构与planHash重算、HEAD==codeSha、工作树干净（RAG_EVIDENCE_ALLOW_DIRTY仅隔离演练）、evidence未漂移、MinIO+RAG状态指纹==targetFingerprint；终态→幂等noop；介于两者→TARGET_STATE_DRIFT零写入拒绝；环境开关仅作附加保护 | RED=集合期ImportError（21测试）；GREEN=35/35（授权缺失/错planHash/错指纹/codeSha不符/工作树dirty/证据漂移/对象漂移/DB漂移零写入、幂等noop、冲突不覆盖、注入后re-plan恢复、advisory锁并发无重复记录、计划输出零凭据）；演练17项全ok（证据`rag-evidence-drill-2026-09-12T08-43-47-471Z.json`，含守卫反例A-E、plan两次逐字节一致、apply、四方verify、noop、object-only、冲突拒绝+re-plan恢复、pg_dump+逐对象备份→全新库+全新MinIO恢复→恢复副本verify ok+同计划noop） | 修复交付（待独立复审） |
| verify范围契约 | 缺数据库时verify跳过RAG检查仍可ok:true | 完整audit/plan/apply/verify必须连数据库（CLI USAGE拒绝）；缺库完整verify ok:false并逐件报告；显式`--object-only`降级模式结果带`verificationScope="object-only"`/`degraded=true`/`dbChecked=false`；完整verify逐件核对Git原件字节SHA、meta.json SHA、MinIO bucket/object_key/下载SHA、rag.fetches与rag.document_versions的object_key/content_hash及两处object_key一致 | 集成测试：缺库verify ok:false+问题指向数据库；object-only标记断言；演练object-only步与四方verify步分别断言标记 | 修复交付（待独立复审） |
| 文档事实同步 | MinIO演练误写"10步"（证据实为12项）；f583adc/b5a8d13角色未标注；最终SHA无法自引用 | 本节及PRD/WI/PROGRESS/验收报告/OPERATIONS/TESTING同步：f583adc=历史任务2/3交付SHA、b5a8d13=本次控制修复起点、最终SHA=本修复提交HEAD（交付报告给出）；历史Reopened章节标记"历史审查记录"；演练步骤数按证据JSON如实（12项/17项/rewrite 10步） | 本文档与各文档一致性核对 | 本次docs更新 |

| Chromium E2E阻塞项（门禁路径既有bug） | AUTH-US-002 reload后回复视图被预创建会话踩掉（4次稳定复现；独立playwright网络取证定位） | `ChatPageClient`将URL会话ID作为ChatPanel外部会话ID传入（URL有会话ID时面板不预创建；恢复失败重置路径不变） | 修复前完整E2E 17/23且4次复现；修复后23/23（58.6s）；独立脚本reload复现通过 | 修复交付（待独立复审） |

- 持久边界：本轮全程仅隔离PostgreSQL（`shv2-ctrl-pg`:54957）与隔离MinIO（`shv2-ctrl-minio-a/b`:54962/54963，演练后清理）；持久policyops与生产MinIO未连接未写入。
## SHV2缺桶生命周期复审修复映射（2026-09-12第三轮，本修复提交HEAD）

起点`82c905b`（第二轮交付的fresh授权计划、四方verify、业务content_hash、Node超时与E2E修复不推翻）。2026-09-12只读核对生产容器socila-minio为bucketCount=0（bucketNames为空）——生产MinIO同步尚未获得授权、尚未执行，原件未进入生产MinIO，不得表述为已入库。

| 复审需求 | 修复前缺口 | 实际实现 | 测试/证据 | 状态 |
| --- | --- | --- | --- | --- |
| 构造与只读命令零建桶（SHV2-FR-023/SHV2-NFR-006、plan/audit零写入契约） | `MinioObjectStore.__init__`在bucket缺失时调用`make_bucket`：audit/plan/verify/服务启动/健康检查构造store即隐式创建`policy-originals` | `storage.py`构造只建立连接信息；显式`bucket_exists()`（只读）/`ensure_bucket()`（仅授权apply持锁写入段；返回本次创建True/已存在False；并发创建BucketAlreadyOwnedByYou/BucketAlreadyExists幂等复查；权限/连接错误原样抛出）；`InMemoryObjectStore`同语义（`with_bucket=False`构造缺失bucket、缺桶put拒绝）；`object_store_from_env`与全部调用方核查零建桶；不新增Compose无条件初始化建桶 | RED=新增`TestBucketLifecycle`13测试，旧实现10失败（`test_store_constructor_does_not_create_bucket`实锤构造即建桶：`assert True is False`）；GREEN=48/48零skip（构造不建桶、ensure_bucket并发恰好一次创建、audit/plan/verify缺桶零写入、授权apply建桶、既有bucket兼容、object-only不建桶） | 修复交付（待独立复审） |
| audit/verify缺桶失败关闭 | 缺桶时对象stat异常被吞→全部"对象缺失"，无明确BUCKET_MISSING语义（且构造已隐式建桶） | audit/verify先`bucket_exists()`：缺失→`BUCKET_MISSING`问题+ok=false+`bucketExists=false`，不创建bucket/不上传/不改RAG；verify的object-only同样对象层失败且scope/degraded/dbChecked标记准确 | `test_audit_fresh_minio_bucket_missing_zero_write`（含rag表零变化断言）、`test_verify_missing_bucket_fails_without_creating`（full+object-only两档）、演练audit缺桶预态步 | 修复交付（待独立复审） |
| plan缺桶仍确定性只读且状态入指纹 | 计划无bucket状态字段；指纹不含bucket存在性，缺桶时无法表达"建桶前置态" | 计划新增`bucketExists`/`plannedBucketCreate`（进入planHash与targetFingerprint/finalFingerprint——`_state_fingerprint`纳入`bucketExists`，终态恒为True）；缺桶时plannedBucketCreate=true、完整23件对象清单不变；同状态两次生成逐字节一致且bucket仍不存在；schema/算法版本升级`rag-evidence-sync-plan/1.1`/`RAG-EVIDENCE-SYNC-1.1`（旧计划结构校验拒绝） | `test_plan_fresh_minio_deterministic_planned_bucket_create_zero_write`、`verify_plan_structure`新增bucketExists/plannedBucketCreate布尔必填；演练plan步（缺桶）两次一致+bucket仍不存在+对象0 | 修复交付（待独立复审） |
| bucket创建纳入fresh授权apply | 建桶发生在构造期（先于任何授权校验），fresh计划不覆盖bucket创建这一持久变化 | 建桶仅发生在apply全部校验通过（`--i-am-authorized`、计划结构、planHash、targetFingerprint、HEAD==codeSha、工作树契约、evidenceManifestHash未漂移、当前MinIO/RAG状态==计划前置指纹、endpoint/库名守卫）并取得advisory锁后的持锁事务内：`ensure_bucket()`→上传`originals/<sha256>`→登记rag.fetches/document_versions→四方verify；缺授权/错hash/错指纹/计划或状态漂移→bucket仍不存在、对象数0、RAG记录零变化；apply结果新增`bucketCreated` | `test_apply_refusals_never_create_bucket`、`test_apply_refuses_evidence_drift_without_creating_bucket`、`test_apply_refuses_db_state_drift_without_creating_bucket`、`test_authorized_apply_creates_bucket_uploads_and_verifies`、`test_reapply_same_plan_noop_after_bucket_created`、`test_concurrent_apply_single_bucket_single_records`、`test_preexisting_bucket_plan_compatible_no_recreate`、`test_conflicting_object_refused_with_bucket_present`；演练守卫反例A-D（未授权/错planHash/错指纹/plan后外部建桶漂移）零建桶、apply后恰好23对象 | 修复交付（待独立复审） |
| 演练从缺桶起点 | 旧演练预先创建bucket，未覆盖"MinIO可达、bucket不存在"路径 | `scripts/rag-evidence-drill.mjs`17项改为缺桶起点：开始前删除隔离bucket（primary/restore）；audit缺桶预态exit4+BUCKET_MISSING；两次plan后bucket仍不存在；未授权/错hash/错指纹/外部建桶漂移全部零建桶；授权apply后bucket存在且恰好23对象；备份→全新库pg_restore+全新MinIO受控回填（恢复程序显式建桶，非evidence_sync副作用）→恢复副本verify ok+同计划noop | 证据`rag-evidence-drill-2026-09-12T12-53-58-005Z.json`17项全ok（failed=false） | 修复交付（待独立复审） |

- 持久边界：本轮全程仅隔离PostgreSQL（`shv2-ctrl-pg`:54957）与隔离MinIO（`shv2-ctrl-minio-a/b`:54962/54963，演练后清理）；仅对生产MinIO执行只读bucket清单核对（bucketCount=0，未写入）；持久policyops未连接未写入；`refactor/policy-ops-agent-platform@0885613`未修改未合并；状态Ready for independent review。
