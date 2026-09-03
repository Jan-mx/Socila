# 09-03 Core与Agent双向服务JWT鉴权 验收报告

> Author: Jan
> Status: Accepted
> Updated: 2026-09-03
> PRD: `docs/prd/09-03-feature-core-agent-service-jwt.md`
> ADR: `docs/refactor/policy-ops-agent/archive/decisions/ADR-0005-内网服务JWT.md`

## 1. 验收环境

- 开发机 Windows 11 / Git Bash，Node v22、Python 3.11（uv 管理，`services/agent` 虚拟环境）。
- 数据库集成与门禁复现：**一次性**演练 PostgreSQL 17 + pgvector 容器（`sjwt-drill-pg`，本地端口 5433，库 `sjwt_drill`，已执行 `npm run db:migrate` 与 `agent.migrate --with-roles`，并完成 seed）；本机保留的 `socila-*` 生产 Compose 栈全程未触碰。演练库为持久复用库：既有 `snapshot-service` 集成测试按 CI 新鲜库语义设计（仅 beforeAll 建数据、无 afterAll 清理），故每轮完整 `test:db`/门禁复现前对 `sjwt_drill` 做全新 drop/create+migrate+roles+seed。
- AC-017 冒烟：**完全隔离**的 Compose 副本（独立项目名、网络、卷、容器名、宿主端口 5442/6391/9010/9011/8081/8443、镜像标签 `web:sjwt-smoke`/`agent:sjwt-smoke`），全部 Secret 为一次性合成值；真实 Secret（`infra/prod/.env`）全程未读取、未输出、未轮换。
- 跨服务真实 TCP：agent 容器内 Python/`PyJWT` 签发 Agent 身份令牌调用 web 容器 `draft-imports`；Next→Agent 方向由挂载仓库真实 `jose` 的一次性 Node 22 容器在隔离栈内部网络上签发 Next 身份令牌直连 `agent:8100`（宿主端口代理在本机不可用，故在容器网络内完成，签发器仍为 Next 侧真实依赖）。
- CI 同构：`.github/workflows/ci.yml` container-gates 增加 SJWT-AC-017 冒烟步骤（agent 容器内 PyJWT 双向 8 断言），`.ci.env` 的 JWT Secret 升级为 ≥32 字节合成值（否则违反 AC-010 模块级校验）。

## 2. 实现范围（SJWT-FR）

| 需求 | 实现 |
| --- | --- |
| SJWT-FR-001 配置 | `src/lib/security/service-jwt-provider.ts`（lazy 单例，构造期校验：current 缺失/＜32字节/previous 相同即抛错）；Python `agent/config.py` + `agent/security/service_jwt.py::validate_service_jwt_secrets`（`agent/api/main.py` 强装配、`agent/worker/tasks.py` 模块导入期校验，worker/beat 进程缺失即启动失败） |
| SJWT-FR-002 算法与Header | Node `jose` `SignJWT.setProtectedHeader({alg:"HS256",typ:"JWT"})` + `jwtVerify` 显式 `algorithms`；Python `pyjwt.encode/decode` 显式 `algorithm="HS256"`、Header `typ` 校验；`alg=none`/其他算法/算法混淆拒绝 |
| SJWT-FR-003 固定claims | 两端固定 `iss/aud/sub` 身份常量 + UUID v4 `jti` + `iat/exp=iat+300`；`clockTolerance=30`；额外 TTL 放宽不可能（exp 由 iat 固定推导） |
| SJWT-FR-004 Next→Agent | `src/lib/security/service-jwt.ts::signNextToken()`；FastAPI `agent/api/app.py` dependency 保护除 `/internal/health` 外全部 `/internal/*`（含 `/internal/ready`） |
| SJWT-FR-005 Agent→Core | `agent/security/service_jwt.py::sign_agent_token()`；`agent/core_client.py` 每次 draft-import 请求前签发；Core `src/app/api/internal/v1/draft-imports/route.ts` 解析请求体前验证固定 Agent 身份 |
| SJWT-FR-006 Header迁移 | 三个 Next 代理路由（proposal 列表、review、draft-import 调用方）改发 `Authorization: Bearer`；`X-Service-Name` 保留为日志上下文，所有鉴权分支删除该 Header 判断 |
| SJWT-FR-007 Secret轮换 | 签发只用 current；验证依次 current→previous；previous 缺失不回退；命中分类（current/previous）仅内部指标，响应与日志不暴露 |
| SJWT-FR-008 JTI防重放 | Core：`service-jwt-replay.repository.ts::consumeServiceJwtJti(tx, claims)` + `materialize.ts` 将 JTI 消费、draft 写入、`agent_materializations` 台账收敛到同一 `withTransaction`；Agent：`agent/security/replay.py::PostgresReplayGuard.with_jti`（BEGIN→删过期→INSERT ON CONFLICT→业务写→COMMIT；冲突/失败整体回滚），接线 `create_run` 与 `create_review_in_tx` |
| SJWT-FR-009 错误与日志 | 两端统一 401 `SERVICE_AUTH_INVALID`（缺失/格式/签名/算法/claims/过期/超前/重放不区分）；重放存储不可用 503 `SERVICE_AUTH_STORE_UNAVAILABLE`；均 `Cache-Control: no-store`；日志仅方向/结果/issuer/subject/jti/失败类别，无令牌、Header、Secret 或签名片段 |

