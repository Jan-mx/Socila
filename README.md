<div align="center">

<h1>社保规划助手</h1>

<p>把复杂的社保政策转成可复核、可解释、可管理的在线规划工具。</p>

<p><strong>规则引擎 + 用户规划对话 + 管理后台 + 智能解读层</strong></p>

</div>

---

## 项目概览

社保规划助手面向个人社保规划场景，将用户基础信息转化为退休节点、缴费缺口、补贴机会和行动清单，并保留可复核的计算依据。项目采用以数据结构定义为先（schema-first）的版本化数据库管理方式，配套管理后台维护规则、参数、案例与发布流程。

| 模块 | 能力 |
| --- | --- |
| 规划对话 | 基于多轮问答收集信息，输出结论、依据和下一步动作 |
| 规则引擎 | 用 JSONLogic + 自定义扩展表达政策规则，支持参数化计算 |
| 案例库 | 沉淀典型社保路径，便于对照和复用 |
| 管理后台 | 管理规则、参数、规则集、测试案例与发布流程 |
| 智能解读层 | 结合确定性计算结果与大模型解释，降低黑箱风险 |

## 技术栈

| 分类 | 技术 |
| --- | --- |
| Web 框架 | Next.js 16 / React 19 / App Router |
| UI | Tailwind CSS v4 / Lucide Icons |
| 数据库 | 本地 PostgreSQL 17 + pgvector（Docker Compose）/ Drizzle ORM |
| 认证 | NextAuth v5 Credentials + PostgreSQL 刷新会话 |
| 政策运营 | FastAPI / Celery / LangGraph（Agent Runtime） |
| 智能能力 | AI SDK / OpenAI 兼容接口 |
| 质量保障 | Vitest / Playwright / ESLint / pytest |

## 快速开始

### 环境要求

- Node.js 20+
- Docker Desktop（本地 Compose：PostgreSQL 17 + pgvector、Redis、MinIO 等）

### 本地启动

启动本地 Compose 的数据服务并等待 PostgreSQL 健康：

```bash
docker compose -f infra/prod/docker-compose.yml up -d postgres redis minio
```

配置宿主机环境（`.env.local` 优先、`.env` 回退、进程变量不覆盖）：

```bash
npm install
cp .env.example .env.local
```

编辑 `.env.local`（数据库主机固定 `localhost:5432/policyops`）后初始化数据库并启动：

```bash
npm run db:migrate
npm run seed
npm run dev
```

访问入口：

- 用户端：[http://localhost:3000](http://localhost:3000)
- 管理后台：[http://localhost:3000/admin](http://localhost:3000/admin)

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | 本地 Compose PostgreSQL 连接串（`localhost:5432/policyops`） |
| `NEXTAUTH_SECRET` | NextAuth 密钥，可用 `openssl rand -base64 32` 生成 |
| `AUTH_REFRESH_PEPPER` | 刷新会话 HMAC pepper（ADR-0007）；必须与 `NEXTAUTH_SECRET` 不同，并与 Docker 运行时保持一致 |
| `NEXTAUTH_URL` | 本地为 `http://localhost:3000` |
| `OPENAI_URL` | OpenAI 或兼容网关地址，留空时使用官方 API |
| `OPENAI_API_KEY` | OpenAI 或兼容网关 API Key |
| `OPENAI_MODEL` | 对话模型名 |

管理员账号为一次性引导：以显式进程变量传入用户名与 bcrypt cost 12 哈希后执行
`node scripts/bootstrap-admin.mjs`（幂等，重复执行 no-op）。引导完成后运行时登录
与用户管理只查询数据库 `users` 表，不再读取任何管理员运行环境变量。

## 数据库与部署

本项目采用 schema-first 的版本化迁移：`drizzle/` 目录保存迁移 SQL 与记账元数据，
`npm run db:migrate` 在本地 PostgreSQL 上重复执行（幂等）。涉及破坏性变更前请先
备份数据库（备份、恢复与口令轮换口径见
[OPERATIONS](docs/refactor/policy-ops-agent/OPERATIONS.md)）。

本地 Personal Demo 使用单机 Docker Compose（Caddy、Next.js、FastAPI、Celery、
PostgreSQL 17 + pgvector、Redis、MinIO），Compose 环境模板见
`infra/prod/.env.example`；部署、备份与恢复见
[OPERATIONS](docs/refactor/policy-ops-agent/OPERATIONS.md)。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run start` | 启动生产服务器 |
| `npm run lint` | 运行 ESLint |
| `npm test` | 运行 Vitest 单元/契约测试 |
| `npm run test:db` | 运行 PostgreSQL 集成测试（需已迁移的本地测试库） |
| `npm run db:migrate` | 执行版本化数据库迁移（幂等） |
| `npm run seed` | 导入 DSL 规则与参数种子数据 |

## 目录结构

```text
src/
├── app/             # App Router 页面与 API 路由
│   ├── (client)/    # 用户端页面：主页、对话、案例
│   ├── admin/       # 管理后台页面
│   └── api/         # 业务 API 与管理 API
├── components/      # 界面、布局、规划结果与向导组件
├── lib/             # auth、db、engine、validators 等核心逻辑
└── types/           # TypeScript 类型定义

services/agent/      # FastAPI / Celery / LangGraph 政策运营 Agent
scripts/             # migration、seed、引导与安全扫描脚本
infra/prod/          # 单机 Personal Demo Compose 与运维脚本
docs/                # PRD 与 PolicyOps 重构文档体系
```

---
