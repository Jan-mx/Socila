# PolicyOps Agent当前进度

> Author: Jan
> Status: Active
> Updated: 2026-09-12

## 当前结论

> SHV2进展（2026-09-12）：功能分支`codex/shanghai-case-v2`三个独立审查问题已修复交付并过全量门禁，状态Ready for independent review（待独立复审确认，不自行标记Accepted）。目标分支`0885613`未修改未合并，持久policyops与生产MinIO未连接未写入。

- 七阶段重构Goal：**Accepted**，七份阶段验收报告全部PASS。
- 当前开发分支：`refactor/policy-ops-agent-platform`；任务3/4最终集成分支已完成显式merge commit集成。
- 09-11上海政策与案例V2 Feature：功能分支`codex/shanghai-case-v2@f583adc`代码/隔离证据已推送，目标分支仍为`0885613`未合并；2026-09-12独立审查后因MinIO原件链路、业务`content_hash`同步和完整Node套件超时三项未闭环而Reopened。
- 当前运行事实源：单机Docker Compose中的PostgreSQL、MinIO和Agent存储；Neon不再承接运行时读写。
- 本机定位：开发机，生产Compose数据卷保留但不常驻；远程服务器部署列入路线图。
- 09-02 Feature（用户与管理员双角色鉴权，PRD `docs/prd/09-02-feature-user-admin-auth.md`）：**Accepted**（验收证据：`reports/feature-09-02-auth/acceptance-report.md`）。
- 09-03 阶段（`docs/prd/09-03-stage-policyops-pre-merge-release.md`，P0合并质量门禁与v2.0.0发布准备）：**Accepted（开发分支发布准备）**（验收证据：`reports/stage-09-03-pre-merge-release/acceptance-report.md`）。本阶段仅验收开发分支`refactor/policy-ops-agent-platform`：六类门禁全部本地新鲜复现（全部退出0、零skip）、workflow经actionlint 1.7.7静态校验零发现、`origin/main...ced6a5a`完整差异审阅完成（401文件，+32501/−1851）。workflow已静态校验、六类门禁已本地复现，不声称GitHub-hosted六项checks已经运行。重构前`main`已由annotated tag `v1.0.0`标记；PR、main ruleset、merge与`v2.0.0` Release为未来人工动作（见“精确下一步”），不阻塞本阶段验收。
- 09-03 阶段（`docs/prd/09-03-stage-runtime-configuration-remediation.md`，本地运行配置与凭据整改）：**Accepted**（验收证据：`reports/stage-09-03-runtime-config-remediation/acceptance-report.md`）。CFG-FR-001～010、CFG-NFR-001～007、CFG-AC-001～013全部通过：统一环境加载、模板与入口收口、管理员引导一次性化、新鲜备份+PG17+pgvector真实恢复对账、PostgreSQL口令轮换与轮换前后逐表对账（34表/1610行一致）、全部门禁本地新鲜复验（全部退出0、零skip）；复审确认本阶段演练容器零残留。
- 09-03 Feature（`docs/prd/09-03-feature-core-agent-service-jwt.md`，Core与Agent双向服务JWT鉴权）：**Accepted**（主体提交`35d673c`，修复提交`fix: 补齐服务JWT复审缺漏`；验收证据：`reports/feature-09-03-service-jwt/acceptance-report.md` §7.4～§7.6）。SJWT-FR-001～009、SJWT-NFR-001～007、SJWT-AC-001～019全部通过：复审四项缺漏逐条修复并重新验收——FastAPI文档/OpenAPI入口统一关闭（四路径一律404、`/internal/health`唯一豁免）、Web Node运行时启动入口`src/instrumentation.ts`对无效Secret fail-fast拒绝启动（standalone真实启动拒绝D2/E2）+Compose`AGENT_SERVICE_JWT_CURRENT`必填插值（缺失/空值`docker compose config`失败）、Python重放存储缺表/权限/连接中断统一映射503且业务异常原样传播不包装（JTI与业务写同事务回滚）、宿主`.env.example`补齐两变量且实际值安全同步至Git忽略的`.env.local`（零输出验证、未轮换）；全部门禁在修复后的全新演练库上重跑（全部退出0、零skip）、AC-017完全隔离Compose双向真实TCP冒烟（10断言+台账恰好1行）与Docker任务资源零残留复核（`socila-*`未动）。2026-09-04复查新发现2项缺漏并修复重验：公开模板可预测占位符通过校验→模板current/previous改空值（故意设计，直接复制未填写的模板被启动校验拒绝，已加防回归测试）+ `psycopg.connect`缺确定性超时→`PostgresReplayGuard`新增`connect_timeout_seconds`（正整数构造期校验、默认5秒、测试不可达连接1秒、超时统一映射503 no-store、既有异常边界不变）；全部门禁新鲜复验（除`pip-audit`因本机到PyPI连接被代理重置而环境阻塞、依赖集零diff外全部退出0）、完整集成测试不再挂起（15通过/5.27s）、演练资源零残留（`socila-*`未动），Feature保持**Accepted**（详见`reports/feature-09-03-service-jwt/acceptance-report.md` §7.7）。2026-09-04 Edge构建警告复查修复：`src/instrumentation.ts`被Next.js同时构建为Node与Edge运行时bundle，静态`process.exit(1)`触发Turbopack警告（`process.exit is not supported in the Edge Runtime`，违反AC-018）→启动校验与进程终止收敛至Node专用模块`src/lib/security/service-jwt-startup-node.ts`（`register`改async、仅`NEXT_RUNTIME=nodejs`分支动态import、Edge运行时不执行启动校验、fail-fast语义不变），`npm run build`零警告、standalone四种真实启动复验（无current/31字节/previous===current均退出1且`/api/health`不可访问、合法合成Secret成功启动Ready）、源码契约测试防回归（§7.8），Feature保持**Accepted**。
- 09-05 Feature（`docs/prd/09-05-feature-socila-naming-regional-dsl.md`，Socila命名统一与地区DSL分层）：**Accepted**（验收证据：`reports/feature-09-05-socila-naming/acceptance-report.md`）。SDL-FR-001～014、SDL-NFR-001～007全部有实现与测试映射，SDL-AC-001～010新鲜证据通过：通用协议`dsl/protocol/socila_dsl_v1`与上海地区`dsl/regions/shanghai_dsl_v1`分层（24规则/29参数/`SOCILA-DSL-1.0`/Manifest `jurisdiction_code=310000`）、Seed经Manifest发现（零硬编码地区）、活动代码与配置SSP/SSRP→Socila硬切换（命名扫描零命中，无旧变量/Cookie/localStorage/服务身份兼容）、Node与Python服务JWT身份原子切换`socila-next-core`（固定向量重签+CI冒烟同步）、粤川示例转测试夹具（生产Seed不写入）、0010迁移完成dsl_version规范化与六条示例精确清理（删除前新鲜pg_dump+SHA-256清单+PG17+pgvector真实恢复逐表对账25表一致；删除后diff仅params 33→29、packs 2→0及0009补齐空表；备份/旧卷/历史快照未动）；Gitleaks完整历史19条历史命中经人工核实为测试合成值并以`.gitleaks.toml`精确allowlist闭环（ADR-0008）。
- 09-05 Feature **复审纠正完成并重新Accepted（2026-09-05）**：三项复审缺漏全部纠正——①命名契约扫描器收敛到`src/lib/naming/socila-naming-contract.ts`并以"允许片段剥离"区分精确旧协议值与独立品牌标识（npm test恢复359/359全绿）；②`.gitleaks.toml`改用`[[allowlists]]`+`targetRules`+`condition="AND"`，新增哨兵回归`scripts/verify-gitleaks-allowlist.mjs`接入CI（ADR-0009替代ADR-0008；哨兵证明允许路径上其他规则照常检测、trace无整文件跳过）；③多地区Seed补齐jurisdiction作用域（seed-rules/seed-params/seed-misc/excel-import，tests行写入jurisdictionCode，协议workflow只装载一次，0011回填存量NULL），新增multi-region-seed落库级集成测试。全部门禁新鲜复验通过后恢复Accepted。
- 09-05 Feature复审历史：曾因命名契约、Gitleaks allowlist和多地区Seed缺漏Reopened；相关缺漏及第二轮扫描器/Gitleaks/Build复审均已修复并取得新鲜门禁，当前最终状态为**Accepted**，详见任务验收报告§8～§10。
- 09-05全国政策能力当前状态：任务2、任务3、任务4、WI-20260907-04和WI-20260909-01均已Accepted；任务3/4最终集成分支已合入`refactor/policy-ops-agent-platform`。后续在用户完成该分支测试后，另行规划`refactor → main`及版本tag；本次未执行。

## 已完成能力

- 用户与管理员双角色鉴权（09-02）：注册/统一登录/改密/刷新会话轮换/管理员用户管理/owner_user_id所有权/匿名入口关闭。
- Next.js Core领域模块化、本地PostgreSQL和资源所有权。
- 国家/省/市/区县模型、地方overlay、冲突和不可变快照。
- FastAPI、Celery、LangGraph Checkpoint、人工interrupt和服务JWT。
- 多格式解析、PyMuPDF、SiliconFlow OCR、DocumentTree和混合RAG。
- 条款Diff、影响分析、DraftBundle、审核和幂等draft物化。
- Docker Compose、Neon迁移、备份恢复、回退和切换验收。

## 当前观察项

| 项目 | 状态 | 下一步 |
| --- | --- | --- |
| RAG生产索引为空 | 预期空态 | 执行首批官方政策采集 |
| 完整真实Agent LLM闭环 | 待持续观察 | 服务器部署后执行真实政策闭环 |
| 国家独立baseline实体 | 最小实现 | 按权威政策分批抽取 |
| 远程Demo环境 | 未部署 | 按OPERATIONS执行服务器验收 |
| OCR置信度缺失 | 已有安全路径 | 关键字段默认进入人工确认 |
| Socila命名与地区DSL | Accepted（2026-09-05） | 后续按09-05第二/三阶段PRD推进 |
| 任务2：CN/上海/广东首期政策交付 | **Accepted（2026-09-07首期）**：GD增量物化、三地区批准和候选快照重放完成；四川无快照 | 保持Accepted，不因任务3/4复审回退 |
| 任务3：地区感知用户规划 | **Accepted（2026-09-09第二轮修复）**：空黄金测试集fail-closed、停用URL地区绑定、replay三方hash、隔离DB 116/116零skip、E2E 19/19 | 代码验收保持；0017与快照已持久执行，但账本/任务4审计待repair-forward |
| 任务4：地区化政策案例库 | **Accepted（2026-09-11独立复审）**：代码、隔离演练、持久repair、幂等与恢复证据全部闭环 | 保持Accepted |
| 持久库案例替换 | **Accepted（2026-09-11独立复审）**：账本18条、可信批次+988 entries、36/36/78零漂移、repair复跑no-op、pre/post恢复40表/20 sequence一致 | 证据`task34-r8-repair-exec-2026-09-10T15-41-40/` |
| 最终分支集成 | **Accepted（2026-09-11）**：源`39f0e2a`已以显式merge commit合入目标原基线`57f051d`，完整门禁通过 | 等待用户在refactor分支测试；不自动合并main或创建tag |
| 四川2026年度缴费基数（缺口6） | Deferred；截至2026-09-06未发布（2025年度于2025-09-22发布） | `WI-20260907-01`：自2026-09-20起复查，发布后采集编码 |
| 四川医保退休年限正式文件（缺口4） | Deferred；仅2025-03征求意见稿，无正式印发 | `WI-20260907-01`：正式印发后采集，不阻塞任务2首期 |
| 川人社办发〔2023〕18号（缺口5） | Deferred；白名单域未检索到 | `WI-20260907-01`：等待用户提供原件或官方入口恢复 |

