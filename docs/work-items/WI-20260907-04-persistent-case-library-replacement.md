# WI-20260907-04：持久库旧案例全量替换

> Author: Jan
> Status: 等待复审（2026-09-10用户明确授权后repair-forward已在本机policyops单事务执行并12项验证全过；独立复审通过前不标记Accepted）
> Updated: 2026-09-10

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

1. 代码层先修复旧test真实hash、manifest自校验、SHA/selection/restore完整验证和42 example原子同步。**已完成（WI-20260907-03第三轮，2026-09-10）**；第四轮再修复prepare-archive补偿（失败不留prepared批次/entries、只精确清理本次batchId、补偿错误与原错误同报）、applied幂等重验（先完整重验manifest正文hash/批次hash/最终N/36/N+42/42 example/逐行hash才noop，漂移稳定错误零写入）、migration换行契约（`.gitattributes` eol=lf，Drizzle读取hash===Git blob LF SHA）、迁移审计语义（blob/raw/LF/CRLF/账本/仅EOL/真实差异+journal与账本时间严格单调核对）。**已完成（第四轮）**；第五轮（代码提交`1fe702b`）修复journal非单调（0010～0014 when改为严格单调：1788560000000/1788600000000/1788640000000/1788680000000/1788705240000，0015～0018不变；SQL零修改）、新增migration账本回归（隔离库删除18/19/20后migration×2 no-op等8项）、审计journal不符由仅报告改为阻断、新增Git blob LF hash匹配与归档目录保护。**已完成（第五轮）**。
2. 只读恢复pre/post dump，从pre重建旧500 regression可信归档，为当前36/36/78生成attestation manifest。**已完成（第四轮只读）**：可信归档永久保存于`F:/Socila/backup/case-library/task34-r4-trusted-old-2026-09-10T06-59-14/`（manifestHash `da0ea94d…`、dumpSHA `0e3c3d8b…`、452/36/500全逐行ID/UID/64位hash、500 test hash全部非空、verified restore-report 40表+20 sequence、sha256sums恰好7文件、第三库二次对账一致）；**第五轮只读复验（2026-09-10）**：8文件完整、SHA全部匹配、manifest 452/36/500、500 test hash全部非空、restore 40表/20 sequence/零mismatch、第三库再次恢复一致（40表/20 sequence/零mismatch），目录未覆盖未删除。当前36/36/78 attestation绑定代码提交`1fe702b…`（attestationManifestHash `8941655b…`）。
3. 对照0010～0018 SQL、实际Schema和21条账本，列出重复/不匹配账本行、prepared批次和未引用snapshot。**已完成（第四轮只读）**：迁移换行审计确认ID 10/11/12/13/14/15/21/22账本hash===0010～0018 Git LF内容（0010/0011/0015为原值不得更新）；ID 18/19/20===0012/0013/0014的CRLF重复登记；ID 17缺号不补写；prepared批次`91d60c5f`；未引用snapshot（CN两条重复、310000 `1f0b0e1e`）。**第五轮**：journal已修正为严格单调并与账本created_at一致（journal非单调从此为阻断错误），ID 10～16、21、22账本hash===Git blob LF SHA为阻断门禁。
4. 输出fresh manifestHash、targetFingerprint、精确拟写集合和回退点后停止。**已完成（第四轮）**：`F:/Socila/backup/case-library/task34-r4-audit-2026-09-10T06-59-14/repair-forward-plan.json`（codeSha `579fed8…`）。**第五轮重新生成（2026-09-10，代码提交`1fe702b`之后）**：`F:/Socila/backup/case-library/task34-r4-audit-2026-09-10T10-12-35/repair-forward-plan.json`（codeSha `1fe702b…`、trustedArchiveManifestHash `da0ea94d…`、trustedArchiveDumpSha `0e3c3d8b…`、attestationManifestHash `8941655b…`、migrationLedgerFingerprint `492c5fbe…`、targetFingerprint `56c479de…`、journalCheck.journalMonotonic=true、ledgerRegressionNoopAfterDelete=true；精确SQL写集合10步不变：只删除账本ID 18/19/20、prepared批次91d60c5f→rolled_back、新增restore_verified可信归档批次+988条entries、业务数据零变化；前置条件/事务边界T1/T2/T3/回退点/失败条件；预期最终账本18条、fingerprint `25d10e62…`）。**第六轮已由绑定`8b360c2…`的单事务可执行写集合取代（executable-write-set.json，planHash `db55e4ab…`；不再拆分T1/T2/T3，见下文第六轮小节）。**
5. 只有用户针对该次清单明确授权后才能repair-forward；不得自动恢复pre dump或重跑首次替换。

