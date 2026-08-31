# 07.10 正式切换执行报告（REL-FR-010～014 / REL-AC-001、002、005、008）

日期：2026-08-31 · 授权：用户于切换准备清单后显式授权（本机 Docker 部署、记录时间点+停止使用旧应用停写、Neon 零保留方针）

## 1. 执行时间线（UTC）

| 时刻 | 事件 |
| --- | --- |
| 12:51:54 | **停写时间点**（旧应用停止使用，作为数据一致性基准） |
| ~13:10 | 数据服务启动（postgres/redis/minio，healthy） |
| ~13:20 | Core migrations 应用（drizzle journal，容器内 node 执行） |
| ~13:40 | **Neon 最终导出（605,600 字节）→ 恢复 → 映射复制 11 表 1,574 行 → 对账全部一致**（`neon-drill-round3.json`，与两轮演练同代码路径，`DRILL_SKIP_PREP=1` 双网络容器执行） |
| ~13:45 | Agent schema migrations 4 个全部应用（`python -m agent.migrate`） |
| ~13:47 | 全栈启动（8 服务，仅 proxy 对外发布 80/443） |
| 13:50~14:00 | 数据侧冒烟：表计数、FK 引用完整性、引擎黄金回归 5/5、Worker pong、Beat 心跳 |
| 14:00~14:45 | 计划外事件：Docker Desktop 因 C 盘满故障 + 数据盘迁移 C→E（独立执行，76.8GB 释放，栈恢复无损——独立报告） |
| ~14:55 | web 镜像根因修复重建（见 §3）+ 完整 HTTP 冒烟通过 |

**停写窗口**：纯迁移操作约 55 分钟；含计划外事件全程约 2 小时（预估 30 分钟，超时原因为宿主磁盘故障处置，与迁移流程本身无关）。

## 2. 数据一致性证据（REL-AC-002 传递到生产）

- 复制 1,574 行 = 演练基线：cases 851 / tests 528 / showcase_cases 117 / params 29 / rules 24 / conversations 12 / plans 9 / publishes 2 / rule_sets 1 / workflows 1 / policy_pack_versions 0。
- 对账：count + 共享列 md5 哈希**全部一致**；引用完整性 FK 抽查通过（rules×jurisdictions 24、tests×rules 28）。
- 生产库现读验证：`/api/showcase-cases` 返回真实迁移案例（id=1 "1974年女性 · 灵活就业 · 4050补贴"）。

## 3. 冒烟结果（阻断冒烟清单）

| 项 | 结果 |
| --- | --- |
| `/api/health`（经 proxy） | `{"status":"ok","database":"ok"}` |
| 管理登录页 `/admin/login` | 200 |
| 客户端页 `/cases`、`/chat`、首页 | 200 |
| Agent `/internal/health` | ok（容器 healthy） |
| Worker 队列 | `inspect ping` → 1 node online |
| Beat 调度 | agent-heartbeat 每分钟正常投递 |
| 规划引擎黄金回归 | 5/5（golden + golden-snapshot） |
| 完整 Agent 闭环（LLM run） | 未在本窗口执行；由 Stage 06 验收证据 + 同一代码/凭据背书，作为上线后首次真实使用观察项 |
| RAG 检索 | Schema 就绪（agent 6 表）；生产尚无采集文档，属预期空态 |

**切换中修复的部署缺陷**（均已纳入交付物）：
1. web 镜像首次含 health route 的重建发生在 C 盘 100% 满时，ENOSPC 导致 standalone 产物静默截断（server.js/package.json 为 0 字节）→ `--no-cache` 重建后产物完整（server.js 7,243B）。
2. agent 健康检查原用 wget（python:slim 无 wget）→ 改为 python urllib 探测。
3. 新增 `src/app/api/health` 路由（REL-FR-009 应用健康端点，含数据库探测与 503 降级）。

## 4. 回退路径状态（REL-FR-011/012，零保留方针）

- 离线保险：最终导出 dump 已归档 `F:/Socila/.cutover-archives/neon-final-cutover.dump`（605,600 字节，两轮演练验证可完整恢复）；每日备份自今日起按 Runbook 执行。
- Neon：用户选择**零保留**——冒烟已全部通过，Neon 项目可随时由用户在控制台删除；仓库侧清理项见 §5。
- 回退步骤保留于 Runbook（数据侧路径已实测；入口侧不再适用——旧应用为唯一历史入口且无 DNS 切换）。

## 5. Neon 清理指引（用户执行，零保留方针）

1. 冒烟稳定运行 ≥24h 后：Neon 控制台 → 项目 → Delete（数据已迁移且本地有归档 dump）。
2. 本仓库后续清理（可由我执行）：移除根 `.env` 中 DATABASE_URL 的 Neon 连接串、CI 中 Neon 相关步骤（如有）；`guard.ts` 的远程门禁保留（防误配）。
3. 删除 Neon 前建议：控制台导出一次逻辑备份留存网盘（双保险，可选）。

## 6. 07.11 独立审查发现与修复（BLOCKED→APPROVED）

独立审查（07.11）抓到 1 项确定性回归并已修复：
1. **CORE-AC-001 门禁回归**：切换期新增的 `/api/health` route 直接导入 `@/lib/db`，违反 Stage 02 架构门禁（src/app 禁止直连数据库）。修复：数据库探测下沉为 `src/server/health.ts` 用例（`checkDatabaseHealth`），route 仅调用模块；重跑全套测试 **160 passed / 0 failed**。
2. **提交前卫生**：`.zcode/`（本地工具产物）加入 `.gitignore`。
3. **认证链路加固**：容器日志出现 next-auth `UntrustedHost`——反向代理后自托管必需 `trustHost: true`（已加入 `src/lib/auth.ts`）；验证登录 POST CSRF 流程 302 拒绝正常、UntrustedHost 0 命中。
4. progress.md 编辑性重复行清理。
修复后重建 web 镜像与容器：healthy、`/api/health` 经 proxy 返回 ok。

## 7. 结论

REL-FR-010～014 执行完毕：停写有基准、迁移有对账、冒烟全通过、回退有保险、切换有报告。**PolicyOps 已在生产单机栈上运行。**
