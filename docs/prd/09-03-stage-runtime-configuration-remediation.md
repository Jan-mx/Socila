# 本地运行配置与凭据整改 Stage PRD

> Author: Jan
> Status: Approved
> Updated: 2026-09-03

## 文档元数据

| 字段 | 值 |
| --- | --- |
| PRD文件 | `09-03-stage-runtime-configuration-remediation.md` |
| 类型 | Stage |
| 状态 | Approved |
| 前置依赖 | Stage 07本地Compose切换、09-02双角色鉴权、09-03发布准备 |
| 可并行阶段 | 无；数据库备份、口令轮换和运行配置必须串行 |
| 后续消费者 | Core↔Agent服务JWT、案例库精简、远程Demo部署 |
| 退出门禁 | 活动运行时只连接本地PostgreSQL，备份恢复、凭据轮换、Compose与完整回归全部取得新鲜证据 |
| 对应总体需求 | REL-FR-001～009、AUTH-FR-012、AUTH-NFR-001/008、PMG-FR-032 |

## 1. 背景与现状

七阶段重构已将运行事实源从Neon切换到单机Docker Compose中的PostgreSQL 17，但活动配置尚未完全收口：

- Docker Web连接`postgres:5432/policyops`，宿主机`.env.local`仍指向Neon并优先覆盖根`.env`；
- 根`.env`、`.env.local`和`infra/prod/.env`存在重复或不一致配置；
- 数据库用户体系已启用，`ADMIN_USERNAME`与`ADMIN_PASSWORD_HASH`仍作为常驻运行变量注入；
- Agent migration在Compose中把内部DNS主机`postgres`判为远程并退出1；
- 根README、Vercel入口和配置模板仍保留重构前口径或代码未读取的变量；
- 一次诊断输出曾暴露本地Compose PostgreSQL连接串中的口令，该口令必须在备份恢复验证后轮换。

本机Docker数据卷`socila_pg-data`是本Stage唯一允许修改的数据库。Neon只作为历史迁移来源，不得读取、写入、删除或重新同步。

## 2. 目标

- 将Docker Compose PostgreSQL确立为唯一活动运行事实源。
- 建立宿主机与容器两套明确且一致的连接配置，消除`.env.local`覆盖导致的误连。
- 移除运行时管理员引导凭据，保持数据库用户登录不变。
- 在可恢复备份后安全轮换本地PostgreSQL口令。
- 修复Compose migration并清理过时、重复或无消费者的活动配置。
- 通过数据对账、认证冒烟和项目门禁证明整改未改变业务数据与产品行为。

## 3. 非目标

- 不精简`cases`或`showcase_cases`。
- 不修改Neon数据库或凭据。
- 不实现Core↔Agent服务JWT；保留其两个Secret变量供后续Feature使用。
- 不轮换`NEXTAUTH_SECRET`、`AUTH_REFRESH_PEPPER`、OpenAI或SiliconFlow API Key。
- 不执行远程部署、DNS/入口切换、生产数据迁移或PR合并。
- 不改变用户、角色、会话、规划、规则、参数或Agent/RAG数据模型。

## 4. 用户故事

- **CFG-US-001** 作为开发者，我需要宿主机脚本只连接本地PostgreSQL，从而不会因环境优先级误改Neon。
- **CFG-US-002** 作为运维者，我需要可恢复的数据库备份和无泄漏口令轮换，从而可以安全更换已暴露凭据。
- **CFG-US-003** 作为管理员，我需要登录完全依赖数据库用户，从而无需在运行容器中保留管理员哈希。
- **CFG-US-004** 作为后续Agent，我需要模板只描述真实生效的配置，从而不会按失效变量实施或验收。

## 5. 功能与工程需求

