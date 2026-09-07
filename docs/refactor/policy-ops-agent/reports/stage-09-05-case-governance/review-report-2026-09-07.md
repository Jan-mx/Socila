# 任务4案例治理独立复审报告

> Status: Reopened
> Date: 2026-09-07
> Scope: 分支`codex/task4-case-governance`提交`e26a543`、本机归档元数据和持久计数的只读复审

## 结论

原452/36/528 Accepted结论撤销。持久库当前计数确为452/36/528，但归档安全、精确删除、快照重放和质量落库不满足旧PRD；不得原样集成或重复运行旧apply。地区化重建由WI-20260907-03定义，持久替换由WI-20260907-04控制。

## 阻断发现

| 等级 | 发现 | 影响 |
| --- | --- | --- |
| P0 | 归档代码默认计算`sha256(fileName)`而非文件内容；实际记录SHA全部与真实文件不符 | 删除前恢复门禁无效 |
| P0 | `selection-report.json`缺失、`restore-report.json`仍pending | 归档包不完整且没有最终恢复证明 |
| P0 | manifest未绑定目标行ID/内容hash、snapshot/hash、评分或500来源映射 | 内容漂移后旧授权仍可能删除新内容 |
| P0 | 81条已删展示归档记录的内容hash全部为`pending` | 无法审计被删展示内容 |
| P1 | 无可比较expected字段时仍判match并获得快照重放分 | 36条快照验证结论不成立 |
| P1 | 当前452 cases和36 showcase的quality_score全部为空 | 质量治理未落库 |
| P1 | 回归来源链只在提交后verify；并发apply无行锁/唯一约束 | 失败不可回滚且可重复归档 |
| P1 | 地区默认硬编码310000，地区证据函数未接入 | 无法证明逐行按来源确认上海 |
| P2 | 管理查询用OR合并active与搜索条件 | 搜索可能返回非active案例 |
| P2 | 缺少任务4专用Chromium E2E及架构、测试、运维同步 | Definition of Done不完整 |

## 数据安全事实

- 治理前完整dump`policyops-clg-pre-20260907205041.dump`及独立SHA文件存在且文件hash匹配。
- 治理后完整dump`policyops-clg-post-20260907210354.dump`及独立SHA文件存在且文件hash匹配。
- 这两个完整dump是潜在恢复点，但现有case-library目录不能标记为可信归档。
- 不默认把治理前dump恢复到持久库；先在隔离库按新归档器恢复和封装。

## 当前边界

- 当前452/36/528保持不变，旧500回归tests尚未删除。
- 任务4代码修复阶段不得连接或写本机持久库。
- 新数据和可信归档完成前不得删除当前剩余案例。
- WI-20260907-04的fresh audit和用户明确授权是任何持久替换的必要前置。
