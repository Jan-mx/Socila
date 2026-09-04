# PolicyOps Agent当前架构

> Author: Jan
> Status: Active
> Updated: 2026-09-04

## 上下文

PolicyOps在现有社保规划Core旁增加政策运营Agent。Next.js继续负责所有浏览器和用户业务；FastAPI、Celery和LangGraph只处理政策运营内部流程。

```mermaid
flowchart TB
    User[规划用户] --> Next[Next.js Core]
    Admin[管理员] --> Next
    Next --> Engine[确定性规则引擎]
    Next --> Core[(PostgreSQL Core Schema)]
    Next -->|服务JWT（Next身份）| AgentAPI
    AgentAPI -->|服务JWT（Agent身份）| Next
    AgentAPI --> Graph[LangGraph]
    AgentAPI --> Queue[Celery / Redis]
    Graph --> AgentDB[(Agent / Checkpoint Schema)]
    Queue --> MinIO[(MinIO原件)]
    Queue --> SF[SiliconFlow]
    Sources[官方来源] --> Queue
```

## Next.js Core

- 浏览器唯一入口和BFF。
- 统一登录注册（09-02）：`/login`、`/register`公开页面；user与admin共用入口；`/admin/login` 308重定向到统一登录。
- NextAuth v5 Credentials + 加密JWT Cookie保存15分钟授权声明（accessExpiresAt）与PostgreSQL刷新会话句柄；授权声明过期后由jwt callback经identity application验证并轮换刷新会话（行锁+HMAC确定性派生+30秒并发宽限，ADR-0007）。
- 客户端Session只暴露AuthenticatedActor：userId、username、role、authVersion、mustChangePassword。
- 用户、角色、状态、authVersion、刷新会话和安全审计事件保存于PostgreSQL（`users`、`auth_refresh_sessions`、`auth_audit_events`，migration 0008纯新增）。
- 规则、参数、测试、地区、快照、规划和发布归Core所有；新建规划/对话只绑定owner_user_id，session_id恒为NULL，历史匿名数据不在新入口展示。
- 服务端路由门禁（src/proxy.ts）执行固定双角色权限矩阵：匿名访问规划/对话/管理一律拒绝；管理敏感写操作经requireFreshAdmin重新查询数据库校验role、status和authVersion。
- Agent集成只暴露PolicyContext只读端口和受限DraftMaterialization端口。

依赖方向为`domain → application → infrastructure → route adapter`；Route Handler不得直接承载领域规则或越过Repository访问Drizzle。

## Agent Runtime

- FastAPI提供内部控制面和健康检查；文档与OpenAPI入口统一关闭（`docs_url`/`redoc_url`/`openapi_url`均为`None`，`/internal/docs`、`/docs`、`/redoc`、`/openapi.json`一律404，09-03复审缺漏一）。
- Celery和Redis负责采集、解析、OCR、Embedding、索引、重试和死信。
- LangGraph负责需要模型推理、Checkpoint和人工interrupt的状态流程。
- Worker并发和prefetch均为1，耗时任务不在FastAPI请求线程执行。
- Agent数据库角色只访问Agent和Checkpoint范围，不能直接写Core published表。

## 服务鉴权

