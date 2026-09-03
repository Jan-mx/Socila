# 09-03 Core与Agent双向服务JWT鉴权 验收报告

> Author: Jan
> Status: Active
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
`draft-imports-auth.integration.test.ts` 4 用例（路由级，位于 `src/app/api/internal/v1/draft-imports/__tests__/` 以满足模块边界规则）：draft-imports 路由矩阵（无鉴权 401+no-store、仅 X-Service-Name 401、伪造 Secret 401、错误方向 Next 令牌 401、合法 Agent 令牌 200+台账行、同令牌重放 401 且无台账、重放再试 401）。

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

**PASS。** SJWT-FR-001～009、SJWT-NFR-001～006、SJWT-AC-001～018 全部取得新鲜本地证据（§4、`reports/traceability.md` 09-03 SJWT 行映射）。真实 JWT Secret 轮换未执行（非目标）；PR、main merge 与 tag/Release 仍为未来人工动作。
