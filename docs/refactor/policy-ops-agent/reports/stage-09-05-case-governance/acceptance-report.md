# 任务4案例库治理与地区化重建验收报告

> Status: Accepted（代码层）；持久repair-forward已于2026-09-10经用户明确授权执行并12项验证全过（WI-20260907-04等待独立复审）
> Branch: `codex/task34-regional-case-rebuild`
> Scope: WI-20260907-03（地区化政策案例生成与可靠归档重建）

## 当前结论

**第六轮：repair-forward执行器隔离验收完成，本报告代码层Accepted（2026-09-10，请求独立复审）**：可审计/确定性/单事务/幂等的`scripts/rcl-repair-forward-task34.mjs`（核心库`src/lib/case-repair/repair-forward.ts`）在post dump隔离库完成19场景演练全过（证据`task34-r6-repair-drill-2026-09-10/repair-executor-test-report.json`），第六轮只读审计绑定代码提交`8b360c2…`生成attestation（`3b7340c1…`）、executable-write-set（planHash `db55e4ab…`、988条entries、确定性批次`c8a7c104-8b8b-53f5-9bfd-1c8a8a6be141`）与repair-forward计划（`task34-r4-audit-2026-09-10T13-42-41/`）；持久policyops未写入，等待用户授权。第五轮结论保留如下：WI-20260907-03已恢复Accepted；第五轮修复journal非单调（0010～0014 when修正为严格单调，SQL零修改）、migration账本回归8项全过、审计journal不符改为阻断、归档目录保护；全部门禁本地新鲜通过（`npm test` 74文件/720零skip、随机端口`npm run test:db` 26文件/141零skip、tsc/eslint/build退出0、scan-secrets 788文件零命中、Gitleaks 8.29.1完整历史86提交零发现、allowlist哨兵全过）；第五轮只读审计绑定新代码提交`1fe702b…`（attestationManifestHash `8941655b…`、targetFingerprint `56c479de…`、journalCheck.journalMonotonic=true、隔离库删除重复行后migration×2 no-op证据）。**WI-20260907-04保持Reopened**：repair-forward计划已由第六轮更新为绑定`8b360c2…`的可执行写集合（planHash `db55e4ab…`），等待用户授权。历史代码与持久执行记录保留为审计事实。

历史背景：`e26a543`实现0016、案例治理与452/36/528路径；复审发现归档SHA用文件名而非文件内容、selection报告缺失、restore报告pending、manifest未绑定内容、81条展示hash为pending、无可比断言仍判match、质量分空、多标签未接入、并发无行锁、地区默认硬编码（[复审报告](./review-report-2026-09-07.md)）。

## 2026-09-08历史报告：修复内容（当前验收已撤回）

| 复审发现 | 修复（RCL编号） |
| --- | --- |
| P0 归档SHA=文件名hash | `archive.ts`对真实文件字节计算SHA-256（`fileContentSha256`）；修改任一文件SHA变化（RCL-FR-003/AC-001）；sha256sums.txt最后生成且不自包含（RCL-FR-003） |
| P0 selection缺失/restore pending | `selection-report.json`生成（策展输入/配额/最终选择，violations非空即pending）；`restore-report.json`绑定来源dump SHA、PG/pgvector版本、恢复目标、表/sequence与规范化hash（RCL-FR-002/004/005） |
| P0 manifest未绑定内容 | `buildRclManifest`绑定旧目标行ID+内容hash、新行hash、快照ID/hash、评分与来源映射；任一漂移manifestHash变化（RCL-FR-006/AC-003） |
| P1 无可比断言仍判match | `compareReplayWithAssertions`声明断言（eq/contains/is_null）必须至少1条实际计算比对；无可比断言→失败不得分（RCL-FR-016/AC-006） |
| P1 质量分空 | `scoreCase`总分+逐项分解（输入40/覆盖30/断言重放30），case/showcase真实落库（RCL-FR-015/AC-009） |
| P1 多标签未接入 | `classifyScenario`接入生成器：地区/性别/年龄/就业/险种/能力/needs-agent同时保留（RCL-FR-017） |
| P1 并发无行锁/唯一约束 | `executeRclApply`批次行`FOR UPDATE`、状态机`restore_verified→applying→applied`条件更新、归档条目`(batch,entity_type,entity_id)`唯一约束；并发仅一组成功（RCL-FR-019/AC-010） |
| P1 地区默认硬编码 | 0018移除`jurisdiction_code`默认值；生成器显式写入310000/440000（RCL-FR-012/022） |
| P2 管理查询OR | `searchCases`改为`active AND filters`（RCL-FR-020/AC-012） |
| P2 无任务4 E2E | 新增`e2e/task4-case-library.spec.ts`（RCL-AC-012/013/015） |