## 第六轮：repair执行器隔离验收（2026-09-10，代码提交`972b453`+`8b360c2`（可信归档校验移入事务内），本Work Item继续Reopened等待用户授权）

可审计、确定性、单事务、幂等的repair-forward执行器已实现并在隔离库完整演练；**未对持久policyops执行任何写入**。

| 项 | 结果 |
| --- | --- |
| 执行器 | `scripts/rcl-repair-forward-task34.mjs`（核心库`src/lib/case-repair/repair-forward.ts`，20条vitest单元独立于case-governance以符合RCL-AC-015契约）：audit（默认只读）/plan/apply/verify四模式；无参数或未知模式失败（退出2），apply缺`--i-am-authorized`/`--plan-hash`/`--target-fingerprint`任一即拒绝零写入；目标库名为policyops时默认拒绝（需用户授权后显式`RCL_REPAIR_ALLOW_PERSISTENT=1`），工作树未提交时拒绝 |
| 确定性批次ID | `sha256("task34-r4-trusted-archive:da0ea94d…")`前16字节设v5版本/变体位 → `c8a7c104-8b8b-53f5-9bfd-1c8a8a6be141`（禁止运行时随机UUID） |
| 单事务 | 账本删除、prepared批次转换、新可信批次与988条entries在同一REPEATABLE READ事务（不拆T1/T2/T3）；事务开始即`pg_advisory_xact_lock`任务专属键；事务内重算targetFingerprint、`FOR UPDATE`锁定并核对账本行18/19/20完整旧值与prepared批次91d60c5f（prepared/c86fcc26…/storage_path与审计一致）、核对attestation（36/36/78/42/36、10 snapshots、5 releases及全部业务表指纹零变化）与可信归档（8文件/sha256sums/manifest正文重算/restore 40表20sequence/dump SHA）；任一不一致立即回滚 |
| 精确删除 | 带完整旧值条件（id+hash+created_at×18/19/20）`RETURNING id`必须恰好三行；保留ID 1～16、21、22原值；不补ID 17、不重排 |
| prepared批次转换 | `UPDATE … SET status='rolled_back' WHERE id AND status='prepared' AND manifest_hash AND storage_path RETURNING id`恰好1行；历史entries保留 |
| 新可信批次 | status=restore_verified、created_by=task34-repair-forward；source_counts 452/36/500/28、retained_counts 36/36/78/42/36、deleted_counts全0、table_hashes含trustedArchiveManifestHash/trustedArchiveDumpSha/attestationManifestHash/migrationLedgerFingerprint（无空对象占位） |
| 988条entries | 从可信归档manifest逐条构建（452 case+36 showcase_case+500 test），真实archive_batch_id/entity_type/entity_id/case_uid/content_hash/archive_reason；全部64位小写hex；同批次entity_type+entity_id无重复；恰好988行 |
| 幂等与漂移 | 第二次执行全部已完成→`noop:true`；部分完成/不一致→`REPAIR_STATE_DRIFT`（禁止补写） |
| 隔离演练 | `scripts/rcl-repair-drill-task34.mjs`（post dump恢复全新PG17+pgvector容器）：19场景全过——初始指纹一致（attestation交叉核对codeSha=1fe702b时===第五轮审计`8941655b…`）、缺授权/错planHash/错targetFingerprint/账本旧值漂移/批次漂移/归档漂移/非法hash与重复全部拒绝且零写入、正常apply单事务成功、账本18条原值、批次rolled_back、988 entries逐项、业务零变化、migration×2 no-op、复跑noop、并发两个apply恰好一个执行另一个经40001重试noop、5个故障注入点均完整回滚、repair后dump第三库恢复40表/20 sequence零mismatch；证据`F:/Socila/backup/case-library/task34-r6-repair-drill-2026-09-10/repair-executor-test-report.json`（allPassed=true） |
| 第六轮只读审计 | `F:/Socila/backup/case-library/task34-r4-audit-2026-09-10T13-42-41/`：attestation-current.json（codeSha `8b360c2…`、attestationManifestHash `3b7340c1…`、targetFingerprint `56c479de…`）、audit-summary.json、repair-forward-plan.json（executor节含apply命令/单事务/交叉核对全过）、executable-write-set.json（planHash `db55e4ab…`、988条entries、确定性批次ID、ledgerDelete旧值三行）、repair-executor-test-report.json（19/19） |

**等待用户授权**：授权确认后由用户执行（本机policyops，需显式`RCL_REPAIR_ALLOW_PERSISTENT=1`，repair前强制新建完整dump）：
`DATABASE_URL=<policyops> RCL_REPAIR_ALLOW_PERSISTENT=1 node scripts/rcl-repair-forward-task34.mjs apply --i-am-authorized --plan-hash db55e4ab990e84289a3e28d45910d455c6e90d5009643fe18eb072fb70c73848 --target-fingerprint 56c479deb89438ff3943b61b73812cc2`
本轮代码与文档提交、历史授权均不构成对该清单的授权；只有用户针对planHash `db55e4ab…`明确授权后才能执行。

