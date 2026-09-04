# 09-03 Core与Agent双向服务JWT鉴权 验收报告

> Author: Jan
> Status: Accepted
> Updated: 2026-09-04
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

## 7.7 模板占位符与连接超时复查修复（2026-09-04，新鲜Red→Green）

### 7.7.1 复查发现

1. **可预测模板占位符通过校验**：宿主模板`.env.example`的`AGENT_SERVICE_JWT_CURRENT=replace-with-at-least-32-random-bytes`自身超过32 UTF-8字节、能通过`validateServiceJwtSecrets`——用户直接复制模板而不替换时，系统接受公开、可预测的服务JWT Secret。
2. **PostgreSQL连接缺少确定性超时**：`services/agent/agent/security/replay.py`的`psycopg.connect(self._database_url)`未传`connect_timeout`；生产`AGENT_DATABASE_URL`与测试`UNREACHABLE_URL`均受影响。Windows防火墙静默丢弃连接时，完整集成测试通过前5项后长期挂起（PostgreSQL侧无测试连接，确认卡在客户端建连阶段）。

### 7.7.2 修复一：模板空值+启动强制校验（SJWT-FR-001/AC-010）

- Red：先修改`src/lib/env/service-jwt-config-contract.test.ts`——断言模板current/previous为空值（删除“模板占位符≥32字节即可”的错误契约），新增防回归测试（模板值直接经`assertServiceJwtStartupConfig`断言必须拒绝）。首跑**2失败/10通过**，失败原因恰为：`expected 'replace-with-at-least-32-random-bytes' to be ''`（模板current非空）与`expected [Function] to throw an error`（未填写模板值可通过启动校验）。
- 实现：`.env.example`的`AGENT_SERVICE_JWT_CURRENT=`与`AGENT_SERVICE_JWT_PREVIOUS=`改为空值；注释明确current必须使用密码学安全随机源生成不少于32随机字节、previous仅Secret轮换窗口期设置、两者不得相同、模板值为空是故意设计（未配置时启动必须失败，`/api/health`不可绕过）。
- Green：`service-jwt-config-contract.test.ts` 12通过；`service-jwt-startup.test.ts` 9通过；`src/lib/env/config-contract.test.ts` 11通过（模板键集合契约不受空值影响）。
- 当前真实`.env.local`与`infra/prod/.env`中的有效JWT Secret未修改、未轮换、零输出；未生成、未输出任何真实Secret；未引入随机熵检测（只通过“模板为空+启动强制校验”解决问题，避免过度设计）。

### 7.7.3 修复二：PostgresReplayGuard确定性连接超时（SJWT-FR-008/FR-009/AC-014）

- Red：
  - 单元（`tests/test_service_jwt.py`新增9例）：默认`connect_timeout=5`显式传入`psycopg.connect`（connect替身记录调用参数）、显式`connect_timeout_seconds=1`生效、`0`/`-1`/`True`/`False`/`2.5`/`"1"`/`None`构造期拒绝。首跑**9失败**：覆盖与非法值用例为`TypeError: PostgresReplayGuard.__init__() got an unexpected keyword argument 'connect_timeout_seconds'`，确认现有构造器不支持超时参数；默认用例因`psycopg.connect`未收到`connect_timeout`断言失败。
  - 集成（`tests/test_service_jwt_replay_integration.py`两处不可达连接改用`connect_timeout_seconds=1`+5秒有界断言）：首跑**2失败**（同一TypeError），同组其余store-unavailable 503映射2例通过（既有异常边界未变）。
- 实现：`PostgresReplayGuard.__init__(database_url, connect_timeout_seconds: int = 5)`——必须为正整数（布尔显式拒绝，非整数/非正整数构造期`ValueError`）；`psycopg.connect`显式传入`connect_timeout=connect_timeout_seconds`。生产装配`agent/api/main.py`保持默认5秒，零改动、不新增环境变量。
- 异常边界不变：连接超时与其他连接失败统一映射`ServiceAuthStoreUnavailable`（503 `SERVICE_AUTH_STORE_UNAVAILABLE` + `Cache-Control: no-store`）；`JtiReplayConflict`继续单独传播→401；缺表/权限不足/连接中断继续503；`work_fn`业务异常原样传播不包装；任意失败JTI与业务写同事务回滚（既有15例全量覆盖）。
- Green：单元`tests/test_service_jwt.py` **44通过**（既有35+新增9）；`ruff check .` 0问题；`mypy agent tests` 48文件0错误。