## 当前任务验证（09-03 P0合并门禁/发布准备阶段，本地新鲜执行）

| 验证 | 结果 |
| --- | --- |
| Node单元测试（`npm test`） | PASS；29文件/237通过、skip 0 |
| Node数据库集成（`npm run test:db`，演练PG17库） | PASS；7文件/23通过、skip 0 |
| Auth E2E（`npm run test:e2e:auth`，standalone+mock模型，5437全新库） | PASS；10通过（59.1s，零AI API错误）；Red阶段已记录协议404失败 |
| Python单元（ruff/mypy/pytest/pip-audit） | PASS；0问题、42源文件0错误、38通过（skip 0、warning 0）、无可知漏洞（本地项目自身“not found on PyPI”为预期提示，非漏洞非skip） |
| Python数据库集成（`pytest -m integration`，演练库） | PASS；5通过、skip 0 |
| ESLint / TypeScript / Build | PASS；全部退出码0 |
| 镜像构建与加固 | PASS；web/agent均非root；npm/npx/corepack与全局pip工具链已移除；OS包已升级 |
| Compose冒烟（合成env+临时卷） | PASS；8服务全部running、6健康检查全部healthy；`/api/health`与`/internal/health`通过；`down -v`残留0；缺`AUTH_REFRESH_PEPPER`时config拒绝 |
| workflow静态校验（actionlint 1.7.7） | PASS；零发现（六job名称、触发器、权限、timeout正确） |
| Secret扫描 | PASS；533个跟踪文件无命中 |
| Gitleaks 8.29.1完整历史 | PASS；32 commits no leaks（仅5个已核实fingerprint基线） |
| Trivy 0.74.0（HIGH/CRITICAL，ignore-unfixed） | PASS；web/agent均可修复HIGH/CRITICAL为0 |

## 当前任务验证（09-03 本地运行配置与凭据整改阶段，2026-09-03本地新鲜执行）

| 验证 | 结果 |
| --- | --- |
| TDD Red（2个新测试文件） | 已记录；18失败/1通过（共享加载器语义+模板/门禁契约失败） |
| 新鲜备份+真实恢复对账（CFG-FR-005/006，CFG-AC-004） | PASS；`policyops-cfg-remediation-20260903-163603.dump`（664,231B）+SHA-256清单；pg_restore退出0/0ERROR/0WARNING；34表/1610行与备份前基线逐表一致 |
| PostgreSQL口令轮换（CFG-FR-007/008，CFG-AC-005/008） | PASS；48随机字节→96字符URL安全口令；经stdin改角色；新口令TCP连接成功、旧口令被拒绝；`infra/prod/.env`与`.env.local`原子替换；全程无Secret输出 |
| 轮换后逐表对账（CFG-AC-006） | PASS；live库逐表行数与备份前基线一致（34表/1610行） |
| 迁移幂等（CFG-AC-007） | PASS；Compose `migrate`与宿主`db:migrate`重复执行全部退出0、无重复应用 |
| 健康检查（CFG-AC-010） | PASS；`/api/health`=`{"status":"ok","database":"ok"}`、agent`/internal/health`=`{"status":"ok"}`、全部Compose服务healthy |
| Compose config（CFG-NFR-005） | PASS；`config --quiet`零插值告警 |
| Node单元测试（`npm test`） | PASS；31文件/256通过、skip 0 |
| ESLint / TypeScript / Build | PASS；全部退出码0（standalone产物） |
| Python门禁（ruff/mypy/pytest非集成/pip-audit） | PASS；0问题、42源文件0错误、38通过（skip 0）、无可知漏洞 |
| DB集成门禁（全新PG17 `dgate`库） | PASS；Core migration×2+Jan引导×2（幂等no-op）+seed（851案例/500回归测试）+`npm run test:db`7文件/23通过skip 0+`agent.migrate --with-roles`×2幂等+`pytest -m integration`5通过skip 0 |
| Auth E2E（全新PG17 `e2e`库+Jan引导+seed+standalone+mock） | PASS；10通过（50.4s），含Jan管理员登录与被禁用账号拒绝 |
| Secret门禁 | PASS；`scan-secrets --all`534个跟踪文件无命中；默认模式18个候选文件无命中 |

## 当前任务验证（09-03 Feature Core与Agent服务JWT鉴权复审缺漏修复，2026-09-03本地新鲜执行）

| 验证 | 结果 |
| --- | --- |
| Node单元测试（`npm test`） | PASS；35文件/313通过、skip 0（含新增`service-jwt-startup.test.ts` 9例与`service-jwt-config-contract.test.ts` 11例） |
| ESLint / TypeScript / Build | PASS；全部退出码0（standalone产物） |
| 启动拒绝（standalone D2/E2，复审缺漏二） | PASS；D2无JWT→退出码1+拒绝消息、E2合法合成Secret→进程存活且零拒绝输出 |
| Node数据库集成（`npm run test:db`，全新重建演练PG17库`sjwfx_drill`） | PASS；9文件/35通过、skip 0 |
| Python门禁（ruff/mypy agent tests/pytest非集成/pip-audit） | PASS；0问题、48文件0错误（`mypy agent tests`，修复4处既有测试类型错误未降检查）、100通过（skip 0、warning 0）、无可知漏洞（本地项目自身“not found on PyPI”为预期提示，非漏洞非skip） |
| Python数据库集成（`pytest -m integration`，演练库） | PASS；20通过、skip 0（replay 15例含新增缺表/权限/业务异常映射4例+RAG 3例+postgres集成2例） |
| Auth E2E（演练库+Jan引导+seed+standalone+mock） | PASS；10通过（37.4s），含Jan管理员登录与被禁用账号拒绝 |
| AC-017 Compose双向冒烟（完全隔离`sjwtfxsmoke`栈、合成Secret、真实TCP） | PASS；10断言（health豁免、ready无JWT/仅Header 401、合法Next→Agent 200、**`/internal/docs`与`/openapi.json` 404**、draft-imports伪造401/合法200/重放401/错误方向401）、台账恰好1行、缺current时`docker compose config`退出1、`down -v`后零残留 |
| Secret门禁 | PASS；`scan-secrets --all`555个候选文件零命中；默认模式26个候选文件零命中 |
| Docker零任务残留（SJWT-NFR-007/AC-019） | PASS；`sjwfx*`容器/卷/网络全部删除、最终枚举零残留、清理前后快照逐行一致、`socila-*`容器与卷未删除未重建 |

## 当前任务验证（09-03 Feature 服务JWT复查缺漏修复，2026-09-04本地新鲜执行）

| 验证 | 结果 |
| --- | --- |
| TDD Red（两组） | 已记录；第一组配置契约测试首跑2失败/10通过（失败原因=模板current非空`replace-with-at-least-32-random-bytes`+未填写模板值可通过启动校验）；第二组单元9失败（`TypeError: unexpected keyword argument 'connect_timeout_seconds'`确认现有构造器不支持超时参数）+集成目标2失败（同一TypeError） |
| 问题一修复（模板空值，SJWT-FR-001/AC-010） | PASS；`.env.example`current/previous改空值+注释收紧（密码学安全随机源≥32随机字节、previous仅轮换窗口期、两者不得相同、空值是故意设计未配置必须启动失败）；`service-jwt-config-contract.test.ts` 12通过（含防回归：未填写模板被`assertServiceJwtStartupConfig`拒绝）、`service-jwt-startup.test.ts` 9通过、`config-contract.test.ts` 11通过；真实`.env.local`/`infra/prod/.env` Secret未修改、未轮换、零输出 |
| 问题二修复（连接超时，SJWT-FR-008/FR-009/AC-014） | PASS；`PostgresReplayGuard(database_url, connect_timeout_seconds=5)`正整数构造期校验（布尔/非整数/非正拒绝）+`psycopg.connect`显式`connect_timeout`；生产装配默认5秒零新增环境变量；异常边界不变（超时仍503 no-store、`JtiReplayConflict` 401、业务异常原样传播、JTI同回滚）；单元`tests/test_service_jwt.py` 44通过（既有35+新增9） |
| Python数据库集成（`pytest -m integration`，演练库`sjwttimeout_drill`） | PASS；完整`test_service_jwt_replay_integration.py` 15通过（5.27s，**不再挂起**）；不可达连接测试实际完成2.11s/2.11s（1秒connect超时+客户端栈开销，满足5秒有界断言） |
| Node单元/静态/构建 | PASS；`npm test` 35文件/314通过、skip 0，`npx tsc --noEmit`/`npx eslint src`/`npm run build`全部退出0 |
| Python门禁（ruff/mypy/pytest非集成） | PASS；0问题、48文件0错误、91通过（skip 0） |
| `uv run pip-audit` | **环境阻塞**；6次尝试（代理5+直连1）全部`ConnectionResetError(10054)`（本地代理127.0.0.1:7897重置PyPI TLS握手，直连同断，curl同失败）；`pyproject.toml`/`uv.lock`本任务零diff，审计对象集与2026-09-03新鲜PASS一致 |
| Compose config / Secret扫描 | PASS；`config --quiet`退出0、`scan-secrets`默认10候选文件零命中、`--all` 558候选文件零命中 |
| Docker零任务残留（SJWT-NFR-007/AC-019） | PASS；任务专属`sjwttimeout-pg`容器/`sjwttimeout-pg-data`卷/`sjwttimeout-net`网络创建前记录清单、无条件清理（rm/volume rm/network rm全退出0）、最终枚举`sjwt*`容器/卷/网络全0、清理前后全量快照逐行一致、`socila-*`九个容器与`socila_pg-data`/`socila_minio-data`/`socila_caddy-data`卷未删除未重建 |

## 当前任务验证（09-03 Feature 服务JWT Edge instrumentation构建警告修复，2026-09-04本地新鲜执行）

| 验证 | 结果 |
| --- | --- |
| TDD Red（构建+测试） | 已记录；`npm run build`（退出0）输出`Turbopack build encountered 1 warning`：`src/instrumentation.ts:21:5 Warning: A Node.js API is used (process.exit at line: 21) which is not supported in the Edge Runtime`+`Ecmascript file had an error`（违反AC-018无未解释warning）；新/改测试首跑8失败/8通过（Node专用模块不存在`Cannot find module './service-jwt-startup-node'`、instrumentation.ts含`process.exit`无动态import、nodejs分支未调用Node模块、register尚非async的同步抛错/`resolves`断言失败） |
| 运行时隔离修复（SJWT-FR-001/AC-010/AC-018、NFR-004/005/006） | PASS；新增`src/lib/security/service-jwt-startup-node.ts`（`runServiceJwtStartupCheck()`：无效配置输出不含Secret的稳定错误+退出码1，fail-fast语义与§7.4一致）；`src/instrumentation.ts`重写为async register（非nodejs立即返回、仅nodejs分支动态import Node专用模块、本体零Node专用API）；未退回"只抛异常"、未删fail-fast、未影响Edge/NextAuth/公开路由 |
| 测试Green | PASS；`service-jwt-startup-node.test.ts` 5通过、`service-jwt-startup-runtime-contract.test.ts` 7通过（源码契约4例+运行时路由3例）、`service-jwt-startup.test.ts` 9通过（register用例改async）、`service-jwt-config-contract.test.ts` 12通过 |
| 生产构建零警告（SJWT-AC-018） | PASS；`npm run build`退出0、输出零warning/error行（Red的Turbopack警告消失）；`npm test` 37文件/326通过skip 0、`npx tsc --noEmit`/`npx eslint src`退出0 |
| standalone真实启动验证（全合成Secret） | PASS；S1无current→退出1+`refusing to start: AGENT_SERVICE_JWT_CURRENT is required`+`/api/health`不可访问、S2 31字节current→退出1、S3 previous===current→退出1、S4合法合成Secret→进程存活`✓ Ready`；日志零Secret |
| Python回归（未改动代码） | PASS；`pytest -m "not integration"` 91通过（20 deselected）、`ruff check .` 0问题、`mypy agent tests` 48文件0错误，均退出0 |
| Compose config / Secret扫描 | PASS；`config --quiet`退出0、`scan-secrets`默认候选文件零命中、`--all`全部候选文件零命中 |
| Docker零任务残留（SJWT-NFR-007/AC-019） | PASS；本轮未新建演练设施，最终枚举`sjwt*`容器/卷/网络全0；`socila-*`九个容器与三个数据卷同基线、未删除未重建 |