SJWT-NFR 对应：NFR-001 两端显式固定 HS256（无算法协商）；NFR-002 协议常量 `300s/30s` 集中在两端常量与契约向量（漂移由 guard 测试拦截）；NFR-003 启动期字节长度与相同值校验（AC-010）；NFR-004 失败关闭（验证异常/存储异常一律 401/503，绝不回退 Header 信任，无 JWT 旧调用立即失败）；NFR-005 Clock/UUID 可注入（`ServiceJwt({now, uuid})`、Python `ServiceJwt(secret, now=...)`），测试零真实等待；NFR-006 零泄漏（§5）。

## 3. TDD 执行

- 单元层 Red 先行：`src/lib/security/service-jwt.test.ts`（28 用例）与 `services/agent/tests/test_service_jwt.py` 在目标模块不存在时运行失败（模块缺失/断言失败），随后最小实现转 GREEN。
- 契约与集成层（跨语言向量、JTI 同事务消费、路由鉴权矩阵）随对应实现切片（`service-jwt-replay.repository.ts`、`agent/security/replay.py`、路由接线）建立测试并全量通过；实现与测试路径见 `reports/traceability.md` 09-03 SJWT 行。

## 4. 验收证据（新鲜执行，2026-09-03）

### 4.1 Node 单元与契约（SJWT-FR-001～003/007/009）

```
npm test
Test Files  33 passed (33)
Tests       293 passed (293)      # skip 0
```

其中 `service-jwt.test.ts` 28 用例（current/previous、alg=none、claims 逐字段、30 秒边界内/外、TTL>300 拒绝、previous 命中分类）；`service-jwt-vectors.contract.test.ts` 9 用例（Python 签名令牌 4 个方向全验证+命中分类、Node 自签自检、拒绝向量双向失败、协议常量漂移守卫）。

### 4.2 Python 单元与契约（SJWT-FR-001～004/007/009）

```
cd services/agent && uv run pytest -q -m "not integration"
81 passed in …                     # skip 0、warning 0
```

其中 `test_service_jwt.py`（签发/验证/固定 claims/边界时钟/统一失败）与 `test_service_jwt_vectors.py` 9 用例（互验 Node 签名令牌、`verified_by` 分类、拒绝向量、协议常量守卫）。

### 4.3 Node 数据库集成（SJWT-FR-008、AC-011～015）

```
SSP_TEST_DATABASE_URL=… npm run test:db
Test Files  9 passed (9)
Tests       35 passed (35)         # skip 0
```

