# WI-20260906-01：阶段E政策包快照repair加固

> Author: Jan
> Status: Ready
> Updated: 2026-09-06

## 关联

- 类型：中型缺陷修复
- 产品：PolicyOps Agent
- 分支：`refactor/policy-ops-agent-platform`
- 权威规格：`docs/prd/09-05-stage-national-baseline-regional-overlays.md`
- 需求：NRP-FR-017～020、NRP-NFR-009～012、NRP-AC-011～015
- 验收证据：`docs/refactor/policy-ops-agent/reports/stage-09-05-national-baseline-overlays/acceptance-report.md`

## 背景与已核实事实

阶段E复审缺陷修复已由提交`b2bd64f`实现并通过既有门禁，但持久库的4个draft政策包仍保存旧版不完整参数快照。当前不得直接执行repair，原因如下：

- 持久库业务计数为49/70/5/4/528/851/117/0，`policy_import_batch_members=74`，上海published规则24条。
- 持久库Drizzle账本只有13条记录，最新为0013；0014唯一索引和CHECK约束尚未应用。
- `audit-policyops-stage-e-fix.json`的`sourceCommit=59a6467`，早于当前HEAD；其中manifest hash和target fingerprint只能作为历史证据，不能用于未来repair。
- 当前repair目标指纹只覆盖固定计数与published行哈希，未绑定将被修改的draft政策包内容；audit后发生的draft编辑可能被覆盖。
- repair没有数据库集成测试，现有单测只证明新快照载荷构造完整，尚未证明真实落库、并发、回滚和幂等语义。
- 当前repair批次使用`status=applied`、粤川`blockingReasons=[]`，并改写原物化批次成员，无法完整保留“原始导入→后续修复”的审计链。

## 目标

- repair只修改audit精确绑定的draft政策包快照，不覆盖audit之后的任何变更。
- 四地区修复在单个事务中完成；任一校验、更新或审计写入失败时全部回滚。
- repair审计保留原物化记录，并以确定性身份记录修复后的政策包成员。
- 并发或重复repair只产生一组修复结果；后续fresh audit+repair返回no-op。
- 通过独立演练库测试证明授权、指纹、原子性、审计、计数和published零漂移。

## 非目标与权限边界

- 本Work Item不授权对本机持久库执行0014、repair、apply、发布或PolicySnapshot生成。
- 不授权远程数据库写入、删除数据、Secret轮换、管理员批准或用户流量激活。
- 不补齐广东、四川政策来源缺口，不改变任务2整体`Reopened`状态。
- 不创建PR，不合并`main`。

## 实现要求

1. 扩展目标状态与指纹，使其绑定四个目标draft包的行ID、地区、pack ID、版本、状态、`param_snapshot`规范化哈希及对应批次成员哈希；不得把连接串或凭据写入指纹、日志和报告。
2. repair在事务内锁定全部目标行，重新读取并校验目标指纹、draft状态、版本和旧哈希；与audit不一致时零写入退出。
3. repair只在全部目标通过校验后更新快照；每次更新必须断言恰好影响一行。
4. repair批次使用由基础manifest hash、地区、pack ID、版本、旧/新content hash确定性生成的修复hash，状态使用`repaired`。
5. repair批次沿用Manifest中的地区readiness和blocking reasons；广东、四川不得写成空阻断原因。
6. 原物化批次和成员保持不可变；每个repair批次新增一条`policy_pack_version`成员，记录目标行、业务键、版本和新content hash。
7. 0014的`(jurisdiction_code, manifest_hash)`唯一约束承担并发裁决；唯一冲突后重新读取状态，若目标已完全一致则返回no-op，否则报错。
8. CLI按实际修复数量输出结果，不固定声称4个；audit继续明确列出drift，并输出可供同一次repair使用的目标指纹。
9. 成功repair后业务实体计数仍为49/70/5/4/528/851/117/0、published上海规则仍为24；预期审计批次4→8、成员74→78。这里的“业务计数不变”不包含新增的修复审计行。

## 测试矩阵

| 场景 | Red要求 | Green通过条件 |
| --- | --- | --- |
| 授权守卫 | 缺授权、错误manifest hash或错误指纹 | 拒绝且政策包、批次、成员零变化 |
| audit后变化 | 修改draft快照、状态、版本或成员hash | repair拒绝，不覆盖新值 |
| 正常修复 | 4个旧格式draft包 | 4包全字段与Manifest一致，4个repaired批次及4个成员落库 |
| 事务回滚 | 在第2～4个包更新或审计写入时注入失败 | 四包、批次和成员全部回到操作前状态 |
| 并发 | 两个repair使用同一fresh audit输入 | 仅一组修复审计；另一调用复核后no-op |
| 重复执行 | 成功后重新audit并repair | no-op，批次和成员不再增加 |
| 零漂移 | 比较操作前后业务计数和published整行哈希 | 49/70/5/4/528/851/117/0及上海published哈希不变 |
| 地区语义 | 检查4个修复批次 | CN/沪awaiting_approval；粤/川blocked且原因完整 |

