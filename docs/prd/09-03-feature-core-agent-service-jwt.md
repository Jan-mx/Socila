# Core与Agent双向服务JWT鉴权 Feature PRD

> Author: Jan
> Status: Accepted
> Updated: 2026-09-04

## 文档元数据

| 字段 | 值 |
| --- | --- |
| PRD文件 | `09-03-feature-core-agent-service-jwt.md` |
| 类型 | Feature |
| 状态 | Accepted |
| 前置依赖 | `09-03-stage-runtime-configuration-remediation.md`已Accepted并推送、ADR-0005 |
| 可并行阶段 | 无；双向协议、Secret和重放存储必须统一交付 |
| 后续消费者 | PolicyOps审核、Draft物化、远程Personal Demo部署 |
| 退出门禁 | Core与Agent所有内部业务调用均使用可轮换短期JWT，错误claims与写请求重放取得双向拒绝证据 |
| 对应总体需求 | AGT-FR-007/011、DRF-FR-013/014、PRD-NFR-002/005/006、ADR-0005 |

## 1. 背景与现状

Compose已向Web和Agent注入`AGENT_SERVICE_JWT_CURRENT/PREVIOUS`，架构与ADR-0005要求Docker内网之外再使用短期HS256服务JWT。然而当前实现仍以可伪造的`X-Service-Name`字符串作为身份判断：

- Next Core代理访问FastAPI proposal/review接口只发送`X-Service-Name: next-core`；
- Agent调用Core draft-import只发送`X-Service-Name: agent-runtime`；
- Core draft-import入口只比较该Header；
- 两个JWT Secret没有代码消费者，`jti`重放保护不存在。

这导致活动配置、架构文档与实际信任边界不一致。Feature必须一次完成双向签发、验证、Secret轮换和写请求重放保护，不允许只保护单向或继续把服务名Header当作凭据。

## 2. 目标

- 为Next→Agent和Agent→Core建立固定、可测试的HS256服务JWT协议。
- 使用current/previous双Secret支持无中断轮换。
- 对审核与draft物化写请求提供数据库原子JTI防重放。
- 将`X-Service-Name`降为非可信日志上下文。
- 统一错误、日志与测试，确保令牌和Secret不会泄漏。

## 3. 非目标

- 不引入mTLS、OAuth、外部身份服务或通用服务账号系统。
- 不改变NextAuth用户Session、`user/admin`角色、用户所有权或浏览器Cookie。
- 不改变公开页面、浏览器API或现有业务响应字段。
- 不新增当前FastAPI尚不存在的proposal列表/创建业务端点；相关路由缺口另行建任务，JWT Feature只保护现有端点和现有Next代理请求。
- 不在本Feature中轮换真实JWT Secret；只实现并验证轮换机制。
- 不允许浏览器直接获得或提交服务JWT。
- 不将健康检查改为需签名请求。

## 4. 用户故事

- **SJWT-US-001** 作为平台维护者，我需要Core和Agent验证调用方身份，从而不能仅靠内网Header冒充服务。
- **SJWT-US-002** 作为运维者，我需要current/previous双Secret，从而可以无中断轮换内部凭据。
- **SJWT-US-003** 作为审核管理员，我需要审核和物化请求不能被重放，从而一次决定只产生一次授权副作用。
- **SJWT-US-004** 作为安全审计者，我需要失败关闭且无令牌泄漏的证据，从而能够复核服务边界。

## 5. 功能与工程需求

