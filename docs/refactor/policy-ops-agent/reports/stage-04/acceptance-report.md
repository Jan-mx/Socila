# 阶段 04 验收报告

## 元数据

- 阶段：04 / Agent Runtime
- 分支 / 提交：`refactor/policy-ops-agent-platform`（基点 `fc43368` + 本阶段工作）
- 验收时间：2026-08-30
- 验收Agent：全流程自主 Goal Agent（ZCode）
- 结论：**PASS**

## 实现结构（`services/agent/`，Python 3.11 + uv）

| 组件 | 位置 | 说明 |
| --- | --- | --- |
| FastAPI 控制面 | `agent/api/app.py` | `/internal/health`、`/internal/ready`、`POST /internal/v1/agent-runs`（幂等）、`GET .../agent-runs/{id}`、`GET /internal/v1/proposals/{id}`、`POST .../review`（幂等）；OpenAPI 于 `/internal/docs`；仅内部前缀，不承载用户业务 |
| Celery/Redis | `agent/worker/celery_app.py` | 队列路由（graph/schedule/dead）、acks_late、prefetch=1、Beat 心跳、失败→死信队列 |
| 图执行任务 | `agent/worker/tasks.py` | start/resume：PostgresSaver Checkpoint、按错误分类有限重试+指数退避、失败落 run.status=failed |
| 错误分类 | `agent/errors.py` | 401/403/4xx 不重试；429/503/超时可重试；安全消息不含密钥 |
| 仓储 | `agent/repositories.py` | 协议 + InMemory（单测）+ Postgres（agent schema，psycopg）双实现 |
| LangGraph 骨架 | `agent/graph/` | TypedDict State（reducers）+ Fake 节点 extract→diff→retrieve_impact→draft→verify→human_review(interrupt)→materialize_draft；verify 限次回环；materialize 幂等 |
| Core 客户端 | `agent/core_client.py` | 服务身份/超时/trace 头的 HTTP 实现 + 确定性 Fake（幂等结果缓存、可注入故障） |
| Agent Schema | `agent/migrations/0001_agent_schema.sql` | agent schema：runs/artifacts/proposals/reviews/events |
| 角色隔离 | `agent/migrations/0002_roles.sql` + `agent/migrate.py --with-roles` | agent_app 角色仅授 agent schema；REVOKE public |
| 门禁 | `.github/workflows/ci.yml`（新增 agent-gates job 计划）；pytest 15 项 | |

## 验收场景

| 验收ID | 执行方式 | 结果 |
| --- | --- | --- |
| AGT-AC-001 Checkpoint 恢复 | `test_postgres_checkpointer_resume`：PostgresSaver 持久化 interrupt → 重建图 → Command(resume) 继续；created 调用恰好一次（前序节点不重复） | PASS |
| AGT-AC-002 创建幂等 | 同 Idempotency-Key 两次 POST → 同 run_id/thread_id、idempotent=true | PASS |
| AGT-AC-003 审核幂等 | 同键重复 review → 一次恢复、一次 created 调用、idempotent=true | PASS |
| AGT-AC-004 角色隔离 | agent_app 连接：agent 表可读写；`SELECT public.rules` → InsufficientPrivilege | PASS |
| AGT-AC-005/006 重试分类 | `test_retry.py`：429/503/超时 retryable；401/403/422 non-retryable；超限 → run failed 可见 | PASS |
| Fake 闭环（DoD） | 创建→暂停→approve/edit/reject 全路由（`test_api.py` + `test_graph.py`） | PASS |

## 验证命令

| 命令 | 退出码 | 摘要 |
| --- | --- | --- |
| `uv run pytest -q`（含集成，演练库） | 0 | 15 passed |
| `uv run python -c "import agent.worker.tasks, agent.api.app, agent.migrate"` | 0 | 模块导入完整 |
| `python -m agent.migrate --with-roles`（演练库） | 0 | agent schema + 角色就绪 |

## 安全与隐私

- 服务身份分离：agent_app 数据库角色对 public（core）schema 零权限（数据库 GRANT/REVOKE 实测）。
- 日志/错误消息不含密钥、Authorization、完整文档（classify_error 输出安全消息；事件 metadata 为固定 Fake 字段）。
- Core 写入仅 materialize_draft 节点，且只接受已批准状态；驳回不触发 Core 调用（测试断言）。

## 遗留问题

| 问题 | 严重度 | 处理决定 |
| --- | --- | --- |
| Celery Worker/Beat 运行时联调（Redis 容器编排）属阶段07部署范围 | 低 | 队列配置、重试与死信已实现并有单元覆盖 |
| HttpCoreClient 对接的 Next 内部 draft 导入端点在阶段06实现 | 低 | 端口与 Fake 已固定契约 |

## Git交付

- 提交：`feat: 建立可恢复的政策Agent运行时`
- 推送：`origin/refactor/policy-ops-agent-platform`；不建 PR、不合并 main

## 下一阶段输入（Stage 05 Ingestion/RAG）

- 可运行的 FastAPI/Celery/LangGraph 骨架与 Checkpoint 恢复。
- State/Artifact/Proposal/Review 契约固定；解析/OCR/索引节点可按同一接口替换 Fake。
- SiliconFlow 验证（05.7）使用 `scripts/validate-siliconflow.mjs` 流程与已就位密钥。
