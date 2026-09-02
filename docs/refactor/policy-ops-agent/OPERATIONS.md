# PolicyOps Agent运行与恢复

> Author: Jan
> Status: Active
> Updated: 2026-09-02

## 当前Profile

Personal Demo面向个人展示和试用：总用户不超过100、并发不超过5、单机4核4GB，不承诺正式SLA、RPO或RTO。

本机是开发机，socila生产Compose数据卷保留但不常驻；远程服务器部署仍在路线图中。开发测试需要时启动`infra/dev/docker-compose.dev.yml`。

## 服务预算

| 服务 | 内存预算 |
| --- | ---: |
| Reverse Proxy | 64MB |
| Next.js | 512MB |
| FastAPI | 384MB |
| Parser/Celery Worker | 768MB |
| PostgreSQL | 768MB |
| Redis | 128MB |
| MinIO | 256MB |
| 系统和余量 | 约1GB |

OCR、批量索引和migration不得同时运行。Worker使用concurrency=1、prefetch=1、max_tasks_per_child=20和120秒默认任务超时。

## 网络

- Caddy是唯一外部入口。
- Next.js只通过内部网络访问FastAPI。
- PostgreSQL、Redis、MinIO和FastAPI默认不对公网开放。
- 本地调试端口不等于生产公开端口；服务器防火墙仍需限制访问来源。
- 宿主HTTP代理可能拦截localhost，健康检查应明确设置no_proxy。

## 资源保护

- 内存持续5分钟超过90%：暂停后台任务。
- 磁盘超过80%：停止采集和新索引。
- PostgreSQL连接超过池上限80%：暂停后台数据库任务。
- Celery积压超过50：暂停新来源调度。
- 连续OOM：将对应格式转到开发机离线处理，不自动提高限制。

## 日常检查

```bash
docker compose -f infra/prod/docker-compose.yml ps
docker stats --no-stream
docker compose -f infra/prod/docker-compose.yml logs --tail 100 web agent worker beat
```

同时检查磁盘、PostgreSQL连接、Celery积压、`/api/health`、`/internal/health`和最近备份。

## 备份与恢复

- 每日执行`infra/prod/backup.sh`，生成PostgreSQL dump并同步MinIO。
- 备份必须离开Demo服务器并保留14天。
- 公开演示前至少执行一次`infra/prod/restore-verify.sh`。
- 恢复后检查数据库记录、MinIO对象、Checkpoint、规划黄金结果和服务健康。
- 恢复点和耗时写入报告，作为Future Production容量输入。

## 故障处理

| 故障 | 处理 |
| --- | --- |
| Web不可用 | 检查proxy/web健康和日志，必要时仅重启web |
| Worker OOM | 暂停队列、检查文件类型，转离线处理 |
| PostgreSQL不可用 | 停止后台写入，恢复服务后从Checkpoint继续 |
| SiliconFlow 401/403 | 不重试，检查Secret状态但不输出值 |
| SiliconFlow 429/503/超时 | 有限退避重试，超过上限进入人工处理 |
| 模型下线 | 暂停新任务，不自动切换未知模型 |

## 服务器部署门禁

1. 准备服务器Secret和离机备份目标；`NEXTAUTH_SECRET`与`AUTH_REFRESH_PEPPER`必须为不同值（ADR-0007）。
2. 验证Compose配置、镜像版本、网络、资源和健康检查。
3. 执行migration（含0008_auth_identity），再执行`node scripts/bootstrap-admin.mjs`幂等引导Jan管理员，然后启动完整服务。
4. 运行登录、规划、Agent、RAG、Worker和Beat冒烟；登录冒烟使用引导账号经`/login`（数据库事实），环境凭据仅服务一次性引导。
5. 执行一次备份及恢复验证。
6. 记录域名、HTTPS、部署版本、恢复点和实际耗时。

生产迁移、停写、入口或DNS切换、删除数据和Secret轮换必须获得用户明确授权。

历史演练与切换细节见[Stage 07报告](./reports/stage-07/acceptance-report.md)和[Runbook](./reports/stage-07/runbook.md)。