- **SJWT-FR-001 配置**：Web与Agent读取同名`AGENT_SERVICE_JWT_CURRENT`和可选`AGENT_SERVICE_JWT_PREVIOUS`；current少于32 UTF-8字节、previous与current相同或配置格式无效时启动失败。
- **SJWT-FR-002 算法与Header**：令牌只允许HS256，Header必须包含`alg=HS256`、`typ=JWT`；拒绝`none`、其他算法、缺失typ和算法混淆。
- **SJWT-FR-003 固定claims**：每个令牌必须有UUID v4 `jti`及NumericDate `iat/exp`，`exp=iat+300`；允许30秒时钟偏差，不允许额外放宽TTL。
- **SJWT-FR-004 Next到Agent**：Next签发`iss=ssp-next-core`、`aud=policy-agent`、`sub=next-core`的令牌，FastAPI对除`/internal/health`外的所有`/internal/*`业务端点验证。
- **SJWT-FR-005 Agent到Core**：Agent签发`iss=policy-agent`、`aud=ssp-next-core`、`sub=agent-runtime`的令牌，Core仅在`/api/internal/v1/draft-imports`验证该固定身份。
- **SJWT-FR-006 Header迁移**：调用方发送`Authorization: Bearer <JWT>`；`X-Service-Name`可继续用于结构化日志，但不能参与允许/拒绝判断。
- **SJWT-FR-007 Secret轮换**：签发只使用current；验证依次接受current、previous。previous缺失时不尝试回退；失败响应不得暴露匹配了哪个Secret。
- **SJWT-FR-008 JTI防重放**：agent-run创建、proposal审核和draft物化内部写请求必须在接收服务数据库事务中登记JTI；主键冲突视为重放并统一返回401。
- **SJWT-FR-009 错误与日志**：缺失、Bearer格式错误、签名错误、算法错误、claims错误、过期、超前和重放统一返回401及稳定错误`SERVICE_AUTH_INVALID`；日志不得包含原始令牌、Authorization Header、Secret或签名片段。

### 5.1 非功能需求

- **SJWT-NFR-001 算法固定**：仅允许HS256，禁止算法协商和降级。
- **SJWT-NFR-002 最短暴露窗口**：TTL固定300秒，时钟偏差最多30秒。
- **SJWT-NFR-003 Secret强度**：current不少于32 UTF-8字节，current/previous不得相同。
- **SJWT-NFR-004 失败关闭**：配置、验证或重放存储异常不得退回内网Header信任。
- **SJWT-NFR-005 可测试性**：Clock、UUID、签发和验证边界可注入，测试不得依赖真实等待。
- **SJWT-NFR-006 零泄漏**：日志、错误、响应、trace和测试产物不得包含Token或Secret。
- **SJWT-NFR-007 演练资源清理**：任何为数据库集成、跨语言契约、Auth E2E或双向Compose冒烟创建的演练容器，必须使用任务专属名称，并在成功、失败或中断后的`finally`清理中删除；任务创建的匿名卷和临时网络必须同步删除。验收前必须通过`docker ps -a`、`docker volume ls`和`docker network ls`确认零任务残留，且不得删除或重建`socila-*`容器、`socila_pg-data`或`socila_minio-data`。

## 6. 实现设计

### 6.1 协议常量

| 方向 | issuer | audience | subject | TTL | skew |
| --- | --- | --- | --- | ---: | ---: |
| Next→Agent | `ssp-next-core` | `policy-agent` | `next-core` | 300秒 | 30秒 |
| Agent→Core | `policy-agent` | `ssp-next-core` | `agent-runtime` | 300秒 | 30秒 |

Next直接依赖`jose`；Python Agent依赖`PyJWT>=2.10,<3`。两端均必须显式传入允许算法`HS256`，不得根据令牌Header动态选择算法。

### 6.2 Node职责

- 新建`src/lib/security/service-jwt.ts`，导出可注入时钟和UUID生成器的签发/验证函数；测试位于同目录`service-jwt.test.ts`。
- 管理后台proposal列表、创建和review代理在每个下游请求前签发新令牌。
- Core draft-import路由在解析请求体前验证Agent令牌；写入前消费JTI。
- 新建`src/server/modules/agent-integration/infrastructure/drizzle/service-jwt-replay.repository.ts`，并把JTI消费、draft写入和`agent_materializations`台账收敛到同一事务。
- 验证函数返回规范化claims，不向路由暴露使用了current还是previous。

### 6.3 Python职责

- 新建`services/agent/agent/security/service_jwt.py`，提供固定Next身份验证和固定Agent身份签发；测试位于`services/agent/tests/test_service_jwt.py`。
- 新建`services/agent/agent/security/replay.py`封装Agent schema的JTI事务消费。
- 在`services/agent/agent/api/app.py`使用FastAPI dependency保护所有内部业务路由，`/internal/health`显式豁免；`/internal/ready`必须验证JWT。
- `HttpCoreClient`在每次draft-import请求前签发新令牌。
- agent-run创建和proposal审核在业务事务开始时消费JTI，重复时不执行任何领域写入；现有多次仓储提交必须收敛为接收方事务端口。

