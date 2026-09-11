# PolicyOps Agent测试与质量规范

> Author: Jan
> Status: Active
> Updated: 2026-09-09

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

## draft政策包repair加固（WI-20260906-01/02，已实现并执行）

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

## 分地区交付与下游修复（ADR-0010/0011）

- 历史Red曾复现持久库fresh audit错误规划74/116/9/8；当前Green已证明只新增5参数、1规则、1规则集版本和1政策包版本，目标50/75/6/5，CN/沪/川零新增（证据见验收报告§17.1～§17.4）。
- 同键多窗口验证旧GD窗口保持v1、新窗口为v2；三个新参数为v1；相同delta重复与并发apply只产生一组结果。
- 广东能力级缺口：2030年前医保退休年限缺参产生`needs_agent`和`W-MI-LOCAL-YEARS-MISSING`且其他模块结果保留；2030年起男30年、女25年生效。
- 四川地区级门禁：无候选快照、无活动发布，规划请求返回unsupported且不得使用上海或广东实体。
- 原任务3/4并行方案已被复审推翻。任务3先修真实入口和日期快照；任务4随后使用其已验收snapshot区间生成案例。

### 任务3专用反例（2026-09-09第二轮修复后全量Green）

- 新会话必须先持久创建再确认地区（`create-conversation.use-case.test.ts`、`e2e/task3-regional.spec.ts` JRP-AC-001）；选择器不得对不存在会话返回404。
- `claim_city_code`缺失、非广东、未知或仅自由文本时不得估算失业金额（`claim-city.test.ts`、`jurisdiction-compute.use-case.test.ts`）；有效代码由服务端规范化后执行。
- 2026和2030广东请求必须命中不同snapshot区间（`snapshot-slices.test.ts` 时间片派生、`jurisdiction-compute.integration.test.ts` 落库反例：2026与2030命中不同snapshotId、2030男30年360月）；缺失、重叠、gateResults缺项或成员hash漂移均fail-closed（`jrp-0017-migration.integration.test.ts` EXCLUDE、compute用例执行期完整性）。
- 激活必须真实运行引用、Schema、依赖、冲突、黄金、双重重放和内容哈希七道门禁（`release-gates.test.ts`）；**空黄金测试集fail-closed**：`loadTests`返回空数组时`golden_tests={fail:"快照没有任何适用黄金测试"}`且`ok=false`（JRP-FR-007/AC-007，2026-09-09修复）。
- 历史plan按保存snapshot逐字节重放（`replay-plan.use-case.test.ts`+集成）；**三方hash一致性**：plan保存`snapshotContentHash`、快照行`contentHash`、成员重算规范化hash必须全部一致，任一不一致（或保存hash缺失）抛`ReplaySnapshotDriftError` fail-closed（JRP-FR-028/AC-008，2026-09-09修复）；compute保存plan时必须写入`snapshotContentHash`（JRP-FR-009，`jurisdiction-compute.use-case.test.ts`断言）。
- **停用URL地区绑定**：`deactivateJurisdictionRelease`校验URL地区代码与release记录地区一致，广东URL+上海releaseId抛`ReleaseJurisdictionMismatchError`且零写入（JRP-FR-027/AC-009，2026-09-09修复）；路由映射409并返回url/record代码；停用广东不影响上海（集成）；四川始终unsupported。
- 聊天和直接规划页面使用同一地区确认契约并有专用Chromium E2E（`e2e/task3-regional.spec.ts` 6例：新会话预创建/聊天与`/plan/new`同契约/claim_city_code/四川不可选/历史replay/跨地区停用拒绝/停用后unsupported），配套`scripts/e2e-task3-setup.ts`预创建沪粤快照并经真实七道门禁激活。
- DB门禁必须在命令中显式提供全新隔离`SOCILA_TEST_DATABASE_URL`并证明零skip（2026-09-09证据：`postgresql://postgres:postgres@localhost:5439/task34r2_drill`，25文件/116零skip）；缺环境变量导致的skip/失败不能作为PASS。