### 7.7.4 演练环境与完整集成（SJWT-NFR-007清单先行）

- 任务专属资源清单（创建前记录）：容器`sjwttimeout-pg`、卷`sjwttimeout-pg-data`、网络`sjwttimeout-net`；镜像`pgvector/pgvector:pg17`，127.0.0.1:5433，库`sjwttimeout_drill`；`agent.migrate --with-roles`重复执行2次（幂等，0001/0003/0006/0007+角色0002）；合成演练口令仅写入临时文件（`chmod 600`，用后即删），任何报告/日志零输出。
- 完整集成`test_service_jwt_replay_integration.py`：**15通过（5.27s，不再挂起）**；不可达连接测试实际完成时间：`test_guard_store_unavailable_category` 2.11s、`test_route_store_unavailable_503` 2.11s（1秒connect超时+客户端栈开销，均满足“5秒内有界”断言；未使用依赖墙钟的过紧断言）。

### 7.7.5 全部门禁重验（2026-09-04新鲜执行）

| # | 命令 | 结果 |
| --- | --- | --- |
| 1 | `npx vitest run src/lib/env/service-jwt-config-contract.test.ts` | PASS，12通过，退出0 |
| 2 | `npx vitest run src/lib/security/service-jwt-startup.test.ts` | PASS，9通过，退出0 |
| 3 | `npm test` | PASS，35文件/314通过、skip 0，退出0 |
| 4 | `npx tsc --noEmit` | PASS，退出0 |
| 5 | `npx eslint src` | PASS，退出0 |
| 6 | `npm run build`（standalone） | PASS，退出0 |
| 8 | `uv run pytest -q tests/test_service_jwt.py` | PASS，44通过，退出0 |
| 9 | `uv run pytest -q -m integration tests/test_service_jwt_replay_integration.py` | PASS，15通过（5.27s、不再挂起），退出0 |
| 10 | `uv run pytest -q -m "not integration"` | PASS，91通过、20 deselected（integration）、skip 0，退出0 |
| 11 | `uv run ruff check .` | PASS，0问题，退出0 |
| 12 | `uv run mypy agent tests` | PASS，48文件0错误，退出0 |
| 13 | `uv run pip-audit` | **环境阻塞（未通过、未声称PASS）**：6次尝试（经代理5次+直连1次）全部`ConnectionResetError(10054)`——本地代理127.0.0.1:7897重置到pypi.org的TLS握手，直连同样被重置，`curl pypi.org`同样schannel握手失败；本任务未改动`pyproject.toml`/`uv.lock`（Git零diff），审计对象集与2026-09-03新鲜PASS（无可知漏洞）完全一致 |
| 14 | `docker compose --env-file infra/prod/.env -f infra/prod/docker-compose.yml config --quiet` | PASS，退出0 |
| 15 | `node scripts/scan-secrets.mjs` | PASS，10个候选文件零命中，退出0 |
| 16 | `node scripts/scan-secrets.mjs --all` | PASS，558个候选文件零命中，退出0 |
| 17 | Docker任务资源零残留核查 | PASS（§7.7.6） |

### 7.7.6 演练资源清理与零残留（SJWT-NFR-007、SJWT-AC-019）

- 无条件清理（创建脚本ERR陷阱+最终显式清理双保险）：`docker rm -f sjwttimeout-pg`、`docker volume rm sjwttimeout-pg-data`、`docker network rm sjwttimeout-net`全部退出0；临时口令文件与演练脚本已删除。
- 最终枚举（`docker ps -a`/`docker volume ls`/`docker network ls`）：`sjwttimeout-*`容器0/卷0/网络0；`sjwt*`全量（含历史演练名）容器/卷/网络均为0。
- 清理前后容器/卷/网络全量快照逐行一致；`socila-*`九个容器、`socila_pg-data`、`socila_minio-data`、`socila_caddy-data`卷与`socila_edge`/`socila_internal`网络均保留，未删除、未重建。
- 真实JWT Secret（`infra/prod/.env`）全程未读取、未输出、未轮换；`.env.local`与`infra/prod/.env`未进入暂存区。

### 7.7.7 结论