## 当前任务验证（09-05 Feature Socila命名统一与地区DSL分层，2026-09-05本地新鲜执行）

| 验证 | 结果 |
| --- | --- |
| TDD Red | 已记录；单元批次6文件/15失败（命名契约/Manifest/dsl布局/数据文件/Seed契约/文档路径）+ Node JWT身份3失败 + Python JWT身份3失败（SDL-FR-008） |
| 静态与构建 | PASS；`tsc --noEmit`、`eslint src`（0 error/0 warning）、`npm run build`（零warning）全部exit 0 |
| Node单元（`npm test`） | PASS；41文件/351通过、skip 0（含命名契约扫描、dsl布局、Manifest发现、数据文件SHA-256、黄金回归） |
| Python门禁 | PASS；ruff 0问题、mypy 48文件0错误、`pytest -m "not integration"` 94通过（skip 0）、pip-audit无已知漏洞 |
| 数据库门禁（全新PG17+pgvector `sdl_drill`库） | PASS；Core migration×2幂等、bootstrap×2幂等、seed（Manifest发现）、`test:db` 11文件/47通过skip 0、`agent.migrate --with-roles`幂等、`pytest -m integration` 20通过；落库直查24规则/29参数/310000/SOCILA-DSL-1.0、粤川示例0 |
| Auth E2E（全新`sdl_e2e`库+standalone+mock，`SOCILA_E2E_*`） | PASS；10通过（47.7s） |
| Compose双向服务JWT冒烟（完全隔离`sdljwt-smoke`栈+合成Secret+临时卷） | PASS；`config --quiet`通过、8服务running/6健康healthy、smoke库migration exit 0、PyJWT双向9断言（新身份双向200、旧身份401无兼容、伪造/重放/错误方向401）、`down -v`后零残留、`socila-*`未动 |
| 持久库备份与恢复对账（SDL-NFR-002） | PASS；`pg_dump -Fc` 664,823B + SHA-256清单；临时PG17+pgvector `pg_restore` exit 0/0错误；public+agent 25表逐表行数一致 |
| 持久库示例清理（SDL-AC-007） | PASS；删除前6目标精确确认（2包/4参数/预期地区版本/引用0）；0010迁移×2幂等；删除后diff仅`params 33→29`、`policy_pack_versions 2→0`、新增0009空表；其余23表不变；web/agent/worker/beat以新镜像重建（JWT身份同步生效）、健康检查全过；备份/旧卷/快照未删除 |
| Secret与Gitleaks | PASS；`scan-secrets --all`563文件零命中；Gitleaks 8.29.1完整历史40 commits：首跑19条历史命中逐条核实为测试合成值（提交35d673c引入），`.gitleaks.toml`精确allowlist（ADR-0008）后复跑零发现 |
| 演练资源清理 | PASS；`sdl-drill-pg`、`sdl-restore-verify`容器删除，`sdl*`容器/卷0残留，冒烟临时文件删除 |

## 当前任务验证（09-05复审纠正，2026-09-05本地新鲜执行）

| 验证 | 结果 |
| --- | --- |
| TDD Red | 已记录；复审复现npm test 350/351（宽泛品牌命中允许片段）；命名契约重写1文件收集失败（模块缺失）；Gitleaks哨兵对旧配置3项失败（哨兵漏检+trace整文件跳过）；多地区Seed集成4失败/1通过（第二地区覆盖第一地区） |
| 静态与构建 | PASS；`tsc --noEmit`、`eslint src scripts`、`npm run build`（零warning）全部exit 0 |
| Node单元（`npm test`） | PASS；41文件/359通过、skip 0（命名契约模块9用例） |
| Python门禁 | PASS；ruff 0问题、mypy 48文件0错误、pytest非集成94通过、pip-audit无已知漏洞 |
| 数据库门禁（全新PG17+pgvector） | PASS；migration×2（0010+0011）幂等、seed×2幂等（落库24规则/29参数/528测试全310000/粤川0）、`test:db` 12文件/52通过（含multi-region-seed 5用例）、`agent.migrate --with-roles`×2幂等、`pytest -m integration` 20通过 |
| 安全门禁 | PASS；`scan-secrets`默认与`--all`（576文件）零命中；Gitleaks 8.29.1完整历史42 commits零发现（新增1条已核实fingerprint：ADR-0008引用的业务字段名样例）；哨兵回归3场景全过（误报精确忽略/允许路径其他规则哨兵被检测/trace无整文件跳过） |
| 资源与边界 | PASS；演练容器删除零残留；持久policyops库全程未连接未修改；0011仅交付代码未对持久库执行；用户未提交文档保持原样 |

## 当前任务验证（09-05第二次复审闭环，2026-09-05本地新鲜执行）

| 验证 | 结果 |
| --- | --- |
| 第二次复审Red | `npm test` 358/359：命名扫描器实现文件顶部注释保留完整历史协议/品牌字符串并命中自身；Gitleaks 8.29.1完整历史43提交发现1条：修复提交`08a92a1`在`.gitleaksignore`第5行新增的业务字段示例说明触发`generic-api-key`；默认Build在静态页面19 workers阶段连续两次因可用内存不足/Windows worker异常退出 |
| 命名契约修复 | PASS；移除扫描器注释中的完整历史标识，目标测试9/9通过；`npm test`新鲜复验41文件/359通过、skip 0 |
| Gitleaks历史修复 | PASS；改写当前`.gitleaksignore`说明并为已进入历史的`08a92a1:.gitleaksignore:generic-api-key:5`登记精确fingerprint；哨兵3场景保持通过；完整历史43提交复跑`no leaks found`、exit 0 |
| 资源受控Build | PASS；`next.config.ts`显式`experimental.cpus=2`，原命令`npm run build`使用2 workers完整生成8/8静态页面、exit 0；未改变运行时业务行为 |
| 最终状态 | 三项用户指定门禁均有新鲜exit 0证据，任务一恢复Accepted |

## 当前任务验证（09-05 Stage 国家baseline及粤川overlay，2026-09-05本地新鲜执行）

| 验证 | 结果 |
| --- | --- |
| TDD Red | 已记录；overlay显式操作测试首跑10失败、0012约束测试在无约束库失败、CN/GD/SC黄金与44例对账测试均先于实现确认失败 |
| Node单元（2 workers） | PASS；47文件/423通过、skip 0（含显式overlay 13例、引用契约3例、CN黄金21例、GD黄金10例、SC黄金7例、零漂移对账2例） |
| TypeScript / ESLint / Build | PASS；全部退出0、build零warning |
| 数据库集成（全新PG17+pgvector `nrp_drill`，四地区Seed） | PASS；14文件/64通过、skip 0（0012约束矩阵、显式replace/restrict解析、四地区候选快照与重放、沪迁移对账、multi-region Seed） |
| Agent迁移与Python集成 | PASS；`agent.migrate --with-roles`幂等、pytest -m integration 20通过skip 0 |
| Python静态与单元 | PASS；ruff 0问题、mypy 33文件0错误、pytest非集成94通过 |
| Auth E2E（全新`nrp_e2e`库+bootstrap+seed+standalone+mock） | PASS；10通过（40.2s） |
| 安全门禁 | PASS；scan-secrets --all 626文件零命中、Gitleaks 8.29.1完整历史45 commits零发现、allowlist哨兵3场景全过 |
| 权威采集 | CN 4份（mohrss×3、gov.cn×1）+GD 2份（hsa/hrss.gd.gov.cn）+SC 1份（rst.sc.gov.cn）官方原件+HTTP元数据+SHA-256+逐字摘录，全部白名单域名 |
| 资源边界 | 演练容器`nrp-drill-pg`（nrp_drill/nrp_e2e两库）验证后已停止；`socila-*`持久资源未删除未重建 |
| 披露 | 首次`npm run db:migrate`未显式指定DATABASE_URL，加载器回退`.env.local`导致已验收的0011与新增0012（均幂等/增量）被应用到本机持久开发库policyops；未重新Seed，应用行为不变；详见验收报告§7 |

## 当前任务验证（09-05 阶段E 权威资产持久化与地区化管理，2026-09-06本地新鲜执行）

| 验证 | 结果 |
| --- | --- |
| 只读基线核对 | 持久库24/29/1、528/851/117、快照0、包0；仓库CN16/6、沪8/27、粤1/5、川0/3——全部符合PRD §1.1 |
| TDD Red | 目标守卫/manifest/计划器/0013迁移/物化器集成均先于实现确认失败 |
| 备份与真实恢复 | pg_dump -Fc 668,191B+SHA-256；全新PG17+pgvector恢复后14表计数与行哈希一致（NRP-AC-012） |
| 显式migration | 0013（params.evidence+批次审计+publishes地区身份）在policyops执行，drizzle账本13条 |
| audit→apply | audit只读输出manifestHash/targetFingerprint；apply携授权+哈希+指纹成功；事务内固定计数49/70/5/4/528/851/117/0、published行哈希不变 |
| 幂等与零漂移 | 同manifest复跑no-op；planning-regression物化前后逐字节一致（528例/524过/passSetHash相同） |
| 地区语义 | CN与沪awaiting_approval、粤/川blocked（含PRD缺口原因）；四川批次0条规则、3个参数；发布流水线blocked 422拒绝晋级 |
| 管理端地区化 | 规则列表jurisdiction/status/module/q筛选+地区列；详情/校验/示例/版本/晋级按jurisdiction+id+version（缺失400/不存在404）；发布审计携带地区与版本；policy-coverage API+覆盖横幅（四川显示0条地方规则、3个参数、blocked） |
| 门禁 | Node单元434/434、DB集成71/71、tsc/eslint零错误、build零警告、Auth E2E 10/10、Gitleaks no leaks、scan-secrets 637文件零命中、哨兵通过、Compose 8服务healthy |
| 边界 | 未授权远程库/发布/活动快照/用户流量/Seed/删除数据/案例库修改——均未发生；演练容器已停止 |

> 本节是提交`6cf2468`的执行记录；2026-09-06独立复审发现其验收覆盖不足，当前状态由下节取代。

## 当前任务复审（09-05 阶段E，2026-09-06）

