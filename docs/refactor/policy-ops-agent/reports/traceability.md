# 需求追踪矩阵

> Author: Jan
> Status: Active
> Updated: 2026-09-09

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
| WI-20260907-02 | `docs/work-items/WI-20260907-02-task3-temporal-entry-hardening.md` | `src/server/modules/publishing/application/release-gates.ts`（空黄金测试集fail-closed）、`src/server/modules/publishing/application/jurisdiction-release.use-case.ts`（停用地区绑定+`ReleaseJurisdictionMismatchError`）、`src/app/api/admin/jurisdictions/[code]/releases/[releaseId]/route.ts`（URL地区传入用例+409映射）、`src/server/modules/planning/application/replay-plan.use-case.ts`（三方hash+`ReplaySnapshotDriftError`）、`src/app/api/plan/[id]/replay/route.ts`（409 `REPLAY_SNAPSHOT_DRIFT`）、`src/server/modules/planning/application/jurisdiction-compute.use-case.ts`（plan保存snapshotContentHash，JRP-FR-009）、`scripts/e2e-task3-setup.ts`、`src/server/modules/identity/__tests__/identity-container.test.ts`（30秒显式超时稳定化） | `release-gates.test.ts`（空集合反例）、`jurisdiction-release.use-case.test.ts`（广东URL+上海releaseId拒绝且零修改）、`replay-plan.use-case.test.ts`（三方一致/保存hash漂移/重算hash漂移/缺保存hash）、`jurisdiction-compute.use-case.test.ts`（savePlan hash断言）、`jurisdiction-compute.integration.test.ts`（跨地区停用拒绝+2026/2030广东不同快照落库）、`e2e/task3-regional.spec.ts`（JRP-AC-008 replay/JRP-AC-009跨地区停用与停用后unsupported） | `reports/feature-09-05-jurisdiction-planning/acceptance-report.md`（2026-09-09第二轮修复验收） | Accepted（2026-09-09） |
| WI-20260907-03 | `docs/work-items/WI-20260907-03-regional-policy-case-rebuild.md` | 第二轮实现保留；待补旧test完整hash、restore/SHA/selection、42 example原子同步和manifest自校验 | 待补第三轮专用Red/Green、随机端口隔离DB和真实恢复明细 | `reports/stage-09-05-case-governance/review-report-2026-09-09-r3.md` | Reopened |
| WI-20260907-04 | `docs/work-items/WI-20260907-04-persistent-case-library-replacement.md` | 历史执行已产生36/36/78；待重建可信旧归档、当前attestation并修复账本/批次审计 | 计划：pre/post/当前三方只读对账、fresh repair目标、幂等及再次恢复；写入需新授权 | 第三轮复审报告；历史执行记录保留 | Reopened |
| WI-20260909-01 | `docs/work-items/WI-20260909-01-task34-final-integration.md` | 计划：最终集成分支以显式merge commit合入`refactor/policy-ops-agent-platform` | 计划：祖先/父提交、完整差异、全量门禁、远端SHA核对 | 合并后新增`reports/task34-final-integration/acceptance-report.md` | Blocked；等待任务4/WI-04重新Accepted |
| WI-20260907-01 | `docs/work-items/WI-20260907-01-sichuan-policy-followup.md` | 计划：四川三项正式来源到位后的规则、参数、物化、审核和候选快照 | 计划：权威引用、黄金、隔离、物化、快照重放；不得提前填写PASS | ADR-0010；等待解锁后新增独立验收证据 | Blocked；不阻塞任务2首期 |
| WI-20260906-02 | `docs/work-items/WI-20260906-02-stage-e-persistent-repair.md` | 实际：持久库`socila-postgres/policyops`（0014迁移+`scripts/materialize-policy-regions.ts` repair一次）；证据`audit-policyops-wi-02.json`、`repair-policyops-wi-02.json`、备份`backup/db/policyops-wi-02-{pre,post}-*.dump`（Git忽略） | 无新增代码/测试；复用WI-01既有守卫与集成覆盖；只读验证`restore-reconcile.ts`/`planning-regression.ts` | 任务2验收报告§15/§17 | Accepted；任务2首期最终Accepted |
| WI-20260906-01 | `docs/work-items/WI-20260906-01-stage-e-pack-repair-hardening.md` | 实际：`src/lib/policy-materialization/target.ts`（PackTargetBinding+loadPackTargets+指纹绑定draft包）、`src/lib/policy-materialization/materialize.ts`（repair重写：事务内FOR UPDATE锁定重校验/REPAIR_TARGET_CHANGED/computeRepairBatchHash确定性repaired批次+新成员/原成员不可变/isJurisdictionBlocked纳入repaired）、`scripts/materialize-policy-regions.ts`（按实际数量输出）、`src/lib/db/index.ts`（池error监听） | 实际：`src/lib/policy-materialization/materializer.integration.test.ts`（+6场景：守卫/目标绑定/正常修复/回滚/并发/幂等零漂移）、`materializer.unit.test.ts`（+2：指纹绑定/CLI源码契约）、`target-guard.test.ts`、`src/lib/engine/__tests__/{guangdong,sichuan}-overlay-golden.test.ts`（既有any→unknown类型修复） | 任务2验收报告§14（Red/Green+全量门禁）；持久库执行见§15/WI-02 | Accepted |
| WI-20260901-01 | `docs/work-items/WI-20260901-01-docs-reorganization.md` | `docs/README.md`、`docs/prd/`、`docs/standards/`、`docs/refactor/policy-ops-agent/`、`AGENTS.md`、`.gitignore` | 文档任务无新增业务测试文件；执行链接、状态、ignore、Secret和项目回归命令 | `docs/refactor/policy-ops-agent/PROGRESS.md` | Accepted |

## 09-07 分地区交付与下游修复计划

| 任务 | 需求范围 | 计划实现 | 计划测试 | 状态 |
| --- | --- | --- | --- | --- |
| 任务2 CN/沪/GD首期 | NRP-FR-001～022、NRP-NFR-001～012、NRP-AC-001～016（ADR-0010范围） | 广东delta、失业金额规则、三地区审核与候选快照 | 已有任务2验收报告§17 | Accepted；保持不变 |
| 任务3 地区感知规划修复 | JRP-FR-001～029、JRP-NFR-001～010、JRP-AC-001～012 | 2026-09-09第二轮修复完成：空黄金测试集fail-closed、停用URL地区绑定、replay三方hash、plan保存快照hash、compute/replay/停用路由同步 | 2026-09-09第二轮验收：`release-gates.test.ts`空集合反例、`jurisdiction-release.use-case.test.ts`跨地区停用拒绝、`replay-plan.use-case.test.ts`三方hash反例、集成`jurisdiction-compute.integration.test.ts`（含2026/2030广东不同快照落库）、显式隔离DB 116/116零skip、Chromium E2E 19/19 | Accepted（2026-09-09）；证据见任务3验收报告§8 |
| 任务4 地区案例重建 | RCL-FR-001～022、RCL-NFR-001～008、RCL-AC-001～015 | 第二轮实现可复用；第三轮待修旧test hash、恢复证明、SHA/selection、42 example原子同步和manifest自校验 | 待补第三轮专用反例、随机端口隔离DB、pre/post/当前三方只读对账 | Reopened（2026-09-09第三轮）；证据见任务4验收报告及r3复审报告 |

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