## 2026-09-08历史报告：迁移与隔离

- `drizzle/0016_clg_case_governance.sql`（SHA-256 `3a9adc91…30dfd5`）未改写（`rcl-0018-rebuild-schema.integration.test.ts`哈希不变量断言）。
- 新增`drizzle/0018_case_library_rebuild.sql`（journal idx17/`1788796860000`）：移除地区默认值、cases/showcase新增scenario/generator/asOf/snapshotHash/coverage/evidence/qualityBreakdown/multiLabels/assertions、批次CHECK增加`applying`、归档条目唯一约束。
- 组合journal（0000→0018）从零执行两次幂等（隔离库`rcl_drill*`，非持久库）；持久库0018未执行。

## 2026-09-08历史报告：确定性生成与计数

- `src/lib/case-governance/generator.ts`（RCL-GEN-1.0）：36条showcase场景（上海18+广东18），每地区男女9/9、三个年龄段各6、三种就业状态各6（RCL-AC-008）；UID `RPC-<地区>-<场景键>-V1`、测试UID `RPCT-…-V1`（RCL-FR-013）；相同模板逐字节一致（RCL-AC-005）。
- 期望值由修复后的快照规划器（任务3 `computeJurisdictionPlan`）计算并回填断言；广东mi-2030场景落在2030窗口快照（男30/女25），其余在2026窗口（RCL-FR-010）。
- 覆盖manifest：N=唯一case数，最终`N/36/N+42`（42条DSL示例=CN19+上海9+广东10+四川4），不硬编码452/500（RCL-FR-015/AC-011）。
- 四川始终unsupported且不生成case（RCL-AC-013）；CN仅内部DSL基线。

## 2026-09-08历史报告：当时记录的测试证据

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| Node单元 | `npm test` | 650 passed / 71 files，0 skip |
| TypeScript | `npx tsc --noEmit` | 退出0 |
| ESLint | `npx eslint src` | 0 error（4条既有warning非本次引入） |
| 生产构建 | `npm run build` | Compiled successfully（standalone） |
| DB集成 | `npm run test:db`（全新PG17+pgvector+btree_gist，migration×2+seed） | 114 passed / 25 files，0 skip（两次全新库复验稳定） |
| Chromium E2E | `npm run test:e2e:auth` | 16 passed（Auth 10 + 任务3 3 + 任务4 3） |
| Python单元 | ruff / mypy / `pytest -m "not integration"` | 全部通过（94 passed） |
| scan-secrets | `node scripts/scan-secrets.mjs --all` | clean（774文件零命中） |
| Gitleaks | 8.29.1完整历史（bundle克隆76 commits） | no leaks found |
| allowlist哨兵 | `node scripts/verify-gitleaks-allowlist.mjs` | 全部通过 |

任务4专用测试（Red→Green驱动）：

- `src/lib/case-governance/__tests__/archive.test.ts`（9）：真实文件SHA、篡改检测、必备文件、sha清单不自包含、selection/restore报告、恢复门禁。
- `src/lib/case-governance/__tests__/replay.test.ts`（6）：断言可比、无可比断言失败、contains/is_null。
- `src/lib/case-governance/__tests__/manifest.test.ts`（7）：精确绑定、漂移检测、N/36/N+42计数、不硬编码452/500。
- `src/lib/case-governance/__tests__/generator.test.ts`（12）：地区范围、配额、UID、覆盖义务、确定性、回归test。
- `src/lib/case-governance/__tests__/scoring.test.ts`（6）、`multi-label.test.ts`（3）：质量分解、多标签。
- `src/server/modules/policy/__tests__/rcl-0018-rebuild-schema.integration.test.ts`（3）：0018结构+applying+唯一约束+0016哈希不变。
- `src/server/modules/policy/__tests__/rcl-apply.integration.test.ts`（7）：删除旧+插入新、prepared拒绝、hash漂移、并发no-op、重复no-op、唯一约束。
- `src/server/modules/policy/__tests__/rcl-end-to-end.integration.test.ts`（2）：生成→快照规划器计算期望→评分→计数N/36/N+42；四川unsupported。
- `e2e/task4-case-library.spec.ts`（3）：公开案例、四川负例、归档权限。

