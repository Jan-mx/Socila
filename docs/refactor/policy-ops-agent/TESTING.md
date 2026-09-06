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

## 国家baseline与地区overlay（09-05 NRP）

- 显式overlay操作（`src/server/modules/policy/__tests__/overlay.test.ts`）：baseline+四种操作的合并语义、目标键解析（missing-target/unknown-key/same-level-target）、CN↔baseline不变量、输入不可变与顺序稳定。
- 0012约束落库（`nrp-explicit-overlay.integration.test.ts`，test:db）：CHECK约束拒绝矩阵（CN+add、地区+baseline、replace无目标、add带目标、非法枚举）、显式replace在解析结果生效且provenance含操作与目标键（NRP-AC-005）、CN/SH/GD隔离、未知目标键→PolicyConflict阻止快照（NRP-AC-006）。
- 引用契约（`src/lib/dsl/citation-contract.test.ts`）：全部地区evidence的SHA-256与meta.json一致、摘录经空白归一化逐字出现在抓取原件文本中（防伪造引用）、参数与政策承载规则引用覆盖率100%（计算框架规则白名单除外）。
- CN baseline黄金（`cn-baseline-golden.test.ts`）：19个示例用例+完整编排，全部政策数值锚定官方摘录（NRP-AC-001）。
- 上海重分类零漂移对账（`shanghai-reclassification-drift.test.ts`）：改动前44例冻结基线（evidence/shanghai-reclassification/pre-reclass-baseline.json）与重分类后链式装载逐案对账，plan/calc/user逐字节一致，trace差异必须被参数改名映射完全解释（NRP-AC-002）。
- 黄金回归与快照（`golden.test.ts`/`golden-snapshot.test.ts`）：语料升级为CN+SH继承链合并（28例），已知偏差清单收敛为浮点噪声1条；重复执行零漂移+提交快照比对。
- 广东黄金（`guangdong-overlay-golden.test.ts`）：GD restrict挂载与provenance、2030统一口径、缴费基数有效期窗口内外、地区隔离（NRP-AC-003/005）。
- 四川黄金（`sichuan-overlay-golden.test.ts`）：继承国家口径、医保年限待办→needs_agent守卫语义（PRD §10）、2025年度窗口、隔离（NRP-AC-004）。
- 落库快照（`nrp-gd-overlay.integration.test.ts`/`nrp-sc-overlay.integration.test.ts`，test:db）：GD/SC候选快照创建、同地区同日期重放哈希一致（NRP-AC-010）、单地区落库不影响SH（NRP-AC-009）。
- 采集方式说明：官方站点（gov.cn/mohrss等）对curl返回403或JS挑战，采集使用Playwright无头Chromium保存渲染后原件+响应头+SHA-256（`evidence/*/*/meta.json`记录fetchMethod），事实仅取自抓取页面正文。

## 阶段E 受控物化与地区化管理（09-05 NRP）

- 物化器单元（`src/lib/policy-materialization/materializer.unit.test.ts`）：目标守卫（DATABASE_URL必须进程显式设置，.env.local存在也不回退；仅本机policyops）；目标指纹非敏感；manifest从已提交内容构建且确定性；地区就绪语义（CN/沪awaiting_approval、粤/川blocked）；草稿强制（不信任文件published）；既有键v2/新键v1版本解析；目标版本冲突拒绝。
- 0013迁移行为（`nrp-0013-materialization-schema.integration.test.ts`，test:db）：params.evidence列、批次审计表（无连接串类字段）、publishes地区身份列（历史可空/新记录完整）、幂等重跑。
- 物化器集成（`materializer.integration.test.ts`，独立动态库）：AC-011缺授权/错哈希/错指纹→拒绝且零写入；AC-013四地区版本与draft强制、旧行published不变；AC-014同manifest no-op与单事务回滚；AC-015固定计数49/70/5/4/528/851/117/0与GD/SC blocked、SC规则0。
- 管理端身份：发布服务以jurisdiction_code+entity_id+version精确定位（缺失400、不存在404、blocked地区422拒绝晋级），发布审计携带地区与版本；规则列表jurisdiction/status/module/q筛选。
- 运维工具：`scripts/restore-reconcile.mjs`（恢复逐表对账）、`scripts/planning-regression.ts`（规划行为零漂移复核）。

