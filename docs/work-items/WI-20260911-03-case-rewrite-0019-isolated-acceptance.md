# WI-20260911-03：0019审计迁移、受控原位改写CLI与隔离验收

> Author: Jan
> Status: Draft（等待WI-20260911-02 Accepted）
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