## 2026-09-08历史时点：未授权动作

- 持久库0018迁移、删除旧452/36/500、插入新N/36/N、归档状态写入：全部待WI-20260907-04在fresh audit后经用户明确授权执行。
- 本机持久库（`socila-postgres/policyops`）未被修改；所有集成测试仅使用隔离库。

## 2026-09-09第二轮修复前复审结论（历史）

详细代码证据与重新验收条件见[第二轮独立复审报告](./review-report-2026-09-09.md)。

- `scripts/rcl-case-library.ts`的audit/generate/plan-replacement等模式仍只打印并退出，未执行声明的业务动作。
- `executeRclApply`对新cases/showcase/tests的场景、断言、输入、期望和日期字段仍写空值；现有E2E没有核对36条和沪粤18/18。
- 因此旧报告中的“完整归档、真实替换和完整E2E”不能作为当前验收证据；修复完成前不得执行WI-20260907-04。

## 2026-09-09第二轮修复前Definition of Done（历史）

- 未通过：RCL-FR-021的七模式CLI仍未调用真实audit、归档、生成、计划、apply和verify逻辑。
- 未通过：RCL-FR-006/018及RCL-AC-011的完整场景字段未由manifest传入并落库。
- 未通过：RCL-AC-008/015的公开36条、沪粤18/18、治理字段和权限Chromium E2E。
- 未复核：真实CLI在全新PG17+pgvector隔离库完成旧库归档恢复、新案例生成、替换和重复验证。
- 仍满足权限边界：本轮未执行持久0017/0018，也未删除或替换当前452/36/500。
- README、PROGRESS、ARCHITECTURE、TESTING、OPERATIONS、traceability与复审报告同步。

## 2026-09-09第二轮修复验收（历史结论已由第三轮撤回）

### 9.1 TDD Red（专用反例，旧实现失败证据）

| 反例 | Red证据（旧实现） |
| --- | --- |
| 受控CLI空壳 | `executor.test.ts`首跑`Cannot find module '../executor'`（七动作模块不存在）；CLI七模式只打印说明并退出0 |
| apply完整场景字段 | `rcl-apply.integration.test.ts`新增用例断言cases/showcase/tests场景字段与manifest逐字节一致——旧实现写null/{}/[]占位失败 |

### 9.2 修复实现

