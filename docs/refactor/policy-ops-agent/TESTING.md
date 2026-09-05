# PolicyOps Agent测试与质量规范

> Author: Jan
> Status: Active
> Updated: 2026-09-05

## 测试先行

- 功能和Bug修复必须从PRD或Work Item需求ID推导测试。
- 先创建或更新最小相关测试，并确认因目标行为缺失而失败。
- 实现后运行目标测试、受影响模块测试和项目级回归。
- 现有套件通过不能替代新需求的专门覆盖。
- 纯文档、纯配置或无法合理制造Red阶段的任务使用验证先行，并在Work Item或报告记录原因。
- TDD Skill可以辅助执行，但PRD、Work Item、测试代码和报告才是项目事实源。

## 测试层级

| 层级 | 覆盖 |
| --- | --- |
| TypeScript单元 | 规则引擎、领域服务、application用例、权限和契约 |
| PostgreSQL集成 | Repository、事务、migration、角色和并发 |
| Python单元/集成 | FastAPI、Celery、LangGraph、解析、OCR、RAG和草案 |
| 契约 | Service JWT、OpenAPI、PolicyContext和DraftBundle |
| 黄金回归 | 规划plan/calc/trace、地区overlay和历史政策样本 |
| 安全 | 资源所有权、SSRF、恶意文件、Prompt注入和Secret扫描 |
| 部署 | Docker build、Compose、健康检查、备份、恢复和回退 |

## 常用命令

```powershell
npm test
npx eslint src
npx tsc --noEmit
npm run build
node scripts/scan-secrets.mjs --all
uv run --project services/agent pytest -q
```

`npm run build`保持原生产构建入口；`next.config.ts`将构建CPU worker固定为2，确保在本机和Personal Demo 4GB资源口径下可重复完成静态页面生成，不影响运行时并发。

测试分层（09-03 PMG-FR-005/006/018）：

```powershell
# 单元测试：零数据库依赖、零 skip（vitest.config.ts 排除 *.integration.test.ts）
npm test
# 数据库集成测试：仅 *.integration.test.ts，必须指向已迁移的全新 PostgreSQL 17 库；
# 未设置 SOCILA_TEST_DATABASE_URL 时直接失败（不允许以 skip 关闭）
$env:SOCILA_TEST_DATABASE_URL="postgresql://..."; npm run test:db
```

Repository集成测试需要本地PostgreSQL；真实部署、恢复和切换按[OPERATIONS](./OPERATIONS.md)及对应报告执行。

identity与鉴权专项（09-02）：

```powershell
# Chromium E2E（前提：全新PG17库已完成migration、bootstrap-admin、seed；npm run build）
$env:SOCILA_E2E_DATABASE_URL="postgresql://..."
$env:SOCILA_E2E_NEXTAUTH_SECRET="..."
$env:SOCILA_E2E_REFRESH_PEPPER="..."
npm run test:e2e:auth
```

管理员引导脚本验证：`node scripts/bootstrap-admin.mjs`（读ADMIN_USERNAME/ADMIN_PASSWORD_HASH；幂等，重复执行no-op，同名普通用户冲突失败，不输出凭据）。

Python测试分层（09-03 PMG-FR-008～014）：

```powershell
cd services/agent
uv run ruff check .
uv run mypy agent
uv run pytest -m "not integration"   # 单元：零环境skip，DeprecationWarning提升为error
uv run pip-audit
# 数据库集成：必须指向已迁移的全新PG17库；缺环境变量时测试直接失败（不允许skip）
$env:SOCILA_TEST_DATABASE_URL="postgresql://..."
$env:AGENT_DATABASE_URL="postgresql://..."
$env:AGENT_DB_PASSWORD="..."
uv run pytest -m integration
```

## 服务JWT跨语言契约（09-03 SJWT）

`testdata/service-jwt-vectors.json` 保存非真实固定向量：同一组claims（固定`fixedNow`）由Node（`jose`）与Python（`PyJWT`）各自独立签名，两端测试套件互验对方签名令牌（iss/aud/sub/jti/iat/exp精确一致、current/previous命中分类），并对全部拒绝向量（`alg=none`、过期、跨方向）在两个方向复验失败；协议常量（HS256/300s/30s）漂移由守卫测试拦截。

```powershell
npm test                       # 含 service-jwt.test.ts、service-jwt-vectors.contract.test.ts、service-jwt-startup.test.ts 与 service-jwt-config-contract.test.ts
uv run --project services/agent pytest -m "not integration"   # 含 test_service_jwt.py 与 test_service_jwt_vectors.py
```

