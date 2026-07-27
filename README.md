<div align="center">

<h1>社保规划助手</h1>

<p>把复杂的社保政策转成可复核、可解释、可管理的在线规划工具。</p>

<p><strong>规则引擎 + 用户规划对话 + 管理后台 + 智能解读层</strong></p>

</div>

---

## 项目概览

社保规划助手面向个人社保规划场景，将用户基础信息转化为退休节点、缴费缺口、补贴机会和行动清单，并保留可复核的计算依据。项目采用以数据结构定义为先（schema-first）的数据库管理方式，配套管理后台维护规则、参数、案例与发布流程。

| 模块 | 能力 |
| --- | --- |
| 规划对话 | 基于多轮问答收集信息，输出结论、依据与下一步动作 |
| 规则引擎 | 用 JSONLogic + 自定义扩展表达政策规则，支持参数化计算 |
| 案例库 | 沉淀典型社保路径，便于对照和复用 |
| 管理后台 | 管理规则、参数、规则集、测试案例与发布流程 |
| 智能解读层 | 结合确定性计算结果与大模型解释，降低黑箱风险 |

## 技术栈

| 分类 | 技术 |
| --- | --- |
| Web 框架 | Next.js 16 / React 19 / App Router |
| UI | Tailwind CSS v4 / Lucide Icons |
| 数据库 | Neon PostgreSQL / Drizzle ORM |
| 认证 | NextAuth v5 Credentials |
| 智能能力 | AI SDK / OpenAI 兼容接口 |
| 质量保障 | Vitest / ESLint |

## 快速开始

### 环境要求

- Node.js 20+
- Neon PostgreSQL 数据库

### 本地启动

```bash
npm install
cp .env.local.example .env.local
```

编辑 `.env.local` 后初始化数据库并启动：

```bash
npx drizzle-kit push
npm run seed
npm run dev
```

访问入口：

- 用户端：[http://localhost:3000](http://localhost:3000)
- 管理后台：[http://localhost:3000/admin](http://localhost:3000/admin)

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL 连接字符串，建议带 `?sslmode=require` |
| `NEXTAUTH_SECRET` | NextAuth 密钥，可用 `openssl rand -base64 32` 生成 |
| `NEXTAUTH_URL` | 本地为 `http://localhost:3000`，生产为正式域名 |
| `ADMIN_USERNAME` | 管理后台登录用户名 |
| `ADMIN_PASSWORD_HASH` | 管理后台密码 bcrypt 哈希值 |
| `OPENAI_URL` | OpenAI 或兼容网关地址，默认 `https://api.openai.com/v1` |
| `OPENAI_API_KEY` | OpenAI 或兼容网关 API Key |
| `OPENAI_MODEL` | 对话模型名 |

生成管理后台密码哈希值：

```bash
node -e "const b = require('bcryptjs'); b.hash('yourpassword', 10).then(console.log)"
```

## 数据库与部署

本项目采用 schema-first：通过 `drizzle-kit push` 将 `src/lib/db/schema.ts` 同步到目标数据库，不维护版本化迁移文件。涉及删列、改类型等破坏性变更时，请先备份数据库。

部署到 Vercel 时，需要在项目控制台配置同名环境变量。首次部署后可在本地指向生产库执行一次种子导入：

```bash
DATABASE_URL=<prod-url> npm run seed
```

`vercel.json` 已配置 `iad1` 区域，并为 `/api/chat` 设置较长的函数超时。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run start` | 启动生产服务器 |
| `npm run lint` | 运行 ESLint |
| `npm run test` | 运行 Vitest |
| `npm run seed` | 导入 DSL 规则与参数种子数据 |
| `npx drizzle-kit push` | 同步数据库 schema |
| `npx drizzle-kit studio` | 打开数据库可视化界面 |

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

docs/
└── architecture.md  # 技术架构说明
```

---


