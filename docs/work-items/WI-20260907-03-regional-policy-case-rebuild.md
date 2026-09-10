# WI-20260907-03：地区化政策案例生成与可靠归档重建

> Author: Jan
> Status: Accepted（2026-09-10第三轮修复完成）
> Updated: 2026-09-10

## Work Item

- ID：WI-20260907-03
- 关联PRD：`docs/prd/09-05-feature-case-library-governance.md`
- 关联需求：RCL-FR-001～022、RCL-NFR-001～008、RCL-AC-001～015
- 决策：ADR-0011
- 前置：WI-20260907-02 Accepted；修复后的上海/广东日期快照可在隔离库重放

## 背景与证据

原任务4的case-library归档SHA不是文件内容SHA，选择报告缺失、恢复报告仍pending、manifest未绑定内容，81条展示归档hash为`pending`，452/36质量分为空。第二轮修复虽实现CLI和场景字段，但第三轮复审确认旧regression hash、恢复证明、SHA精确覆盖、42 example原子同步和manifest自校验仍未实现，因此本Work Item重新Reopened。

## 范围

- 修复真文件SHA、归档文件完整性、恢复provenance和精确manifest。
- 从治理前dump在隔离库重建完整旧851/117/500档案。
- 新增上海/广东确定性场景模板、生成器、显式断言、覆盖manifest和质量分解。
- 策展36条公开案例，上海18、广东18。
- 新增0018修复Schema、批次状态和并发约束。
- 补完整单元、DB集成和专用Chromium E2E。

## 非目标

- 不使用LLM，不采集真实用户案例，不修改政策实体。
- 不执行持久库0018、删除、插入或归档状态写入。
- 不生成CN用户案例或四川用户案例。

## 实现要求

1. 归档文件全部存在后按真实字节计算SHA；sha清单不自包含。
2. restore report绑定来源dump、版本、扩展、表和sequence结果。
3. manifest绑定旧/新精确行、hash、snapshot、评分和测试来源。
4. 无可比较断言不得获得快照重放分。
5. case/showcase保存质量总分与逐项分解，多标签进入真实读取路径。
6. 0018固定为journal idx17/`1788796860000`；apply使用`FOR UPDATE`、`applying`状态和目标唯一约束。
7. 每个新case一条地区回归test；42条DSL示例完整保留。
8. 管理查询必须是`active AND filters`。

## 测试矩阵

| 场景 | 通过条件 |
| --- | --- |
| 文件篡改/缺失 | verify失败，批次不进入restore_verified |
| manifest漂移 | 任一行/hash/snapshot/来源变化均拒绝 |
| 真实恢复 | 完整旧851/117/500从本归档恢复一致 |
| 重复生成 | N、36、产物和manifestHash逐字节一致 |
| 地区/配额 | cases仅沪粤；showcase沪粤18/18且各项配额满足 |
| 质量/重放 | active/selected分数非空；无可比断言失败 |
| 并发apply | 一组成功，另一组确定性no-op |
| API/E2E | 公开36；管理active过滤；归档元数据权限正确 |

## 验收与回退

- 最终隔离库计数为`N/36/N+42`，N来自覆盖manifest；必须由真正CLI执行并核对完整场景字段。
- 0018执行两次幂等且0016 SQL hash不变；CLI每个模式必须有真实执行输出和失败反例。
- 完整门禁零skip；归档正文和凭据不进入Git或日志。
- 本Work Item只交付代码、生成资产和隔离证据；持久替换失败时无需数据库回退。

## 文档同步

- 任务4 PRD、README、PROGRESS、ARCHITECTURE、TESTING、OPERATIONS、traceability和任务4复审报告。

## 历史验收记录（2026-09-09第二轮结论已撤回）

1. **受控CLI七模式真实执行**：`scripts/rcl-case-library.ts`调用`executor.ts`七动作，输出可验证JSON并按失败原因返回非零退出码；默认只读audit；apply必须`--i-am-authorized`。
2. **完整场景字段**：manifest类型承载scenarioKey/asOfDate/input/expected/assertions/coverage/evidence；0018追加cases.input/expected/assertions列；apply逐字节落库且事务内fail-closed校验（空占位拒绝零写入）。
3. **真实CLI闭环**：隔离库audit→generate→plan→prepare-archive（真实pg_dump）→真实恢复演练（第二实例pg_restore+reconcile全表对账+verified restore-report+重算sha256sums）→verify-archive→apply（删851/500插36/36/36）→verify（36/36/78、沪粤18/18、配额、字段非空）。
4. **行内容hash绑定**：plan与apply统一行内容重算hash比较，任一漂移拒绝零写入（RCL-AC-003）。
5. **golden语义**：激活门禁只加载source=example黄金测试（RCL-FR-007）。
6. **E2E**：`e2e/task4-case-library.spec.ts`精确36/18/18、治理字段、管理active过滤、归档权限；全套19/19。