启动期校验与配置契约（09-03复审缺漏二/四，2026-09-04运行时隔离复查）：`src/lib/security/service-jwt-startup.test.ts` 覆盖Node运行时启动入口——current缺失、少于32 UTF-8字节或与previous相同时启动校验以退出码1终止进程（fail-fast，Next 16 standalone中仅抛错不会使进程退出），非Node运行时（edge）不执行校验；校验与进程终止逻辑位于Node专用模块`src/lib/security/service-jwt-startup-node.ts`（`service-jwt-startup-node.test.ts` 5例：无效三态exit(1)、合法不退出、错误输出不含Secret且为稳定消息），`register`为async且仅`NEXT_RUNTIME=nodejs`分支动态import该Node专用模块——`src/instrumentation.ts`本体不引用`process.exit`或任何`node:`模块，源码契约与运行时路由（edge不加载/未设置不加载/nodejs恰好调用1次）由`service-jwt-startup-runtime-contract.test.ts`覆盖（7例，防Edge构建警告回归，AC-018）；`src/lib/env/service-jwt-config-contract.test.ts` 覆盖Compose中web/agent/worker/beat四消费者的`AGENT_SERVICE_JWT_CURRENT`必填插值（`:?`，缺失或空值时`docker compose config`失败）、`AGENT_SERVICE_JWT_PREVIOUS`可选插值、其他服务不含JWT变量，以及根`.env.example`声明两个变量且值为空（直接复制未填写的模板被启动校验拒绝，含防回归测试）。真实启动拒绝以standalone产物验证（D2无JWT→退出码1+拒绝消息；E2合法合成Secret→进程存活；2026-09-04四场景S1无current/S2 31字节/S3 previous===current/S4合法，见验收报告§7.4/§7.8）。

## 服务JWT跨语言契约（09-03 SJWT）

`testdata/service-jwt-vectors.json`保存非真实固定向量：同一组claims（固定`fixedNow`）由Node（`jose`）与Python（`PyJWT`）各自独立签名，两端测试套件互验对方签发的令牌（iss/aud/sub/jti/iat/exp精确一致、current/previous命中分类正确），并双向复验全部拒绝向量（`alg=none`、过期、跨方向）；协议常量（HS256/300s/30s）漂移由guard测试拦截。09-05 SDL-FR-008将固定身份原子切换为`socila-next-core`：向量文件全部令牌以同一组测试Secret/`fixedNow`/JTI重签，新增"旧身份（`ssp-next-core`）令牌统一401"双向拒绝用例（Node `service-jwt.test.ts`、Python `test_service_jwt.py`）。

```powershell
npm test                                   # 含 service-jwt.test.ts 与 service-jwt-vectors.contract.test.ts
uv run --project services/agent pytest -m "not integration"   # 含 test_service_jwt.py 与 test_service_jwt_vectors.py
```

## Socila命名契约与地区DSL（09-05 SDL）

- 命名契约扫描（`src/lib/naming/socila-naming-contract.ts` + `.test.ts`，npm test；2026-09-05复审纠正语义）：扫描Git跟踪的活动代码与配置（排除docs/历史与package-lock），禁止精确旧协议值（SSP-DSL-1.0/ssp_dsl_v1）、旧环境变量/Cookie/localStorage/服务身份/开发Compose资源名等历史标识与独立品牌缩写。精确片段语义：允许文件（仅drizzle/0010 migration、其行为测试与守卫钉断言）中的精确旧协议值在宽泛品牌检查前被剥离，**同文件中其他独立品牌标识仍必须命中**；全部token值经拆分构造防自命中（SDL-AC-003）。
- Gitleaks allowlist哨兵回归（`scripts/verify-gitleaks-allowlist.mjs`，CI security-gates；ADR-0009）：以Gitleaks 8.29.1在临时git仓库中断言——已核实误报被`[[allowlists]]`+`targetRules`精确忽略（exit 0）、允许路径上其他规则的合成哨兵（private-key-header假PEM，非真实凭据）必须被检测（exit非0+报告发现）、trace无`skipping file: global allowlist`整文件跳过。
- 多地区Seed隔离（`multi-region-seed.integration.test.ts`，test:db；2026-09-05复审纠正）：临时DSL目录构造两个地区共享rule_id/param_id/rule_set_id/测试名，断言两地记录并存、值互不覆盖、tests行带jurisdictionCode、重复Seed幂等（SDL-AC-002落库面）。
- DSL布局契约（`src/lib/dsl/dsl-layout.test.ts`）：协议目录`dsl/protocol/socila_dsl_v1`（Socila命名Schema、`dsl_version` const钉死`SOCILA-DSL-1.0`）与地区目录`dsl/regions/shanghai_dsl_v1`（24规则全SOCILA-DSL-1.0、SHANGHAI_BASE 29参数、RS-SHANGHAI-PLAN-V1覆盖24规则、旧目录不存在）。
- 地区Manifest发现（`src/lib/dsl/region-manifest.test.ts`）：Manifest必备字段、清单与目录双向一致、越界路径拒绝、未知`dsl_version`拒绝、未来地区无需修改上海常量即可发现（SDL-AC-002）。
- migration行为（`src/server/modules/policy/__tests__/sdl-0010-migration.integration.test.ts`，test:db）：已知旧值规范化、未知值中止、六条示例精确删除+对照行不变、非预期地区/版本/引用中止、重复执行幂等（SDL-AC-007）。
- 生产Seed干净（`seed-regional-clean.integration.test.ts`）：全新库Seed后无粤川示例包与参数（SDL-AC-005）；区域隔离测试经`fixtures/regional-examples.ts`显式安装夹具并在afterAll清理零残留（SDL-AC-006）。
- 数据文件契约（`src/lib/data/data-file-contract.test.ts`）：`data/shanghai-test-cases-from-transcripts.xlsx` SHA-256与重命名前一致（SDL-AC-010）。