### 6.4 重放事务

接收方验证顺序：解析Bearer→验证签名/Header/claims→开始数据库事务→删除过期重放记录→插入JTI→执行业务写入→提交。插入冲突时整体回滚并返回统一401。

GET/健康检查不消费JTI；所有令牌仍必须携带唯一JTI。客户端在网络重试时签发新JTI，并复用现有`Idempotency-Key`保证业务幂等。

### 6.5 演练资源生命周期

执行Agent必须在创建演练设施前记录本次将创建的容器、卷和网络精确名称，并以`try/finally`、PowerShell`finally`或CI`if: always()`保证清理无条件执行。清理只能作用于该清单中的任务专属资源；清理后重新枚举Docker对象，任一任务资源仍存在都视为验收失败，不得提交或声称完成。

## 7. 数据模型与不变量

### 7.1 Core表

`public.service_jwt_replays`：

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `jti` | uuid | 主键 |
| `issuer` | text | 非空 |
| `subject` | text | 非空 |
| `audience` | text | 非空 |
| `expires_at` | timestamptz | 非空 |
| `created_at` | timestamptz | 非空，默认now |

Core使用`drizzle/0009_service_jwt_replays.sql`创建表及`expires_at`索引，并在`src/lib/db/schema.ts`声明同构表。

### 7.2 Agent表

`agent.service_jwt_replays`使用相同字段与约束，由Agent数据库角色读写；Agent角色不得因此获得Core表权限。

Agent使用`services/agent/agent/migrations/0007_service_jwt_replays.sql`创建表、`expires_at`索引并授予现有`agent_app`角色最小读写权限。

### 7.3 不变量

- JTI只保存UUID和claims元数据，不保存令牌或签名。
- 同一接收方同一JTI最多成功插入一次。
- 业务写与JTI消费处于同一事务；业务回滚时JTI也回滚，调用方可用新令牌和相同业务幂等键重试。
- 过期记录可机会式批量删除；删除失败不得绕过当前JTI唯一插入。
- 已发布规则、政策和快照的不变量不变。

## 8. API、事件与类型

### 8.1 请求Header

```text
Authorization: Bearer <service-jwt>
X-Service-Name: next-core | agent-runtime   # 可选日志上下文，不可信
X-Trace-Id: <trace-id>
Idempotency-Key: <business-idempotency-key> # 写请求保持现有语义
```

### 8.2 claims类型

```ts
type ServiceJwtClaims = {
  iss: "ssp-next-core" | "policy-agent";
  aud: "policy-agent" | "ssp-next-core";
  sub: "next-core" | "agent-runtime";
  jti: string;
  iat: number;
  exp: number;
};
```

Python使用具有相同字段语义的dataclass/Pydantic模型。验证后只向业务层传递规范化claims和JTI。

### 8.3 错误

签名、格式、claims、期限和重放等服务鉴权失败统一：

```json
{"error":"SERVICE_AUTH_INVALID"}
```

HTTP状态为401，`Cache-Control: no-store`。不得在响应中区分缺失、过期、previous失败或重放。令牌已经验证但重放数据库不可用属于基础设施失败，返回503 `SERVICE_AUTH_STORE_UNAVAILABLE`，同样使用`Cache-Control: no-store`。

## 9. 迁移与兼容

- Core新增`drizzle/0009_service_jwt_replays.sql`并更新journal；Agent新增`services/agent/agent/migrations/0007_service_jwt_replays.sql`，两者必须在空库和现有本地库重复执行安全。
- 部署顺序：先应用两端migration→部署同时支持current/previous验证的新服务→验证双向调用→未来另行授权后才可轮换真实Secret。
- `X-Service-Name`在一个版本内保留为日志字段，但删除其授权分支；没有JWT的旧调用立即失败关闭。
- 回退旧镜像时可保留两个重放表；不得删除表或清理已记录JTI作为回退步骤。

## 10. 安全、隐私与可观测

- Secret只来自部署环境；不得写入仓库、镜像层、测试快照、错误或报告。
- JWT不含用户ID、用户名、角色、业务payload或个人资料。
- 日志允许记录方向、结果、issuer、subject、jti、traceId和稳定失败类别；禁止记录完整Token/Header/Secret。
- 统计签发成功、验证成功、401、过期、claims错误、previous命中和重放数量；previous命中仅进入内部指标，不返回客户端。
- 连续鉴权失败或重放在短窗口内超过阈值时记录安全告警，但不自动切换Secret。

