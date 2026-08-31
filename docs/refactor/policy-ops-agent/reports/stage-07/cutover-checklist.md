# 07.9 Demo 切换准备清单（REL-FR-010～014）

状态：**ready-to-release**。执行 07.10 需用户显式授权（强制暂停点：生产迁移/停写/入口切换）。

## 1. 前置验收状态（全部 PASS）

| 项 | 证据 |
| --- | --- |
| 07.1/07.3 Compose/备份 | `infra/prod/docker-compose.yml`（minio 固定版本、CPU/内存限额、agent 健康检查）、backup.sh/restore-verify.sh |
| 07.2 Runbook | `reports/stage-07/runbook.md`（含回退可执行步骤） |
| 07.4/07.5 迁移演练×2 | `neon-drill-round{1,2}.json`：1,574 行对账全一致，8.5/8.6 min，160 测试指向迁移库全绿 |
| 07.6 资源与安全 | `capacity-security-report.md`：限额合规、生产依赖 0 高危（next→16.3.3）、pip-audit 0、Secret 扫描净 |
| 07.7 恢复验证 | `restore-verify-report.md`：恢复点 2026-08-31、12s、PG/MinIO 数据完整 |
| 07.8 回退演练 | `rollback-drill-report.md`：Neon 只读可用（5.1s、六表基线一致）、离线 dump 保留 |

## 2. 用户授权决策项（07.10 前）

- [ ] 授权执行正式切换（维护窗口时间：＿＿＿＿）
- [ ] 确认回退窗口时长（建议 ≥7 天，期间 Neon 只读保留、不删除）
- [ ] 确认停写方式（Vercel 旧应用暂停写入/下线入口）
- [ ] 提供 Demo 服务器与部署 Secret 注入方式（`infra/prod/.env` 模板见 Runbook）

## 3. 切换执行序（PRD §7.2，预计总停写 ≈30 分钟）

1. 冻结写入并记录时间点 → 最终 pg_dump（口径同演练，约 10 min 含 Neon 冷启动）。
2. 目标库跑 migrations → 映射复制 → 自动对账（`neon_drill.py` 同流程，count+hash 必须全一致）。
3. 启动内部全栈 `docker compose up -d --wait`（仅代理对外）。
4. 阻断冒烟（见 §4）。
5. 切换内网入口/DNS，监控错误率、延迟、数据库连接、队列。
6. Neon 转只读回退窗口（不删除，REL-FR-012）。

## 4. 阻断冒烟清单（任一失败即触发回退）

- [ ] 登录/登出、JWT authVersion 失效语义
- [ ] 规划计算（上海示例：参数/规则/测试全链路）与黄金结果一致
- [ ] Agent run（Checkpoint 恢复、interrupt 审核、幂等物化）
- [ ] 后台队列（Beat 调度、Worker 单并发、死信可见）
- [ ] RAG 检索（地区/日期过滤、引用回链）

## 5. 切换时补录项（真机）

- [ ] REL-AC-003：非授权网络访问数据端口被拒
- [ ] REL-AC-004：并发≤5 场景无资源耗尽（OCR/批量索引并行观察）
- [ ] 镜像 digest 固定与非 root 实测（镜像支持时）
- [ ] 记录实际恢复点、停写时长、入口生效时长

## 6. 回退触发（详见 Runbook）

黄金回归失败 / 关键功能不可用 30 分钟未修复 / 数据差异不可解释 → 停写新系统、入口切回 Vercel、Neon 只读保持、保留现场。