- **CFG-FR-001 运行事实源**：所有活动Web、脚本和migration配置必须指向本地`policyops`；宿主机使用`localhost:5432`，Compose使用`postgres:5432`。
- **CFG-FR-002 环境优先级**：`.env.local`是宿主机唯一私有配置源；Next.js、Drizzle、migration、seed、showcase生成和管理员引导使用相同的`.env.local`优先、`.env`回退、进程变量不覆盖规则。
- **CFG-FR-003 根环境清理**：将根`.env`中仍需保留的值安全迁入`.env.local`后删除根`.env`，不得留下第二份活动Secret或数据库连接。
- **CFG-FR-004 管理员凭据清理**：从`.env.local`、`infra/prod/.env`、Compose Web环境和活动模板删除`ADMIN_USERNAME`与`ADMIN_PASSWORD_HASH`；`bootstrap-admin.mjs`继续接受显式进程变量，要求bcrypt cost 12，成功后运行时登录只查询`users`表。
- **CFG-FR-005 新鲜备份**：口令轮换前生成PostgreSQL custom-format dump与SHA-256清单，保存到仓库根`backup/db/`；`backup/db/`必须被Git忽略且不得进入提交。
- **CFG-FR-006 恢复验证**：使用PostgreSQL 17 + pgvector临时容器执行`pg_restore --list`和真实恢复，逐表核对轮换前基线；历史备份不能替代本次新鲜备份。
- **CFG-FR-007 口令轮换**：生成不少于32随机字节的URL安全口令，不回显；同步修改数据库`postgres`角色、`POSTGRES_PASSWORD`、Compose的`DATABASE_URL`/`AGENT_DATABASE_URL`与宿主机`DATABASE_URL`。
- **CFG-FR-008 轮换原子性**：轮换前停止Web、Agent、Worker、Beat和migration；先准备并校验临时配置，再修改数据库角色并原子替换私有环境文件；任何失败不得以已暴露旧口令作为长期回退。
- **CFG-FR-009 migration门禁**：仅Compose的`migrate`服务显式设置`ALLOW_REMOTE_DATABASE=1`以允许内部DNS`postgres`；宿主机脚本仍只允许`localhost`、`127.0.0.1`或`::1`，远程例外仍需人工授权。
- **CFG-FR-010 活动配置清理**：移除活动Vercel入口和根README中的Neon/Vercel当前部署说明；配置模板只列出运行时代码实际读取的变量，未实现变量应删除或在非配置文档中标为固定值。

### 5.1 非功能需求

- **CFG-NFR-001 最小权限**：只有migration服务获得内部非loopback门禁例外。
- **CFG-NFR-002 Secret安全**：任何输出、提交、报告和测试不得包含真实Secret或完整连接串。
- **CFG-NFR-003 可恢复**：口令轮换必须以新鲜、真实恢复通过的备份为前置条件。
- **CFG-NFR-004 可重复**：配置解析、migration和健康检查可重复执行且结果一致。
- **CFG-NFR-005 可审计**：需求、实现、测试、备份恢复和提交存在唯一追踪路径。
- **CFG-NFR-006 零数据漂移**：整改不得新增、删除或改变任何业务数据。

## 6. 实现设计

### 6.1 配置所有权

| 场景 | 权威文件 | 数据库主机 |
| --- | --- | --- |
| 宿主机Next/脚本/Drizzle | `.env.local` | `localhost:5432` |
| 本地Personal Demo Compose | `infra/prod/.env` | `postgres:5432` |
| 可提交示例 | `.env.example`、`infra/prod/.env.example` | 仅占位值 |

Plain Node脚本使用一个共享加载器；TypeScript脚本复用现有`src/lib/env/load-environment.ts`语义。环境加载必须`override:false`，CI显式注入值始终优先。

### 6.2 口令轮换顺序

1. 读取并记录不含Secret的容器、数据库版本和精确行数基线。
2. 创建新鲜dump、清单和临时恢复库，验证全部基线。
3. 停止数据库依赖服务，但保持PostgreSQL容器和数据卷运行。
4. 生成新口令并在内存中构造、校验三个目标连接串。
5. 修改PostgreSQL角色口令并原子更新两个私有环境文件。
6. 清除旧根`.env`和任何临时明文文件。
7. 重建依赖服务，运行migration两次、健康检查和数据对账。
8. 若重建失败，保持数据卷不动，使用新生成口令修复配置；只有数据损坏时才从已验证dump恢复。