`service-jwt-replay.integration.test.ts` 8 用例：首次消费+行内容（issuer/subject/audience/expiresAt）、重复 JTI 拒绝、8 路 `Promise.all` 并发同 JTI 恰好一个成功、业务回滚后 JTI 同回滚（新 bundle 成功且台账 1 行）、过期行机会式清理、存储故障映射 `SERVICE_AUTH_STORE_UNAVAILABLE`、`JtiReplayConflictError.jti` 载荷、身份常量一致性。
`draft-imports-route.integration.test.ts` 4 用例（路由级，位于 `src/server/modules/agent-integration/__tests__/`，模块边界规则下由 agent-integration 模块持有路由集成测试）：draft-imports 路由矩阵（无鉴权 401+no-store、仅 X-Service-Name 401、伪造 Secret 401、错误方向 Next 令牌 401、合法 Agent 令牌 200+台账行、同令牌重放 401 且无台账、重放再试 401）。

### 4.4 Python 数据库集成（SJWT-FR-008、AC-011～015）

```
cd services/agent && uv run pytest -q -m integration
16 passed                          # skip 0
```

`test_service_jwt_replay_integration.py` 11 用例：`PostgresReplayGuard` 首次消费行内容、重复 `JtiReplayConflict.jti`、4 线程×8 并发恰好一个成功、业务失败 JTI 同回滚、过期清理、不可达 URL→`ServiceAuthStoreUnavailable.public_code`；FastAPI 真实装配（`PostgresRepositories`+guard+`ServiceJwt`）：`/internal/health` 豁免、`/internal/ready` 401/200、create_run 鉴权矩阵（无鉴权/仅 Header/伪造/错误方向均 401）、有效令牌 200 入库+重放 401 无副作用+新 JTI 同幂等键 200 幂等、存储不可用 503+no-store、`create_review_in_tx` 与 JTI 同事务（审核行+run 状态、重放冲突、失败回滚）。

### 4.5 Auth E2E（回归，`npm run test:e2e:auth`）

```
10 passed (1.1m)                   # standalone 构建 + 全新 PG17 库 + mock 模型
```

双角色鉴权全流程（注册/登录/改密/禁用/助手回复）在 SJWT 接线后无回归。

### 4.6 AC-017 完整 Compose 双向冒烟（真实 TCP）

隔离栈 8 服务全部 running、6 健康检查 healthy；容器网络内 Node 22（挂载仓库真实 `jose`，Next 侧签发器）→ `agent:8100` 与 agent 容器内 PyJWT → `web:3000` 双向：

- Next→Agent：`/internal/health` 无 JWT 200（唯一豁免）、`/internal/ready` 无 JWT 401、仅 `X-Service-Name` 401、合法 Next 令牌 200。
- Agent→Core：`draft-imports` 仅 `X-Service-Name`（伪造服务名）401、合法 Agent 令牌 200 且 `agent_materializations` 台账入库、同 JTI 重放 401 无副作用、Next 方向令牌（错误方向）401。
- 冒烟后 `down -v` 删除全部临时容器/卷/网络，宿主无残留。

### 4.7 全项目门禁（SJWT-AC-018，本地新鲜复现）

| 门禁 | 结果 |
| --- | --- |
| `npm test`（单元，零数据库） | PASS，293 通过、skip 0 |
| `npx tsc --noEmit` | PASS，退出 0 |
| `npx eslint src` | PASS，退出 0 |
| `npm run build`（standalone） | PASS，退出 0 |
| `npm run test:db`（演练 PG17） | PASS，9 文件/35 通过、skip 0 |
| `uv run ruff check .` / `mypy agent` | PASS，0 问题 |
| `uv run pytest -m "not integration"` | PASS，81 通过、skip 0 |
| `uv run pip-audit` | PASS，无可知漏洞（本地项目自身 not found on PyPI 为预期提示） |
| `uv run pytest -m integration`（演练库） | PASS，16 通过、skip 0 |
| `npm run test:e2e:auth` | PASS，10 通过（1.1m） |
| AC-017 Compose 双向冒烟 | PASS（§4.6） |
| `node scripts/scan-secrets.mjs --all` | PASS，无命中（真实 Secret 未进入任何被扫描产物） |
| Gitleaks 完整历史 | PASS，no leaks（仅 5 个已核实 fingerprint 基线） |