#### 单元超时策略（2026-09-09任务3复审P2稳定化）

`src/server/modules/identity/__tests__/identity-container.test.ts`的三个`freshContainer()`用例经`vi.resetModules()`重新求值identity-container的完整依赖图（`@/lib/db`→drizzle/pg链），在并行单元套件负载下单测可能超过vitest默认5秒；三个用例显式放宽到30秒（`it(..., 30_000)`）。这是模块重载固有成本，断言本身仍是确定性环境变量契约（缺失pepper拒绝、相同拒绝、合法放行），不以超时掩盖失败。

### 地区案例全量重建专用反例（2026-09-09第三轮复审未闭环）

- 归档SHA必须来自真实文件字节（`archive.test.ts` 9例：篡改检测、必备文件、sha清单不自包含）；篡改、缺少selection/restore报告或pending状态均拒绝apply；`executor.ts`的`bufferSha256`对二进制dump直接Buffer哈希（String(buffer)有损解码已修复）。
- manifest绑定精确行ID/内容hash、snapshot/hash、评分和测试来源（`manifest.test.ts`）；**完整场景字段**：新行绑定scenarioKey/asOfDate/input/expected/assertions/coverage/evidence，任一漂移使manifestHash变化（RCL-AC-003）。
- 无可比较显式断言的快照重放不得得分（`replay.test.ts` 6例）；active/selected案例质量总分和分解均非空（`scoring.test.ts`）。
- 相同模板重复生成相同N、36和manifestHash（`generator.test.ts` 12例）；cases仅沪粤，每个case一条回归test，42条DSL示例完整。
- showcase严格沪18/粤18，每地区男女9/9、三个年龄段各6、三种就业状态各6（RCL-AC-008）。
- 两个并发apply只有一组成功（`rcl-apply.integration.test.ts`：FOR UPDATE+applying+唯一约束）；管理查询必须为`active AND filters`。
- **行内容hash绑定**：plan-replacement与apply统一按行内容重算规范化hash（原生SQL行、排除基础设施列），库中content_hash列为空也能精确绑定，任一行漂移拒绝且零写入（RCL-AC-003）。
- 完整旧851/117/500归档必须在全新PG17+pgvector真实恢复并对账（`reconcile.ts`：表集合/行数/规范化哈希）。
- 最终组合migration顺序为0015→0016→0017→0018，并从零执行两次验证幂等（`rcl-0018-rebuild-schema.integration.test.ts`：0016哈希不变；0018含cases.input/expected/assertions列与归档条目entity_type含test）。
- 端到端：生成→快照规划器计算期望→评分→N/36/N+42（`rcl-end-to-end.integration.test.ts`）；四川始终unsupported。
- **受控CLI七模式真实演练**（`rcl-cli.integration.test.ts` 11例，spawn真实CLI）：audit→generate→plan-replacement→prepare-archive（真实pg_dump）→真实恢复演练（第二实例pg_restore+reconcile全表对账+verified restore-report+重算sha256sums）→verify-archive→apply（--i-am-authorized）→verify；每个模式断言真实JSON输出与退出码；缺授权退出1、归档篡改退出2。
- apply后cases/showcase/tests的scenarioKey、asOfDate、输入、期望、断言、覆盖、证据和质量分解必须与manifest逐字节一致，禁止null或空对象占位（`assertCompleteScenarioFields`事务内fail-closed）。
- Chromium E2E（`e2e/task4-case-library.spec.ts`）精确断言公开36条、上海18、广东18、治理字段非空、管理active过滤、归档批次可读及匿名401/普通用户403。
- 激活门禁的golden_tests只加载source='example'的DSL示例（RCL-FR-007；回归tests不进入黄金重放）。
- 旧regression test必须按完整业务行计算非空hash；修改任一业务字段均使apply拒绝，不能只比较`sourceCaseUid`（`hashes.test.ts` 8字段漂移、`rcl-apply.integration.test.ts` 8字段漂移Red）。
- SHA清单必须精确覆盖必备文件；restore报告必须验证dump SHA、版本、全部表和真实sequence明细，空明细`verified`必须失败（`archive.test.ts` SHA精确覆盖与restore深验证、`rcl-cli.integration.test.ts` 真实报告由`buildVerifiedRestoreReport`生成）。
- 42条DSL example的保留/更新/新增/删除集合必须进入manifest并在同一apply事务执行；当前28或49条不得自适应成为合法目标（`dsl-examples.test.ts` 42条确定性、`manifest.test.ts` assertRclCounts强制42、`rcl-apply.integration.test.ts` 同事务同步与回滚）。
- manifest文件、批次hash和重算hash必须三方一致（`manifest.test.ts` recomputeManifestHash/createdAt不入hash/正文篡改拒绝）；以452/36/500+28镜像演练后最终必须得到匹配manifest的36/36/78（阶段二pre dump隔离演练，2026-09-10）。
- 落库新行hash逐项核对：apply插入后按稳定UID重读完整行重算并与manifest比较，返回实际DB ID/UID/hash；verify同样逐项核对（`rcl-apply.integration.test.ts`、`rcl-cli.integration.test.ts` Fix 8）。
- **prepare-archive补偿（第四轮复审）**：任何prepare阶段失败（第二次完整dump失败/写文件失败/最终SHA生成失败）均不得留下prepared批次或archive entries；只精确清理本次新建batchId（`status='prepared'`守卫条件更新，历史批次不受影响）；文件失败清理本次不完整临时归档；补偿失败必须同时报告原始错误与补偿错误（`RclPrepareError.originalError/compensationErrors`）；正常路径仍生成包含批次记录的最终完整dump（`executor.test.ts` 第四轮补偿4条Red→Green）。
- **applied幂等重验（第四轮复审）**：`executeRclApply`对`batch.status='applied'`不得直接noop——先重验manifest正文hash、批次hash、最终N/36/N+42、42条example与cases/showcase/regression逐行hash，完全一致才返回noop；首次apply后篡改case/showcase/regression/example任一最终行，复跑apply必须返回稳定错误且零删除零插入（`rcl-apply.integration.test.ts` 第四轮篡改4条Red→Green）。
- **migration SQL换行契约（第四轮复审）**：仓库根`.gitattributes`固定`drizzle/*.sql text eol=lf`；0010～0018 Git blob不变；显式`core.autocrlf=true`的全新checkout仍为LF；Drizzle实际读取hash必须与Git blob的LF SHA一致（`migration-lf.contract.test.ts` 4例）；`jrp-0017-migration.integration.test.ts` 0015哈希不变量基线为Git LF内容`3ae5b95f…`。
- 测试库端口：materializer集成测试从`SOCILA_TEST_DATABASE_URL`解析实际端口（删除5439硬编码）；`scripts/db-gate-task34.mjs`以任务专属随机高位端口全新PG17+pgvector容器跑全量`npm run test:db`（2026-09-10第四轮证据：26文件/141零skip）。
- **journal严格单调契约（第五轮复审）**：`drizzle/meta/_journal.json`全部entry按idx严格递增；0010～0018 when与预期时间表一致（1788560000000/1788600000000/1788640000000/1788680000000/1788705240000/1788777720000/1788785400000/1788796800000/1788796860000）；max when必须恰为0018=1788796860000（保证账本max下整体no-op，旧journal的0014=1788991200000会被migrator重新应用→Red）（`migration-lf.contract.test.ts` 第五轮新增3例）。
- **migration账本回归（第五轮复审）**：`scripts/rcl-ledger-regression-task34.mjs`（共享逻辑`scripts/lib/task34-ledger-regression.mjs`）在post dump恢复的隔离库验证8项——修复后journal首次migration no-op账本21条；事务删除ID 18/19/20；migration×2均no-op；账本持续18条不重新生成0012～0014；ID 10～16、21、22 hash/created_at不变；ID 17缺号不补写不重排；模拟0019（when=1788797000000>1788796860000）只应用一次；工作树SQL均LF且hash===Git blob（2026-09-10证据：`task34-r5-ledger-regression-2026-09-10/ledger-regression.json` ok:true）。
- **prepare-archive归档目录保护（第五轮复审）**：目标目录已包含任一历史归档专属文件（policyops-fc/cases/showcase_cases/tests.dump、selection-report、restore-report、sha256sums.txt）时必须拒绝开始（禁止覆盖历史归档，零写入零批次）；manifest.json为plan-replacement合法前置产物不拒绝；补偿只删除本次新建文件、历史无关文件保留（`executor.test.ts` 第五轮3条Red→Green；第二次dump/写文件/最终SHA/补偿失败4条保持零prepared批次/entries）。
- **迁移审计阻断门禁（第五轮复审）**：`scripts/rcl-audit-task34.mjs`中journal非单调/与预期不符、ID 10～16/21/22账本hash≠Git blob LF SHA、隔离库删除重复行后migration×2非no-op均为阻断错误（throw，不生成repair-forward计划）；`--trusted-dir`模式只读复验既有可信归档（8文件/SHA/manifest/restore/第三库恢复一致）并禁止覆盖（2026-09-10第五轮审计：journalMonotonic=true、ledgerGitBlobHashMatch=true 9/9、ledgerRegressionNoopAfterDelete=true）。
- **repair-forward执行器（第六轮，WI-20260907-04）**：`src/lib/case-repair/__tests__/repair-forward.test.ts` 20例（Red→Green；独立于case-governance目录以保持RCL-AC-015契约）——确定性批次ID `sha256("task34-r4-trusted-archive:<manifestHash>")`前16字节设v5位===`c8a7c104-8b8b-53f5-9bfd-1c8a8a6be141`（禁止随机UUID）；988条entries由manifest逐条构建（452/36/500）、任一非64位小写hex→`ENTRY_HASH_INVALID`、同批次entity_type+entity_id重复→`ENTRY_DUPLICATE`、计数不符→`TRUSTED_ARCHIVE_MISMATCH`；可信批次行真实计数/table_hashes/created_by；planHash覆盖entries+批次ID+codeSha且相同输入确定性；账本删除语句三组(id AND hash AND created_at)+RETURNING id；状态分类pending/repaired/drift（部分完成、988不完整、业务指纹/计数变化、账本旧值漂移均为drift）；参数守卫（无参数失败、apply缺授权/planHash/targetFingerprint拒绝、未知模式拒绝）。
- **repair-forward隔离演练（第六轮）**：`scripts/rcl-repair-drill-task34.mjs <post-dump> --out <dir>`在任务专属全新PG17+pgvector容器按顺序验证19场景（audit/plan初始指纹一致并交叉核对attestation===第五轮审计；缺授权/错planHash/错targetFingerprint/账本旧值漂移/prepared批次漂移/可信归档临时副本漂移/非法hash与重复→拒绝且零写入；正常apply单事务；账本18条原值；批次rolled_back且历史entries保留；新可信批次字段；988 entries逐项（verify --plan）；36/36/78/10/5与业务表hash不变；migration×2 no-op；复跑noop；并发两apply一执行一noop（40001重试）；5故障注入点完整回滚；repair后dump第三库恢复40表/20 sequence零mismatch），写`repair-executor-test-report.json`；2026-09-10证据`task34-r6-repair-drill-2026-09-10/`（19/19）。审计脚本`--executor-test-report`绑定该报告且要求19项全过，并调用执行器`plan`生成`executable-write-set.json`与审计交叉核对（targetFingerprint/attestation/账本指纹/codeSha/可信归档/988/确定性ID/pending/工作树干净）。