两项复查发现均以新鲜Red→Green证据修复：模板占位符收紧（空值+启动强制校验防回归）与PostgresReplayGuard确定性连接超时（默认5秒/测试1秒、超时统一503映射、异常边界不变）。全部门禁除`pip-audit`因本机到PyPI网络被重置而环境阻塞（依赖集零变化，见§7.7.5第13行）外全部新鲜PASS。本Feature状态保持**Accepted**（SJWT-FR-001～009、SJWT-NFR-001～007、SJWT-AC-001～019）；修复提交`fix: 收紧服务JWT占位符与连接超时`推送至`origin/refactor/policy-ops-agent-platform`。真实JWT Secret轮换仍未执行（非目标）；PR、main merge与tag/Release仍为未来人工动作。

## 7.8 Edge instrumentation构建警告修复（2026-09-04，新鲜Red→Green）

### 7.8.1 发现（SJWT-AC-018）

`npm run build`（退出0）输出Turbopack警告——`src/instrumentation.ts`被Next.js同时构建为Node与Edge运行时bundle，文件静态引用`process.exit(1)`（第21行）使Edge bundle引用Node专用API：

```text
Turbopack build encountered 1 warning:
./src/instrumentation.ts:21:5
Warning: A Node.js API is used (process.exit at line: 21) which is not supported in the Edge Runtime.
Ecmascript file had an error
```

违反SJWT-AC-018"全部退出0且无未解释skip或warning"。既有证据（§7.4缺漏二）确认必须保留启动期fail-fast与显式退出（Next 16 standalone中register仅抛错只触发unhandledRejection且进程存活），故修复方向是运行时隔离而非删除校验。

### 7.8.2 TDD Red（先测试后实现，2026-09-04）

- 新增`src/lib/security/service-jwt-startup-node.test.ts`（5例，Node专用模块行为）与`src/lib/security/service-jwt-startup-runtime-contract.test.ts`（7例，源码契约+运行时路由）；既有`src/lib/security/service-jwt-startup.test.ts`的4个register用例由同步断言改为async契约（`register()`改async）。
- 首跑**8失败/8通过**，失败原因恰为目标行为缺失：
  - Node模块测试整文件`Cannot find module './service-jwt-startup-node' ... Does the file exist?`（Node专用模块不存在，5例）；
  - 源码契约：`expected 'import { assertServiceJwtStartupConfi…' not to match /process\.exit/`（instrumentation.ts确实含`process.exit`）、`expected null not to be null`（无动态import）、`ENOENT ... service-jwt-startup-node.ts`（模块文件不存在）；
  - 运行时路由：`expected "spy" to be called 1 times, but got 0 times`（nodejs分支未调用Node启动模块）；
  - 既有register用例：同步`register()`抛`Error: process.exit called with 1`（来自`src/instrumentation.ts:21:13`）或`TypeError: You must provide a Promise to expect() when using .resolves, not 'undefined'`（register尚非async）。
- 构建Red证据：修复前`npm run build`即上述"Turbopack 1 warning"（§7.8.1）。

### 7.8.3 实现（最小修复，运行时隔离）

- 新增`src/lib/security/service-jwt-startup-node.ts`：导出`runServiceJwtStartupCheck()`——调用`assertServiceJwtStartupConfig()`；无效配置时输出稳定错误`[service-jwt] startup validation failed, refusing to start: <message>`（不含Secret，SJWT-NFR-006）并`process.exit(1)`（fail-fast语义与§7.4缺漏二一致，`/api/health`不构成绕过路径）；有效配置不退出。
- 重写`src/instrumentation.ts`：`register`改为`async`；`NEXT_RUNTIME`非`nodejs`立即返回（Edge运行时不执行启动校验、不接触Node专用模块）；仅nodejs分支经动态`import("@/lib/security/service-jwt-startup-node")`加载并调用。文件本身不再引用进程退出或任何仅Node可用模块（源码契约测试防回归）。
- 未退回"只抛异常"实现（既有standalone实测证据）；未删除启动期fail-fast、未改为首次路由调用时校验；未影响Edge运行时、NextAuth与公开路由（§7.8.4/§7.8.5）。

### 7.8.4 Green（新鲜执行）