GitHub-hosted 六项 checks 留待未来人工发布流程产生（分支推送不触发运行），本地复现全部退出 0、零未解释 skip/warning。

### 4.8 CI workflow（SJWT-AC-017 固化）

container-gates 在健康检查后新增 agent 容器内 PyJWT 双向冒烟（health 豁免、ready 401×2、ready 200、draft-imports 伪造名 401/合法 200 入台账/重放 401/错误方向 401，共 8 断言）；YAML 静态校验通过。

## 5. 零泄漏核查（SJWT-AC-016）

- 全部测试断言与测试产物不含完整令牌、`Authorization` Header、Secret 或签名片段；测试使用合成 Secret 与确定性/随机 JTI。
- `testdata/service-jwt-vectors.json` 为**非真实**固定向量（合成 Secret，`fixedNow=1760000000`），是 Node/Python 互验的契约事实源。
- 失败响应统一 `{"error":"SERVICE_AUTH_INVALID"}` / `{"error":"SERVICE_AUTH_STORE_UNAVAILABLE"}`，不区分具体失败原因，`Cache-Control: no-store`。
- 重放表仅存 JTI 与 claims 元数据（`issuer/subject/audience/expires_at`），无令牌/签名（两端集成测试断言行内容）。
- `scan-secrets --all` 与 Gitleaks 完整历史均无命中；`infra/prod/.env` 真实 JWT Secret（第 15-16 行）全程未读取、未输出、未轮换。

## 6. 验收结论

原执行结论为PASS，覆盖SJWT-FR-001～009、SJWT-NFR-001～006、SJWT-AC-001～018。2026-09-03复审新增SJWT-NFR-007/SJWT-AC-019演练资源清理规则，并发现§7所列四个实现缺漏；在缺漏修复、完整门禁重跑和后续修复提交推送前，本Feature状态为**Review Reopened**。真实JWT Secret轮换未执行（非目标）；PR、main merge与tag/Release仍为未来人工动作。

**复审缺漏已全部修复并重新验收（§7.4），本Feature状态恢复为Accepted**：四项缺漏各自取得Red→Green证据，全部项目门禁在修复后的全新演练库上重跑通过（§7.4重验表），真实启动拒绝（D2/E2）与隔离Compose双向冒烟+零残留证据齐备（§7.5）。真实JWT Secret轮换仍未执行（非目标）；PR、main merge与tag/Release仍为未来人工动作。

## 7. 2026-09-03复审

### 7.1 演练资源清理（SJWT-NFR-007、SJWT-AC-019）

- 复审发现`sjwt-drill-pg`仍在运行并挂载一个任务匿名卷，说明原验收未覆盖数据库演练容器的最终清理。
- 已按精确名称执行容器及匿名卷删除；复核未发现`sjwt-*`任务容器、网络或关联匿名卷残留，且`socila-*`容器、`socila_pg-data`和`socila_minio-data`均未删除或重建。
- PRD已增加无条件`finally`/`if: always()`清理和Docker对象零残留验收；后续任何演练残留都必须阻止提交和完成声明。

### 7.2 开放缺漏（已于§7.4全部关闭）