## 11. 失败模式、重试与回退

| 失败 | 行为 | 可重试 |
| --- | --- | --- |
| current缺失/过短 | 服务启动失败 | 修复Secret后重启 |
| previous等于current | 服务启动失败 | 修复配置后重启 |
| 签名/Header/claims无效 | 统一401，无业务调用 | 使用合法新令牌重试 |
| 令牌过期 | 统一401 | 调用方签发新JTI重试 |
| JTI重复 | 统一401，事务无副作用 | 不重用令牌；新JTI+相同业务幂等键可重试 |
| 重放表不可用 | 失败关闭，返回503 `SERVICE_AUTH_STORE_UNAVAILABLE` | 数据库恢复后使用新JTI重试 |
| 下游5xx/超时 | 沿用有限重试策略 | 每次重试签发新JTI，保留业务幂等键 |
| previous验证异常 | 不自动提升previous为current | 修复配置后重启 |
| 演练容器/卷/网络清理失败 | 停止验收，不提交 | 按创建清单精确删除并重新枚举；不得扩大到`socila-*`资源 |

## 12. 交付物

- Node服务JWT签发/验证模块及直接`jose`依赖。
- Python服务JWT模块及锁定范围的PyJWT依赖。
- Core与Agent重放表migration及仓储/事务接口。
- `testdata/service-jwt-vectors.json`中的非真实共享固定向量，供Node与Python互验。
- 双向HTTP客户端和内部路由鉴权接线。
- 单元、契约、数据库并发、双向集成和Compose验收测试。
- ARCHITECTURE、OPERATIONS、TESTING、模块README、traceability、PROGRESS和验收报告。

## 13. 测试矩阵

| 类型 | 需求 | 场景 | 通过条件 |
| --- | --- | --- | --- |
| Node单元 | SJWT-FR-001～003/007/009 | current/previous、算法、claims、边界时钟 | 可注入Clock/UUID，全部确定性 |
| Python单元 | SJWT-FR-001～004/007/009 | 签发、验证、健康豁免、统一失败 | 不启动外部服务即可覆盖 |
| 契约 | SJWT-FR-004～006/009 | 双向Header、固定claims、错误响应 | Node/Python共享固定向量互验 |
| 数据库 | SJWT-FR-008 | 首次消费、重复、并发、业务回滚 | 只有一个事务消费成功，无半成品业务写 |
| 集成 | SJWT-FR-004/005 | Next→Agent proposal/review、Agent→Core materialize | 合法调用通过，缺失/伪造Header拒绝 |
| 轮换 | SJWT-FR-007 | current签发、current/previous验证、移除previous | 无中断验证且签发永不使用previous |
| 安全 | SJWT-NFR-001～006 | 日志、响应、Secret扫描、算法混淆 | 无Token/Secret泄漏，失败关闭 |
| Compose | 全部 | migration、健康、真实内网调用 | 健康豁免可用，业务端点必须JWT |
| 资源清理 | SJWT-NFR-007 | DB集成、E2E、跨语言和Compose演练结束或失败 | 任务容器、匿名卷和临时网络零残留，保留的`socila-*`资源不变 |

## 14. 验收场景