- 三个启动测试文件全部通过：`service-jwt-startup-node.test.ts` 5通过、`service-jwt-startup-runtime-contract.test.ts` 7通过（源码契约4例：不引用process.exit/无node:静态导入/动态import位于nodejs守卫之后/Node模块承载退出码1；运行时路由3例：edge不加载、NEXT_RUNTIME未设置不加载、nodejs恰好调用1次）、`service-jwt-startup.test.ts` 9通过（5例断言函数不变+4例async register）。
- 生产构建零警告：`npm run build`退出0，输出中无任何warning/error行（对比修复前"Turbopack build encountered 1 warning"消失）。
- Node全量门禁：`npm test` **37文件/326通过**、skip 0（35文件/314通过基线+2个新测试文件12例）；`npx tsc --noEmit`退出0；`npx eslint src`退出0。

### 7.8.5 standalone真实启动验证与全部门禁重验（2026-09-04新鲜执行）

standalone产物（`.next/standalone/server.js`，全新构建，端口3900～3903，全合成Secret）：

| 场景 | 配置 | 结果 |
| --- | --- | --- |
| S1 无`AGENT_SERVICE_JWT_CURRENT` | 干净环境（变量未设置） | 进程**退出码1**；`refusing to start: AGENT_SERVICE_JWT_CURRENT is required`；`/api/health`连接不可达（进程已终止，无绕过路径）；日志零Secret |
| S2 current仅31字节 | 31字节合成值 | 进程**退出码1**；`refusing to start: AGENT_SERVICE_JWT_CURRENT must be at least 32 UTF-8 bytes`；日志零Secret |
| S3 previous===current | 两变量同一48字节合成值 | 进程**退出码1**；`refusing to start: AGENT_SERVICE_JWT_PREVIOUS must differ from AGENT_SERVICE_JWT_CURRENT`；日志零Secret |
| S4 合法合成Secret | current+previous各48字节合成值且不同 | 进程**存活**、`✓ Ready`、`Local: http://127.0.0.1:3903`、零拒绝输出（合法配置不终止进程） |

全程只使用合成Secret，未读取、未输出、未轮换任何真实`.env`值。

全部门禁（本次任务命令序列新鲜执行）：

| # | 命令 | 结果 |
| --- | --- | --- |
| 1 | `npx vitest run src/lib/security/service-jwt-startup.test.ts` | PASS，9通过，退出0 |
| 2 | `npx vitest run src/lib/env/service-jwt-config-contract.test.ts` | PASS，12通过，退出0 |
| 3 | `npm test` | PASS，**37文件/326通过**、skip 0（35文件/314基线+2个新测试文件12例），退出0 |
| 4 | `npx tsc --noEmit` | PASS，退出0 |
| 5 | `npx eslint src` | PASS，退出0 |
| 6 | `npm run build`（standalone） | PASS，退出0，**输出零warning/error行**（§7.8.1警告消失） |
| 7 | standalone真实启动验证（S1～S4） | PASS（上表） |
| 8 | `uv run pytest -q -m "not integration"` | PASS，91通过、20 deselected（integration）、skip 0，退出0 |
| 9 | `uv run ruff check .` | PASS，0问题，退出0 |
| 10 | `uv run mypy agent tests` | PASS，48文件0错误，退出0 |
| 11 | `docker compose --env-file infra/prod/.env -f infra/prod/docker-compose.yml config --quiet` | PASS，退出0 |
| 12 | `node scripts/scan-secrets.mjs` | PASS，候选文件零命中，退出0 |
| 13 | `node scripts/scan-secrets.mjs --all` | PASS，全部候选文件零命中，退出0 |
| 14 | Docker任务资源零残留核查（`docker ps -a`/`volume ls`/`network ls`） | PASS，`sjwt*`容器/卷/网络全0（本轮无新建演练设施）；`socila-*`九个容器与`socila_pg-data`/`socila_minio-data`/`socila_caddy-data`卷与基线一致，未删除、未重建 |

Python侧未改动代码（本轮无`PostgresReplayGuard`变更），第8～10项为回归复验。

### 7.8.6 结论

Edge构建警告以运行时隔离修复：`process.exit`等Node专用API全部收敛到`src/lib/security/service-jwt-startup-node.ts`，instrumentation为运行时中性入口（async register+nodejs分支动态import）；fail-fast启动拒绝语义与§7.4/§7.7完全一致（standalone四种场景复验）。本Feature状态保持**Accepted**；修复提交`fix: 隔离服务JWT启动校验运行时`推送至`origin/refactor/policy-ops-agent-platform`。真实JWT Secret轮换仍未执行（非目标）；PR、main merge与tag/Release仍为未来人工动作。