## CI六项门禁（09-03 PMG-FR-020～025）

`.github/workflows/ci.yml`：触发`pull_request`、`main` push与`workflow_dispatch`；同ref并发取消；job级timeout；默认token仅`contents: read`；第三方Action全部固定提交SHA。

| Job | 本地等价命令 | 通过条件 |
| --- | --- | --- |
| `gates` | `npx tsc --noEmit`、`npx eslint src`、`npm test` | 退出0；单元skip为0 |
| `agent-gates` | ruff、mypy、`pytest -m "not integration"`、pip-audit | 退出0；skip为0、未解释warning为0 |
| `database-gates` | 全新PG17：migration×2、引导×2、seed、`npm run test:db`、`agent.migrate --with-roles`、`pytest -m integration` | 幂等no-op；集成skip为0 |
| `e2e-gates` | `npm run test:e2e:auth`（standalone构建+mock模型+全新库） | 10项Auth流程与助手回复通过 |
| `container-gates` | 构建web/agent镜像；合成env+临时卷`compose up`→健康检查→SJWT-AC-017双向冒烟（合法双向调用200、伪造服务名/错误方向/重放401）→`down -v`；Trivy 0.74.0 | 健康通过、双向冒烟通过、临时资源删除、可修复HIGH/CRITICAL为0 |
| `security-gates` | `node scripts/scan-secrets.mjs --all`；Gitleaks 8.29.1完整历史（09-05起使用`.gitleaks.toml`：默认规则集+精确路径/规则allowlist） | 除7个已核实fingerprint与`.gitleaks.toml`已核实测试合成值allowlist外0发现 |

## SiliconFlow

- 确定性Fake覆盖401/403、429/503、超时、畸形响应、重试上限和隐私阻断。
- 真实验证覆盖`/models`、Embedding、Rerank和PaddleOCR-VL-1.5。
- 真实输入只使用公开或合成政策文本和图片。
- 输出不得包含API Key、Authorization Header、完整向量或图片Base64。
- 当前实测模型和结果见[SiliconFlow验证记录](./config/siliconflow-validation.md)。

## RAG质量门禁

| 指标 | 最低值 |
| --- | ---: |
| Context Precision | 0.85 |
| Context Recall | 0.90 |
| Faithfulness | 0.95 |
| 引用覆盖率 | 100% |
| 错地区混入率 | 0 |
| 错生效日期混入率 | 0 |
| 受影响规则召回率 | 90% |

## OCR质量门禁

| 指标 | 最低值 | 失败处理 |
| --- | ---: | --- |
| 字符准确率 | 95% | 页面进入人工校对 |
| 文号准确率 | 100% | needs_review |
| 日期准确率 | 100% | needs_review |
| 金额/比例准确率 | 100% | needs_review |
| 表格单元格准确率 | 90% | 关键参数表人工确认 |
| 页面完整率 | 100% | 缺页不得完成 |
| 引用页码覆盖率 | 100% | 缺引用不得索引或生成草案 |

扫描件没有可靠原生文本或模型不返回confidence时，文号、日期、金额和比例默认要求人工确认。

## 追踪与报告

- PRD/Work Item定义需求和验收ID。
- [traceability](./reports/traceability.md)记录实现与测试路径。
- reports记录实际命令、退出码、环境、时间和结论。
- 降低质量阈值必须获得用户批准并记录新ADR。
- 阶段和当前历史证据见[reports](./reports/README.md)。
