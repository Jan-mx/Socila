# PolicyOps 运维 Runbook（阶段07.2，REL-FR-008/009）

> Profile：Personal Demo（ADR-0002）。无正式 SLA/RPO/RTO；恢复耗时记录为 Future Production 输入。

## 日常检查（每日一次）

| 项 | 命令/位置 | 告警阈值（operational-baseline） |
| --- | --- | --- |
| 容器状态 | `docker compose -f infra/prod/docker-compose.yml ps` | 非 healthy 即处理 |
| 磁盘 | `df -h` | >80%：停止采集与新索引并告警 |
| PostgreSQL 连接 | `SELECT count(*) FROM pg_stat_activity;` | >池上限 80%：暂停后台 DB 任务 |
| Celery 待处理 | `celery inspect reserved` | >50：暂停新来源调度 |
| 内存 | `docker stats --no-stream` | 任一容器持续 5 分钟 >90%：暂停后台任务 |

## 常见故障处理

### 1. Web（Next）不可用
```bash
docker compose -f infra/prod/docker-compose.yml restart web
docker logs policyops-web --tail 100
```
- 反复 OOM：确认并发≤5；`docker stats` 观察 512MB 上限。

### 2. Worker OOM / 连续失败
- 连续 OOM：将对应格式移到开发机离线处理（ADR-0002 约束），不自动提高内存上限。
- 死信检查：`agent.dead` 队列中记录任务名/参数/einfo；修复后重放。

### 3. 数据库不可用
- 应用侧已实现 503 映射（阶段02.4）；确认 PostgreSQL 容器与磁盘。
- 恢复后：Run 状态停在 failed 的按 AGT-AC-001 从 Checkpoint 恢复。

### 4. SiliconFlow 不可用/模型下线
- 401/403：不重试；检查密钥是否轮换/失效（勿在日志输出）。
- 模型下线：保留已索引数据，新 Embedding 任务排队；不得自动切换未知模型——需 ADR + 用户批准。

## 备份与恢复（07.3）

```bash
# 每日备份（cron，离机保存14天）
infra/prod/backup.sh          # pg_dump + MinIO 增量同步 → 备份目录/离机目标

# 恢复验证（公开演示前至少一次）
infra/prod/restore-verify.sh  # 恢复到临时容器并抽查
```

## 空服务器恢复（07.7 演练口径）

1. 安装 Docker + 恢复 `infra/prod/docker-compose.yml` 与 Secret。
2. 恢复 pg-data（最近备份）与 minio-data（增量同步）。
3. `docker compose up -d --wait` → 冒烟：`/internal/health`、规划计算、Agent run。
4. 记录恢复耗时（RPO/RTO 输入）。

## 回退（07.8 演练口径，REL-FR-010～012）

- **触发条件**：切换冒烟失败 / 迁移后黄金回归失败 / 关键功能不可用且 30 分钟内无法修复 / 监控出现不可解释的数据差异。
- **步骤（按序执行，全程预计 <15 分钟）**：
  1. 冻结新系统写入：`docker compose -f infra/prod/docker-compose.yml stop worker beat`（记录时间点）。
  2. 入口切回旧系统：DNS/内网入口指回 Vercel 旧应用（生效即恢复，预计 <5 分钟，取决于 TTL）。
  3. 新系统数据侧保留现场用于排查：`docker compose logs` 归档；PostgreSQL/MinIO 卷不动。
  4. 回退窗口内 Neon 只读可用（07.8 实测：5.1s 连通，六表计数与演练基线一致）；旧应用照常使用 Neon。
  5. 复盘后二选一：修复后重新走 07.10 清单；或放弃切换，用备份恢复本地数据（07.7 恢复路径，12s 实测）。
- **回退数据源（双保险）**：
  - 在线：Neon 原库只读（07.10 切换后保留至回退窗口结束，REL-FR-012 不得删除）。
  - 离线：切换前最终 pg_dump（演练保留于 `%TEMP%/neon-drill/neon-round{1,2}.dump`，各 605,600 字节，可重复恢复——07.4/07.5 已两轮验证）。
