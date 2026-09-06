# PolicyOps Agent运行与恢复

> Author: Jan
> Status: Active
> Updated: 2026-09-05

## 当前Profile

Personal Demo面向个人展示和试用：总用户不超过100、并发不超过5、单机4核4GB，不承诺正式SLA、RPO或RTO。

本机是开发机，socila生产Compose数据卷保留但不常驻；远程服务器部署仍在路线图中。开发测试需要时启动`infra/dev/docker-compose.dev.yml`（09-05 SDL-FR-009起容器/卷/网络命名为`socila-pg-dev`等；历史`ssp-*`开发资源不自动删除，需要时由运维人工处置）。

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
- 本地开发机：`backup/db/`保存本机新鲜dump（Git忽略，不提交、不替代服务器备份）。

### PostgreSQL口令轮换runbook（09-03 CFG-FR-007/008）

严格串行，任何一步失败即停止并恢复原状：

1. 新鲜备份：`pg_dump -Fc`写入`backup/db/`并生成SHA-256清单；随后在临时PG17+pgvector容器中真实恢复，逐表行数必须与备份前基线完全一致（**必须先于口令轮换完成**）。
2. 停止依赖数据库的服务（web/agent/worker/beat）；**不得**停止或删除`socila_pg-data`，**不得**执行`down -v`。
3. 生成新口令（≥32随机字节、URL安全）仅保存在内存/临时文件，任何日志、报告、argv不得出现明文；临时轮换文件用完即删。
4. 经stdin执行`ALTER ROLE`（不进进程列表），验证新口令TCP连接成功、旧口令被拒绝。
5. 原子替换私有env文件（`infra/prod/.env`与`.env.local`：`POSTGRES_PASSWORD`、`DATABASE_URL`、`AGENT_DATABASE_URL`），替换前校验临时文件内容。
6. 重建服务；Compose与宿主migration各执行两次确认幂等；`/api/health`、`/internal/health`与容器健康检查全部通过。
7. 轮换后逐表行数对账必须与备份前基线一致；不一致即按恢复流程回滚并上报。

### 服务JWT Secret轮换runbook（09-03 SJWT-FR-007）

current/previous双Secret支持无中断轮换，严格串行，任何一步失败即停止并恢复原状：

1. 生成新Secret（≥32随机字节、URL安全）只保存在私有env文件；任何日志、报告、argv不得出现明文；临时轮换文件用完即删。
2. 更新全部四个消费者（web/agent/worker/beat）到同一组值：`AGENT_SERVICE_JWT_PREVIOUS`=旧current、`AGENT_SERVICE_JWT_CURRENT`=新Secret；不得有服务停留在旧值。
3. 按依赖顺序重启服务（web、agent、worker、beat）；模块级校验（SJWT-AC-010）保证缺失或无效值时进程启动失败，不存在带病运行的服务。
4. 重启后执行双向冒烟：`/internal/health`豁免可用、双向合法调用200、缺失/伪造/错误方向统一401、一次业务写JTI入台账；存量旧令牌在TTL 300秒+30秒偏差窗口内经`previous`继续通过验证。
5. 旧令牌窗口完全过期（≥5.5分钟）后，清空`AGENT_SERVICE_JWT_PREVIOUS`并再次重启四个服务。
6. `previous`命中只进入内部指标（签发/验证/401/重放计数），不向客户端输出；连续鉴权失败或重放在短窗口内超过阈值时按安全告警处理，不自动轮换Secret。

重放表在消费时机会式清理过期行，无需独立维护任务；两端migration（drizzle/0009、agent 0007）均可安全重跑；`agent.migrate --with-roles`重跑会自动重建`agent_app`角色对`agent.service_jwt_replays`的最小读写授权。回退旧镜像时保留两个重放表，不得删表或清理已记录JTI（SJWT §9）。

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

