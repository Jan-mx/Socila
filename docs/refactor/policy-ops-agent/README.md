# PolicyOps Agent重构文档

> Author: Jan
> Status: Active
> Updated: 2026-09-03

## 当前状态

七个重构阶段已经完成并通过阶段验收。当前应用采用Next.js Core、FastAPI、Celery、LangGraph、本地PostgreSQL、pgvector、Redis和MinIO。

09-02用户与管理员双角色鉴权Feature已Accepted；09-03 P0合并质量门禁与v0.2.0发布准备**Accepted（开发分支发布准备）**：六类门禁全部本地新鲜复现（全部退出0、零skip），workflow经actionlint 1.7.7静态校验零发现，`origin/main...ced6a5a`完整差异审阅完成（401文件，+32501/−1851）；PR、main ruleset、merge与tag/Release为未来人工动作（见`PROGRESS.md`精确下一步与PRD §17）。

09-03本地运行配置与凭据整改阶段（`docs/prd/09-03-stage-runtime-configuration-remediation.md`）**Accepted**：宿主/Compose环境加载与模板收口统一、管理员引导一次性化、新鲜备份经PG17+pgvector真实恢复对账、PostgreSQL口令完成轮换（轮换前后逐表对账34表/1610行一致），全部门禁本地新鲜复验（见`PROGRESS.md`与`reports/stage-09-03-runtime-config-remediation/acceptance-report.md`）。

本机作为开发环境，后续工作以远程Demo部署、真实Agent闭环、首批政策采集和持续质量建设为主。

产品需求见：[PolicyOps Agent PRD](../../prd/09-01-policy-ops-agent.md)。

## 开始工作

所有Agent先读取：

1. 仓库根`AGENTS.md`；
2. 本README；
3. `PROGRESS.md`；
4. 根据任务类型读取下表中的对应文档。

不要默认批量读取reports和archive。

## 当前文档

| 文件 | 用途 |
| --- | --- |
| `REFACTOR-PLAN.md` | 已完成的七阶段重构计划和结果摘要 |
| `ROADMAP.md` | 未来开发方向和优先级 |
| `PROGRESS.md` | 当前状态、阻塞和下一步 |
| `ARCHITECTURE.md` | 当前组件、数据和调用边界 |
| `TESTING.md` | TDD规则、测试命令和质量门禁 |
| `OPERATIONS.md` | 部署、资源、备份、恢复和告警 |

## 子目录

| 目录 | 用途 |
| --- | --- |
| `config/` | PolicyOps和SiliconFlow配置模板及验证记录 |
| `sources/` | 官方政策来源白名单 |
| `decisions/` | 当前生效的ADR（ADR-0007起；ADR-0001～0006在archive/decisions） |
| `reports/` | 阶段测试、验收、迁移和发布证据 |
| `archive/` | 旧PRD、memory-bank、历史ADR和被替代计划 |

## 阅读路由

| 任务 | 读取 |
| --- | --- |
| 产品行为 | 产品PRD |
| 接口、Schema、组件 | `ARCHITECTURE.md` |
| 测试、OCR、RAG质量 | `TESTING.md` |
| 部署、备份、恢复 | `OPERATIONS.md` |
| 安排后续开发 | `ROADMAP.md` |
| 查看当前状态 | `PROGRESS.md` |
| 调查历史决策 | `archive/`中的对应文件 |
| 核对执行证据 | `reports/`中的对应报告 |

## 不变量

- 规则引擎是政策数字结论的唯一计算来源。
- Agent只能创建draft，不能自动发布。
- 生产个人资料不得发送到政策模型服务。
- 原始政策文件和DocumentTree是审计事实源。
- 已发布规则、政策和快照不可原地修改。