门禁历史记录：`npm test` 72文件/663、`test:db` 26文件/129零skip、E2E 19/19、tsc/eslint 0 error、build退出0（1条既有warning）、Python 94+20零skip、Gitleaks/scan-secrets/哨兵全过。第三轮复审发现测试允许空旧test hash和伪verified恢复报告通过，故该记录不再构成当前验收。

## 第三轮修复与重新验收（2026-09-10）

第三轮复审反例已全部修复（TDD Red→Green，Red证据：单元37失败/32通过；集成反例含8业务字段漂移/example原子同步/批次状态/并发/新行hash）：

| 复审发现 | 修复 |
| --- | --- |
| 旧test contentHash为空 | `planRclReplacement`读取完整旧regression test行；`testRowContentHash`（唯一规范化hash，plan/apply共用，排除仅限id/受控时间戳/运行时执行状态）；manifest每条旧test为64位非空SHA-256；apply事务内重读完整行重算，8个业务字段任一漂移稳定拒绝零写入 |
| restore只验证status | `validateRestoreReport`深验证：sourceDump文件名/SHA、PG/pgvector版本非空、tableCount/sequenceCount与明细一致、每表真实rows+64位hash、每sequence真实lastValue/isCalled、mismatches为空、archiveFileHashes与实际文件SHA一致；空明细verified拒绝；`buildVerifiedRestoreReport`由恢复演练同一实现生成真实报告（禁止手工构造） |
| SHA清单不精确 | `verifySha256SumsFile`：恰好覆盖7个必备文件各一次、安全basename（拒绝../绝对路径/子目录）、64位小写hex、不自包含、无重复/额外 |
| selection violations硬编码 | `computeSelectionReport`从生成后showcase实际计算（沪粤18/18、男女9/9、年龄段6/6/6、就业态6/6/6、UID/地区/必填字段校验）；verify-archive解析并交叉核对selection-report |
| 42 example事务外删除 | `loadDslExampleTargets`从CN19/上海9/广东10/四川4地区DSL确定性加载42条；manifest记录保留/更新/新增/删除集合（updated自带目标内容）；apply同一事务原子同步；`assertRclCounts`显式要求exampleTestCount===42（28/49等不得成为合法目标） |
| manifest无自校验 | canonical manifest core提取；读取/verify-archive/apply/verify均重算manifestHash；文件声明/正文重算/批次三方一致fail-closed；createdAt等非确定性元数据不入hash |
| 批次状态 | verify-archive只有精确一个prepared批次（id+状态+storagePath）匹配才能推进；状态UPDATE返回0行必须失败；prepare先写文件后事务写批次+entries（失败不留可推进批次），批次写入后重新dump完整库（自包含归档） |
| 新行hash核对 | apply插入后按稳定UID重读全部cases/showcase/regression tests，重算完整DB行hash与manifest逐项比较，返回实际DB ID/UID/hash；verify同样逐项核对（不得只核对总数与字段非空） |
| 测试库端口 | materializer集成测试从`SOCILA_TEST_DATABASE_URL`解析实际端口与库名（删除5439硬编码）；任务专属随机高位端口全新PG17+pgvector容器，`npm run test:db`零skip |

## 第三轮验收证据（2026-09-10本地新鲜执行）

- TDD Red：单元批次37失败/32通过（testRowContentHash/manifest自校验/SHA清单/restore验证/selection/dsl-examples模块缺失或行为不符）；集成反例首跑失败（旧test仅sourceCaseUid比较、example同步缺失、空明细verified通过等）。
- Node单元：`npm test` 73文件/705通过、skip 0。
- DB集成：随机端口隔离容器（docker自动分配高位主机端口，pgvector/pgvector:pg17，vector/btree_gist扩展）`npm run test:db` 26文件/137通过、skip 0；agent.migrate --with-roles×2幂等；`pytest -m integration` 20通过、skip 0。
- 静态：`npx tsc --noEmit`退出0；`npx eslint src scripts` 0 error（既有warning未新增）。
- 阶段二隔离演练：pre dump（`59ee2f5f…`）全新实例恢复→pre基线452/36/500/28核对→0017/0018补齐→沪粤快照激活→CLI完整流程（audit/generate/plan/prepare/真实恢复/verify-archive/apply/verify）→最终36/36/42/36、manifest exampleTestCount=42、counts.tests=78、旧500 test归档hash全部非空64位hex、restore-report含全部表与真实sequence明细、apply复跑no-op、篡改fail-closed。
- 边界：全程未连接持久policyops写路径；临时容器/库/网络/文件finally清理；未执行WI-20260909-01。

## 第三轮复审（2026-09-09）

- 旧500 regression在manifest及归档条目中的`contentHash`全部为空，apply只校验`sourceCaseUid`。
- `verify-archive`未验证restore正文、SHA清单精确覆盖、selection配额和manifest重算hash。
- `assertRclCounts`接受任意example数量；当前持久执行在manifest生成后、apply事务外删除7条example。
- 修复上述反例并取得随机端口隔离DB零skip证据前不得Accepted。