| 项目 | 复审结论 |
| --- | --- |
| 持久库事实 | 49 rules、70 params、5 rule_sets、4 policy_pack_versions、528 tests、851 cases、117 showcase_cases、0 snapshots、74批次成员；CN/沪awaiting_approval，粤/川blocked；8个Compose服务healthy |
| P1目标保护 | `DATABASE_URL`只校验URL authority，未固定5432且未拒绝`?host=`/`?port=`覆盖；node-postgres可实际连接远程目标，NRP-NFR-009未满足 |
| P1发布旁路 | 规则与参数PATCH把未过滤body写入Repository，可用`status=published`绕过publishing用例、blocked检查和发布审计 |
| P1参数契约 | 35个标量draft保存为number/boolean/string/array，但后台仅按scalar处理，导致显示、校验和编辑路径错误 |
| P1政策包完整性 | 4个draft政策包中的6个table/timeline参数未保存rows/key_fields/value_fields，不能确定性重放 |
| P2地区身份 | run-example、规则版本校验及参数更新/校验仍存在非精确查询；同名CN/上海实体可能串区 |
| P2恢复证据 | 恢复脚本只核对14张表；当前库实际有public/drizzle/agent/rag共37张表，不能据此声称完整数据库恢复一致 |
| P2完整性哈希 | published哈希遗漏规则输入/输出/引用/evidence及参数rows/evidence等政策字段，零漂移证据不足 |
| P1干净CI | 单测断言Git忽略的`.env.local`必须存在；本地434/434通过不证明干净检出或CI可运行 |
| 新鲜只读验证 | `npm test` 48文件/434通过，`npx tsc --noEmit`退出0；这些结果不覆盖上述反例，不能恢复Accepted |
| 下游门禁 | 持久库`policy_snapshots=0`且任务2未Accepted；案例治理仅可准备只读审计/评分，地区规划仅可准备契约/UI骨架，二者均不得进入持久写、激活或最终验收 |

任务2保持**Reopened**。退出条件为上述P1/P2逐项补失败测试与修复、在无`.env.local`干净检出重跑门禁、完成全部37表及sequence的真实恢复对账、纠正验收报告不准确表述并通过独立复审。执行顺序继续为任务2修复并Accepted→任务4案例治理→任务3地区感知规划。


## 当前任务验证（09-05 阶段E复审缺陷修复，2026-09-06本地新鲜执行）

| 验证 | 结果 |
| --- | --- |
| TDD Red | 缺陷1：9失败/4过；缺陷2：模块缺失；缺陷3：6失败/1过；缺陷4：快照type=undefined；缺陷5/6：路由4失败；缺陷8：notes不敏感；缺陷10：CN晋级bypass；缺陷11：0014缺失+重复批次插入成功 |
| 修复后 | 单元467/467（51文件零skip）、数据库集成79/79（19文件零skip）、tsc/eslint零错误、build零警告、Auth E2E 10/10、Python 20/20+94单元、Gitleaks no leaks、scan-secrets 652文件零命中、哨兵通过 |
| 持久库（只读+恢复对账，未执行repair） | 计数49/70/5/4/528/851/117/0、members=74；新鲜dump SHA-256 e7e6083d…4e9c2；37表+18 sequence对账一致；audit确认4个draft包快照漂移（repair待用户授权，停在audit） |
| 干净检出 | .env.local临时移除后npm test 467/467复现，恢复原状 |
| 状态 | 任务2保持Reopened：repair待授权、管理员批准未完成、粤/川blocked缺口未消除 |

## 当前任务验证（WI-20260906-01 阶段E政策包快照repair加固，2026-09-06本地新鲜执行）

| 验证 | 结果 |
| --- | --- |
| Work Item状态 | **Accepted**（代码+测试+文档；持久库0014/repair仍未执行，需用户另行明确授权） |
| TDD Red | 已记录；单元2失败（指纹未绑定draft包/CLI固定“4个”）+集成4失败（audit后变化被覆盖、repaired批次/新成员缺失、注入失败仍提交、并发双成功）+2护栏通过（守卫拒绝、复跑no-op） |
| repair专用Green | 集成9/9（守卫/目标绑定/正常修复/回滚/并发/幂等零漂移）+单元13/13；audit后修改快照、状态、版本或成员哈希均以`FINGERPRINT_MISMATCH`拒绝且不覆盖新值；repair批次`repaired`+确定性哈希+粤川阻断原因继承；原物化批次/成员不可变+每批次1条新成员；事务内`FOR UPDATE`重校验+`REPAIR_TARGET_CHANGED`零写入退出；并发单组修复+另一复核no-op |
| 门禁 | npm test 469/469（51文件零skip）；test:db 85/85（19文件零skip）；tsc/eslint退出0（0 error，7个既有warning）；build零警告；Auth E2E 10/10；ruff 0问题、mypy 48文件0错误、pytest 94非集成+20集成零skip；Gitleaks 56 commits no leaks；scan-secrets --all 662文件零命中；allowlist哨兵通过；无.env.local干净环境npm test 469/469复现 |
| 顺带修复 | golden测试6处既有`no-explicit-any`（HEAD即存在，非本次引入）改为`unknown`类型；集成teardown改为closeDatabase→显式终止残留会话→删库并挂error监听，run零unhandled errors；`isJurisdictionBlocked`纳入`repaired`批次 |
| 持久库（只读核对） | 计数49/70/5/4/528/851/117/0、members=74、batches=4、上海published规则24、Drizzle账本13条——全程未连接写入、未执行0014、未执行repair |
| 状态 | 任务2整体保持**Reopened**：repair待授权、管理员批准未完成、粤/川blocked缺口未消除 |

## 当前任务验证（WI-20260906-02 阶段E持久库政策包快照repair，2026-09-06本地真实执行）

| 验证 | 结果 |
| --- | --- |
| 授权 | 阶段A只读报告后，用户在同一任务中回复"允许以上操作"（仅限报告所列阶段B操作：一次0014+一次repair及验证），语义等价固定授权语句 |
| 阶段A | 基线逐项一致；备份`policyops-wi-02-pre-20260906-203412.dump`（SHA-256 `fb87d394…3667`）；wi02-restore-pg零错误恢复+37表18 sequence对账一致；fresh audit恰好4包漂移并存证（旧audit未复用） |
| 0014迁移 | 账本13→14；两个唯一索引+三项CHECK全部存在；业务数据零变化 |
| 一次repair | 4包修复（CN/粤/川/沪v1，新内容哈希落库）；新增4个`repaired`批次（readiness/阻断原因继承地区语义）+4成员；原4批次与74成员不可变 |
| 幂等与零漂移 | repair后再audit零漂移；新输入复跑no-op（8/78不再增加）；计数49/70/5/4/528/851/117/0、沪published=24、planning-regression与repair前逐字节一致 |
| repair后备份恢复 | `policyops-wi-02-post-20260906-205122.dump`（SHA-256 `5e8f5abb…510a`）；全新库零错误恢复+37表18 sequence再次全一致 |
| 安全边界 | 仅本机policyops；无发布/快照/批准/删除/远程库/Secret/流量；演练容器已清理；证据JSON零凭据 |
| 状态 | WI-20260906-02 **Accepted**；任务2整体保持**Reopened**（粤川权威缺口、管理员批准、候选快照未完成） |

## 历史任务计划（任务2分地区首期交付；下游顺序已由ADR-0011替代）

| 项目 | 当时结论 |
| --- | --- |
| 首期范围 | CN、上海310000、广东440000；三地区均需管理员批准和可重放候选快照 |
| 四川 | Deferred/Blocked；保留3个draft参数和3条原因，不批准、不建快照、不开放流量，不阻塞首期Accepted |
| 广东能力边界 | 整体可用；2030年前仅医保退休地市年限缺参时`needs_agent`+`W-MI-LOCAL-YEARS-MISSING`，其他模块继续；2030年起男30/女25 |
| 当前技术阻断 | fresh audit错误规划74/116/9/8；必须改为只写5参数、1规则、1规则集版本、1政策包版本的GD delta |
| 目标基线 | 候选快照前50/75/6/5/528/851/117/0；CN/沪/川零新增 |
| 后续顺序 | 任务2Accepted后，任务3与任务4从同一冻结提交并行开发；最终先集成任务3 migration 0015，再集成任务4 migration 0016 |

本次仅完成范围与依赖文档调整：`npm test` 51文件/474通过，`scan-secrets --all` 686个候选文件零命中，Markdown相对链接、PRD/Work Item状态、提示词未写入仓库及`git diff --check`均通过；未修改代码、未执行数据库写入、管理员批准、快照创建、案例删除或地区激活。

## 当前任务验证（任务2首期：广东增量物化与地区就绪，2026-09-07本地新鲜执行）

| 验证 | 结果 |
| --- | --- |
| TDD Red | 已记录；持久库式状态仍重放全部四地区（plan 26/46/4/4，与持久库audit错误规划74/116/9/8同构）+GD readiness仍blocked+R-GD-UI-AMOUNT金额行不执行+集成audit全量重放 |
| Node单元（`npm test`） | PASS；51文件/485通过、skip 0（+16：增量计划2、广东编排4、失业金额示例5等） |
| TypeScript / ESLint / Build | PASS；tsc退出0；eslint 0 error/7 warning（均为HEAD既有，未新增）；build零warning（2 workers、8/8静态页） |
| 数据库集成（`npm run test:db`，全新PG17 `nrp_drill`迁移+seed） | PASS；19文件/85通过、skip 0（持久库镜像fixture：audit只规划GD delta 1/5/1/1、apply后50/75/6/5、CN/沪/川零新增、复跑no-op、WI-repair全套回归） |
| Python门禁（ruff/mypy/pytest非集成） | PASS；0问题、33文件0错误、94通过（skip 0） |
| Python集成（`pytest -m integration`，`nrp_agent_drill`库） | PASS；20通过（skip 0） |
| Auth E2E（全新`nrp_e2e_drill`库+Jan引导+seed+standalone+mock） | PASS；10通过 |
| Secret扫描 / Gitleaks 8.29.1完整历史 / 哨兵 / pip-audit | PASS；688候选文件零命中；61 commits no leaks；3场景全过；无已知漏洞 |
| 增量语义（单元+集成） | 三个全新GD参数v1、两个新窗口v2（旧窗口v1保留）、R-GD-UI-AMOUNT v1、RS-GD-PLAN-V1 v2、GD-BASE v2；相同delta复跑no-op（批次/成员不再增加）；广东2030年前仅R-220 needs_agent+W-MI-LOCAL-YEARS-MISSING且其他模块继续；2030-01-01起男30/女25 |
| 边界 | 未执行持久库apply、未批准、未建快照、未改四川实体、未开放流量；演练动态库已清理或待清理 |

## 当前任务只读准备（任务2 GD增量物化，2026-09-07本地新鲜执行，提交`f72a3cd`后）

| 步骤 | 结果 |
| --- | --- |
| 工作区/HEAD | 干净；HEAD=`f72a3cd`与origin同步（代码批次已推送） |
| 新备份 | `backup/db/policyops-gd-delta-pre-20260907060104.dump`（705,375B；SHA-256 `2acdb956e3d17de14d975817a1067b5efeabcfa81c9ef3d1a3353323ad550575`，Git忽略目录） |
| 完整恢复对账 | 临时`gd-restore-pg`（pgvector/pgvector:pg17，端口5441）`pg_restore`退出0/0 ERROR/0 WARNING；`restore-reconcile.ts` 37表+18 sequence、表集合/行数/规范化行哈希全部一致；容器已删除 |
| fresh audit（当前HEAD，零写入） | `audit-gd-delta-f72a3cd.json`：manifestHash `4895e023…`、targetFingerprint `ff6163b1…`、worktreeClean=true、idempotentNoOp=false；**planCounts恰好{rules:1, params:5, ruleSets:1, packs:1}（广东delta）**；CN/310000/510000区域计数全零；packSnapshotDrift恰1条（GD-BASE v1, rowId 5）；expectedPostCounts=50/75/6/5/528/851/117/0；GD readiness=awaiting_approval且blockingReasons=[]；四川blocked且3条原因不变；未出现74/116/9/8 |
| 规划回归基线（只读） | `planning-regression-pre-gd-apply.txt`：528/524过/4失败、passSetHash `e4fb8c3d…`（与WI-02基线一致） |
| 状态 | 只读准备全部通过，**等待用户对本次apply的明确授权**（未获授权不写policyops） |

