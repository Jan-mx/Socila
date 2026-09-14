# 任务4与持久替换第三轮独立复审报告

> Status: Reopened
> Date: 2026-09-09
> Scope: `codex/task34-regional-case-rebuild`截至`7b3f21a`及本机`localhost:5432/policyops`只读状态

## 结论

任务3代码验收保持Accepted；任务4和WI-20260907-04不能验收，WI-20260909-01不得执行。当前36/36/78数据字段初步完整，pre/post备份文件SHA与sidecar一致，因此默认冻结现状并准备repair-forward，不自动恢复pre dump。

## 阻断发现

| 等级 | 发现 | 证据与影响 |
| --- | --- | --- |
| P0 | 旧500 regression未绑定内容hash | `executor.ts`为旧test写空`contentHash`，apply只比较`sourceCaseUid`；两个新归档批次的500条test entry全部为空hash |
| P0 | 恢复报告可伪造verified | `verify-archive`只读取`status`；stage-a/stage-b报告的table/sequence明细为空、`sequenceCount=0`，不能证明文档声称的全表和20条sequence对账 |
| P0 | 最终状态与applied manifest不一致 | applied manifest包含49 example并声明85 tests；脚本在manifest生成后、apply事务外删除7条example，持久库最终只有42 example和78 tests |
| P1 | SHA与selection验证不完整 | SHA清单不要求精确覆盖全部文件；selection的`violations`硬编码为空，未验证真实配额 |
| P1 | migration账本非规范 | 账本21条，0012～0014重复登记；0015账本hash与当前SQL文件hash不一致 |
| P1 | 执行遗留 | 快照共10条，发布记录5条；归档批次2 applied+1 prepared，需要逐对象解释和repair-forward审计 |

## 只读事实

- 当前计数：cases=36、showcase=36、tests=78、policy_snapshots=10。
- tests来源：example=42、regression=36。
- 36 cases和36 showcase的scenario/asOfDate/input/expected/assertions/coverage/evidence/qualityBreakdown初步非空；36 regression无来源孤儿。
- pre dump SHA：`59ee2f5f…`；post dump SHA：`934c4758…`；两者实际文件SHA与sidecar一致。
- 最终开发分支为`7b3f21a`；目标`refactor/policy-ops-agent-platform`仍为`57f051d`，尚未合并。

## 重新验收条件

1. 修复旧test完整hash、manifest自校验、SHA精确覆盖、selection真实计算、restore正文及表/sequence验证。
2. 42条DSL example的保留/更新/新增/删除必须进入manifest并与案例替换同一事务。
3. 从pre dump重建旧500 regression可信归档，为当前36/36/78生成匹配的attestation manifest。
4. 只读确认0010～0018文件、实际Schema和账本后，另行授权repair-forward；不得直接重跑旧stage脚本。
5. 完整Node、随机端口隔离DB、Chromium、Python及安全门禁零skip后重新独立复审。

本报告不授权数据库repair、恢复pre dump、删除快照/批次、重跑apply或执行最终分支合并。