## SHV2 RCL-GEN-2.0案例与文档（09-11 WI-20260911-02）

- 生成器V2（`src/lib/case-governance/__tests__/generator-v2.test.ts` 40例）：版本与V2 UID、36/18/18与全部策展配额（9/9、6/6/6、18个唯一组合）、上海六能力各3条且每状态1条、非退休能力断言自身输出、完整生日/女性口径/失业三要素/灵活基数/补贴认定契约、字段缺失→needs_agent反例、case_text与标题/问题/回答互异非占位、数值单源（36条数字全溯源、expected逐命名空间=引擎）、policySources白名单与仓库meta.json SHA/URL一致、广东五能力与as-of、重复生成逐字节一致。
- 内存链路辅助（`__tests__/engine-chain-v2.ts`）：以`mergePolicyContext`+`orchestrateSnapshot`镜像快照执行路径（含claim_city_code规范化），供单元层期望计算；与数据库快照路径的一致性由"已提交manifest≡内存生成"交叉校验证明。
- Markdown案例库（`case-library-doc.test.ts` 10例）：确定性渲染、manifestHash正文重算、`checkCaseLibraryMarkdown`漂移检测（改字符/改内容/改hash/减条目均失败）、已提交`docs/refactor/policy-ops-agent/case-library/shanghai-guangdong-v2.md`通过`--check`且与内存生成逐条一致；脚本`scripts/rcl-case-library-v2-doc.ts --check`退出码0/2。
- API与文案契约（`src/lib/showcase/synthetic-copy.test.ts` 8例）：`decorateShowcaseCase`（synthetic/human_curated、不完整evidence不升格）、两个路由新增字段向后兼容（mock仓储）、公开页/首页/导航/卡片禁用"真实咨询"表述、后台"合成案例文档"与"待生成V2案例文档"。
- Chromium E2E（`e2e/shv2-case-copy.spec.ts` 4例）：公开页合成披露与卡片结构、首页/导航、公开API 36条caseNature/policySources、管理后台文档字段与权限内联（匿名/普通用户契约由task4 spec覆盖）；V1数据状态断言"待生成V2案例文档"且不展示占位问答。
- test:db标准参数：本机Windows长时串行运行以`--dangerouslyIgnoreUnhandledErrors`屏蔽vitest 3.2.6 worker teardown RPC竞态（`scripts/db-gate-task34.mjs`既有约定，测试失败仍非零退出）；集成测试必须显式`SOCILA_TEST_DATABASE_URL`与`RCL_DRILL_PG_CONTAINER`。