## 阶段E复审缺陷修复（09-05 NRP，2026-09-06）

- 目标守卫加固（`src/lib/policy-materialization/target-guard.test.ts` 13例）：协议白名单、端口精确5432、拒绝全部query/fragment/socket/percent编码路径、pg-connection-string交叉一致、指纹非敏感、无dotenv导入源码契约。
- 编辑白名单（`src/lib/admin/entity-edit-policy.test.ts` 9例）：受控字段与未知字段拒绝、业务字段放行（rules/params/rule_sets）。
- 参数类型契约（`src/lib/admin/params-service.test.ts` 7例）：number/boolean/string/array读value、table/timeline读rows、类型运行时校验、标量禁rows。
- 包快照完整性（materializer.unit新增）：快照携带rows/key_fields/value_fields/type/有效期/operation/evidence/contentHash。
- 路由级身份与隔离（`src/app/api/admin/__tests__/{nrp-identity-regional,nrp-stage-e-fix}.integration.test.ts`）：缺失身份400/错版本404/同名CN-SH不串区；PATCH注入status/version/jurisdictionCode被400且库不变；发布门禁按jurisdiction_codes继承链加载测试（沪测试不替CN充数）；发布审计携带地区与版本。
- published哈希矩阵（fix集成）：修改name/module/priority/effective窗口/notes/dsl_version/supersedes及删除行均改变哈希，还原恢复。
- 并发与约束（0014）：批次(jurisdiction,manifest_hash)唯一、成员唯一+entity_type CHECK、status/readiness枚举CHECK；并发apply单事务成功/另一no-op。
- 对账工具（`scripts/restore-reconcile.ts`）：目录驱动枚举public/drizzle/agent/rag全部BASE TABLE与sequence，整行to_jsonb规范化哈希，表集合/计数/哈希/sequence任一不符退出1。

## draft政策包repair加固（WI-20260906-01，已实现并验收；持久库repair仍未执行）

专用测试已按Red→Green完成（2026-09-06，Red/Green证据见验收报告§14），全部位于`src/lib/policy-materialization/`：

- 单元（`materializer.unit.test.ts`、`target-guard.test.ts`）：目标指纹绑定draft包行ID/地区/pack ID/版本/状态/快照哈希/成员哈希——任一变化都改变指纹；CLI按实际修复数量输出的源码契约；指纹不含连接串与口令。
- 数据库集成（`materializer.integration.test.ts`，独立动态演练库，先写失败测试再实现）：
  - 守卫：缺授权/错manifest哈希/错指纹全部拒绝，政策包、批次、成员零变化；
  - 目标绑定：audit后修改任一目标draft的快照、状态、版本或成员哈希，repair以`FINGERPRINT_MISMATCH`拒绝且不覆盖新值；
  - 正常修复：四个旧格式draft包单事务修复，快照逐字段等于Manifest，4个`repaired`批次（readiness/阻断原因继承Manifest地区语义）+4个新成员（记录目标行、版本、新内容哈希）落库，原物化批次和全部原成员不变，repair批次哈希由基础manifest哈希+地区+pack ID+版本+旧/新内容哈希确定性生成；
  - 事务回滚：第2个包更新后注入失败，四包、批次、成员全部回到操作前状态；
  - 并发：同一fresh audit两个repair并发，仅一组修复审计，另一调用复核后no-op（0014唯一约束+事务内`FOR UPDATE`重校验+`REPAIR_TARGET_CHANGED`零写入退出共同裁决）；
  - 幂等与零漂移：成功后fresh audit复跑repair为no-op且批次、成员不再增加；业务计数49/70/5/4/528/851/117/0、published整行哈希不变。

全量门禁不能替代这些专用反例；持久库audit、migration或repair不得作为测试步骤。集成测试teardown先`closeDatabase()`、再显式终止残留会话、最后删库，测试客户端挂error监听（错误仅记录，查询失败仍经promise拒绝暴露），保证run零unhandled errors。