| 缺陷 | 实现 |
| --- | --- |
| P0 CLI空壳 | `src/lib/case-governance/executor.ts`七动作（audit/prepareRclArchive/verifyRclArchive/generateRclScenarios/planRclReplacement/applyRclReplacement/verifyRclReplacement）+`bufferSha256`（二进制dump直接Buffer哈希，修复String(buffer)有损解码）；`scripts/rcl-case-library.ts`改为薄壳调用executor并输出可验证JSON、按失败原因返回非零退出码 |
| P0 apply丢失场景 | `manifest.ts`的`NewCaseRow/NewShowcaseRow/NewTestRow`扩展scenarioKey/asOfDate/input/expected/assertions/coverage/evidence；0018追加cases.input/expected/assertions列（幂等IF NOT EXISTS）与归档条目entity_type含test；`apply.ts`逐字节写入（cases.isRegression=true、showcase.inputData/expectedData/assertions、tests.input/expected+sourceCaseUid）+事务内`assertCompleteScenarioFields`（空占位fail-closed零写入） |
| P1 manifest类型 | manifestHash绑定完整场景字段（任一漂移改变hash，RCL-AC-003）；plan-replacement与apply统一按行内容重算规范化hash（原生SQL行、排除基础设施列），库中content_hash列为空也能精确绑定 |
| P1 E2E未证明36/18/18 | `e2e/task4-case-library.spec.ts`重写：`/api/showcase-cases`精确36条、沪18粤18、qualityScore/qualityBreakdown/multiLabels/assertions/scenarioKey/asOfDate非空；管理搜索`q=RPC-`只返回active；管理员归档批次可读；匿名401/普通用户403；四川unsupported；配套`scripts/e2e-rcl-setup.ts`在E2E库完成真实CLI替换演练 |
| P1 真实CLI闭环 | `rcl-cli.integration.test.ts` 11例spawn真实CLI：audit→generate→plan→prepare-archive（真实pg_dump）→真实恢复演练（第二实例pg_restore+reconcile全表对账+verified restore-report+重算sha256sums）→verify-archive→apply（删851/500插36/36/36）→verify（36/36/78、配额、字段非空） |
| RCL-FR-007 golden语义 | `release-gates.ts`golden_tests只加载source='example'的DSL示例（回归tests不进入激活门禁重放），空集合fail-closed |

### 9.3 专用Green与全量门禁（2026-09-09本地新鲜执行）

| 门禁 | 命令/条件 | 结果 |
| --- | --- | --- |
| 专用单元 | `executor.test.ts` 8、`release-gates.test.ts` 10、`rcl-apply.integration.test.ts` 9、`manifest.test.ts` | 全部通过 |
| Node单元 | `npm test` | 72文件/663通过、skip 0 |
| TypeScript / ESLint / Build | `npx tsc --noEmit`、`npx eslint src scripts`、`npm run build`（2 workers） | 退出0；0 error/6既有warning；1条既有warning（citation-verifier动态fs访问） |
| DB集成 | 全新PG17+pgvector库`task34r2b_drill`，显式`SOCILA_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5439/task34r2b_drill`；migration×2（含0018扩展）、bootstrap×2、seed×2全部幂等 | `npm run test:db` 26文件/129通过、skip 0（含rcl-cli 11例真实CLI演练） |
| Agent迁移与Python集成 | `agent.migrate --with-roles`×2幂等；`pytest -m integration` | 20通过、skip 0 |
| Python静态与单元 | ruff、mypy（33文件0错误）、`pytest -m "not integration"`、pip-audit | 全部通过；94通过skip 0；无已知漏洞 |
| Chromium E2E | 全新`task34r2_e2e`库+`scripts/e2e-rcl-setup.ts`真实CLI替换演练+standalone | 全套19/19；task4 4例精确36/18/18、治理字段、管理过滤、归档权限 |
| Secret扫描 / Gitleaks / 哨兵 | `scan-secrets --all`、Gitleaks 8.29.1完整历史、`verify-gitleaks-allowlist.mjs` | 773文件零命中；no leaks found；3场景全过 |

### 9.4 复验说明

- E2E登录/注册存在每小时频率限制（`LOGIN_USER_RATE_LIMIT=5`、`REGISTER_RATE_LIMIT=5`），task3/task4 spec通过合并admin测试与复用注册用户控制在限额内（admin登录共4次<5）。
- `git`历史Gitleaks在提交前扫描为80 commits基线；提交后需复扫。
- 数据库门禁全程使用显式隔离URL；未连接、未修改本机持久policyops库；未执行0017/0018、删除、插入或归档状态写入。

### 9.5 当时的Definition of Done对照（历史）

- RCL-FR-001～022、RCL-NFR-001～008、RCL-AC-001～015：全部具有真实代码与测试映射（§9.2/§9.3）。
- 旧完整库归档可恢复（真实恢复演练：第二实例pg_restore+reconcile全表对账）；现有错误归档不再作为通过证据。
- 新案例确定性生成，最终`N/36/N+42`（36/36/78）与manifest逐项一致；沪粤公开各18条；CN和四川严格留在内部测试边界。
- 代码阶段不写持久库；真实替换待WI-20260907-04在fresh audit后经用户明确授权。
- Node/DB/Chromium/TS/ESLint/Build/Python/安全门禁新鲜通过且零skip。
- README、PROGRESS、ARCHITECTURE、TESTING、OPERATIONS、traceability与本报告已同步；任务4 PRD与WI-20260907-03已置Accepted（代码层）。

