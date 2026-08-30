# 阶段 06 验收报告

## 元数据

- 阶段：06 / Policy Drafting
- 分支 / 提交：`refactor/policy-ops-agent-platform`（基点 `d20ca01` + 本阶段工作）
- 验收时间：2026-08-30
- 验收Agent：全流程自主 Goal Agent（ZCode）
- 结论：**PASS**

## 实现结构

| 组件 | 位置 | 说明 |
| --- | --- | --- |
| 条款树 Diff | `services/agent/agent/drafting/diff.py` | 增/删/改/移/拆/合 + 相似度与路径证据（规范化文本匹配） |
| 影响检索 | `agent/drafting/impact.py` | 业务键/数值词面、规则定义重叠、参数引用、测试 rule_refs、RAG 证据通道；ImpactItem 带解释/引用/通道 |
| DraftBundle 契约 | `agent/drafting/bundle.py` | Pydantic 模型（畸形拒绝）；verify（引用/状态/依赖/回归）+ revise 限次修正 |
| 审核体验 | `src/app/admin/review/page.tsx` + `/api/admin/proposals`（代理） | 管理员批准/驳回/理由；NextAuth admin 校验；服务身份转发 |
| Core 物化 | `src/server/modules/agent-integration/application/materialize.ts` + `/api/internal/v1/draft-imports` | Zod 二次校验、幂等台账（agent_materializations）、stale 快照 409、非 draft 403 安全事件、只创建 draft |
| 闭环样本 | `tests/test_closed_loop.py` | 上海最低工资 2024→2025 真实调整样本全链路 |

## 验收场景

| 验收ID | 执行方式 | 结果 |
| --- | --- | --- |
| DRF-AC-001 Diff 与标注一致 | `test_diff_labeled_changes` + 闭环样本（第一/二条 modified、第三条未变） | PASS |
| DRF-AC-002 影响召回 ≥90% | `test_impact_recall_labeled_set`：3/3 标注实体召回（100%）且每项有解释与引用 | PASS |
| DRF-AC-003 缺引用不可批准 | `test_verify_fails_without_citations`：can_review=False | PASS |
| DRF-AC-004 编辑批准保留原稿 | `test_closed_loop`：agent_original=2740 保留 + admin_patch=2745；API 审核流覆盖 | PASS |
| DRF-AC-005 幂等物化 | `materialize.test.ts`：同键二次调用 idempotent=true、draft_ids 相同 | PASS |
| DRF-AC-006 基准快照变化拒绝 | stale base_snapshot_id → 409「重新运行影响分析」 | PASS |
| DRF-AC-007 production 提交拒绝 | parseAndReject → 403 non-draft-status + 安全事件日志 | PASS |

## 验证命令

| 命令 | 退出码 |
| --- | --- |
| `uv run pytest -q`（41 项） | 0 |
| `npm test`（160 通过） | 0 |
| `npx eslint src` / `npx tsc --noEmit` / `npm run build` | 0 / 0 / 0 |

## 安全与权限

- Core 二次校验不信任 Agent：Zod 重校验 + 引用/状态/快照新鲜度检查（不信任 Agent 校验结果）。
- 非 draft 状态提交 → 403 + `[security]` 日志（AC-007）；前端不接触 published/version/数据库 ID。
- 管理员身份经 NextAuth（`auth()`）校验后才转发 FastAPI；服务身份头 X-Service-Name（阶段07升级 ADR-0005 JWT）。
- 审核物化日志不含完整个人案例输入。

## 遗留问题

| 问题 | 处理决定 |
| --- | --- |
| Faithfulness/影响召回的正式评测集扩展（当前标注集 3 实体 1 政策对） | 随真实政策运营持续扩充（quality-gates 允许提高阈值） |
| 管理员编辑 UI 的并排原文定位 | 最小可用版已交付（草案 JSON + 状态 + 决策）；并排视图随后台完善 |
| BLOCKER-001（Neon 漂移） | 维持挂起至阶段07授权路径 |

## Git交付

- 提交：`feat: 实现政策影响分析与草案审核闭环`
- 推送：`origin/refactor/policy-ops-agent-platform`；不建 PR、不合并 main