1. FastAPI使用逐路由鉴权，但`/internal/docs`仍可在无JWT时返回200，与“`/internal/health`唯一免JWT内部端点”不一致；必须关闭生产文档端点或把文档/OpenAPI入口纳入同一鉴权边界，并增加拒绝测试。
2. Web侧`getServiceJwt()`为惰性装配，Compose中的`AGENT_SERVICE_JWT_CURRENT`也不是必填插值；缺失或过短Secret时Web仍可启动并通过`/api/health`，不满足SJWT-FR-001/SJWT-AC-010的启动失败要求。必须增加Web启动期校验和真实启动拒绝测试。
3. Python`PostgresReplayGuard`只将`OperationalError`/`InterfaceError`映射为503；缺表、权限不足等重放存储不可用错误会冒泡为500，不满足SJWT-FR-009/SJWT-AC-014。必须扩充安全的数据库异常映射，并覆盖缺表/权限错误测试。
4. 宿主机权威模板`.env.example`及当前`.env.local`均未声明`AGENT_SERVICE_JWT_CURRENT/PREVIOUS`；直接运行宿主Next.js时，Agent代理首次签发会因缺少Secret失败。必须在可提交模板补齐两个变量，并由运维安全同步实际Secret到被忽略的`.env.local`，不得在提交或日志中输出取值。

### 7.3 Git交付

- JWT主体实现已由`35d673c feat: 接通Core与Agent服务JWT鉴权`提交并推送，当前HEAD与upstream一致。
- 本复审发现属于提交后的follow-up；修复上述缺漏、按PRD重跑全部门禁并推送独立修复提交前，不得把Feature重新标记Accepted。

### 7.4 四项缺漏修复与Red→Green证据（2026-09-03）

**缺漏一：关闭FastAPI文档入口（SJWT-FR-004/FR-009、AC-015）**

- Red：新增测试`test_docs_and_openapi_entries_closed`首跑失败——`/internal/docs 必须404（当前 200）`。
- 实现：`agent/api/app.py`装配改为`FastAPI(docs_url=None, redoc_url=None, openapi_url=None)`（生产与测试装配一致，不新增环境开关，最小实现）。
- Green：`services/agent/tests/test_service_jwt.py` 35 passed，含新断言：`/internal/docs`、`/docs`、`/redoc`、`/openapi.json`无JWT一律404；`/internal/health`无JWT仍200（唯一豁免）；`/internal/ready`无JWT 401 `SERVICE_AUTH_INVALID` + `Cache-Control: no-store`。

**缺漏二：Web启动期拒绝无效JWT Secret（SJWT-FR-001/AC-010、NFR-003/006）**

- Red：`service-jwt-startup.test.ts`创建时模块缺失（`Failed to load url ../../instrumentation … Does the file exist?`）；配置契约测试首跑6项失败（Compose非必填插值、`.env.example`未声明变量）。
- 实现：
  - `src/lib/security/service-jwt-provider.ts`新增`assertServiceJwtStartupConfig()`：current缺失、为空、少于32 UTF-8字节或与previous相同即抛错，错误消息不含Secret内容（NFR-006）；`getServiceJwt()`改经同一校验，消除惰性装配绕过。
  - 新增`src/instrumentation.ts`：Next.js Node运行时启动入口（next dev/start与standalone server.js均在此执行）；校验失败时显式`process.exit(1)`——实测Next 16 standalone中register()抛错仅触发unhandledRejection且进程继续存活，只有显式退出才能保证启动失败；`/api/health`不构成绕过路径。
  - `infra/prod/docker-compose.yml`：web/agent/worker/beat的`AGENT_SERVICE_JWT_CURRENT`改为必填插值`${…:?…}`；实测缺失`docker compose config`退出1、空值退出1、合法合成值退出0（§7.5 S1/S1b复验）。
  - `playwright.config.ts` webServer注入固定合成current（≥32字节）供E2E使用。
  - 实测`next build`不调用`register()`（干净环境构建退出0）→Dockerfile构建层无需合成占位（PRD条件要求未触发）。
- Green：
  - `src/lib/security/service-jwt-startup.test.ts` 9 passed（断言函数5例：缺失/过短/previous相同/合法/零泄漏；register入口4例：exit(1)语义×3、edge运行时豁免）。
  - `src/lib/env/service-jwt-config-contract.test.ts` 11 passed（4消费者必填插值、4消费者previous插值、其他服务零JWT变量、`.env.example`双变量声明且current占位符≥32字节）。
  - 真实启动拒绝（standalone产物，全新构建）：**D2**无JWT→`exit 1` + `[service-jwt] startup validation failed, refusing to start: AGENT_SERVICE_JWT_CURRENT is required`；**E2**合法合成Secret→进程存活至timeout（exit 124）、零拒绝输出、服务就绪（`✓ Ready`）。