## V1→V2受控原位改写（09-11 WI-20260911-03）

- 0019migration行为（`src/lib/case-rewrite/__tests__/rcl-0019-migration.integration.test.ts` 4例）：审计表列全集、plan_hash唯一、(batch,entity_type,entity_id)唯一、hash列CHECK拒绝非法值、外键RESTRICT不级联删除历史审计、SQL重复执行幂等、journal 0019严格单调（when=1788797000000）。
- 核心单元（`src/lib/case-rewrite/__tests__/rewrite-v2.test.ts` 14例）：批次ID v5确定性派生、planHash正文重算与敏感性、来源工件指纹/attestation、人物槽位匹配（V2按§8.2矩阵重新分配能力→槽位而非scenario_key为匹配身份）、投影（整数ID保留/V2 UID/case_text/transcript不虚构/last_run清空）、108条entries完整绑定、状态分类（pending/applied/drift）、参数守卫、业务行+快照+release指纹敏感性。
- CLI集成演练（`rcl-rewrite-cli.integration.test.ts` 8例）：重建V1基线（seed→激活3区间→V1 CLI七模式）→generate-v2→audit→守卫反例（缺授权/错planHash/错targetFingerprint零写入）→行漂移拒绝→apply（108行原位、ID不变、1批次+108entries、case_text非空/transcript NULL、计数36/36/80）→verify→复跑noop→applied后篡改drift（从entries.after恢复后复跑noop）→并发两apply一执行一noop→故障点注入整体回滚→policyops库名默认拒绝。
- 隔离验收演练（`scripts/rcl-rewrite-drill-v2.mjs`）：全新库上baseline→generate-v2→audit/plan→守卫→apply→verify/noop→0019×2幂等→post dump第三实例pg_restore+`restore-reconcile`全表+sequence对账→最终计数/审计核对，证据JSON入reports。
- migration journal契约更新：0010～0018保持≤持久账本max（不重应用），0019=1788797000000为唯一高于账本max的新迁移（持久执行须另行fresh授权）。