## 当前任务受控写入（任务2 GD增量物化apply，2026-09-07，用户明确授权）

| 步骤 | 结果 |
| --- | --- |
| 授权 | 用户回复"允许以上"（授权范围：一次GD增量apply及其验证；未覆盖批准/快照/其他写入） |
| fresh audit（HEAD `ed39e93`，旧audit不复用） | manifestHash `6cf0190b…`（docs提交变更sourceCommit所致）、targetFingerprint `ff6163b1…`（DB状态未变）、只显示GD delta 1/5/1/1、drift仅GD-BASE v1 |
| apply（一次） | 退出0；4批次（id 9-12，GD 8成员、CN/沪/川0成员）；计数**50/75/6/5/528/851/117/0**（事务内核验通过，published行哈希不变）；落库核对：GD旧5参数v1保留+新5条（3个v1+2个v2窗口）、R-GD-UI-AMOUNT v1、RS-GD-PLAN-V1 v1（16规则）+v2（17规则）、GD-BASE v1+v2 |
| 幂等 | 旧指纹复跑被`FINGERPRINT_MISMATCH`拒绝（apply后计数变化，守卫生效）；以post-apply fresh audit指纹复跑→`noop:true`；复跑audit planCounts全零、`idempotentNoOp:true`、drift=[] |
| 规划回归 | `planning-regression-post-gd-apply.txt`与apply前**逐字节一致**（SHA-256 `84535389…`相同，528/524/4、passSetHash `e4fb8c3d…`） |
| apply后备份与恢复 | `backup/db/policyops-gd-delta-post-20260907063211.dump`（711,209B；SHA-256 `189572ac…`）；临时容器`pg_restore`退出0/0错误；`restore-reconcile.ts` 37表+18 sequence全一致；容器已删除 |
| 边界 | 未执行管理员批准、未创建候选快照、未改四川实体、未开放流量、未删除数据 |

## 当前任务管理员批准（任务2三地区，2026-09-07，用户指示"三个地区全部为批准并继续"）

| 步骤 | 结果 |
| --- | --- |
| 批准执行 | 用户（管理员）决定三地区全部批准并指示执行；经`promoteEntity`正规发布用例（schema/examples/回归门禁+发布审计），**CN/310000/440000全部规则、参数、规则集晋级published**（规则50、参数72、规则集5；业务计数50/75/6/5/528/851/117/0不变；四川3参数保持draft、无任何变更） |
| 阻塞①修复 | `isJurisdictionBlocked`改**最新批次**语义（历史blocked批次是审计事实不代表当前就绪）——GD旧blocked批次不再阻塞批准；四川最新批次blocked仍拒绝。TDD Red/Green（materializer.integration新增就绪语义测试） |
| 阻塞②修复 | 晋级门禁测试归属（审查缺陷10补全）：规则晋级只认本地区归属测试；CN/GD规则无tests表测试时用**DSL examples**作回归载体（`runExamplesGate`，参数基线=地区参数包published参数；不落tests表、固定计数528不变）；restrict/exempt元数据规则豁免examples与回归门禁。TDD更新缺陷10测试（CN规则不拿SH测试充数+examples兜底+无examples拒绝） |
| 阻塞③修复 | 持久库4条过期测试期望对齐权威DSL（R-200时间线19→18.5、R-220输入参数名迁移P-SH-MEDICAL-LIFETIME-REQUIRED-YEARS→P-MI-LIFETIME-MALE-YEARS+gender+legacy双名兼容、R-300月差2→3（引擎date_diff语义）、R-510浮点参数改二进制精确组合0.25+0.5）→ **规划回归528/528全过**（passSetHash `e4fb8c3d…`→`d25068b8…`，记录为测试期望修正后的新基线）；GD规则文件parameter_refs/examples格式按schema修正并同步库中draft行（git与库一致，零delta） |
| 阻塞④修复 | 快照合并：历史地方add与链上国家baseline同名时跳过（重分类继承语义；旧上海基线16条CN同名add+2参数不再产生duplicate-add；行保留可回退）。TDD Red/Green（snapshot-service集成新增场景） |
| 快照计划（只读） | 三地区候选快照resolvePolicyContext：**CN 0冲突/16规则/7参数、上海 0冲突/24规则/38参数、广东 0冲突/17规则/12参数**（asOf 2026-09-07） |
| 门禁 | npm test 485/485、test:db 87/87、tsc退出0、eslint 0 error/7既有warning、build零warning、scan-secrets 8候选零命中 |
| 边界 | 未创建候选快照（等待授权）、未开放流量、未删除数据、四川无变更 |

## 当前任务复审与重建决策（任务3/4，2026-09-07）

| 项目 | 只读结论 |
| --- | --- |
| 分支 | 任务3`24b0119`/`33af7ad`、任务4`e26a543`均已推送且工作区干净，但不得原样集成 |
| 任务3代码 | 新会话选择地区会404；领取地市未进入公开/AI Schema；2026快照无法覆盖2030；门禁/hash/历史重放/停用/直接页面不完整 |
| 任务4归档 | case-library记录SHA与真实文件全部不符，selection报告缺失、restore报告pending，81条展示归档hash为`pending` |
| 任务4质量 | 持久库452 cases和36 showcase的quality_score全部为空；无可比字段可误判重放PASS |
| 持久事实 | Drizzle 16条；沪粤release active、四川0；cases/showcase/tests/snapshots=452/36/528/6；治理前后完整dump的独立SHA有效 |
| 决策 | 任务3/4均Reopened；先修任务3，再以确定性模板重建沪粤案例，最后另行授权持久替换 |
| 新目标 | cases=N、showcase=36（沪18/粤18）、tests=N+42；删除当前旧452/36及关联500旧回归tests |
| 本轮边界 | 只修改文档；未修改代码、未连接数据库、未删除案例、未执行migration或激活 |

本轮文档基线验证为`npm test` 51文件/485通过。实现和执行证据不得提前填写PASS；提示词只在对话中提供。

## 第二轮独立复审（任务3/4，2026-09-09）

| 项目 | 结论 |
| --- | --- |
| 分支 | `7aa9bfc`已推送且工作区原始状态干净；本轮只修改复审文档 |
| 任务3 | 空黄金测试集可通过；停用路由忽略路径地区；replay未比较快照行hash，保持Reopened |
| 任务4 | `rcl-case-library.ts`七模式为空壳；apply写入完整场景字段为空；E2E未验证36/18/18，保持Reopened |
| Node | 默认5秒超时出现1失败；`npx vitest run --testTimeout=20000`为71文件/650通过 |
| DB集成 | 当前环境未设置`SOCILA_TEST_DATABASE_URL`，测试出现skip/失败；报告中的114/25未独立复现 |
| 静态/安全 | tsc退出0；eslint 0 error/6 warning；scan-secrets 769文件零命中 |
| 持久边界 | 只读仍为Drizzle 16、cases/showcase/tests/snapshots=452/36/528/6；0017/0018和新案例替换未执行 |

本轮新增的执行提示词只在对话中提供。PRD、Work Item、验收报告和开发文档不得保存可执行提示词；旧WI-20260906-01/02内嵌提示词已移除。

## 当前任务验证（任务3第二轮修复：空黄金测试集/停用地区绑定/三方hash，2026-09-09本地新鲜执行）

| 验证 | 结果 |
| --- | --- |
| TDD Red | 已记录；空黄金测试集旧实现错误记pass（新用例ok=true失败）、停用广东URL+上海releaseId旧实现成功停用、replay三方hash旧实现仅两方比较（4失败：缺ReplaySnapshotDriftError/漂移仍重放/缺保存hash容忍） |
| Node单元（`npm test`） | PASS；71文件/655通过、skip 0（含release-gates空集合反例、jurisdiction-release跨地区停用拒绝、replay三方hash四反例、compute savePlan hash断言）；identity-container模块重载用例显式30秒超时稳定化（2026-09-09复审P2） |
| TypeScript / ESLint / Build | PASS；tsc退出0；eslint 0 error/6 warning（均为既有，非本次引入）；build退出0（1条既有warning：citation-verifier动态fs访问，基线stash复现确认非本次引入） |
| 数据库集成（显式`SOCILA_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5439/task34r2_drill`，全新PG17+pgvector） | PASS；migration×2幂等、bootstrap×2幂等、seed×2幂等、`npm run test:db` 25文件/116通过skip 0（含停用经用例、跨地区停用拒绝且SH保持active、2026/2030广东命中不同snapshot且2030男30年360月落库）、`agent.migrate --with-roles`×2幂等、`pytest -m integration` 20通过skip 0 |
| Python门禁 | PASS；ruff 0问题、mypy 33文件0错误、pytest非集成94通过、pip-audit无已知漏洞（本地项目自身not found为预期提示） |
| Chromium E2E（全新`task34r2_e2e`库+Jan引导+seed+`scripts/e2e-task3-setup.ts`预创建沪粤快照+standalone） | PASS；全套19/19（auth 10+task3 6+task4 3），task3新增JRP-AC-008历史replay三方一致、JRP-AC-009跨地区停用409且零修改、JRP-AC-009停用后409 POLICY_SNAPSHOT_UNAVAILABLE并恢复 |
| Secret与Gitleaks | PASS；scan-secrets --all 772文件零命中；Gitleaks 8.29.1完整历史79 commits no leaks；allowlist哨兵3场景全过 |
| 边界 | 0017只在隔离库验证；持久账本repair、日期快照调度、激活/停用未授权执行；持久policyops全程未连接未修改；演练容器资源零新增（复用既有jrp-drill-pg容器建新库） |

## 当前任务验证（任务4第二轮修复：受控CLI七模式真实执行，2026-09-09本地新鲜执行）

| 验证 | 结果 |
| --- | --- |
| TDD Red | 已记录；executor模块缺失（Cannot find module）、apply写入空占位（manifest类型不承载完整场景） |
| Node单元（`npm test`） | PASS；72文件/663通过、skip 0（含executor七动作8例、release-gates空黄金集+example过滤、manifest完整场景类型、rcl-apply完整字段反例） |
| TypeScript / ESLint / Build | PASS；tsc退出0；eslint 0 error/6 warning（均为既有）；build退出0（1条既有warning：citation-verifier动态fs访问） |
| 数据库集成（显式`SOCILA_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5439/task34r2b_drill`，全新PG17+pgvector） | PASS；migration×2幂等（含0018扩展：cases.input/expected/assertions列+归档条目entity_type含test）、bootstrap×2、seed×2、`npm run test:db` 26文件/129通过skip 0（含新增rcl-cli 11例：audit→generate→plan→prepare-archive真实pg_dump→真实恢复演练（第二实例pg_restore+reconcile全表对账+verified restore-report+重算sha256sums）→verify-archive→apply（删851/500插36/36/36）→verify（36/36/78、沪粤18/18、配额、字段非空））、`agent.migrate --with-roles`×2幂等、`pytest -m integration` 20通过skip 0 |
| Python门禁 | PASS；ruff 0问题、mypy 33文件0错误、pytest非集成94通过、pip-audit无已知漏洞 |
| Chromium E2E（全新`task34r2_e2e`库+`scripts/e2e-rcl-setup.ts`真实CLI替换演练+standalone） | PASS；全套19/19，task4 4例精确断言36条/沪18粤18/治理字段非空/管理active过滤/归档批次可读/匿名401/普通用户403/四川unsupported |
| Secret与Gitleaks | PASS；scan-secrets --all 773文件零命中；Gitleaks 8.29.1完整历史no leaks；allowlist哨兵3场景全过 |
| 边界 | 0018/删除/插入只在隔离库演练；持久policyops全程未连接未修改；持久库替换待WI-20260907-04授权 |