## repair-forward持久执行记录（2026-09-10，用户明确授权；等待独立复审）

用户在同一任务中明确授权（仅本机`localhost:5432/policyops`；codeSha `aeb464fc473ba05c849b98e9cc04046ca8c3c8ca`、planHash `179507da922755ce86e9d76daeba831e91ae36cb605d994e45364fcf91e63189`、targetFingerprint `56c479deb89438ff3943b61b73812cc2`、attestationManifestHash `ca4238a5c3aca5a744fcbc190e8bd147cb4450686bf6d4a38c8d0d91a55fd6f4`；不授权修改36/36/78业务数据、snapshot、release、政策实体、远程库、Secret、部署或分支合并）后，按以下顺序执行一次repair-forward：

| 阶段 | 结果 |
| --- | --- |
| 执行前门禁 | 工作区干净、HEAD=origin=`aeb464f`；只读核对migrations=21、36/36/78、example 42/regression 36、snapshots 10、releases 5、batches 2 applied+1 prepared、确定性可信批次不存在；fresh audit/plan与授权codeSha/planHash/targetFingerprint/attestation逐项一致（state=pending） |
| pre-repair备份 | `F:/Socila/backup/db/policyops-rcl-repair-pre-20260910234300.dump`（SHA-256 `b190d1d1705b36d59f8accc0022e0eff07ab23697b1558f353afcc872780810f`，sidecar `.sha256`校验OK）；全新PG17+pgvector实例恢复并对账：`restore-reconcile` exit 0、40表全部OK、20 sequence、账本21 |
| 受控apply | `RCL_REPAIR_ALLOW_PERSISTENT=1`仅作用于apply子进程；`node scripts/rcl-repair-forward-task34.mjs apply --i-am-authorized --plan-hash 179507da… --target-fingerprint 56c479de…`单事务成功：applied=true、ledgerDeleted=[18,19,20]、preparedBatchRolledBack=91d60c5f、entriesInserted=988、attempts=1、终态账本18条（fingerprint `25d10e627fe854a3c48b72127f325004481412f759d4c3f72e7fa6df43c580f4`）、36/36/78/42/36/10/5、archiveBatches=4 |
| 执行后验证（12项全过） | ①migrations=18且ID恰为1～16、21、22；②ID 1～16、21、22的hash/created_at与计划ledgerKeep逐项一致；③批次91d60c5f=rolled_back且历史988 entries保留；④批次c8a7c104=restore_verified、created_by=task34-repair-forward、manifest_hash `da0ea94d…`、storage_path永久可信归档；⑤新批次entries恰好988、全部64位小写hex、entity_type+entity_id无重复、452/36/500；⑥cases/showcase/tests=36/36/78；⑦example=42、regression=36；⑧snapshots=10、releases=5；⑨`run-migrations.mjs`连续两次均no-op（账本持续18）；⑩相同授权参数复跑apply返回`noop:true`（零写入）；⑪`verify --plan`读取本次executable-write-set返回ok=true、state=repaired；⑫cases/showcase_cases/tests/policy_snapshots/jurisdiction_planning_releases规范化hash与计划businessFingerprints完全一致 |
| post-repair备份 | `F:/Socila/backup/db/policyops-rcl-repair-post-20260910234716.dump`（SHA-256 `8303a4c35d390a8452266eb9c4f77b88b1c47ad3098a0ccca14e95a582466757`，sidecar校验OK）；第三个全新PG17+pgvector实例恢复并对账：exit 0、40表全部OK、20 sequence、账本18、可信批次entries 988 |
| 证据 | `F:/Socila/backup/case-library/task34-r8-repair-exec-2026-09-10T15-41-40/`（pre-audit/pre-plan/executable-write-set.fresh/pre-restore-reconcile/apply-result/post-state/migration-run1&2/apply-rerun/post-verify/post-restore-reconcile/repair-execution-summary.json）；授权计划`task34-r7-fresh-plan-2026-09-10T15-15-11/` |
| 边界 | 仅执行授权的三项写入；未修改snapshot/release/政策实体/远程库/Secret/部署；未合并分支、未创建PR；临时验证容器已清理；可信归档与pre/post备份未覆盖 |

当前持久事实：migrations=18（1～16、21、22）、36/36/78、10 snapshots、5 releases、archive batches=2 applied+1 rolled_back+1 restore_verified（988 entries）。本Work Item标记**等待复审**，独立复审通过后再置Accepted。
