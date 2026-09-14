# 07.7 Demo 恢复验证报告（REL-FR-007～009 / REL-AC-006）

日期：2026-08-31 · 环境：本地演练栈（dev compose，与生产脚本同一份 `infra/prod/backup.sh` / `restore-verify.sh`，经 `COMPOSE_FILE/NETWORK/POSTGRES_DB` 参数化）

## 1. 备份演练（backup.sh）

- 数据源：`drill-target-2`（07.5 第 2 轮迁移演练目标库，含 1,574 行迁移业务数据）+ dev MinIO（含 2 个合成测试对象）。
- 产物（离机目录 `.tmp-drill-backup/2026-08-31/`，演练后清理；生产为 NAS/离机挂载）：
  - `postgres.dump` 612K（pg_dump -Fc，含 Core 业务表与全部 Schema）。
  - `minio/` 对象镜像（`mc mirror`，2 文件）。
- 校验：dump 非空 + 对象数>0 断言通过；保留策略 14 天清理逻辑在位。
- 耗时：2s（数据量小；正式切换按 07.4/07.5 导出+导入+对账 8.5min 另计）。

## 2. 恢复演练（restore-verify.sh）

- PostgreSQL：pg_restore 至全新临时 pgvector/pg17 容器，`--exit-on-error` 无错误。
  抽查：rules=24、params=33、tests=528、plans=9、conversations=12——与备份时源库一致。
  （params 33 vs 演练对账 29：备份前 160 测试套件曾指向该库运行，测试新增参数行；恢复忠实还原备份时点。）
- Agent/Checkpoint 表：按存在条件检查（drill 目标库仅 core migrations，故无 agent_rag_chunks/checkpoints；生产库备份含全部 Schema，恢复后条件检查自动覆盖）。
- MinIO：全新 MinIO 实例（固定 RELEASE.2025-09-07T16-13-09Z）从备份目录 mirror 恢复，2 对象完整。
- 实际恢复点：2026-08-31；实际耗时：12s（含容器启动等待）。

## 3. 结论

- REL-AC-006（数据目录不可用→离机备份恢复→关键数据完整+记录恢复点与耗时）：**通过（演练口径）**。
- 备份保存于演练主机之外的临时目录结构，生产部署时 `BACKUP_TARGET` 指向 NAS/离机挂载（REL-FR-007，备份离开 Demo 主机的最终落实在 07.10 切换后按 Runbook 日任务执行）。
- 本轮发现的脚本缺陷均已修复并纳入交付物：mc 镜像无 shell（改 `MC_HOST_*` 免 shell）、mirror 目标目录需预建、agent/checkpoint 表条件抽查。