1. 准备服务器Secret和离机备份目标；`AUTH_REFRESH_PEPPER`是Compose必填变量（`:?`插值，缺失即拒绝启动），且必须与`NEXTAUTH_SECRET`为不同值（应用启动时二次拒绝相同值，ADR-0007）；`AGENT_SERVICE_JWT_CURRENT`在web/agent/worker/beat四个服务必填（≥32 UTF-8字节，缺失、无效或与previous相同即启动失败，SJWT-AC-010），`AGENT_SERVICE_JWT_PREVIOUS`可选（双窗口轮换）。
2. 验证Compose配置（`docker compose --env-file .env config`）、镜像版本、网络、资源和健康检查。
3. 执行migration（含0008_auth_identity与0009_service_jwt_replays；Agent侧重放表由migrate服务随`agent.migrate --with-roles`应用0007并重建`agent_app`最小授权），再执行`node scripts/bootstrap-admin.mjs`幂等引导Jan管理员，然后启动完整服务。
4. 运行登录、规划、Agent、RAG、Worker和Beat冒烟；登录冒烟使用引导账号经`/login`（数据库事实），环境凭据仅服务一次性引导。
5. 执行一次备份及恢复验证。
6. 记录域名、HTTPS、部署版本（当前代码基线v0.2.0：PolicyOps+Auth）、恢复点和实际耗时。

生产迁移、停写、入口或DNS切换、删除数据和Secret轮换必须获得用户明确授权。

历史演练与切换细节见[Stage 07报告](./reports/stage-07/acceptance-report.md)和[Runbook](./reports/stage-07/runbook.md)。

## 阶段E 受控物化runbook（09-05 NRP，仅本机policyops）

> **当前停止点（2026-09-06）**：不得直接执行第5、10步。持久库只有13条Drizzle迁移记录，0014尚未应用；现有`audit-policyops-stage-e-fix.json`基于旧提交`59a6467`，其hash和指纹不得复用。必须先完成并验收`docs/work-items/WI-20260906-01-stage-e-pack-repair-hardening.md`，再针对“一次0014 migration + 一次repair”取得用户明确授权。

1. 只读基线核对（规则/参数/规则集/案例计数与仓库权威资产清单）。
2. 完整备份：`docker exec socila-postgres pg_dump -U postgres -Fc policyops > backup/db/policyops-stage-e-pre-<ts>.dump`并生成SHA-256清单（backup/为Git忽略）。
3. 全新PG17+pgvector容器真实恢复：`cat <dump> | docker exec -i <容器> pg_restore -U postgres -d postgres --clean --if-exists`。
4. 逐表对账：`DATABASE_URL=<源库> TARGET_DATABASE_URL=<恢复库> node scripts/restore-reconcile.mjs`——任一表不符即禁止后续步骤。
5. 显式migration：`DATABASE_URL=<policyops> node scripts/run-migrations.mjs`（禁止dotenv回退）。
6. audit：`npx tsx scripts/materialize-policy-regions.ts audit`（只读，输出manifestHash/targetFingerprint/计划/幂等标志）。
7. apply：`npx tsx scripts/materialize-policy-regions.ts apply --i-am-authorized --manifest-hash <audit输出> --target-fingerprint <audit输出>`——单事务四地区draft写入+固定计数与旧行哈希事务内核验；失败自动全部回滚。
8. 复核：固定计数、published行哈希、`scripts/planning-regression.ts`（与物化前输出一致）、`GET /api/admin/policy-coverage`地区就绪状态。
9. 同manifest重复apply为幂等no-op；连接串/口令不得出现在日志、manifest、审计表或Git（NRP-NFR-009）。
10. 包快照修复（审查缺陷4）：仅在WI-20260906-01 Accepted且取得本次明确授权后，先显式应用0014，再基于当前HEAD重新audit；执行`npx tsx scripts/materialize-policy-regions.ts repair --i-am-authorized --manifest-hash <同次audit的hash> --target-fingerprint <同次audit的fp>`。repair在事务内锁定并校验目标draft状态，保留原物化审计，新增确定性`repaired`批次和成员；不改published或业务实体计数。成功后预期批次4→8、成员74→78。
11. repair后重新audit必须得到`packSnapshotDrift=[]`；使用新的audit输入复跑repair必须no-op。任一步出现状态、版本、旧哈希或指纹不一致即停止，不得覆盖并发编辑。
12. 对账必须以`scripts/restore-reconcile.ts`的目录驱动结果为准（public/drizzle/agent/rag全部BASE TABLE+sequence，当前37表+18 sequence），不得以部分表清单宣称"完整恢复"。repair前后分别保留备份，并对repair后备份执行新的37表+18 sequence真实恢复对账。
