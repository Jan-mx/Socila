# WI-20260906-02：阶段E持久库政策包快照repair

> Author: Jan
> Status: Ready
> Updated: 2026-09-06

## 关联

- 类型：受控持久库运维任务
- 产品：PolicyOps Agent
- 分支：`refactor/policy-ops-agent-platform`
- 前置任务：`WI-20260906-01-stage-e-pack-repair-hardening.md` Accepted
- 权威规格：`docs/prd/09-05-stage-national-baseline-regional-overlays.md`
- 运维入口：`docs/refactor/policy-ops-agent/OPERATIONS.md`阶段E runbook
- 验收证据目标：任务2验收报告§15（仅在真实执行后创建）

## 当前基线

截至2026-09-06只读核对：

- Drizzle迁移账本13条，最新0013；0014尚未应用。
- 业务计数：rules=49、params=70、rule_sets=5、policy_pack_versions=4、tests=528、cases=851、showcase_cases=117、policy_snapshots=0。
- `policy_import_batches=4`、`policy_import_batch_members=74`、上海published规则24条。
- 4个draft政策包快照存在已知漂移；repair代码与专用测试已由WI-20260906-01验收。
- `audit-policyops-stage-e-fix.json`基于旧提交`59a6467`，其中manifest hash和target fingerprint永久禁止作为本任务执行输入。

## 目标

- 在任何持久写入前取得可恢复、可对账的最新备份和fresh audit。
- 获用户单独明确授权后，仅对本机`localhost:5432/policyops`应用一次0014并执行一次四包draft快照repair。
- 证明repair后业务计数、上海published资产、规划行为和地区阻断状态不漂移。
- 证明repair幂等，且repair后数据库可通过37表、18 sequence真实恢复对账。

## 非目标与权限边界

- 本Work Item及其提示词本身不构成数据库写入授权。
- 未获得用户在执行任务中的明确授权前，只允许只读核对、备份、隔离恢复演练和audit。
- 不执行apply或Seed，不发布规则，不生成PolicySnapshot，不进行管理员批准或开放用户流量。
- 不连接远程数据库，不删除持久数据，不轮换Secret，不执行停写、入口或DNS切换。
- 不补齐广东、四川政策来源缺口；任务完成后任务2整体仍保持Reopened。

## 固定授权语句

阶段B开始前，执行Agent必须在同一任务中收到用户以下或语义完全等价的明确回复：

> 我明确授权：仅对本机localhost:5432/policyops执行一次0014迁移和一次四包draft政策包快照repair；不授权发布、快照生成、删除、远程库、Secret轮换或流量切换。

未收到该回复时必须停在阶段A报告，不得推断授权。

## 阶段A：只读准备与恢复门禁

1. 确认工作区干净、当前分支与`origin/refactor/policy-ops-agent-platform`同步，WI-20260906-01为Accepted。
2. 只读复核当前基线、四地区readiness和blocking reasons；任一值与本Work Item基线不符即停止并报告。
3. 创建紧邻操作时间的新`pg_dump -Fc`备份和SHA-256清单；备份位于Git忽略目录，不输出数据库口令。
4. 创建任务专属的全新PG17+pgvector恢复容器或数据库，恢复新备份。
5. 使用`scripts/restore-reconcile.ts`核对源库与恢复库的schema集合、37张BASE TABLE、18个sequence、行数及规范化整行哈希；任一不符即停止。
6. 基于当前HEAD和显式DATABASE_URL执行fresh audit，确认目标精确为`localhost:5432/policyops`、工作树资产干净、恰好4个draft包漂移，并保存新的manifestHash和targetFingerprint。
7. 向用户报告备份文件及SHA-256、恢复对账结果、目标、基线计数、4个漂移对象和阶段B拟执行操作，然后停止请求授权。

阶段A不得应用0014，不得执行repair，也不得把旧audit或旧指纹作为候选输入。

## 阶段B：授权后的受控写入

