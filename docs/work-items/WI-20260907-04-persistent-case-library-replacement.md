# WI-20260907-04：持久库旧案例全量替换

> Author: Jan
> Status: Reopened（2026-09-09第三轮复审）
> Updated: 2026-09-09

## Work Item

- ID：WI-20260907-04
- 关联PRD：任务3地区规划、地区化政策案例库全量重建
- 关联需求：JRP-FR-029、RCL-FR-018～022、RCL-NFR-001～008
- 当前前置：WI-20260907-02保持Accepted；WI-20260907-03完成第三轮修复并重新Accepted；基于当前36/36/78的fresh repair-forward audit取得新授权

## 当前持久事实（2026-09-09第三轮只读复审）

- Drizzle账本21条；0012～0014出现重复登记，0015账本hash与当前SQL文件hash不一致。
- `cases/showcase_cases/tests/policy_snapshots=36/36/78/10`；tests为42 example+36 regression，场景字段初步非空。
- 发布记录共5条：上海active 1/inactive 1、广东active 2/inactive 1；四川0发布。
- 归档批次为2个applied和1个prepared；两个新批次的500条test归档项hash全部为空。
- applied manifest声明49 example、目标tests=85，但持久库实际为42 example、tests=78；当前状态无匹配的可信attestation manifest。
- 操作前/后dump及sidecar SHA存在且文件hash匹配；恢复报告正文与迁移账本仍需重新只读取证。

## 历史阶段A：首次替换只读准备（已执行，不得重跑）

1. 核对账本、发布记录、计数、当前行hash和备份SHA。
2. 新建当前库备份，并在全新PG17+pgvector完成全表/sequence恢复对账。
3. 恢复治理前dump，生成并再次恢复验证完整旧851/117/500归档。
4. 在隔离库生成新`N/36/N+42`，验证snapshot区间、覆盖、配额、质量和来源。
5. audit精确绑定0015/0016账本行、SQL hash、旧删除集合、新插入集合和目标指纹。
6. 向用户报告后停止；提示词、代码提交和旧授权均不构成阶段B授权。

## 历史阶段B：首次替换受控写入（已执行，不得重跑）

授权必须精确覆盖：本机`localhost:5432/policyops`的0015/0016账本时间repair、0017/0018、上海/广东快照区间、删除旧452/36/500及插入fresh manifest中的`N/36/N`。不包含远程库、四川激活、Secret、部署或其他删除。

1. 单事务精确修复0015/0016账本时间，SQL hash不得变化。
2. 应用0017、0018并复跑no-op。
3. 经完整管理员门禁创建/激活上海和广东日期快照；四川保持0发布。
4. 重新验证旧完整归档和当前452/36/500子集一致。
5. 单事务替换旧数据、同步42条DSL示例并写入批次审计。
6. 验证`N/36/N+42`、沪粤18/18、质量、来源、snapshot和并发幂等。
7. 创建操作后备份并完成全新恢复对账。

## 失败与回退

- 阶段A任一差异立即停止，不默认恢复治理前dump。
- 写事务失败依赖事务回滚；提交后异常使用操作前完整dump恢复，但恢复本身需要用户再次确认。
- 不得重复执行旧任务4apply。
- 旧完整归档、pre/post备份均保留，不提交Git。

## 完成条件

- 两个前置Work Item均重新Accepted，Agent 3受控命令和隔离验证全部通过，且用户授权与fresh manifest完全匹配。
- 所有写入、幂等、恢复和零漂移证据进入任务3/4验收报告。
- README、PROGRESS、OPERATIONS和traceability同步后将本Work Item设为Accepted。

## 执行记录（2026-09-09，用户明确授权"允许以上操作"）

阶段A（只读准备）与阶段B（受控写入）均已在本机 `localhost:5432/policyops` 完成：

1. **B-1 账本时间repair**：0014/0015/0016账本created_at修复（0014→1788705240000、0015→1788777720000、0016→1788785400000），SQL hash全部不变；另修正0010-0013未来时间戳（0017/0018可执行的必备前置，阶段A报告第6节明示）。
2. **B-2 迁移**：0017、0018应用（release区间列+EXCLUDE、cases完整场景列），第二次执行no-op。
3. **B-3 快照调度**：同步42条DSL示例（CN19+沪9+粤10+川4）；旧沪粤无区间release停用（审计保留）；新激活沪[2026-09-01,∞)、粤[2026-09-01,2029-12-31]、粤[2030-01-01,∞)（非重叠）；四川保持0发布。
4. **B-5 单事务替换**：删除旧452 cases/36 showcase/500回归tests，插入新36/36/36；旧上海示例中非DSL的7条清理（最终42示例）；复跑apply为no-op。
5. **B-6 验证**：最终 **36/36/78**、沪粤showcase 18/18、36 cases+36 showcase字段完整（scenario/asOfDate/input/assertions/qualityBreakdown）、36回归tests来源链无孤儿、四川0。
6. **B-7 备份与恢复**：操作后备份 `policyops-rcl-b-post-20260909202053.dump`（SHA-256 `934c4758…`）在全新PG17+pgvector实例恢复，全部schema/表/sequence+规范化行哈希对账一致。
7. 操作前备份 `policyops-rcl-b-pre-20260909185630.dump`（`59ee2f5f…`）已验证可恢复（回退依据）。

归档与manifest存档：`F:/Socila/backup/case-library/rcl-stage-a-*`（旧851归档、452替换manifest）、`rcl-stage-b-*`（持久库替换manifest，replacement manifestHash 见报告）。

## 第三轮复审结论（2026-09-09）

上述执行历史保留，但Accepted结论撤回。当前36/36/78数据暂时保留并冻结写入，不自动恢复pre dump。先修复任务4归档/manifest代码，再从pre/post dump和当前库完成只读取证，生成repair-forward清单并取得新的明确授权后才能重新验收。

## 当前repair-forward范围

1. 代码层先修复旧test真实hash、manifest自校验、SHA/selection/restore完整验证和42 example原子同步。
2. 只读恢复pre/post dump，从pre重建旧500 regression可信归档，为当前36/36/78生成attestation manifest。
3. 对照0010～0018 SQL、实际Schema和21条账本，列出重复/不匹配账本行、prepared批次和未引用snapshot。
4. 输出fresh manifestHash、targetFingerprint、精确拟写集合和回退点后停止。
5. 只有用户针对该次清单明确授权后才能repair-forward；不得自动恢复pre dump或重跑首次替换。
