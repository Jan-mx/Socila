# 07.6 资源与安全验收报告（REL-FR-001～009、013～014）

日期：2026-08-30 · 环境：开发演练机（真机容量观察项见"待切换验证"）

## 1. 资源预算（REL-FR-013，Personal Demo Profile ADR-0002）

`infra/prod/docker-compose.yml` 资源限额核验：

| 服务 | mem_limit | cpus | 备注 |
| --- | --- | --- | --- |
| proxy | 64m | - | Caddy |
| web | 512m | 1.5 | Next.js |
| agent | 384m | 1.0 | FastAPI 控制面 |
| worker | 768m | 1.0 | `--concurrency=1 --prefetch-multiplier=1 --max-tasks-per-child=20 --time-limit=120` |
| beat | 128m | - | 调度 |
| postgres | 768m | 1.0 | pgvector pg17 |
| redis | 128m | - | |
| minio | 256m | - | 固定 RELEASE 版本 |

- 内存合计 3,008MB ≤ 4GB（余量约 1GB 给 OS）；CPU 为限额非预留，4 核内有效。
- 后台 Worker 并发=1、prefetch=1、软/硬超时 110/120s，OCR/批量 Embedding 单串行队列。
- 本轮演练（07.4/07.5）与 160 测试全程运行无 OOM；个人开发机实测 Docker 栈稳定。

## 2. 网络与端口（REL-FR-002）

- 仅 proxy 发布 80/443；web 在 edge+internal；postgres/redis/minio/agent/worker/beat 全部位于 `internal: true` 网络（无外网路由）。
- PostgreSQL/Redis/MinIO/FastAPI 无宿主端口映射，仅服务名互访。

## 3. 镜像与版本固定（PRD §10）

- postgres `pgvector/pgvector:pg17`、redis `redis:7-alpine`、caddy `caddy:2-alpine`、minio `minio/minio:RELEASE.2025-09-07T16-13-09Z`（本轮由 `latest` 收紧为与演练环境一致的固定 RELEASE）。
- web/agent 为本地构建镜像（`policyops-web:latest`/`policyops-agent:latest`），构建上下文含 `.dockerignore`；digest 固定与漏洞扫描待真机部署时执行（见 §7）。
- 本轮整改：web/agent/worker/postgres 增加 `cpus` 限额；agent 增加健康检查（`/internal/health`）；minio 镜像固定。

## 4. Secret 管理（REL-FR-003、PRD §10）

- Compose 凭据全部经 `${VAR}` 从部署环境/local env 注入，仓库内无密钥。
- Secret 扫描（跟踪文件，模式：sk- 前缀、api_key 赋值、Bearer、连接串密码）：4 处命中均为占位符或 localhost CI 凭据（`.env.example`、`ci.yml`、`config.py` 默认值、测试模板），无真实密钥。
- `config/*.local.env`、`infra/dev/.env` 保持 gitignore（阶段 01 起持续有效）。

## 5. 依赖漏洞（PRD §10）

| 扫描 | 范围 | 结果 |
| --- | --- | --- |
| npm audit --omit=dev | 生产 JS 依赖 | 修复前 8（5 high/3 critical，均由 next@16.2.9 继承 sharp/postcss）→ 升级 next@16.3.3 + `npm audit fix` → **0 vulnerabilities** |
| pip-audit（uv 导出 1551 行锁定依赖） | Agent Python 依赖 | **No known vulnerabilities found** |
| dev 依赖残留 | 仅 devDependencies | 4 moderate（不进生产镜像） |

- 升级回归：`npm test` 160/160 通过、`tsc --noEmit` OK、`eslint src` OK、`npm run build` OK。

## 6. 认证与权限（REL-FR-014）

- NextAuth JWT + `authVersion` 失效语义、user/admin 权限、敏感写数据库复核、物化接口 production 403/stale 409/幂等：由测试套件覆盖（160 测试含认证与权限组），阶段 02/04/06 验收报告为证。
- 快照/发布仅 Core 可写；Agent 无 staging/production 路径（阶段 06 安全测试为证）。

## 7. 待切换（07.10）真机验证项

以下项依赖实际 Demo 服务器，列入切换前检查单（`SMOKE-CHECKLIST.md`/07.9）：

- 真机 4核4GB 容量观察（并发≤5 场景无资源耗尽，REL-AC-004）。
- 容器非 root 实测（镜像支持时）与镜像 digest 固定。
- 端口暴露实测（非授权网络访问被拒，REL-AC-003）。

## 结论

静态与本地可验证项全部通过，无 OOM、无阻断级漏洞（生产依赖 0 高危/严重）。07.6 PASS。
