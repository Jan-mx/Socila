# PolicyOps Agent重构文档

> Author: Jan
> Status: Active
> Updated: 2026-09-09

## 当前状态

七个重构阶段已经完成并通过阶段验收。当前应用采用Next.js Core、FastAPI、Celery、LangGraph、本地PostgreSQL、pgvector、Redis和MinIO。

09-02用户与管理员双角色鉴权Feature已Accepted；09-03 P0合并质量门禁与v2.0.0发布准备**Accepted（开发分支发布准备）**：六类门禁全部本地新鲜复现（全部退出0、零skip），workflow经actionlint 1.7.7静态校验零发现，`origin/main...ced6a5a`完整差异审阅完成（401文件，+32501/−1851）；重构前`main`已由`v1.0.0`标记，PR、main ruleset、merge与`v2.0.0` Release为未来人工动作（见`PROGRESS.md`精确下一步与PRD §17）。

09-05 Stage（`docs/prd/09-05-stage-national-baseline-regional-overlays.md`）按ADR-0010完成**任务2首期CN、上海、广东分地区交付（Accepted，2026-09-07）**。任务3（WI-20260907-02）保持**Accepted**。**任务4（WI-20260907-03）第三轮修复完成并重新Accepted（2026-09-10）**：旧regression test按完整业务行计算非空64位hash（8个业务字段漂移均拒绝）、manifest三方自校验（文件声明hash/正文重算hash/批次hash一致，fail-closed）、SHA清单精确覆盖7个必备文件各一次（重复/额外/路径穿越/非法hash全部拒绝）、restore-report真实验证（sourceDump SHA、PG/pgvector版本、全部表rows与64位hash、真实sequence lastValue/isCalled明细，空明细verified拒绝）、selection-report由生成后showcase实际计算（上海18/广东18、每地区男女9/9、年龄段6/6/6、就业态6/6/6，violations不得硬编码为空）、42条DSL example的保留/更新/新增/删除集合进入manifest并由apply在**同一事务**原子同步（assertRclCounts显式要求exampleTestCount===42）、批次状态UPDATE返回0行必须失败、落库新行按稳定UID重算完整行hash与manifest逐项核对（apply与verify均返回实际DB ID/UID/hash）。随机端口全新PG17+pgvector隔离DB：`npm run test:db` 26文件/137零skip、pytest -m integration 20/20、agent.migrate --with-roles×2幂等；npm test 73文件/705零skip；tsc/eslint零error。pre dump（`59ee2f5f…`）隔离恢复完整CLI演练通过：pre基线452/36/500/28核对→0017/0018补齐（账本created_at为未来时间戳导致drizzle migrator跳过，隔离库手动应用+登记）→audit→generate→plan（manifestHash `0ae24c80…`）→prepare→真实恢复（全表/sequence对账）→verify-archive→apply（删452/36/500插36/36/36）→verify→复跑no-op→最终36/36/42/36→篡改fail-closed。**WI-20260907-04保持Reopened（等待repair-forward授权）**：只读审计完成——当前库36/36/78冻结；post dump恢复对比仅`auth_refresh_sessions`运行期差异（40表+20 sequence其余一致）；旧452/36/500可信归档已从pre重建（manifestHash `da0ea94d…`，500 test hash全部非空）；当前36/36/78 attestation manifest（attestationManifestHash `3e081d59…`）；账本21条定位0012～0014重复登记（id 12/13/14旧hash与id 18/19/20重复）、0015/0010/0011账本hash与当前SQL不一致、id 17缺失；repair-forward计划（migrationLedgerFingerprint `205acb40…`、targetFingerprint `58cef928…`、精确拟更新账本行/归档批次/snapshot处置/回退点）见`F:/Socila/backup/case-library/task34-r3-audit-2026-09-10T01-15-43/repair-forward-plan.json`。`refactor/policy-ops-agent-platform`仍停在`57f051d`，不得执行最终合并、重跑旧stage脚本或自动恢复pre dump。

09-05 Feature（`docs/prd/09-05-feature-socila-naming-regional-dsl.md`，Socila命名统一与地区DSL分层）**Accepted（2026-09-05两轮复审纠正后重新验收）**：首轮复审三项缺漏已纠正——命名契约区分"允许的精确旧协议片段"与"独立品牌标识"、`.gitleaks.toml`改用`[[allowlists]]`+`targetRules`并新增哨兵回归（ADR-0009）、多地区Seed补齐jurisdiction作用域并有落库级测试；第二轮复审又修复扫描器注释自命中与`.gitleaksignore`说明文字历史误报，并将Next生产构建worker限制为2以适配本机及4GB Demo资源档。最终新鲜复验：`npm test` 359/359、Gitleaks 8.29.1完整历史43提交零发现、`npm run build`以2 workers退出0。通用协议`dsl/protocol/socila_dsl_v1`与上海地区`dsl/regions/shanghai_dsl_v1`分层，规则格式唯一规范值`SOCILA-DSL-1.0`；活动代码与配置完成Socila硬切换；服务JWT身份为`socila-next-core`；粤川示例仅保留测试夹具，生产Seed与持久库均为0。证据见`reports/feature-09-05-socila-naming/acceptance-report.md`。