- **SJWT-AC-001** Given合法current Secret，When Next调用Agent内部业务端点，Then固定Next claims验证通过。
- **SJWT-AC-002** Given合法current Secret，When Agent调用Core draft-import，Then固定Agent claims验证通过。
- **SJWT-AC-003** Given只有`X-Service-Name`无Bearer，When调用任一内部业务端点，Then返回统一401且无副作用。
- **SJWT-AC-004** Given`alg=none`或非HS256令牌，When验证，Then返回统一401。
- **SJWT-AC-005** Given错误issuer、audience或subject，When验证，Then返回统一401。
- **SJWT-AC-006** Given缺失jti/iat/exp或非UUID v4 jti，When验证，Then返回统一401。
- **SJWT-AC-007** Given`iat`在允许偏差内或外，When验证，Then30秒内通过、超出立即拒绝。
- **SJWT-AC-008** Given令牌TTL大于300秒或已经过期，When验证，Then返回统一401。
- **SJWT-AC-009** Givenprevious Secret仍配置，When验证旧签名令牌，Then通过；When签发新令牌，Then只使用current。
- **SJWT-AC-010** Given两个Secret相同或current不足32字节，When启动服务，Then启动失败且不输出Secret。
- **SJWT-AC-011** Given首次写请求，WhenJTI消费与业务事务提交，Then重放表和业务副作用各产生一次。
- **SJWT-AC-012** Given同一JTI并发提交两次，When消费，Then仅一个事务成功，另一个统一401。
- **SJWT-AC-013** Given业务事务回滚，When使用新JTI和相同Idempotency-Key重试，Then可以安全完成且不重复业务实体。
- **SJWT-AC-014** Given重放存储不可用，When发送写请求，Then返回503且不执行业务写入。
- **SJWT-AC-015** Given访问`/internal/health`，When不携带JWT，Then健康检查仍可用；其他`/internal/*`端点拒绝。
- **SJWT-AC-016** Given任一失败请求，When检查响应、日志和测试快照，Then不存在Token、Authorization或Secret。
- **SJWT-AC-017** Given配置Feature已Accepted，When构建并启动完整Compose，Then双向合法调用通过且伪造服务名失败。
- **SJWT-AC-018** Given全部实现完成，When运行完整项目门禁，Then全部退出0且无未解释skip或warning。
- **SJWT-AC-019** Given任一JWT演练成功、失败或被中断，When进入最终清理阶段，Then该任务创建的容器、匿名卷和临时网络全部被删除，Docker枚举无任务残留，且`socila-*`容器和持久卷未被删除或重建。

## 15. Definition of Done

- SJWT-FR-001～009、SJWT-NFR-001～007和SJWT-AC-001～019全部映射到实际实现、测试和验收证据。
- 每项可制造Red的行为均先观察到预期失败，再完成最小实现和重构。
- Node/Python固定测试向量可以互相签发验证，双向真实HTTP集成通过。
- 两端migration在空库和现有库重复执行通过；并发JTI测试证明原子唯一性。
- Node、Python、数据库、Auth E2E、TypeScript、ESLint、Build、Compose与Secret扫描取得新鲜PASS。
- 所有任务专属演练容器、匿名卷和临时网络完成无条件清理并取得零残留证据。
- 受影响README从Updating恢复Active；ARCHITECTURE、OPERATIONS、TESTING、traceability和PROGRESS同步。
- 提交前检查完整staged diff，只创建提交`feat: 接通Core与Agent服务JWT鉴权`并推送当前upstream；不创建PR、不合并main、不轮换真实Secret。

## 16. 下一阶段输入

- 受固定claims和双Secret保护的双向内部服务协议。
- 可审计、可清理、并发安全的JTI重放记录。
- 远程Personal Demo部署可直接复用的服务鉴权配置和Runbook。
- 多机部署或更高安全等级时重新评估mTLS，当前不自动扩展。

## 17. 2026-09-03复审记录

主体实现由`35d673c feat: 接通Core与Agent服务JWT鉴权`交付。当日复审新增SJWT-NFR-007/SJWT-AC-019（演练资源零残留），并发现4项实现缺漏：①FastAPI文档与OpenAPI入口未关闭；②Web启动期未拒绝无效JWT Secret（惰性装配+Compose非必填插值）；③Python重放存储未把缺表/权限等错误映射为503；④宿主机`.env.example`/`.env.local`缺少两个JWT变量。四项均已按本PRD修复并重新验收（Red→Green证据、全部门禁、隔离Compose双向冒烟与Docker零残留见验收报告§7.4/§7.5），修复提交`fix: 补齐服务JWT复审缺漏`。

## 18. 2026-09-04复查记录

2026-09-04复查新发现2项缺漏，本次（2026-09-04）又发现并修复1项Edge构建警告；三项均以新鲜Red→Green修复、全部映射到本PRD既有需求（不新增FR/NFR编号）、全部门禁通过后本PRD状态保持**Accepted**（证据：验收报告§7.7/§7.8）。