**缺漏三：Python重放存储异常映射（SJWT-FR-008/FR-009、AC-013/014）**

- Red（演练库真实PG17）：缺表→`psycopg.errors.UndefinedTable`原样冒泡（应503）；无表权限→`InsufficientPrivilege: permission denied for schema agent`原样冒泡；缺表路由测试经ASGITransport异常传播（应503响应）。
- 实现：`agent/security/replay.py::PostgresReplayGuard.with_jti`以`replay_phase`标记区分重放SQL阶段（连接/事务初始化/删除过期JTI/插入JTI）与业务阶段（`work_fn`）：重放阶段任意`psycopg.Error`（缺表42P01、权限不足42501、连接中断等）统一映射`ServiceAuthStoreUnavailable`；`JtiReplayConflict`单独传播（路由统一401，FR-008/AC-012）；业务阶段异常一律原样传播、绝不包装为存储不可用（AC-013）；任意失败在`with conn.transaction()`内整体回滚JTI与业务写。
- Green：`services/agent/tests/test_service_jwt_replay_integration.py` 15 passed，新增4例：缺表→`ServiceAuthStoreUnavailable`、无权限角色→`ServiceAuthStoreUnavailable`、业务SQL错误原样传播（非`ServiceAuthStoreUnavailable`实例）且JTI同回滚+修复后相同JTI可重新执行、缺表经真实路由→503 `SERVICE_AUTH_STORE_UNAVAILABLE` + no-store；并修复`_jti`生成bug（两位tag产生13位UUID尾组触发22P02）。

**缺漏四：宿主机JWT配置（SJWT-FR-001、NFR-005/006）**

- `.env.example`新增`AGENT_SERVICE_JWT_CURRENT=replace-with-at-least-32-random-bytes`与`AGENT_SERVICE_JWT_PREVIOUS=`（注释：current必填≥32随机字节、previous仅轮换窗口期、两者不得相同、缺失或无效时进程启动失败且`/api/health`不可绕过）；`src/lib/env/config-contract.test.ts`根模板期望键8→9。
- `infra/prod/.env`现有JWT值由本地一次性脚本安全同步到Git忽略的`.env.local`（**非轮换、未生成新Secret**）；验证仅输出：是否设置（True/True）、UTF-8字节长度（48/48，达标）、两值是否不同（True）——实际值零输出。`.env.local`与`infra/prod/.env`未暂存、未提交。
- Green：`service-jwt-config-contract.test.ts` + `config-contract.test.ts`合计34 passed。

### 7.5 重新验收（2026-09-03修复后新鲜执行）

**演练环境（SJWT-NFR-007清单先行）**：任务专属容器`sjwfx-pg`（pgvector/pgvector:pg17，127.0.0.1:5433）、卷`sjwfx-pg-data`、网络`sjwfx-net`；创建前记录精确清单，最终按清单精确删除（§7.6）。冒烟另使用任务专属项目`sjwtfxsmoke`（容器/卷/网络均`sjwtfxsmoke_*`前缀，宿主端口18080/18443/18100/16391，合成Secret）。