## 当前任务验证（WI-20260907-04持久库受控替换，2026-09-09用户明确授权执行）

| 验证 | 结果 |
| --- | --- |
| 阶段A只读核对 | 账本16条/0015-0016时间异常、沪粤active、四川0、452/36/528/6与基线一致；治理前dump `policyops-wi-02-pre-20260906-203412.dump`（`fb87d394…`）与治理后（`5e8f5abb…`）SHA MATCH |
| 阶段A旧归档 | 全新实例恢复治理前dump（851/117/528+500回归）；0015-0018应用后生成可信归档（oldTargets=851/117/500），40表恢复对账一致、verify-archive通过 |
| 阶段A隔离演练 | 452基线复制库`rcl_b_pre`：0017/0018+沪粤快照+CLI全流程（audit/generate/plan/prepare/恢复演练/verify/apply/verify）通过，删452/36/500、插36/36/36；replacement manifestHash与targetFingerprint见阶段A报告 |
| 阶段A备份 | 操作前备份 `policyops-rcl-b-pre-20260909185630.dump`（`59ee2f5f…`）全新实例恢复+全表/sequence/哈希对账一致 |
| B-1账本repair | 0014/0015/0016（及0010-0013）账本时间修复，SQL hash全部不变 |
| B-2迁移 | 0017、0018应用（release区间EXCLUDE、cases完整场景列），第二次no-op |
| B-3快照 | 同步42条DSL示例（CN19+沪9+粤10+川4）；旧沪粤release停用（审计保留）；新激活沪[2026-09-01,∞)、粤[2026-09-01,2029-12-31]、粤[2030-01-01,∞)非重叠；四川0发布 |
| B-5替换 | 单事务删除452/36/500、插入36/36/36；旧上海非DSL示例7条清理（最终42）；复跑apply no-op |
| B-6验证 | 最终36/36/78、沪粤18/18、36cases+36showcase字段完整、回归来源链36/36无孤儿、四川0 |
| B-7备份 | 操作后备份 `policyops-rcl-b-post-20260909202053.dump`（`934c4758…`）全新实例恢复+全表/sequence/规范化行哈希对账一致 |
| 边界 | 未触碰远程库、四川激活、Secret轮换、生产部署；未执行WI-20260909-01最终合并 |

## 第三轮独立复审（任务4/WI-04，2026-09-09）

| 项目 | 当前事实 |
| --- | --- |
| 代码 | 旧regression test写空hash；restore只验证status；SHA/selection和manifest自校验不完整；example删除在apply事务外 |
| 账本 | 21条；0012～0014重复登记，0015账本hash与当前SQL不一致 |
| 数据 | 36 cases、36 showcase、42 example、36 regression、10 snapshots；场景字段初步完整 |
| 归档 | 2 applied+1 prepared；两个新批次各500条test entry为空hash；applied manifest声明85 tests而当前为78 |
| 备份 | pre/post dump文件SHA与sidecar一致，保留作为只读复核与回退点；不自动恢复 |
| 分支 | 源`codex/task34-regional-case-rebuild@7b3f21a`，目标`refactor/policy-ops-agent-platform@57f051d`，尚未合并 |

任务3保持Accepted；任务4（WI-20260907-03）第三轮修复完成并重新Accepted，WI-04保持Reopened等待repair-forward授权，WI-20260909-01保持Blocked。repair-forward计划已生成（见下节），等待用户基于fresh清单另行授权。

## 第四轮独立复审（任务4/WI-04，2026-09-10）

| 发现 | 修复 | 证据 |
| --- | --- | --- |
| prepare-archive补偿缺失 | 任何prepare阶段失败不留prepared批次/entries；只精确清理本次batchId（status='prepared'守卫）；文件失败清理本次不完整归档；补偿失败同时报告原始错误与补偿错误（`RclPrepareError`） | Red：4条补偿用例对旧实现全失败；Green：executor.test.ts 15/15 |
| applied幂等未重验 | `executeRclApply`对applied批次先完整重验manifest正文hash、批次hash、最终N/36/N+42、42条example与cases/showcase/regression逐行hash，完全一致才noop；任一最终行缺失/增加/漂移返回稳定错误且零写入 | Red：4条篡改用例对旧实现全失败；Green：rcl-apply.integration.test.ts 20/20 |
| migration SQL换行未固定 | 仓库根`.gitattributes`固定`drizzle/*.sql text eol=lf`；0010～0018 blob不变；Windows `core.autocrlf=true`全新checkout仍为LF；Drizzle读取hash===Git blob LF SHA | `migration-lf.contract.test.ts` 4/4；jrp-0017哈希不变量基线改为LF值`3ae5b95f…` |
| 迁移审计语义不完整 | `scripts/rcl-audit-task34.mjs`同时输出Git blob SHA/工作树raw SHA/LF规范化SHA/CRLF规范化SHA/账本SHA/仅EOL差异/真实内容差异；同步输出journal与账本created_at严格单调核对 | audit-summary.json `migrationAudit`/`migrationJournal`/`migrationLedgerTimeCheck` |

## 当前任务验证（任务4第四轮修复与只读审计，2026-09-10本地新鲜执行）

| 验证 | 结果 |
| --- | --- |
| TDD Red | 单元补偿4条、集成篡改4条（case/showcase/regression/example）对旧实现全部失败（旧实现直接noop/留prepared残留）；修复后全部Green |
| Node单元（`npm test`） | PASS；74文件/713通过、skip 0 |
| TypeScript / ESLint / Build | PASS；tsc退出0、eslint 0 error（既有warning未新增）、`npm run build`退出0 |
| 数据库集成（任务专属随机高位端口全新PG17+pgvector容器，vector/btree_gist） | PASS；migration×2、bootstrap×2、seed×2幂等；`npm run test:db` 26文件/141通过、skip 0；agent.migrate --with-roles×2幂等；`pytest -m integration` 20通过、skip 0 |
| 第四轮只读审计（持久库仅SELECT） | 当前36/36/78/10冻结；post dump恢复对比仅`auth_refresh_sessions`运行期差异（40表+20 sequence其余一致）；migration换行审计逐文件确认：ID 10/11/12/13/14/15/21/22账本hash===0010～0018 Git LF内容，ID 18/19/20===0012/0013/0014 CRLF重复登记，ID 17缺号不补写；journal when与预期时间表不符（仅报告，禁止猜测修复），账本created_at与预期严格单调一致 |
| 可信旧归档（第四轮） | `F:/Socila/backup/case-library/task34-r4-trusted-old-2026-09-10T06-59-14/`永久保留：policyops-fc.dump+cases/showcase_cases/tests.dump+selection-report+manifest（452/36/500全逐行ID/UID/64位hash，500 test hash全部非空，manifestHash `da0ea94d…`）+verified restore-report（40表+20 sequence真实明细）+sha256sums（恰好7文件）；从该归档恢复第三个全新库二次对账40表/20 sequence全部一致（`trusted-archive-re-reconcile.json` ok:true） |
| 当前attestation（第四轮） | `task34-r4-audit-2026-09-10T06-59-14/attestation-current.json`：绑定codeSha `579fed8…`；36 cases+36 showcase+36 regression+42 example全逐行ID/UID/64位hash；10 snapshots、5 releases、3个archive批次；attestationManifestHash `eb6d8d9d…`；targetFingerprint `56c479de…`（任一数据变化即变化） |
| repair-forward计划（第四轮） | `F:/Socila/backup/case-library/task34-r4-audit-2026-09-10T06-59-14/repair-forward-plan.json`：codeSha `579fed8…`、trustedArchiveManifestHash `da0ea94d…`、trustedArchiveDumpSha `0e3c3d8b…`、attestationManifestHash `eb6d8d9d…`、migrationLedgerFingerprint `492c5fbe…`、targetFingerprint `56c479de…`；精确SQL写集合10步（只删账本重复行18/19/20、prepared批次91d60c5f→rolled_back、新增restore_verified可信归档批次+988 entries、业务数据零变化）、每项旧值前置条件、事务边界T1/T2/T3、回退点、失败条件；预期最终账本18条、fingerprint `25d10e62…` |
| 边界 | 全程未写持久policyops；临时容器/库/网络/文件finally清理；可信归档目录永久保留；未执行repair、未执行WI-20260909-01、未创建PR、未合并分支 |

## 第五轮独立复审（任务4/WI-04，2026-09-10）

| 发现 | 修复 | 证据 |
| --- | --- | --- |
| journal when非单调（0010～0014未来时间戳，0014=1788991200000>0015；post恢复库上0014会被migrator重新应用） | `drizzle/meta/_journal.json`：0010=1788560000000、0011=1788600000000、0012=1788640000000、0013=1788680000000、0014=1788705240000、0015=1788777720000、0016=1788785400000、0017=1788796800000、0018=1788796860000；idx/tag不变、SQL零修改；全部18条按idx严格递增且max when===0018 | `migration-lf.contract.test.ts`新增3条单调契约；`npm test` 74文件/720零skip |
| migration账本回归无自动验证 | `scripts/lib/task34-ledger-regression.mjs`+`scripts/rcl-ledger-regression-task34.mjs`：post dump隔离恢复后8项验证（首次no-op账本21→事务删18/19/20→migration×2 no-op→账本18条不重新生成0012～0014→保留行hash/created_at不变→ID 17不补写不重排→模拟0019 when>1788796860000只应用一次→工作树SQL均LF） | `F:/Socila/backup/case-library/task34-r5-ledger-regression-2026-09-10/ledger-regression.json` ok:true |
| 审计journal不符仅报告 | `scripts/rcl-audit-task34.mjs`：journal非单调/与预期不符→阻断throw；ID 10～16、21、22账本hash===Git blob LF SHA→阻断；隔离库删除重复行后migration×2 no-op→门禁；`--trusted-dir`只读复验既有可信归档（禁止覆盖） | 第五轮audit三门禁全过（journalMonotonic=true、ledgerGitBlobHashMatch=true 9/9、ledgerRegressionNoopAfterDelete=true） |
| prepare-archive无目录保护 | `executor.ts`：目标目录已包含历史归档专属文件（4 dump/selection/restore/sha256sums）时拒绝开始；manifest.json为plan-replacement合法产物不拒绝；补偿只删除本次新建文件 | `executor.test.ts`第五轮3条Red→Green；第二次dump/写文件/最终SHA/补偿失败4条保持零prepared批次/entries |

## 当前任务验证（任务4第五轮修复与只读审计，2026-09-10本地新鲜执行）