测试优先扩展`src/lib/policy-materialization/materializer.integration.test.ts`；只有确有职责边界需要时才新增聚焦的repair集成测试文件。Red输出和Green结果记录到任务2验收报告，不用泛化全量门禁替代专用覆盖。

## 持久库后续执行门禁

本Work Item代码与测试Accepted后，仍必须另行取得用户对“一次0014 migration + 一次repair”的明确授权。获授权后的顺序固定为：

1. 只读基线与fresh备份。
2. 全新PG17+pgvector恢复并对账37表、18 sequence。
3. 显式DATABASE_URL应用0014。
4. 在当前HEAD重新audit；不得复用`audit-policyops-stage-e-fix.json`中的旧hash或指纹。
5. 使用同一次audit输出执行repair。
6. 再次audit确认`packSnapshotDrift=[]`；用新的audit输入复跑repair并确认no-op。
7. 复核业务计数、published整行哈希、规划回归、地区readiness与blocking reasons。
8. 创建repair后备份，在全新恢复库再次完成37表、18 sequence对账。

任何一步失败立即停止，不继续管理员批准或候选快照流程。

## 回退

- 代码层：使用正常反向提交撤回本Work Item，不改写共享分支历史。
- 演练库：删除任务专属数据库或容器；不得删除`socila-*`持久资源。
- 持久库：未来获授权执行时，repair事务失败自动回滚；事务提交后的回退只能使用紧邻操作前的已验证备份，并需新的明确授权。

## 文档同步

- `docs/prd/09-05-stage-national-baseline-regional-overlays.md`
- `docs/refactor/policy-ops-agent/{README,PROGRESS,ARCHITECTURE,TESTING,OPERATIONS}.md`
- `docs/refactor/policy-ops-agent/reports/{traceability.md,stage-09-05-national-baseline-overlays/acceptance-report.md}`

## 完成条件

- 专用Red/Green证据覆盖测试矩阵全部场景。
- 目标测试、受影响模块套件和项目门禁全部新鲜通过，零skip、Build零warning。
- 无`.env.local`的干净环境中Node单测通过。
- 文档只记录实际发生的验证；不得提前声称0014或repair已在持久库执行。
- Work Item更新为Accepted，任务2整体继续保持Reopened。
- 完整staged diff与敏感信息检查通过。
- 创建并推送单一提交：`fix: 加固政策包快照修复事务与审计`。

## 其他Agent执行提示词

```text
你正在F:\Socila仓库的refactor/policy-ops-agent-platform分支工作。

目标：执行docs/work-items/WI-20260906-01-stage-e-pack-repair-hardening.md，只完成repair代码加固、测试和文档同步。不得执行本机持久库migration、repair、apply、发布、管理员批准、PolicySnapshot生成、数据删除或用户流量激活。

开始前必须读取：
1. AGENTS.md
2. docs/refactor/policy-ops-agent/README.md
3. docs/refactor/policy-ops-agent/PROGRESS.md
4. docs/work-items/WI-20260906-01-stage-e-pack-repair-hardening.md
5. docs/prd/09-05-stage-national-baseline-regional-overlays.md
6. 与任务直接相关的ARCHITECTURE.md、TESTING.md、OPERATIONS.md
7. 验收报告中任务2复审、缺陷修复与repair准备章节

严格按Work Item的范围、实现要求、测试矩阵、持久库边界和完成条件执行。先写最小失败测试并保存Red证据，再实现最小修复；不要降低约束、测试、引用或验收阈值。工作期间将受影响README设为Updating，验收完成后恢复Active。

至少运行repair专用单元/数据库集成测试、npm test、npm run test:db、npx tsc --noEmit、npx eslint src scripts、npm run build、npm run test:e2e:auth、Agent ruff/mypy/非集成与集成pytest、Gitleaks、scan-secrets和allowlist哨兵，并在无.env.local环境复跑Node单测。演练设施使用任务专属名称并在finally清理，不触碰socila持久资源。

完成后更新Work Item验证结果并设为Accepted，更新PROGRESS、traceability和验收报告的实际证据；任务2整体仍保持Reopened。检查完整staged diff和敏感信息后，提交fix: 加固政策包快照修复事务与审计并推送当前upstream。不要创建PR或合并main。最终明确报告提交SHA、门禁结果以及“未执行0014、未执行repair、未修改持久库”。
```