## 2026-09-09 WI-20260907-04 持久库替换执行（用户授权"允许以上操作"）

本机`localhost:5432/policyops`完成：账本repair（0014-0016及0010-0013时间，SQL hash不变）→ 0017/0018应用（第二次no-op）→ 42条DSL示例同步 → 沪粤非重叠快照激活 → **单事务删除旧452/36/500、插入新36/36/36**，非DSL旧上海示例7条清理 → 最终 **36/36/78**、沪粤showcase 18/18、36 cases+36 showcase字段完整（scenario/asOfDate/input/expected/assertions/coverage/evidence/qualityBreakdown）、36回归tests来源链无孤儿、四川0。操作前备份`policyops-rcl-b-pre-20260909185630.dump`（`59ee2f5f…`）与操作后备份`policyops-rcl-b-post-20260909202053.dump`（`934c4758…`）均在全新PG17+pgvector实例恢复，全部schema/表/sequence（20条）+规范化行哈希对账一致。旧851/117/500可信归档与452替换manifest存档于`F:/Socila/backup/case-library/`（Git忽略）。详见WI-20260907-04执行记录。

## 2026-09-09第三轮复审：当前结论

详细证据见[第三轮独立复审报告](./review-report-2026-09-09-r3.md)。上节为执行时报告，以下反例撤回其Accepted结论：

- applied manifest实际声明49 example和85 tests，持久库实际为42 example和78 tests；7条example在manifest生成后、apply事务外删除。
- 旧500 regression归档项hash全部为空；无法证明删除目标的完整业务内容。
- restore-report只检查状态，stage脚本保存的表/sequence明细为空且`sequenceCount=0`。
- migration账本实际21条，0012～0014重复登记，0015账本hash与当前SQL不一致。

当前36/36/78暂时保留并冻结写入；pre/post备份保留。不取得新的fresh repair-forward授权，不得重跑stage脚本、恢复pre dump或执行最终分支合并。

## 2026-09-10第五轮修复与只读审计（本报告保持Reopened，等待独立复审）

第四轮复审遗留的journal非单调与审计门禁缺口在代码提交`1fe702b`修复（fix: 修正迁移journal与重复账本门禁）：

| 项 | 结果 |
| --- | --- |
| journal严格单调修复 | `drizzle/meta/_journal.json`：0010=1788560000000、0011=1788600000000、0012=1788640000000、0013=1788680000000、0014=1788705240000、0015=1788777720000、0016=1788785400000、0017=1788796800000、0018=1788796860000（idx/tag不变、SQL零修改、全部entry按idx严格递增）；migration SQL blob LF SHA与账本ID 10～16、21、22原hash继续匹配 |
| migration账本回归 | `scripts/rcl-ledger-regression-task34.mjs`：post dump隔离恢复后8项全过——首次migration no-op账本21条；事务删除ID 18/19/20；migration×2均no-op；账本持续18条不重新生成0012～0014；ID 10～16、21、22 hash/created_at不变；ID 17缺号不补写不重排；模拟0019（when=1788797000000>1788796860000）只应用一次；工作树SQL均LF且hash===Git blob（证据`task34-r5-ledger-regression-2026-09-10/ledger-regression.json`） |
| 审计阻断门禁 | `scripts/rcl-audit-task34.mjs`：journal非单调/与预期不符→阻断（不再仅报告）；ID 10～16、21、22账本hash===Git blob LF SHA→阻断；隔离库删除重复行后migration×2 no-op→门禁；三者全过才生成repair-forward计划；`--trusted-dir`只读复验既有可信归档（禁止覆盖） |
| 归档目录保护 | `prepareRclArchive`：目标目录已包含历史归档专属文件（4 dump/selection/restore/sha256sums）时拒绝开始；补偿只删除本次新建文件 |
| 门禁 | `npm test` 74文件/720零skip；随机端口全新PG17+pgvector`npm run test:db` 26文件/141零skip（migration×2/bootstrap×2/seed×2幂等、agent.migrate --with-roles×2幂等、pytest -m integration 20/20）；tsc/eslint/build退出0；scan-secrets 788文件零命中；Gitleaks 8.29.1完整历史86提交零发现；allowlist哨兵全过 |
| 第五轮只读审计 | `F:/Socila/backup/case-library/task34-r4-audit-2026-09-10T10-12-35/`：codeSha `1fe702b…`；attestation-current.json（36/36/78全逐行ID/UID/64位hash、10 snapshots、5 releases、3批次；attestationManifestHash `8941655b…`、targetFingerprint `56c479de…`）；audit-summary.json（journalCheck.journalMonotonic=true、ledgerGitBlobHashMatch=true 9/9、ledgerRegressionNoopAfterDelete=true、可信归档复验8文件/SHA匹配/452/36/500/500 test hash非空/restore 40表+20 sequence零mismatch/第三库恢复40表20 sequence一致）；repair-forward-plan.json（写集合只含删除账本ID 18/19/20、prepared批次91d60c5f→rolled_back、新增restore_verified可信归档批次+988条entries；36/36/78、10 snapshots、5 releases零变化；含隔离库no-op证据；repair前强制新建备份） |
| 边界 | 全程持久policyops仅SELECT；未执行repair-forward；未恢复pre dump；未创建PR、未合并分支；可信归档目录未覆盖未删除；隔离容器/库finally清理 |

