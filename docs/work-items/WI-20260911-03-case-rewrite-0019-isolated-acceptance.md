# WI-20260911-03：0019审计迁移、受控原位改写CLI与隔离验收

> Author: Jan
> Status: Accepted（2026-09-11，代码+测试+隔离演练；无持久库写入）
> Updated: 2026-09-11

## Work Item

- ID：WI-20260911-03
- 关联PRD：`docs/prd/09-11-feature-shanghai-case-library-v2.md`
- 关联需求：SHV2-FR-017～025、SHV2-NFR-004/006/007/008
- 关联验收：SHV2-AC-014～021
- 前置：WI-20260911-02 Accepted

## 范围

1. `drizzle/0019_case_rewrite_audit.sql`：只创建`case_rewrite_batches`与`case_rewrite_entries`（PRD §12.1），不更新业务数据；journal保持严格单调。
2. 独立CLI（`scripts/rcl-case-rewrite-v2.ts`，核心`src/lib/case-rewrite/`）：`audit`/`plan`/`apply`/`verify`。
3. 绑定：code SHA、planHash、targetFingerprint、36 cases、36 showcase、36 regression、44 examples、evidence artifacts、snapshot/release状态、before/after hash。
4. apply前置：`--i-am-authorized`、精确planHash与targetFingerprint、干净已提交工作树、持久库额外环境opt-in、默认拒绝`policyops`。
5. 事务：REPEATABLE READ + advisory xact lock + FOR UPDATE锁定108行；保留整数ID；V1→V2 UID原位升级；清空回归测试`last_run_result/last_run_at`；写1个batch + 恰好108条entries；COMMIT前重读全部hash；任一漂移回滚；复跑noop；部分完成→稳定state drift错误。
6. 隔离演练：随机端口全新PG17+pgvector与恢复副本；不得写`localhost:5432/policyops`。

## 测试矩阵（TDD Red先于实现）

| 场景 | 通过条件 |
| --- | --- |
| 0019两次执行 | 第二次no-op；cases/showcase/tests行零变化 |
| 缺授权/错hash/错指纹/policyops默认 | 零写入拒绝 |
| 行/来源/快照漂移 | 零写入拒绝 |
| 正常apply | 108行原位更新、整数ID不变、V2 UID、case_text非空、transcript_text NULL |
| 审计 | 1 batch + 108 entries，before/after完整、hash 64位hex |
| 并发 | 一方执行、另一方noop或重试后noop |
| 故障点 | 任一注入点全部回滚 |
| noop | 相同plan复跑noop:true |
| 恢复 | post dump新实例恢复全部表与sequence一致 |
| 最终状态 | 36/36/80（44 example+36 regression）、沪粤18/18 |

## 验收与回退

- SHV2-AC-014～021新鲜证据；14项完整门禁。
- 只交付代码与隔离证据；生成fresh只读授权包（code SHA、manifestHash、targetFingerprint、精确写集合、备份与回退点），不执行持久写入。

## 文档同步

- traceability、ARCHITECTURE、TESTING、OPERATIONS（受控改写runbook）、PROGRESS、PRD状态。

## 验收记录（2026-09-11，隔离库本地新鲜执行）

- 实现：`drizzle/0019_case_rewrite_audit.sql`（纯审计结构，journal严格单调0019=1788797000000）；`src/lib/case-rewrite/rewrite-v2.ts`（匹配/投影/计划/指纹/状态分类/单事务apply/verify）；`scripts/rcl-case-rewrite-v2.mjs`（audit/plan/apply/verify，policyops连接前拒绝）；`scripts/rcl-rewrite-drill-v2.mjs`（隔离演练编排）；schema新增两表Drizzle定义；`.gitignore`排除E2E状态文件。
- TDD：RED=单元14例模块缺失失败+迁移/集成失败；GREEN=单元14/14、迁移集成4/4、CLI集成8/8。
- 隔离演练（证据`rewrite-drill-evidence-2026-09-11T19-01-07-253Z.json`，9步全ok）：全新库baseline（36/36/80）→generate-v2→audit pending→plan 108条→守卫三反例零写入→apply applied=true→verify ok→复跑noop→0019×2幂等→post dump第三实例pg_restore+restore-reconcile全表+sequence对账→最终36/36/80、1批次、108entries、36条V2干净case。
- 门禁：全新库`test:db` 29文件/156零skip（含新增迁移4+CLI集成8例）；tsc 0；eslint 0 error；build 0；agent.migrate×2幂等；pytest integration 20/20零skip+非集成94；ruff/mypy 0问题；Chromium E2E 23/23——其中V2终态分支：shv2_e2e经受控改写（planHash fe92d7d8…，verify ok）后公开页可读问答/政策依据安全外链/管理后台结构化字段全部生效且无"待生成V2"提示；scan-secrets --all 914文件零命中；gitleaks全历史98提交——case-library manifest场景键触发的19条generic-api-key误报经人工核实后按ADR-0009登记"规则×路径"精确allowlist（哨兵回归3场景全过），复扫no leaks；migration-lf契约在提交态复跑7/7。
- 边界：持久policyops全程未连接未写入（守卫在连接前拒绝）；未创建持久快照/release；0019仅交付SQL（持久执行须另行fresh授权）；E2E状态文件已入.gitignore不入Git。