| 步骤 | 命令 | 结果 |
| --- | --- | --- |
| 1 | `npm test` | PASS，35文件/313通过、skip 0 |
| 2 | `npx tsc --noEmit` | PASS，退出0 |
| 3 | `npx eslint src` | PASS，退出0 |
| 4 | `npm run build`（standalone） | PASS，退出0 |
| 5 | `uv run pytest -q tests/test_service_jwt.py` + 集成目标文件 | PASS，35 passed / 15 passed |
| 6 | `uv run ruff check .` | PASS，0错误 |
| 7 | `uv run mypy agent tests` | PASS，48文件0错误（修复4处既有测试类型错误：`fetchone()`None守卫×3、`ServiceJwt\|None`非空绑定×1，未降低任何检查） |
| 8 | `uv run pytest -q -m "not integration"` | PASS，100通过、skip 0 |
| 9 | `uv run pip-audit` | PASS，无可知漏洞 |
| 11 | 全新演练库：drop/create `sjwfx_drill` + core `db:migrate`×2（幂等）+ agent `migrate --with-roles`×2（幂等）+ seed + Jan管理员引导 | PASS，各步退出0 |
| 11 | `npm run test:db`（演练库） | PASS，9文件/35通过、skip 0 |
| 11 | `uv run pytest -q -m integration`（演练库） | PASS，20通过、skip 0（replay 15 + RAG 3 + postgres集成 2） |
| 12 | `npm run test:e2e:auth`（演练库+standalone+mock） | PASS，10通过（37.4s） |
| 13 | 隔离Compose双向JWT冒烟（`sjwtfxsmoke`项目，§7.5.1） | PASS，10断言+台账恰好1行 |
| 14 | `node scripts/scan-secrets.mjs` | PASS，26个候选文件零命中 |
| 15 | `node scripts/scan-secrets.mjs --all` | PASS，555个候选文件零命中 |
| 16 | Docker零任务残留核查（`docker ps -a`/`volume ls`/`network ls`） | PASS，任务资源零残留、`socila-*`未动（§7.6） |

#### 7.5.1 隔离Compose双向JWT冒烟（SJWT-AC-017、AC-015、NFR-007）

镜像`web:sjwtfxsmoke`/`agent:sjwtfxsmoke`（全新构建，镜像内容验证含`instrumentation`与`replay_phase`/`docs_url=None`）；完全隔离栈（独立项目/容器/卷/网络/宿主端口，合成Secret≥32字节）：

- S1 `docker compose config`（合法env）退出0；**S1b 缺`AGENT_SERVICE_JWT_CURRENT`的env → config退出1**（`required variable AGENT_SERVICE_JWT_CURRENT is missing a value`）——必填插值在Compose层生效。
- S2~S6 基础设施与应用栈启动：postgres healthy、web `/api/health` ok（**web容器启动本身即证明启动期校验通过**——无效Secret会`exit 1`）、agent healthy。
- S7 agent容器内PyJWT双向10断言全过：`/internal/health`无JWT 200（唯一豁免）、`/internal/ready`无JWT 401、仅`X-Service-Name` 401、合法Next→Agent 200、**`/internal/docs`无JWT 404（缺漏一）、`/openapi.json`无JWT 404（缺漏一）**、Agent→Core仅伪造服务名401、合法Agent→Core 200、同JTI重放401、错误方向（Next令牌到Core）401。
- S8 台账`agent_materializations`中三个冒烟幂等键合计**恰好1行**（仅合法调用入库，重放与错误方向零副作用）。
- S9 无条件`docker compose down -v`（仅作用于`sjwtfxsmoke`项目）。

### 7.6 演练资源清理与零残留（SJWT-NFR-007、SJWT-AC-019）

- 清理前基线已记录（容器/卷/网络全量快照）；冒烟结束后`sjwtfxsmoke_*`容器0、卷0、网络0。
- 演练库资源按清单精确删除：`docker rm -f sjwfx-pg`、`docker volume rm sjwfx-pg-data`、`docker network rm sjwfx-net`（退出0）。
- 最终枚举：`sjwfx*`容器/卷/网络全部为0；清理后容器/卷/网络快照与清理前基线**逐行一致**（唯一差异为本任务自身资源已不存在）。
- `socila-*`九个容器状态与基线完全一致（均未运行、未被删除或重建）；`socila_pg-data`、`socila_minio-data`、`socila_caddy-data`卷均保留。
- 真实Secret（`infra/prod/.env`）全程未读取、未输出、未轮换；`.env.local`与`infra/prod/.env`未进入暂存区。