**独立复审前本报告顶部保持Reopened**；WI-20260907-03已恢复Accepted（代码与隔离门禁层面），WI-20260907-04等待用户对`1fe702b…`计划的repair-forward授权，WI-20260909-01保持Blocked。

## 2026-09-10第六轮：repair-forward执行器隔离验收（代码层Accepted，请求独立复审）

| 项 | 结果 |
| --- | --- |
| 执行器 | `scripts/rcl-repair-forward-task34.mjs`（核心`src/lib/case-repair/repair-forward.ts`；未处于tsx运行时时以tsx CLI重载自身，同一进程执行全部数据库操作）：audit/plan/apply/verify；无参数失败（退出2）、apply缺授权/planHash/targetFingerprint拒绝零写入、目标库policyops默认拒绝、工作树未提交拒绝 |
| 绑定 | codeSha=HEAD（`8b360c2…`）、trustedArchiveManifestHash `da0ea94d…`、trustedArchiveDumpSha `0e3c3d8b…`、trustedArchiveDir永久可信归档、fresh attestationManifestHash `3b7340c1…`、migrationLedgerFingerprint `492c5fbe…`、targetFingerprint `56c479de…`；planHash `db55e4ab…`覆盖完整988条写集合、确定性批次ID与codeSha |
| 确定性批次ID | `sha256("task34-r4-trusted-archive:"+manifestHash)`前16字节设v5版本/变体位=`c8a7c104-8b8b-53f5-9bfd-1c8a8a6be141`（单元测试固定断言；禁止随机UUID） |
| 单事务 | REPEATABLE READ+事务开始即`pg_advisory_xact_lock`；事务内重算targetFingerprint、重建计划核对planHash、`FOR UPDATE`锁定核对账本18/19/20完整旧值与prepared批次、核对attestation/业务指纹/可信归档；精确条件删除RETURNING恰好18/19/20、批次条件更新RETURNING恰好1行、新批次restore_verified（真实计数与table_hashes）、988条参数化entries累计rowCount恰好988、COMMIT前终态核对；任一不一致回滚 |
| 幂等/并发 | 复跑`noop:true`；部分完成/不一致→`REPAIR_STATE_DRIFT`；并发第二方经40001重试后noop |
| 单元 | `src/lib/case-repair/__tests__/repair-forward.test.ts` 20例（Red→Green）：确定性ID、988条entries构建/非法hash/重复/计数、批次行真实字段、planHash覆盖entries与批次ID与codeSha、账本删除语句完整旧值、状态分类pending/repaired/drift、参数守卫 |
| 隔离演练 | `scripts/rcl-repair-drill-task34.mjs`：19场景全过（见WI-20260907-04第六轮表）；并发场景`c1 noop attempts=2 / c2 applied attempts=1`；5故障点全部回滚；repair后dump第三库恢复40表/20 sequence零mismatch；attestation交叉核对（codeSha=1fe702b）===第五轮审计`8941655b…` |
| 门禁 | `npm test` 75文件/740零skip；随机端口全新PG17+pgvector `npm run test:db` 26文件/141零skip（agent.migrate --with-roles×2、pytest -m integration 20/20）；tsc/eslint（0 error）/build退出0；scan-secrets 790文件零命中；Gitleaks 8.29.1完整历史91提交零发现；allowlist哨兵全过；RCL-AC-015契约保持（执行器库独立于case-governance目录） |
| 第六轮只读审计 | `F:/Socila/backup/case-library/task34-r4-audit-2026-09-10T13-42-41/`：attestation-current.json、audit-summary.json、repair-forward-plan.json（单事务写集合、executor节、交叉核对10项全true、隔离演练绑定）、executable-write-set.json、repair-executor-test-report.json；journalCheck.journalMonotonic=true、ledgerRegressionNoopAfterDelete=true、可信归档复验通过 |
| 边界 | 持久policyops仅SELECT；未执行repair-forward；未恢复pre dump；未创建PR、未合并分支；可信归档与pre/post备份未覆盖；隔离容器/库/临时归档副本finally清理 |

