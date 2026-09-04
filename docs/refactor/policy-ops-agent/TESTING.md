# PolicyOps Agent测试与质量规范

> Author: Jan
> Status: Active
> Updated: 2026-09-04

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

测试分层（09-03 PMG-FR-005/006/018）：

```powershell
# 单元测试：零数据库依赖、零 skip（vitest.config.ts 排除 *.integration.test.ts）
npm test
# 数据库集成测试：仅 *.integration.test.ts，必须指向已迁移的全新 PostgreSQL 17 库；
# 未设置 SSP_TEST_DATABASE_URL 时直接失败（不允许以 skip 关闭）
$env:SSP_TEST_DATABASE_URL="postgresql://..."; npm run test:db
```

Repository集成测试需要本地PostgreSQL；真实部署、恢复和切换按[OPERATIONS](./OPERATIONS.md)及对应报告执行。

identity与鉴权专项（09-02）：

```powershell
# Chromium E2E（前提：全新PG17库已完成migration、bootstrap-admin、seed；npm run build）
$env:SSRP_E2E_DATABASE_URL="postgresql://..."
$env:SSRP_E2E_NEXTAUTH_SECRET="..."
$env:SSRP_E2E_REFRESH_PEPPER="..."
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
$env:SSP_TEST_DATABASE_URL="postgresql://..."
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

`testdata/service-jwt-vectors.json`保存非真实固定向量：同一组claims（固定`fixedNow`）由Node（`jose`）与Python（`PyJWT`）各自独立签名，两端测试套件互验对方签发的令牌（iss/aud/sub/jti/iat/exp精确一致、current/previous命中分类正确），并双向复验全部拒绝向量（`alg=none`、过期、跨方向）；协议常量（HS256/300s/30s）漂移由guard测试拦截。

```powershell
npm test                                   # 含 service-jwt.test.ts 与 service-jwt-vectors.contract.test.ts
uv run --project services/agent pytest -m "not integration"   # 含 test_service_jwt.py 与 test_service_jwt_vectors.py
```

## CI六项门禁（09-03 PMG-FR-020～025）

`.github/workflows/ci.yml`：触发`pull_request`、`main` push与`workflow_dispatch`；同ref并发取消；job级timeout；默认token仅`contents: read`；第三方Action全部固定提交SHA。

| Job | 本地等价命令 | 通过条件 |
| --- | --- | --- |
| `gates` | `npx tsc --noEmit`、`npx eslint src`、`npm test` | 退出0；单元skip为0 |
| `agent-gates` | ruff、mypy、`pytest -m "not integration"`、pip-audit | 退出0；skip为0、未解释warning为0 |
| `database-gates` | 全新PG17：migration×2、引导×2、seed、`npm run test:db`、`agent.migrate --with-roles`、`pytest -m integration` | 幂等no-op；集成skip为0 |
| `e2e-gates` | `npm run test:e2e:auth`（standalone构建+mock模型+全新库） | 10项Auth流程与助手回复通过 |
| `container-gates` | 构建web/agent镜像；合成env+临时卷`compose up`→健康检查→SJWT-AC-017双向冒烟（合法双向调用200、伪造服务名/错误方向/重放401）→`down -v`；Trivy 0.74.0 | 健康通过、双向冒烟通过、临时资源删除、可修复HIGH/CRITICAL为0 |
| `security-gates` | `node scripts/scan-secrets.mjs --all`；Gitleaks 8.29.1完整历史 | 除5个已核实fingerprint外0发现 |

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