- Docker内部网络是第一层隔离：Next与FastAPI仅通过内网互相调用；服务JWT是网络之外的第二层身份证明（ADR-0005）。
- Next与FastAPI双向通过短期服务JWT通信：HS256、TTL固定300秒、时钟偏差最多30秒（ADR-0005，09-03 Feature实现）。
- 固定身份：Next→Agent使用`iss=ssp-next-core`、`aud=policy-agent`、`sub=next-core`；Agent→Core使用`iss=policy-agent`、`aud=ssp-next-core`、`sub=agent-runtime`；claims另含UUID v4 `jti`、`iat`、`exp`（exp=iat+300，SJWT-FR-003～005）。
- 两端显式固定HS256（Node `jose`、Python `PyJWT>=2.10,<3`），拒绝`none`与任何算法降级；签发只使用current Secret，验证依次尝试current、previous；previous命中仅进入内部指标（SJWT-FR-002/007、NFR-001）。
- `AGENT_SERVICE_JWT_CURRENT`在web/agent/worker/beat四个消费者必填（≥32 UTF-8字节、previous与current相同或格式无效时启动失败，SJWT-AC-010）；`AGENT_SERVICE_JWT_PREVIOUS`可选，支持双窗口无中断轮换。
- Web Node运行时启动入口（`src/instrumentation.ts`，next dev/start与standalone server.js共用）启动期校验current Secret：缺失、不足32 UTF-8字节或与previous相同时以退出码1终止进程（Next 16 standalone中仅抛错不足以使进程退出，必须fail-fast），`/api/health`不构成绕过路径；instrumentation会被Next.js同时构建为Node与Edge运行时bundle，故启动校验与进程终止逻辑位于Node专用模块`src/lib/security/service-jwt-startup-node.ts`，`register`（async）仅在`NEXT_RUNTIME=nodejs`分支经动态import加载，Edge运行时不执行启动校验且构建零警告（2026-09-04运行时隔离复查）；Compose中`AGENT_SERVICE_JWT_CURRENT`为必填插值（`${…:?…}`），缺失或空值时`docker compose config`直接失败（09-03复审缺漏二）。
- FastAPI对除`/internal/health`（唯一免JWT内部端点）外的所有`/internal/*`业务端点验证Next身份令牌，`/internal/ready`必须携带合法JWT；Core仅在`/api/internal/v1/draft-imports`验证固定Agent身份（SJWT-FR-004/005、AC-015）。
- 鉴权失败（缺失、格式、签名、算法、claims、过期、超前、重放）统一返回401 `SERVICE_AUTH_INVALID`且不区分具体原因；重放存储不可用返回503 `SERVICE_AUTH_STORE_UNAVAILABLE`；两者均`Cache-Control: no-store`（SJWT-FR-009、AC-014）。
- `X-Service-Name`只作为不可信的结构化日志上下文，不参与允许/拒绝判断（SJWT-FR-006、AC-003）。
- 内部写请求（agent-run创建、proposal审核、draft物化）在接收方数据库事务内消费JTI：主键冲突视为重放统一401；业务回滚时JTI同回滚，调用方可用新JTI+相同业务幂等键安全重试（SJWT-FR-008、AC-011～013）。
- 重放表`public.service_jwt_replays`（Core，drizzle/0009）与`agent.service_jwt_replays`（Agent，migration 0007，`agent_app`最小读写）只保存JTI与claims元数据，不保存令牌或签名；过期行在消费时机会式清理（SJWT-NFR-006）。
- 浏览器和用户JWT不得获得内部服务Secret；JWT不含用户ID、用户名、角色或业务payload。
- 刷新会话HMAC pepper（`AUTH_REFRESH_PEPPER`）与`NEXTAUTH_SECRET`是两个独立密钥：compose必填插值拒绝缺失，identity容器启动时拒绝两者相同（09-03 PMG-FR-032）。

## 政策与规则模型

- `Jurisdiction`保存国家、省、市、区县层级。
- 国家政策形成baseline，地方版本使用add、replace、restrict和exempt overlay。
- 规则、参数、测试和政策携带business key、版本、地区、状态和有效期。
- 同级冲突和重叠有效期产生Conflict，不自动裁决。
- 发布快照保存解析后的地区继承链、版本集合、hash和provenance。
- JSON DSL继续保存在JSONB，并由AJV和JSON Schema校验。

## 文档、OCR与RAG

```mermaid
flowchart LR
    File[HTML/PDF/DOCX/XLSX/JSON/MD/图片] --> Route[格式与逐页路由]
    Route --> Native[原生解析/PyMuPDF]
    Route --> OCR[SiliconFlow OCR-VL]
    Native --> Tree[DocumentTree JSON]
    OCR --> Review[差异与人工校对]
    Review --> Tree
    Tree --> Chunk[父子/表格Chunk]
    Chunk --> FTS[tsvector + GIN]
    Chunk --> Vector[pgvector 1024维]
    FTS --> RRF[混合召回/RRF]
    Vector --> RRF
    RRF --> Rerank[SiliconFlow Rerank]
```

- HTML、DOCX、XLSX、JSON和Markdown优先原生解析。
- 文本PDF由PyMuPDF逐页提取，扫描或版面信息由PaddleOCR-VL-1.5处理。
- 原件保存到MinIO，DocumentTree是权威解析结构，Markdown是派生副本。
- 文号、日期、金额、比例冲突或缺少模型置信度时进入人工复核。
- 检索先过滤地区、有效期和发布状态，再执行全文、向量、RRF和重排。
- SiliconFlow Embedding为`BAAI/bge-m3`，实测维度1024；Rerank为`BAAI/bge-reranker-v2-m3`。

## 草案闭环

1. 比较完整新旧DocumentTree。
2. 检索受影响规则、参数、测试和历史案例。
3. 生成带引用、地区、有效期和provenance的DraftBundle。
4. 执行结构、引用、依赖和回归校验。
5. 管理员批准、编辑后批准或驳回。
6. 已批准Bundle通过服务JWT和幂等键调用Next Core。
7. Core二次校验后只创建draft；发布继续执行现有门禁。

## 数据所有权

| 数据 | 权威存储 | 所有者 |
| --- | --- | --- |
| 用户、会话、规划 | PostgreSQL Core | Next Core |
| 规则、参数、测试、地区、快照 | PostgreSQL Core | Next Core |
| Agent Run、提案、审核、事件 | PostgreSQL Agent | Agent Runtime |
| Graph Checkpoint | PostgreSQL Checkpoint | LangGraph |
| 原始政策和页面资源 | MinIO | Ingestion |
| Chunk、全文和向量 | PostgreSQL Agent | RAG |

## 部署

Personal Demo使用单机Docker Compose：Caddy、Next.js、FastAPI、Celery Worker、Beat、PostgreSQL 17 + pgvector、Redis和MinIO。只有反向代理对外；其他服务使用内部网络。详细资源和恢复规则见[OPERATIONS](./OPERATIONS.md)。