轮换助手可以是一次性本地脚本，但必须位于Git忽略目录、不得记录Secret、执行后删除；不得把真实值放入Shell历史、命令参数、补丁、测试快照或报告。

## 7. 数据模型与不变量

- 不新增、删除或修改业务表和列。
- 轮换前后每张现有业务表的精确行数必须一致。
- `users`中至少保留1个`active admin`；现有密码哈希不得被管理员环境变量覆盖。
- `socila_pg-data`不得删除、重建或执行`down -v`。
- dump和临时恢复设施不得进入Git；验证容器完成后应按精确名称删除。

## 8. API、事件与类型

- 无浏览器API、内部API或TypeScript公共类型变化。
- 环境接口变化：
  - 删除运行时`ADMIN_USERNAME`、`ADMIN_PASSWORD_HASH`。
  - 保留一次性引导脚本的同名进程输入。
  - 保留`AGENT_SERVICE_JWT_CURRENT/PREVIOUS`，本Stage不接线。
- 配置失败必须在启动或脚本入口fail-fast，不得静默回退Neon。

## 9. 迁移与兼容

- 配置整改不执行Schema migration；只修复migration执行入口。
- 现有Docker数据库和数据卷原地保留。
- Neon连接从活动配置移除，不执行反向同步或删除。
- 已登录Cookie可能因宿主机与Docker origin不同而独立，但两套运行时必须使用相同NextAuth Secret和refresh pepper。
- 回退仅允许恢复代码/配置模板；数据库口令不得回退为已暴露值。

## 10. 安全、隐私与可观测

- 工具输出只能显示变量是否设置、URL主机/端口/库名、哈希算法与长度，不得显示用户名之外的凭据内容。
- 备份可能包含用户数据，必须Git忽略且只保存在用户指定本地目录。
- 口令不得进入进程列表、Git diff、PowerShell历史、Docker inspect输出、日志或Markdown。
- 提交前扫描候选文件和新增文本；真实`.env`、dump、清单和临时文件不得暂存。
- 验收报告记录备份文件名、大小、SHA-256和计数，但不记录连接串或Secret。

## 11. 失败模式、重试与回退

| 失败 | 行为 | 重试/回退 |
| --- | --- | --- |
| dump或清单失败 | 停止，不轮换 | 修复备份路径后重新生成 |
| 临时恢复或对账失败 | 停止，不轮换 | 删除精确验证容器，调查dump/版本 |
| 私有配置校验失败 | 停止，不修改数据库角色 | 修正临时配置后重试 |
| 角色口令已改但文件替换失败 | 服务保持停止，不泄漏新口令 | 使用仍在内存的新口令完成原子替换；不得长期恢复旧口令 |
| migration失败 | 保留PostgreSQL和数据卷，停止后续验收 | 查看migration日志并修复门禁/Schema问题 |
| 数据行数漂移 | 立即停止，不提交 | 从事务/日志确认原因；必要时用已验证dump恢复 |
| 服务健康失败 | 不声称完成 | 保留数据卷，回滚应用配置并继续使用新数据库口令 |

## 12. 交付物

- 统一环境加载器及专用单元测试。
- 宿主机/Compose配置、模板、README和部署入口整改。
- 新鲜PostgreSQL dump、SHA-256清单及恢复验证证据。
- 已轮换且不泄漏的本地PostgreSQL凭据。
- migration重复执行、服务健康、数据对账和完整回归证据。
- traceability、PROGRESS、OPERATIONS、ARCHITECTURE与验收报告更新。

## 13. 测试矩阵