| 验证 | 结果 |
| --- | --- |
| Node单元（`npm test`） | PASS；74文件/720通过、skip 0 |
| TypeScript / ESLint / Build | PASS；tsc退出0、eslint 0 error、`npm run build`退出0 |
| 数据库集成（任务专属随机高位端口全新PG17+pgvector容器，vector/btree_gist） | PASS；migration×2（修复后journal幂等）、bootstrap×2、seed×2幂等；`npm run test:db` 26文件/141通过、skip 0；agent.migrate --with-roles×2幂等；`pytest -m integration` 20通过、skip 0 |
| Secret扫描 / Gitleaks / 哨兵 | PASS；scan-secrets 788文件零命中；Gitleaks 8.29.1完整历史86提交零发现；allowlist哨兵3场景全过 |
| migration账本回归（隔离库） | PASS；8项全过（证据见上）；post dump SHA-256 `934c4758…` |
| 第五轮只读审计（持久库仅SELECT，绑定代码提交`1fe702b…`） | 当前36/36/78/10冻结；post dump恢复对比仅`auth_refresh_sessions`运行期差异（40表+20 sequence其余一致）；journalCheck.journalMonotonic=true、journal 9/9与预期一致；账本ID 10～16、21、22 hash===Git blob LF SHA（9/9）、created_at与预期一致；隔离库删除18/19/20后migration×2 no-op；可信归档复验（`--trusted-dir`）：8文件完整、SHA全部匹配、manifest 452/36/500、500 test hash全部非空、restore 40表/20 sequence/零mismatch、第三库再次恢复一致（40表/20 sequence/零mismatch）；证据`task34-r4-audit-2026-09-10T10-12-35/` |
| 当前attestation（第五轮） | `task34-r4-audit-2026-09-10T10-12-35/attestation-current.json`：绑定codeSha `1fe702b…`；36 cases+36 showcase+36 regression+42 example全逐行ID/UID/64位hash；10 snapshots、5 releases、3个archive批次；attestationManifestHash `8941655b…`；targetFingerprint `56c479de…` |
| repair-forward计划（第五轮） | `F:/Socila/backup/case-library/task34-r4-audit-2026-09-10T10-12-35/repair-forward-plan.json`：codeSha `1fe702b…`、trustedArchiveManifestHash `da0ea94d…`、trustedArchiveDumpSha `0e3c3d8b…`、attestationManifestHash `8941655b…`、migrationLedgerFingerprint `492c5fbe…`、targetFingerprint `56c479de…`；journalCheck.journalMonotonic=true、ledgerCreatedAtMatchesExpected=true、ledgerGitBlobHashMatch=true、ledgerRegressionNoopAfterDelete=true；写集合只含删除账本ID 18/19/20、prepared批次91d60c5f→rolled_back、新增restore_verified可信归档批次+988条entries（0010/0011/0015 hash零更新）；36/36/78、10 snapshots、5 releases零变化；含隔离库no-op证据；repair前强制新建备份；预期最终账本18条、fingerprint `25d10e62…` |
| 边界 | 全程未写持久policyops；未执行repair-forward；未恢复pre dump；未执行WI-20260909-01、未创建PR、未合并分支；`task34-r4-trusted-old-2026-09-10T06-59-14/`未覆盖未删除；临时容器/库finally清理 |

## 第六轮：repair-forward执行器隔离验收（任务4/WI-04，2026-09-10，代码提交`972b453`+`8b360c2`（可信归档校验移入事务内））

| 项 | 实现/证据 |
| --- | --- |
| 执行器 | `scripts/rcl-repair-forward-task34.mjs`（核心`src/lib/case-repair/repair-forward.ts`，独立于case-governance以保持RCL-AC-015契约）：audit/plan/apply/verify；无参数失败、apply缺`--i-am-authorized`/`--plan-hash`/`--target-fingerprint`拒绝零写入；目标库policyops默认拒绝（需`RCL_REPAIR_ALLOW_PERSISTENT=1`）；工作树未提交拒绝 |
| 绑定 | codeSha=HEAD、trustedArchiveManifestHash `da0ea94d…`、trustedArchiveDumpSha `0e3c3d8b…`、trustedArchiveDir永久目录、fresh attestationManifestHash/migrationLedgerFingerprint/targetFingerprint；planHash覆盖988条写集合+确定性批次ID+codeSha |
| 确定性批次ID | `sha256("task34-r4-trusted-archive:<manifestHash>")`前16字节设v5版本/变体位=`c8a7c104-8b8b-53f5-9bfd-1c8a8a6be141` |
| 单事务 | 账本精确条件删除（RETURNING恰好18/19/20）、prepared批次91d60c5f→rolled_back（RETURNING恰好1行）、新restore_verified可信批次（真实计数/table_hashes、created_by=task34-repair-forward）与988条参数化entries在同一REPEATABLE READ事务；开始即`pg_advisory_xact_lock`；事务内重算targetFingerprint、重建计划核对planHash、FOR UPDATE锁定核对账本行与批次、核对attestation/业务指纹/可信归档；COMMIT前终态核对；任一不一致回滚 |
| 幂等/并发 | 复跑noop:true；部分完成/不一致→REPAIR_STATE_DRIFT；并发第二方经40001重试后noop |
| 单元 | `src/lib/case-repair/__tests__/repair-forward.test.ts` 20例Red→Green |
| 隔离演练 | `scripts/rcl-repair-drill-task34.mjs`：19场景全过（缺授权/错planHash/错targetFingerprint/账本旧值漂移/批次漂移/归档漂移/非法hash与重复拒绝零写入；正常apply；账本18条原值；批次rolled_back；可信批次+988 entries逐项；36/36/78/10/5及业务表hash不变；migration×2 no-op；复跑noop；并发一执行一noop；5故障点回滚；repair后dump第三库恢复40表/20 sequence零mismatch）；`task34-r6-repair-drill-2026-09-10/repair-executor-test-report.json` allPassed=true |

## 当前任务验证（任务4第六轮repair执行器，2026-09-10本地新鲜执行）

| 验证 | 结果 |
| --- | --- |
| TDD Red | `repair-forward.test.ts`首跑模块不存在（20例失败）→ 实现后20/20 |
| Node单元（`npm test`） | PASS；75文件/740通过、skip 0（含RCL-AC-015契约：执行器库独立于case-governance） |
| TypeScript / ESLint / Build | PASS；tsc退出0、eslint 0 error、`npm run build`退出0 |
| 数据库集成（随机高位端口全新PG17+pgvector） | PASS；migration×2/bootstrap×2/seed×2幂等；`npm run test:db` 26文件/141通过、skip 0；agent.migrate --with-roles×2幂等；`pytest -m integration` 20通过、skip 0 |
| Secret扫描 / Gitleaks / 哨兵 | PASS；scan-secrets 790文件零命中；Gitleaks 8.29.1完整历史91提交零发现；allowlist哨兵3场景全过 |
| 隔离演练 | PASS；19/19（并发`c1 noop attempts=2 / c2 applied attempts=1`；attestation交叉核对codeSha=1fe702b时===第五轮`8941655b…`） |
| 第六轮只读审计（持久库仅SELECT，绑定`8b360c2…`） | `F:/Socila/backup/case-library/task34-r4-audit-2026-09-10T13-42-41/`：attestation-current.json（`3b7340c1…`、targetFingerprint `56c479de…`、36/36/78/42/36、10 snapshots、5 releases、3批次）、audit-summary.json（journalMonotonic=true、账本hash 9/9===Git blob LF、隔离库删除18/19/20后migration×2 no-op、可信归档复验8文件/SHA/452/36/500/restore 40/20/0/第三库一致、执行器交叉核对10项全true）、repair-forward-plan.json（单事务写集合、executor节含apply命令、无VALUES占位）、executable-write-set.json（planHash `db55e4ab…`、988 entries、确定性批次ID、ledgerDelete三行完整旧值、ledgerKeep 1..16/21/22）、repair-executor-test-report.json（19/19） |
| 边界 | 持久policyops仅SELECT；未执行repair-forward；未恢复pre dump；未创建PR、未合并分支；可信归档与pre/post备份未覆盖；隔离容器/库/临时归档副本finally清理 |

## repair-forward持久执行（WI-20260907-04，2026-09-10，用户明确授权；等待独立复审）

| 阶段 | 结果 |
| --- | --- |
| 授权 | 仅本机`localhost:5432/policyops`；codeSha `aeb464fc473ba05c849b98e9cc04046ca8c3c8ca`、planHash `179507da922755ce86e9d76daeba831e91ae36cb605d994e45364fcf91e63189`、targetFingerprint `56c479deb89438ff3943b61b73812cc2`、attestationManifestHash `ca4238a5c3aca5a744fcbc190e8bd147cb4450686bf6d4a38c8d0d91a55fd6f4`（`task34-r7-fresh-plan-2026-09-10T15-15-11/`） |
| 执行前门禁 | 工作区干净、HEAD=origin=`aeb464f`；持久库migrations=21、36/36/78、42/36、10/5、batches 2 applied+1 prepared、可信批次不存在；fresh audit/plan与授权参数逐项一致（state=pending） |
| pre备份 | `policyops-rcl-repair-pre-20260910234300.dump`（`b190d1d1…`+sidecar）全新PG17+pgvector恢复对账exit 0：40表OK/20 sequence/账本21 |
| apply | 单事务：applied=true、ledgerDeleted=[18,19,20]、批次91d60c5f→rolled_back、988 entries、attempts=1、终态账本18（fingerprint `25d10e62…`）；`RCL_REPAIR_ALLOW_PERSISTENT=1`仅子进程 |
| 执行后12项 | 账本18条=1～16/21/22且原值不变；批次rolled_back（历史988 entries保留）；可信批次restore_verified/task34-repair-forward；988 entries全hex无重复452/36/500；36/36/78、42/36、10/5；migration×2 no-op；复跑apply noop:true；verify --plan ok=true（repaired）；业务表规范化hash与计划一致 |
| post备份 | `policyops-rcl-repair-post-20260910234716.dump`（`8303a4c3…`+sidecar）第三个全新实例恢复对账exit 0：40表OK/20 sequence/账本18/988 entries |
| 边界 | 仅授权三项写入；snapshot/release/政策实体/远程库/Secret/部署零变化；未合并分支；临时容器清理；证据`F:/Socila/backup/case-library/task34-r8-repair-exec-2026-09-10T15-41-40/` |

## 精确下一步（未来人工动作：未经用户明确授权，不得执行下列外部动作）

任务2～4、持久repair-forward和WI-20260909-01最终集成均已Accepted。当前下一步是由用户在`refactor/policy-ops-agent-platform`完成独立测试；确认后再建立单独的`refactor → main`与版本tag计划。当前仍禁止重跑stage-a/stage-b、自动恢复pre dump、合并`main`或创建tag。四川后续仍按`WI-20260907-01-sichuan-policy-followup.md`独立推进。09-03发布动作仍为未来人工动作：

1. 重构前版本基线：**已完成**。annotated tag `v1.0.0`已推送至origin，并精确指向`main`提交`1c0f6e7eb48d0e6b4ef52063454afdb0c8375d4c`；不得移动或重建。
2. 用户未来人工发布流程（PRD §17.2）：
   1. 人工创建Draft PR：`refactor/policy-ops-agent-platform → main`（六项checks与Actions运行链接在PR创建后产生）；
   2. 六项检查（`gates`、`agent-gates`、`database-gates`、`e2e-gates`、`container-gates`、`security-gates`）出现后，为`main`配置Active ruleset（只允许PR合并、解决所有对话、分支保持最新、六项必需检查）；
   3. 审阅全部差异并解决对话，PR转Ready，六项检查通过且分支最新后选择merge commit；
   4. 等待main上六项CI再次全部通过；
   5. 在main merge commit创建并推送annotated tag `v2.0.0`，发布PolicyOps+Auth Release；
   6. 将PR、merge SHA、tag与Release链接交回执行Agent，另建docs-only任务完成最终文档记录。