1. **可预测模板占位符通过长度校验（SJWT-FR-001、SJWT-AC-010）**：宿主模板`.env.example`的`AGENT_SERVICE_JWT_CURRENT=replace-with-at-least-32-random-bytes`自身不少于32 UTF-8字节、能通过`validateServiceJwtSecrets`，直接复制模板不替换时系统接受公开可预测的服务JWT Secret。修复：模板current/previous改为**空值**（故意设计），注释明确current必须使用密码学安全随机源生成不少于32随机字节、previous仅Secret轮换窗口期设置、两者不得相同；直接复制未填写的模板会被Node启动校验拒绝（未配置模板值=配置缺失），并新增防回归测试。实现：`.env.example`；测试：`src/lib/env/service-jwt-config-contract.test.ts`（12通过，含"未填写模板被`assertServiceJwtStartupConfig`拒绝"）。
2. **PostgreSQL连接缺少确定性超时（SJWT-FR-008/FR-009、SJWT-AC-014、SJWT-NFR-004）**：`services/agent/agent/security/replay.py`的`psycopg.connect`未传`connect_timeout`，Windows防火墙静默丢弃连接时完整重放集成测试通过前5项后挂起。修复：`PostgresReplayGuard`新增`connect_timeout_seconds: int = 5`——正整数在构造期校验（布尔/非整数/非正整数拒绝），`psycopg.connect`显式传入；生产装配保持默认5秒、零新增环境变量；测试不可达连接使用1秒并有界断言（5秒内完成）；连接超时仍统一映射`ServiceAuthStoreUnavailable`（503 `SERVICE_AUTH_STORE_UNAVAILABLE` + no-store），既有异常边界（`JtiReplayConflict`→401、缺表/权限/连接中断→503、业务异常原样传播、JTI与业务写同回滚）不变。完整`test_service_jwt_replay_integration.py` **15项在有界时间完成**（5.27s，不再挂起）。实现：`services/agent/agent/security/replay.py`；测试：`services/agent/tests/test_service_jwt.py`（44通过）与`services/agent/tests/test_service_jwt_replay_integration.py`（15通过）。
3. **Edge bundle中的`process.exit`构建警告（SJWT-AC-018、SJWT-NFR-004/005/006）**：`src/instrumentation.ts`会被Next.js同时构建为Node与Edge运行时bundle，文件静态引用`process.exit(1)`使`npm run build`报告"process.exit is not supported in the Edge Runtime"（Turbopack警告+Ecmascript file had an error），违反AC-018"无未解释skip或warning"。修复：启动校验与进程终止逻辑移入Node专用模块`src/lib/security/service-jwt-startup-node.ts`（配置无效时输出**不含Secret**的稳定错误（NFR-006）并以退出码1终止进程；fail-fast语义不变，Next 16 standalone中仅抛错进程会存活，`/api/health`不构成绕过路径）；`src/instrumentation.ts`的`register`改为async，仅`NEXT_RUNTIME=nodejs`分支**动态import**该Node专用模块，文件本身不再引用进程退出或任何仅Node可用模块（源码契约测试防回归）；Edge运行时不执行启动校验（NFR-005可测试性：运行时路由经vi.mock断言）。`npm run build`**零警告**；standalone四种真实启动验证（无current/31字节current/previous===current均退出1且`/api/health`不可访问、合法合成Secret成功启动Ready）全部使用合成Secret，未读取、未输出任何真实`.env`值。实现：`src/instrumentation.ts`、`src/lib/security/service-jwt-startup-node.ts`；测试：`src/lib/security/service-jwt-startup.test.ts`（9通过，register用例改async）、`src/lib/security/service-jwt-startup-node.test.ts`（5通过）、`src/lib/security/service-jwt-startup-runtime-contract.test.ts`（7通过）。
4. **演练资源零残留（SJWT-NFR-007、SJWT-AC-019）**：上述修复的演练资源全部使用任务专属名称（容器`sjwttimeout-pg`/卷`sjwttimeout-pg-data`/网络`sjwttimeout-net`），创建前记录清单、无条件清理、最终`docker ps -a`/`docker volume ls`/`docker network ls`枚举零残留，`socila-*`容器与持久卷未删除、未重建（验收报告§7.7.6）。

修复提交：`fix: 收紧服务JWT占位符与连接超时`（第1、2项）与`fix: 隔离服务JWT启动校验运行时`（第3项），均推送至`origin/refactor/policy-ops-agent-platform`。真实JWT Secret轮换未执行（非目标）；PR、main merge与tag/Release仍为未来人工动作。