### 运行配置与凭据（09-03 CFG）

- 配置所有权：宿主脚本与本地开发经共享加载器 `scripts/lib/load-environment.mjs` 取 `.env.local`（优先）→ `.env`（回退），进程环境永远优先、不被文件覆盖；Compose 运行时使用 `infra/prod/.env`。根 `.env` 已删除，宿主不再以远程数据库为目标。
- `NEXTAUTH_SECRET` 与 `AUTH_REFRESH_PEPPER` 在宿主与 Compose 两个运行时取值一致；`POSTGRES_PASSWORD`/`DATABASE_URL`/`AGENT_DATABASE_URL` 只在 `infra/prod/.env` 维护，宿主 `DATABASE_URL` 只使用 `localhost:5432` 映射。
- 管理员引导一次性完成：`scripts/bootstrap-admin.mjs` 只从显式进程变量读取 `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH`（bcrypt cost 12）；运行时登录只查 `users` 表，任何活动配置、模板与 Compose 环境都不再常驻 `ADMIN_*` 变量。
- 远程数据库门禁：宿主脚本默认只允许 localhost/127.0.0.1/::1；Compose 内仅 `migrate` 服务持有 `ALLOW_REMOTE_DATABASE=1` 例外（其内部DNS `postgres` 会被宿主门禁视为远程），其余服务零例外（最小权限）。
- 服务JWT：`AGENT_SERVICE_JWT_CURRENT`在web/agent/worker/beat四个消费者必填（≥32 UTF-8字节，worker/beat经tasks模块导入期校验，Web经Node运行时启动入口`src/instrumentation.ts`fail-fast校验，Compose以`:?`必填插值使缺失/空值在`docker compose config`阶段失败，SJWT-AC-010）；`AGENT_SERVICE_JWT_PREVIOUS`可选，支持双窗口轮换；签发只用current，验证依次current→previous（09-03 SJWT-FR-001/007，实现见“服务鉴权”节）。宿主机侧两个变量由`.env.example`模板声明，实际值仅保存在Git忽略的`.env.local`（安全同步，不轮换）。
- 凭据轮换：PostgreSQL口令轮换前必须先完成新鲜 `pg_dump -Fc` + SHA-256清单 + PG17+pgvector真实恢复对账；轮换后必须完成逐表行数对账、迁移幂等与健康检查。runbook见[OPERATIONS](./OPERATIONS.md)。

### 质量门禁（09-03）

GitHub Actions六job工作流（`.github/workflows/ci.yml`），触发`pull_request`、`main` push与`workflow_dispatch`；同ref并发取消；job级timeout；默认token仅`contents: read`；第三方Action全部固定提交SHA。

| Job | 内容 |
| --- | --- |
| `gates` | tsc、ESLint、Node单元测试（零数据库依赖、零skip） |
| `agent-gates` | ruff、mypy、Python单元（`-m "not integration"`）、pip-audit |
| `database-gates` | 全新pgvector PG17：Core migration/引导各两次（幂等）、seed、`npm run test:db`、Agent migration+角色授权、Python集成 |
| `e2e-gates` | 全新库+standalone构建+mock模型：`npm run test:e2e:auth`（10项Auth流程含助手回复） |
| `container-gates` | 构建web/agent最终镜像；合成env+临时卷Compose冒烟（健康检查后执行SJWT-AC-017双向冒烟：合法双向调用通过、伪造服务名拒绝，随后无条件`down -v`）；Trivy 0.74.0扫描（HIGH/CRITICAL，ignore-unfixed，`scanners: vuln`） |
| `security-gates` | `scan-secrets.mjs --all` + Gitleaks 8.29.1完整历史（`fetch-depth: 0`，`.gitleaksignore`仅5个已核实fingerprint） |

运行镜像加固：web基于node:22-alpine，`apk upgrade`后删除npm/npx/corepack完整目录（`/usr/local/lib/node_modules`与`/usr/bin`），非root `node`用户；agent基于python:3.11-slim，运行层`apt-get upgrade`后删除全局pip/setuptools/wheel，uv仅存在于build stage，非root `appuser`。占位配置不使用Docker ARG/ENV保存Secret名称，仅在执行build的单层命令中使用非真实占位值。

## 已接受决策

- 保留Next.js Core，不引入NestJS。
- Docker内网隔离+HS256短期服务JWT双向鉴权，JTI重放消费与业务写同事务（ADR-0005，09-03 Feature已实现验收）。
- NextAuth 15分钟授权声明 + PostgreSQL刷新会话双层会话（ADR-0007）；固定双角色权限矩阵，不建立通用RBAC。
- 决策记录见[decisions](./decisions/)目录（ADR-0007起）。
- Python内部控制面使用FastAPI。
- LangGraph用于可恢复、需要人工中断的政策运营流程。
- PostgreSQL JSONB兼容现有JSON规则，pgvector与业务元数据同库。
- Personal Demo不在本地加载Docling完整流水线或OCR/VLM模型。
- 外部模型只接收公开政策和去标识化规则元数据。

历史ADR见[archive/decisions](./archive/README.md)。