3. 按ROADMAP准备远程Personal Demo服务器部署（需单独授权）。
4. 建立首批官方政策采集和RAG索引。

历史逐步执行日志已归档至[archive/memory-bank/progress.md](./archive/memory-bank/progress.md)，阶段证据见[reports](./reports/README.md)。

## 当前任务验证（WI-20260911-02 RCL-GEN-2.0案例/文档/API/UI，2026-09-11本地新鲜执行）

| 验证 | 结果 |
| --- | --- |
| 基线核对 | 分支`codex/shanghai-case-v2`；任务2残留清理后工作树干净，HEAD保持任务1提交`caa6344` |
| TDD Red | 3个新测试文件（generator-v2/case-library-doc/synthetic-copy）首跑模块缺失失败已记录 |
| Node单元（`npm test`） | PASS；80文件/829通过、skip 0（含SHV2新增58例） |
| TypeScript / ESLint / Build | PASS；tsc退出0；eslint 0 error（既有10 warning未新增）；build退出0 |
| 数据库集成（隔离PG17+pgvector `shv2_drill`） | PASS；`test:db` 27文件/144零skip（项目标准参数运行，见traceability）；agent.migrate×2幂等；pytest -m integration 20/20零skip、非集成94、ruff/mypy 0问题 |
| 生成器V2隔离库生成 | PASS；`generate-v2`经真实活动快照输出36条（沪18/粤18、3个快照绑定），coverageManifestHash与libraryManifestHash确定性 |
| Markdown案例库 | PASS；`render`+`--check`通过（36/18/18）；篡改副本退出2；已提交manifest与内存生成器逐条一致 |
| Chromium E2E | PASS；23/23（auth 10+SHV2 4+task3 5+task4 4；SHV2 4例覆盖公开页合成文案/首页导航/公开API字段/后台文档与结构字段） |
| Secret扫描 / Gitleaks / 哨兵 | PASS；scan-secrets --all 899文件零命中；Gitleaks 8.29.1完整历史96提交零发现（worktree临时独立克隆扫描）；allowlist哨兵3场景全过 |
| 边界 | 持久policyops全程未连接未写入；未创建持久快照/release；非RCL人工案例零改写；E2E管理员哈希与脚本内置哈希不匹配为既有环境事实（隔离库内本地更新，见验收报告§2.4） |

下一步：保留WI-20260911-03既有代码与隔离证据，从`f583adc`修复三项独立审查问题并重新验收；目标集成分支`refactor/policy-ops-agent-platform`保持不动，修复完成前暂缓用户最终测试与任何持久授权。

## 当前任务验证（WI-20260911-03 0019审计迁移+受控原位改写，2026-09-11本地新鲜执行）

| 验证 | 结果 |
| --- | --- |
| TDD Red | 单元14例模块缺失失败；迁移集成（无0019）与CLI集成失败已记录 |
| Node单元（提交态） | PASS；migration-lf契约7/7（含0019 journal单调与持久账本max关系）；全量见§4 |
| 数据库集成（全新库shv2_drill3） | PASS；`test:db` 29文件/156零skip（含0019迁移4例+CLI集成8例）；agent.migrate×2幂等；pytest integration 20/20零skip、非集成94、ruff/mypy 0 |
| 隔离演练（`rcl-rewrite-drill-v2.mjs`） | PASS；9步全ok（全新库baseline→generate-v2→audit/plan→守卫三反例→apply 108行→verify/复跑noop→0019×2幂等→post dump第三实例恢复对账→最终36/36/80+1批次+108entries+36条V2干净case）；证据`rewrite-drill-evidence-2026-09-11T19-01-07-253Z.json` |
| Chromium E2E（V2终态） | PASS；23/23——shv2_e2e经受控改写（planHash `fe92d7d8…`）后V2分支断言全部生效 |
| Secret / Gitleaks / 哨兵 | PASS；scan-secrets 914文件零命中；gitleaks全历史98提交——manifest场景键19条误报经人工核实按ADR-0009精确allowlist+哨兵通过后复扫no leaks；migration-lf契约提交态7/7 |
| 边界 | 持久policyops全程未连接未写入（守卫连接前拒绝）；0019仅交付SQL；改写持久执行须另行fresh授权 |

## 09-12独立审查：09-11 Feature重新打开（历史审查记录）

功能分支`codex/shanghai-case-v2`已推送到`f583adc`，远端SHA一致；`refactor/policy-ops-agent-platform`本地与远端仍为`0885613`，未修改、未合并。任务1/2/3的代码和隔离证据保留，但独立审查发现三个未关闭问题，三个Work Item与Feature状态改为Reopened：

| 问题 | 当前证据 | 下一步 |
| --- | --- | --- |
| MinIO原件链路未闭环 | 23份上海原件只在Git evidence目录；采集脚本写本地文件，未证明`policy-originals/originals/<sha256>`对象和RAG `object_key`存在 | TDD实现幂等MinIO同步、四方SHA对账及全新MinIO恢复演练 |
| V2业务`content_hash`未同步验证 | rewrite审计有`new_content_hash`，但更新列排除了业务表`content_hash`；现有测试只验证动态规范化hash | apply同步写入`cases.content_hash`/`showcase_cases.content_hash`并逐行核对审计一致性 |
| 完整Node套件不稳定 | 独立复跑目标测试101/101、tsc通过；完整`npm test`为842/843，migration当前工作树用例5秒超时；单文件7/7通过 | 修复超时后重跑标准完整套件，零失败零skip才可恢复Accepted |

当前精确下一步：由修复Agent从`f583adc`开始，只修上述问题并在隔离数据库/MinIO验证；不得执行持久政策物化、管理员批准、快照/release切换、0019或V2案例回填。修复通过独立复审并推送后，才交给用户测试；用户测试完成前不得合并目标分支。

## 修复交付（2026-09-12）：三个审查问题闭环，Ready for independent review

从`d47dedf`开始严格TDD修复（RED记录→实现→GREEN→全量门禁），全程仅隔离PostgreSQL（`shv2-fix-pg`:54956、`shv2-task2-pg`:54955）与隔离MinIO（`shv2-fix-minio-a/b`:54960/54961）：

| 问题 | 修复 | RED→GREEN证据 |
| --- | --- | --- |
| MinIO原件链路 | `services/agent/agent/rag/evidence_sync.py`（audit/plan/apply/verify；`policy-originals/originals/<sha256>`；桶/endpoint/库名守卫；凭据redact）+CLI+`scripts/rag-evidence-drill.mjs`+配置模板bucket统一 | RED=ModuleNotFoundError（15例）→GREEN 18/18；真实23件原件演练12项全ok（含pg_dump+逐对象备份→全新库+全新MinIO恢复→恢复副本四方对账；证据`rag-evidence-drill-2026-09-12T04-14-59-793Z.json`） |
| V2业务`content_hash` | `rewrite-v2.ts`：先按排除`content_hash`的投影算目标hash再写after投影（防循环）；apply同事务UPDATE业务列并单独核对；verify逐条显式核对；verifyPlanBody校验 | RED=单元2例失败→GREEN 17/17+集成10/10（业务hash逐行对账36+36、tests无该列、篡改verify失败、注入回滚）；演练10步全ok（漂移0/0、恢复副本verify ok；证据`rewrite-drill-evidence-2026-09-12T04-56-15-244Z.json`） |
| 完整Node套件超时 | `migration-lf.contract.test.ts`单次`git cat-file --batch`批量读取（60次子进程→1次）+两用例显式30秒超时；断言零改动 | RED=842/843（目标用例5243ms超5s）→单文件7/7（469ms）→标准完整`npm test`连续两次零失败零skip |

门禁（全部本地新鲜）：pytest integration 31/31+非集成101/101零skip；citation组32/32；tsc/eslint(0 error)/build退出0；ruff/mypy 0问题；Chromium E2E 23/23（`shv2_e2e`重建为满足新content_hash契约的V2终态）；案例库`--check`通过；scan-secrets 921文件零命中；allowlist哨兵3场景全过；test:db全新库（29文件/158）零skip；Gitleaks 8.29.1完整历史100提交零发现（新增`test_rag_evidence_sync.py`脱敏哨兵误报经人工核实按ADR-0009登记精确allowlist，哨兵3场景全过）。

下一步：用户/独立复审确认后，由用户决定持久执行（生产MinIO同步、持久RAG登记、持久0019与V2改写）并另行fresh授权；目标集成分支合并仍需用户明确指令。

## 2026-09-12控制契约复审修复（第二轮；起点b5a8d13，本修复提交HEAD）

独立复审在b5a8d13基础上发现控制缺口，本轮只修以下三项（f583adc为历史任务2/3交付SHA；上一轮MinIO接入、业务content_hash与Node超时修复保留不推翻）：

| 缺口 | 修复 | RED→GREEN证据 |
| --- | --- | --- |
| evidence_sync apply未绑定fresh授权计划 | `build_plan`确定性计划（schema/version、codeSha、jurisdiction、固定bucket、evidenceManifestHash、MinIO+RAG状态指纹与终态指纹、完整对象清单、计划上传/登记/noop集合、规范化planHash）；apply显式`--i-am-authorized/--plan-file/--plan-hash/--target-fingerprint`，写入前校验计划结构、HEAD==codeSha、工作树干净（RAG_EVIDENCE_ALLOW_DIRTY仅隔离演练）、evidence未漂移、MinIO+RAG状态指纹==targetFingerprint；终态noop、介于两者TARGET_STATE_DRIFT零写入拒绝；环境开关仅附加保护；并发advisory锁+锁内重分类 | RED=集合期ImportError（21测试）→GREEN=35/35；演练17项全ok（证据`rag-evidence-drill-2026-09-12T08-43-47-471Z.json`：守卫反例A-E零写入、plan两次一致、apply、四方verify、noop、object-only、冲突拒绝+re-plan恢复、pg_dump+逐对象备份→全新库+全新MinIO恢复→恢复副本verify ok+同计划noop） |
| 缺数据库时verify可ok:true | 完整audit/plan/apply/verify必须连数据库（CLI USAGE拒绝）；缺库完整verify ok:false；显式`--object-only`降级（verificationScope/degraded/dbChecked标记） | 集成断言缺库ok:false+问题指向数据库；object-only标记断言；演练object-only步+四方verify步 |
| 文档事实过期 | f583adc=历史任务2/3交付SHA；b5a8d13=本次控制修复起点；最终SHA=本修复提交HEAD（交付报告给出）；历史Reopened章节标记历史审查记录；MinIO演练步骤数按证据JSON如实更正（12项/17项，rewrite演练10步不变） | 本文档与PRD/3WI/验收报告/traceability/OPERATIONS/TESTING一致性核对 |

门禁（本修复提交HEAD代码状态）：35/35 evidence_sync测试、演练17项、pytest 43+106零skip、npm test×2 81文件/846零失败零skip、test:db 29文件/158零skip、tsc/eslint/build 0、Chromium E2E 23/23（含ChatPageClient修复）、citation 32、--check、scan-secrets 926零命中、哨兵、Gitleaks 101提交零发现、git diff --check干净。

状态：**Ready for independent review**（不自行标记Accepted）。目标集成分支`refactor/policy-ops-agent-platform@0885613`未修改未合并；持久policyops与生产MinIO未连接未写入（全程仅隔离`shv2-ctrl-pg`:54957与`shv2-ctrl-minio-a/b`:54962/54963，演练后清理）。
