# 阶段 02 验收报告

## 元数据

- 阶段：02 / Next Core
- 分支 / 提交：`refactor/policy-ops-agent-platform`（基点 `0f63530` + 本阶段工作）
- 验收时间：2026-08-30
- 验收Agent：全流程自主 Goal Agent（ZCode）
- 结论：**PASS**

## 需求追踪

| 需求ID | 实现位置 | 测试/证据 | 结果 |
| --- | --- | --- | --- |
| CORE-FR-001 模块 | `src/server/modules/`（九模块） | 边界扫描测试模块清单断言 | ✓ |
| CORE-FR-002 层边界 | 每模块 domain/application/infrastructure/contracts | README + 扫描器 | ✓ |
| CORE-FR-003 框架隔离 | `module-boundaries.test.ts`（全层禁 next/react/AI SDK；domain 禁 DB） | 扫描测试通过 | ✓ |
| CORE-FR-004 仓储拆分 | 五模块读写端口+Drizzle 实现（42 函数全覆盖） | 对账 12/12（Git 历史留证）+ CRUD/回滚/并发 3/3 | ✓ |
| CORE-FR-005 用例层事务/权限 | `compute-plan.use-case.ts`、`conversation.use-case.ts`、`publish-use-case.ts`、`withTransaction` | Fake 端口单测 9 项（无框架无DB） | ✓ |
| CORE-FR-006 Route 瘦身 | 22 路由+1 页面迁移，直连 db 归零 | AC-001 自动化扫描 + node 复核 0 命中 | ✓ |
| CORE-FR-007 输入隔离 | `test-runner.ts` 深拷贝修复 | `input-isolation.test.ts` 4 项（含历史污染场景零漂移） | ✓ |
| CORE-FR-008 本地驱动 | `src/lib/db/index.ts` pg.Pool + node-postgres；无 Neon 依赖 | 仓储集成测试 + 构建（惰性初始化） | ✓ |
| CORE-FR-009 资源所有权 | `identity/domain/owner.ts` + migration 0002（owner_user_id）+ 路由接线 | 权限矩阵 7/7 + 真机归属拒绝 | ✓ |
| CORE-FR-010 Agent 端口 | `agent-integration/application/ports.ts`（PolicyContextPort/DraftMaterializationPort） | 端口定义 + 用例层引用 | ✓ |

## 验收场景（真机/新鲜执行）

| 验收ID | 执行方式 | 结果 | 证据 |
| --- | --- | --- | --- |
| CORE-AC-001 Route 依赖检查 | 自动化扫描测试 `route-dependencies.test.ts` + node 实测 | PASS | src/app 下 `@/lib/db`、`@/lib/db/schema`、`@/lib/db/queries` 导入 0 处 |
| CORE-AC-002 跨用户越权 | dev 服务器（演练库）真机：A 创建方案→A 读 200→B 读 404→无会话读 404；会话删除 403/404 由用例测试覆盖 | PASS | 响应 `{"error":"未找到规划方案"}`（404 不可枚举） |
| CORE-AC-003 本地 PostgreSQL 行为与基线一致 | dev 服务器全程指向演练库；showcase/plan 接口 200；仓储对账（02.2/02.3）15/15 | PASS | 黄金快照 28 条不变 + 真机 200 |
| CORE-AC-004 引擎复用输入重复执行 | `input-isolation.test.ts` | PASS | 结果一致、输入未污染、黄金快照不变 |
| CORE-AC-005 数据库不可用返回 503 | 真机停止演练库容器：`/api/showcase-cases` → 503 `{"error":"服务暂时不可用，请稍后重试","requestId":...}`；日志仅含操作名/requestId/消息（57P01） | PASS | mapRouteError 接入 5 个公开业务路由（chat 为 SSE 流式语义，单独处理留待后续阶段） |
| CORE-AC-006 无数据库网络构建成功 | `npm run build`（构建期 Pool 惰性初始化，无连接） | PASS | 退出码 0 |

## 验证命令

| 命令 | 退出码 | 摘要 |
| --- | --- | --- |
| `npm test` | 0 | 23 文件：22 通过 + 1 skipped；146 通过（原 112 项全部保持） |
| `npx eslint src` | 0 | 无告警 |
| `npx tsc --noEmit` | 0 | 类型通过 |
| `npm run build` | 0 | 生产构建成功（无 DB 网络） |
| 真机冒烟（dev @ 演练库） | — | AC-002/003/005 场景全部复现 |

## 安全与敏感信息

- Secret 扫描：候选零命中（scan-secrets 门禁）。
- local 配置 ignore：`siliconflow.local.env`、`infra/dev/.env` 均被忽略（01.5 已验证规则覆盖）。
- 个人数据检查：真机测试使用的会话/方案均为测试自建数据（演练库，非生产）；Neon 未触碰（02.5 事故后已加 db-guard 防呆门禁）。
- 权限与越权测试：ownership 矩阵 7/7 + 真机 AC-002。

## 遗留问题

| 问题 | 严重度 | 处理决定 | 负责人 |
| --- | --- | --- | --- |
| BLOCKER-001（Neon showcase_cases 漂移）：显式 migration 0001 已就绪，生产应用待授权 | 中 | 阶段07迁移路径执行（用户授权 + transcript_text 数据保全） | 用户 + Goal Agent |
| chat 路由 DB 故障时依赖 SSE 语义（未接 503 映射） | 低 | 记录为后续增强；chat 已迁至模块仓储，无直连 db | Goal Agent（后续阶段） |
| dev 服务器在反复硬杀数据库后 Pool 会出现挂起连接（CLOSE_WAIT 堆积，需重启进程恢复） | 低 | 开发期现象；生产就绪的连接池恢复/超时防护属阶段07运维能力 | Goal Agent（07.1） |
| 02.2 事故整改项：Neon 曾被误 seed（无数据丢失） | 已闭环 | db-guard 门禁已实施并验证 | — |

## Git交付

- 提交：`refactor: 完成Next Core领域模块化`（本报告随该提交交付）
- 推送结果：`origin/refactor/policy-ops-agent-platform`
- PR：不自动创建；不合并 main

## 下一阶段输入（Stage 03 Policy Model）

- 稳定领域端口与事务边界（rules/planning/publishing 仓储 + withTransaction）。
- 本地 PostgreSQL 驱动与 migration 流程（0000~0002 已入库，drill 环境可复现）。
- 规则/参数仓储可扩展为 PolicyContext 快照源（03.5 不可变快照）。
- Agent 集成端口已定义（03 中 PolicyContextPort 仍未实现，阶段03交付 Jurisdiction/overlay 后由 agent-integration 组合）。