1. 再次确认授权语句、工作区/远端同步状态、显式目标和持久库基线均未变化。
2. 使用显式DATABASE_URL执行0014迁移；确认Drizzle账本变为14条、两个唯一索引和三项CHECK约束存在。任何不符立即停止。
3. 迁移后重新执行fresh audit；只使用这一次输出的manifestHash和targetFingerprint执行一次repair。
4. repair必须报告4个修复对象，并新增4个`status=repaired`批次和4个成员；原4个物化批次及74个成员保持原样。
5. 再次audit必须得到`packSnapshotDrift=[]`。使用新的audit输出复跑repair必须返回no-op，批次和成员不得继续增加。
6. 验证最终状态：业务计数49/70/5/4/528/851/117/0、batches=8、members=78、policy_snapshots=0、上海published规则24条；CN/沪awaiting_approval，粤/川blocked且原因完整。
7. 运行`scripts/planning-regression.ts`，输出必须与repair前基线逐字节一致。
8. 创建repair后备份和SHA-256清单，在新的全新PG17+pgvector目标恢复，并再次完成37表、18 sequence对账。
9. 任一步失败立即停止并保留证据，不继续管理员批准、候选快照或下游任务。

## 验收矩阵

| 项目 | 通过条件 |
| --- | --- |
| 授权 | 阶段B前存在本任务明确授权；范围精确为本机0014+一次repair |
| 备份恢复 | repair前后各有新备份、SHA-256，且37表+18 sequence完整一致 |
| migration | 账本14条；0014两个唯一索引、三项CHECK全部存在 |
| repair | 恰好4包修复；新增4个repaired批次和4个成员；旧审计不变 |
| 幂等 | repair后fresh audit零漂移；第二次repair为no-op且无新增审计 |
| 零漂移 | 业务计数、上海published整行哈希及planning-regression不变 |
| 地区边界 | 粤川继续blocked且原因完整；无PolicySnapshot、发布或流量变化 |
| 安全 | 日志、文档、Git均不含连接串、口令、Authorization或Secret |

## 失败与回退

- 阶段A任何恢复或audit不一致：停止，不申请写入授权。
- 0014失败：停止repair；记录迁移输出并评估是否处于事务回滚状态，不自行修改账本。
- repair失败：依赖单事务自动回滚；重新只读核对业务计数、批次和成员，禁止盲目重跑。
- repair提交后验收失败：停止所有后续写入；使用repair前已验证备份制定回退方案，并另行请求用户对恢复操作的明确授权。
- 不自动删除备份；任务专属演练容器和临时数据库在证据保存后清理，`socila-*`持久资源不得删除或重建。

## 文档与提交

真实执行完成后：

- 将本Work Item更新为Accepted并记录真实命令、时间、备份摘要和验收结果。
- 在任务2验收报告新增§15，不改写§11～§14历史证据。
- 更新README、PROGRESS、OPERATIONS和traceability；任务2仍保持Reopened。
- 运行Markdown链接、章节状态、`git diff --check`、`npm test`和`scan-secrets --all`。
- 检查完整staged diff和新增文本凭据特征。
- 提交`docs: 记录任务2持久库快照修复验收`并推送当前upstream；不创建PR，不合并main。

## 其他Agent执行提示词

```text
你正在F:\Socila仓库的refactor/policy-ops-agent-platform分支执行任务2的持久库repair操作。

首先读取：
1. AGENTS.md
2. docs/refactor/policy-ops-agent/README.md
3. docs/refactor/policy-ops-agent/PROGRESS.md
4. docs/work-items/WI-20260906-02-stage-e-persistent-repair.md
5. docs/prd/09-05-stage-national-baseline-regional-overlays.md
6. docs/refactor/policy-ops-agent/OPERATIONS.md
7. 任务2验收报告§11～§14

严格按照WI-20260906-02的权限边界、阶段A、阶段B、验收矩阵、失败与回退执行。本提示词不构成写入授权：先完成阶段A，只读报告后停止；只有用户在同一任务中明确授权“仅对本机localhost:5432/policyops执行一次0014迁移和一次四包draft政策包快照repair”后才能进入阶段B。

禁止复用audit-policyops-stage-e-fix.json或任何旧manifest hash/target fingerprint。禁止发布、PolicySnapshot生成、管理员批准、删除、远程库、Secret轮换和流量切换。任一计数、哈希、目标、恢复对账或状态不符立即停止，不猜测、不降低门禁、不盲目重试。

真实执行完成后更新WI-02、PROGRESS、OPERATIONS、traceability和任务2验收报告§15，任务2整体仍保持Reopened；检查完整staged diff和敏感信息，提交“docs: 记录任务2持久库快照修复验收”并推送当前upstream，不创建PR、不合并main。
```