| 类型 | 需求 | 场景 | 通过条件 |
| --- | --- | --- | --- |
| 单元 | CFG-FR-002 | `.env.local`优先、`.env`回退、进程值优先 | 每条路径确定且零环境依赖 |
| 配置契约 | CFG-FR-001/003/004/009/010 | 扫描活动模板、Compose、README和旧入口 | 无Neon活动连接、无常驻管理员变量、migration例外仅限目标服务 |
| 恢复 | CFG-FR-005/006 | dump列表与PG17+pgvector临时恢复 | 所有核心表可恢复且计数一致 |
| 数据 | CFG-FR-007/008 | 轮换前后逐表对账 | 表集合和行数无漂移 |
| 认证 | CFG-FR-004/007 | 用户/admin登录、刷新、管理后台 | 数据库身份路径全部通过 |
| Compose | CFG-FR-009 | config解析、migration两次、服务重建 | 零插值警告，migration两次退出0，健康服务全部通过 |
| 回归 | CFG-FR-010 | Node、Python、数据库、E2E、构建、安全 | 全部门禁零失败、零未解释skip |

## 14. 验收场景

- **CFG-AC-001** Given宿主机存在`.env.local`，When Next、Drizzle和数据库脚本加载环境，Then目标均为`localhost:5432/policyops`且不读取Neon。
- **CFG-AC-002** GivenCI已注入`DATABASE_URL`，When加载本地文件，Then进程值不被覆盖。
- **CFG-AC-003** Given数据库管理员已存在，When启动Web，Then无需`ADMIN_USERNAME`或`ADMIN_PASSWORD_HASH`即可登录和管理用户。
- **CFG-AC-004** Given口令尚未轮换，When执行备份恢复，Then恢复库的表集合及精确行数与源库一致。
- **CFG-AC-005** Given新口令已生成，When完成角色与配置切换，Then旧口令失效、新连接可用且输出中没有Secret。
- **CFG-AC-006** Given轮换完成，When查询所有业务表，Then行数与轮换前基线一致。
- **CFG-AC-007** GivenCompose migration服务，When连续执行两次，Then两次退出0且migration记账无重复。
- **CFG-AC-008** Given宿主机直接执行受保护数据库脚本，When目标为非loopback主机且无人工授权变量，Then脚本拒绝执行。
- **CFG-AC-009** Given活动配置和文档，When扫描Neon、Vercel、管理员运行变量与未消费配置，Then旧内容只存在于历史/回退材料。
- **CFG-AC-010** Given全部服务重建，When执行Web、Auth、Agent和数据库健康检查，Then全部返回预期成功状态。
- **CFG-AC-011** Given配置候选提交，When执行Secret和Git忽略检查，Then真实环境、dump、清单和Secret均未进入提交。
- **CFG-AC-012** Given全部整改完成，When执行适用项目门禁，Then退出码均为0且无未解释skip或warning。

## 15. Definition of Done

- CFG-FR-001～010、CFG-NFR-001～006和CFG-AC-001～012均有实现、测试或运行证据映射。
- 所有可测试行为先取得失败测试，再完成最小实现；纯私有配置和口令操作以恢复演练与运行验收代替伪单元测试。
- 新鲜备份和临时恢复在轮换前通过，轮换后数据对账与Auth冒烟通过。
- Node/Python单元、数据库集成、Auth E2E、TypeScript、ESLint、Build、Compose、Secret扫描全部取得新鲜结果。
- 受影响README在实施时为Updating，验收后恢复Active；ARCHITECTURE、OPERATIONS、traceability和PROGRESS同步。
- 提交前检查完整staged diff，只创建提交`fix: 统一本地运行配置与凭据管理`并推送当前upstream；不创建PR、不合并main。

## 16. 下一阶段输入

- 唯一本地运行事实源和已验证的备份/恢复路径。
- 不含常驻管理员引导凭据的运行环境。
- 可重复执行的Core与Agent migration入口。
- `AGENT_SERVICE_JWT_CURRENT/PREVIOUS`的稳定配置位置，供服务JWT Feature接线。