WI-20260907-03 Accepted；任务4 PRD与本报告代码层Accepted；WI-20260907-04继续Reopened等待用户授权；WI-20260909-01继续Blocked。请求独立复审。

## 2026-09-10 WI-20260907-04 repair-forward持久执行（用户明确授权；等待独立复审）

| 阶段 | 结果 |
| --- | --- |
| 授权与门禁 | 授权codeSha `aeb464fc473ba05c849b98e9cc04046ca8c3c8ca`、planHash `179507da922755ce86e9d76daeba831e91ae36cb605d994e45364fcf91e63189`、targetFingerprint `56c479deb89438ff3943b61b73812cc2`、attestation `ca4238a5c3aca5a744fcbc190e8bd147cb4450686bf6d4a38c8d0d91a55fd6f4`；工作区干净、HEAD=origin=`aeb464f`；持久库migrations=21/36/36/78/42/36/10/5/batches 2 applied+1 prepared/可信批次不存在；fresh audit/plan逐项一致 |
| pre备份 | `F:/Socila/backup/db/policyops-rcl-repair-pre-20260910234300.dump`（`b190d1d1705b36d59f8accc0022e0eff07ab23697b1558f353afcc872780810f`+sidecar）全新PG17+pgvector恢复对账：40表OK/20 sequence/账本21 |
| apply | 单事务成功：applied=true、ledgerDeleted=[18,19,20]、91d60c5f→rolled_back、c8a7c104 restore_verified+988 entries、attempts=1；终态账本18（fingerprint `25d10e62…`）、36/36/78/42/36/10/5、archiveBatches=4 |
| 执行后12项验证 | 全部通过：账本18条=1～16/21/22且hash/created_at原值不变；批次rolled_back（历史988 entries保留）；可信批次restore_verified/task34-repair-forward/manifest `da0ea94d…`/永久归档目录；988 entries全64位hex无重复（452/36/500）；36/36/78；42/36；10/5；migration×2 no-op；复跑apply noop:true；verify --plan ok=true（repaired）；业务表规范化hash与计划一致 |
| post备份 | `F:/Socila/backup/db/policyops-rcl-repair-post-20260910234716.dump`（`8303a4c35d390a8452266eb9c4f77b88b1c47ad3098a0ccca14e95a582466757`+sidecar）第三个全新实例恢复对账：40表OK/20 sequence/账本18/988 entries |
| 边界 | 仅授权三项写入；snapshot/release/政策实体/远程库/Secret/部署零变化；未创建PR、未合并分支；证据`F:/Socila/backup/case-library/task34-r8-repair-exec-2026-09-10T15-41-40/` |

WI-20260907-04标记等待复审；WI-20260909-01继续Blocked；请求独立复审。