09-03本地运行配置与凭据整改阶段（`docs/prd/09-03-stage-runtime-configuration-remediation.md`）**Accepted**：宿主/Compose环境加载与模板收口统一、管理员引导一次性化、新鲜备份经PG17+pgvector真实恢复对账、PostgreSQL口令完成轮换（轮换前后逐表对账34表/1610行一致），全部门禁本地新鲜复验；复审确认本阶段演练容器零残留（见`PROGRESS.md`与`reports/stage-09-03-runtime-config-remediation/acceptance-report.md`）。

09-03 Feature（`docs/prd/09-03-feature-core-agent-service-jwt.md`，Core与Agent双向服务JWT鉴权）**Accepted**：HS256双向签发与验证（current/previous双Secret、固定claims、300秒TTL+30秒偏差）、JTI消费与业务写同事务（重放统一401、业务失败JTI同回滚）、`/internal/health`唯一免JWT、401 `SERVICE_AUTH_INVALID`/503 `SERVICE_AUTH_STORE_UNAVAILABLE`统一语义（均no-store）、Node/Python跨语言契约向量互验、AC-017完整Compose双向冒烟与AC-018全部门禁新鲜PASS；2026-09-03复审发现的4项缺漏（文档/OpenAPI入口关闭、Web启动期fail-fast校验+Compose必填插值、Python重放存储异常统一503映射、宿主JWT配置补齐与安全同步）已全部修复并重新验收，SJWT-NFR-001～007/SJWT-AC-001～019全部通过（见`PROGRESS.md`与`reports/feature-09-03-service-jwt/acceptance-report.md`）。2026-09-04复查新发现2项缺漏并修复重验：公开模板可预测占位符通过校验→模板`AGENT_SERVICE_JWT_CURRENT/PREVIOUS`改空值（直接复制未填写被启动校验拒绝）+ `psycopg.connect`缺确定性超时→`PostgresReplayGuard`新增`connect_timeout_seconds`（默认5秒/测试1秒、超时统一503 no-store），完整集成测试不再挂起、演练资源零残留，Feature保持**Accepted**（见`PROGRESS.md`与`reports/feature-09-03-service-jwt/acceptance-report.md` §7.7）。2026-09-04 Edge构建警告复查修复：`src/instrumentation.ts`静态`process.exit(1)`触发Edge运行时Turbopack警告→启动校验与进程终止收敛至Node专用模块`service-jwt-startup-node.ts`（`register`改async、仅nodejs分支动态import、Edge运行时不执行启动校验），`npm run build`零警告、standalone四种真实启动复验（S1～S4）、源码契约测试防回归，Feature保持**Accepted**（见`PROGRESS.md`与`reports/feature-09-03-service-jwt/acceptance-report.md` §7.8）。

本机作为开发环境，后续工作以远程Demo部署、真实Agent闭环、首批政策采集和持续质量建设为主。

产品需求见：[PolicyOps Agent PRD](../../prd/09-01-policy-ops-agent.md)。

## 开始工作

所有Agent先读取：

1. 仓库根`AGENTS.md`；
2. 本README；
3. `PROGRESS.md`；
4. 根据任务类型读取下表中的对应文档。

不要默认批量读取reports和archive。

## 当前文档

| 文件 | 用途 |
| --- | --- |
| `REFACTOR-PLAN.md` | 已完成的七阶段重构计划和结果摘要 |
| `ROADMAP.md` | 未来开发方向和优先级 |
| `PROGRESS.md` | 当前状态、阻塞和下一步 |
| `ARCHITECTURE.md` | 当前组件、数据和调用边界 |
| `TESTING.md` | TDD规则、测试命令和质量门禁 |
| `OPERATIONS.md` | 部署、资源、备份、恢复和告警 |

## 子目录

| 目录 | 用途 |
| --- | --- |
| `config/` | PolicyOps和SiliconFlow配置模板及验证记录 |
| `sources/` | 官方政策来源白名单 |
| `decisions/` | 当前生效的ADR（ADR-0007起；ADR-0001～0006在archive/decisions） |
| `reports/` | 阶段测试、验收、迁移和发布证据 |
| `archive/` | 旧PRD、memory-bank、历史ADR和被替代计划 |

## 阅读路由

| 任务 | 读取 |
| --- | --- |
| 产品行为 | 产品PRD |
| 接口、Schema、组件 | `ARCHITECTURE.md` |
| 测试、OCR、RAG质量 | `TESTING.md` |
| 部署、备份、恢复 | `OPERATIONS.md` |
| 安排后续开发 | `ROADMAP.md` |
| 查看当前状态 | `PROGRESS.md` |
| 调查历史决策 | `archive/`中的对应文件 |
| 核对执行证据 | `reports/`中的对应报告 |

## 不变量

- 规则引擎是政策数字结论的唯一计算来源。
- Agent只能创建draft，不能自动发布。
- 生产个人资料不得发送到政策模型服务。
- 原始政策文件和DocumentTree是审计事实源。
- 已发布规则、政策和快照不可原地修改。
- Agent提示词只在对话中提供，禁止写入PRD、Work Item、验收报告或其他开发文档；本README只记录提示词管理规则和权限边界。
- 合成政策案例不得描述为真实用户案例或权威政策来源。
