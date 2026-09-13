# WI-20260911-01：上海官方原文采集与政策纠偏

> Author: Jan
> Status: Ready for user testing（第五轮ensure期间冲突对象竞态已由WI-20260913-01任务1闭环；持久MinIO同步仍待用户fresh授权）
> Updated: 2026-09-13

## Work Item

- ID：WI-20260911-01
- 关联PRD：`docs/prd/09-11-feature-shanghai-case-library-v2.md`
- 关联需求：SHV2-FR-001～007、SHV2-NFR-001/002/006/008
- 关联验收：SHV2-AC-001～005
- 前置：PRD提交`d7fd63a`；基线`0885613`
- 后置：WI-20260911-02（本Work Item未Accepted前不得开始验收）

## 背景与证据

2026-09-11只读核对：`dsl/regions/shanghai_dsl_v1/`的25个标量参数+2个表格全部只有`source: "policy"`/`"transcript"`/不完整文号伪引用，8条地方规则`evidence`均为空数组；`src/lib/dsl/citation-contract.test.ts`的`REGION_DIRS`只含`cn_dsl_v1/guangdong_dsl_v1/sichuan_dsl_v1`，上海从未进入引用契约。`reports/stage-09-05-national-baseline-overlays/evidence/310000/`下8个目录全部为空。

## 范围

1. 使用`scripts/capture-official-page.mjs`从白名单域名（`www.shanghai.gov.cn`、`rsj.sh.gov.cn`、`ybj.sh.gov.cn`）采集上海正式原文，每份保存`original.html`、`extracted-text.txt`、`http-headers.txt`、`meta.json`。
2. 上海加入引用契约扫描；全部活动参数/表格与政策承载规则evidence覆盖率100%；excerpt逐字存在于`extracted-text.txt`。
3. 按PRD §6.4纠正2026-09-01有效事实：缴费基数7546/37731（2026-07-01）、失业金2340/1872/1690（2026-07-01）、最低工资2740（2025-07-01）、灵活就业养老20%/医保10%、医保等待期6个月与≤3个月衔接豁免、退休职工医保累计超过15年、就业困难人员补贴一般不超过3年且距退休不足5年可延长至退休。
4. 移除或纠正：医保男25/女20口径、固定8年补贴延长、固定7/8月补差、`source="policy"/"transcript"`伪引用。
5. 历史值以`effective_from/effective_to`闭合窗口保留。
6. 新增`R-SH-UI-AMOUNT`与`R-SH-FLEX-CONTRIBUTION`，各至少一条黄金示例；上海example 9→11、全地区42→44。
7. 隔离库物化audit只规划上海预期delta，其他地区零漂移。

## 非目标

- 不写本机持久`policyops`；不代替管理员批准；不创建持久快照或切换release。
- 不修改广东、四川、CN政策含义。
- 找不到正式原文或含义不唯一的事实保持blocked，不猜测。

## 实现要求

1. 证据目录：`docs/refactor/policy-ops-agent/reports/stage-09-05-national-baseline-overlays/evidence/310000/<DOC-ID>/`。
2. DSL evidence结构含`document_id/jurisdiction_code/title/authority/official_url/fetched_at/content_sha256/artifact/parse_version/locator/excerpt`。
3. 参数多窗口同`param_id`并列，当前窗口列在最后（fresh seed与黄金夹具last-write-wins语义）。
4. 新规则加入`rules_manifest.json`与`rule_set_shanghai_plan_v1.json`（执行顺序：`R-SH-UI-AMOUNT`在`R-420`之后、`R-SH-FLEX-CONTRIBUTION`紧随其后）。
5. `R-SH-UI-AMOUNT`：缺领取阶段/资格不确定/无有效参数→`needs_agent`不估算。
6. `R-SH-FLEX-CONTRIBUTION`：基数越界→警告+`needs_agent`不截断；非灵活就业→`applicable=false`不伪造。
7. 冻结夹具（golden-snapshot、shanghai-reclassification-drift基线）因规则/参数合法变化重新生成并在验收报告记录差异原因。

## 测试矩阵（TDD Red先于实现）

| 场景 | 通过条件 |
| --- | --- |
| 上海加入citation contract | 27+新增参数/表与8+2规则100%覆盖 |
| 缺原件/SHA错误/URL错误/摘录不存在 | 稳定失败（citation-verifier反例） |
| 参数有效期边界 | 2026-06-30取旧值、2026-07-01取新值；无重叠 |
| 三档失业金 | 第1-12月2340、13-24月1872、延长1690 |
| 灵活缴费 | 7546×20%=1509.2、×10%=754.6、合计2263.8；缺基数/越界→needs_agent |
| 上海example | 11条；全地区44条 |
| 物化audit | 隔离库只规划上海delta，CN/GD/SC零新增 |

## 验收与回退

- SHV2-AC-001～005新鲜证据；`npm test`零skip；`test:db`随机端口PG17+pgvector零skip。
- 本Work Item只交付代码、证据文件与隔离证据；无持久库写入，无回退需求。

## 文档同步

- PRD §22边界、traceability、TESTING、ARCHITECTURE（引用契约范围）、PROGRESS。

## 独立审查补充（2026-09-12）

- Git证据目录中的23份上海原件不能替代架构规定的MinIO运行时原件；当前采集脚本只写本地`docs/.../evidence`，尚未完成`policy-originals/originals/<sha256>`上传和RAG `object_key`对账。
- 任务验收不得把“证据文件已提交”表述为“MinIO原件已入库”。
- 闭环条件：每份原件在MinIO存在同字节对象，bucket/key、对象SHA、`meta.json`和RAG数据库记录一致，并有恢复演练证据。

## 修复交付记录（2026-09-12，MinIO原件链路闭环）

- 实现：`services/agent/agent/rag/evidence_sync.py`（`PolicyEvidenceSync`，audit/plan/apply/verify四模式；复用`agent/rag/storage.py`的MinIO/内存ObjectStore、`migrations/0003_rag_schema.sql`的rag.sources/fetches/document_versions、`capture-official-page.mjs`产出目录布局；bucket固定`policy-originals`、对象键固定`originals/<sha256>`；错bucket/远程endpoint/policyops库名连接前拒绝；对象冲突拒绝覆盖；输出清单与错误路径统一凭据redact）；CLI入口`python -m agent.rag.evidence_sync`；编排`scripts/rag-evidence-drill.mjs`；配置模板`config/runtime.env.example`默认bucket改为`policy-originals`（与`storage.py`一致，Compose不覆盖）。
- TDD：RED=`test_rag_evidence_sync.py`整体ModuleNotFoundError（15例）；GREEN=18/18（守卫与枚举7例零依赖；隔离DB集成10例：上传+RAG登记/幂等no-op/冲突拒绝/缺记录/DB content_hash漂移/错object_key/对象下载SHA漂移/plan零写入/verify ok；真实MinIO备份→全新实例恢复四方对账1例）。
- 真实23件原件隔离演练（`scripts/rag-evidence-drill.mjs`，12项全ok，证据`reports/feature-09-11-shanghai-case-v2/rag-evidence-drill-2026-09-12T04-14-59-793Z.json`；本节为历史审查记录）：audit预态23缺失（exit4）→plan 23 uploads零写入→apply 23上传+rag.sources(3域名)/fetches/document_versions登记+verify→幂等复跑uploaded=0/noop=23→守卫反例（错bucket/远程endpoint/policyops库名均exit2）→OBJECT_CONFLICT拒绝且对象字节不变→pg_dump+23对象逐字节备份（SHA清单）→全新数据库pg_restore+全新MinIO回填→恢复副本四方对账verify ok→证据文件零密钥。22/23份原件有DSL evidence引用且SHA全部一致；DOC-SH-EMPLOYER-SUBSIDY-BASIS-2024为政策依据辅助页，无DSL引用（清单`dslRefs:0`如实报告，不作为阻断）。
- 边界：全程仅隔离MinIO（`shv2-fix-minio-a/b`:54960/54961）与隔离PostgreSQL（`shv2-fix-pg`:54956）；生产MinIO（socila-minio）与持久policyops未连接未写入；持久对象同步/恢复对账须另行fresh授权。

## 控制契约复审修复交付（2026-09-12第二轮；起点b5a8d13，本修复提交HEAD）

独立复审在b5a8d13基础上发现两项控制缺口，修复如下（f583adc为历史任务2/3交付SHA）：

- **apply绑定fresh授权计划**：`evidence_sync.py`新增确定性`build_plan`（schema/version、codeSha、jurisdiction、固定bucket、evidenceManifestHash、MinIO+RAG目标状态指纹与期望终态指纹、完整对象清单、plannedUploads/plannedFetches/plannedVersions/noopObjects/conflicts、规范化planHash；同状态两次生成逐字节一致）；`apply(plan, plan_hash, target_fingerprint, i_am_authorized)`在任何写入前校验——授权声明、计划结构、planHash重算、HEAD==计划codeSha、工作树干净（`RAG_EVIDENCE_ALLOW_DIRTY`仅隔离演练）、evidence未漂移、MinIO+RAG状态指纹==targetFingerprint；终态→幂等noop；介于前置与终态→`TARGET_STATE_DRIFT`零写入拒绝。`RAG_EVIDENCE_ALLOW_REMOTE`/`RAG_EVIDENCE_ALLOW_PERSISTENT`仅作endpoint/库名附加保护。冲突拒绝、凭据脱敏、幂等与恢复能力保留；并发apply经advisory锁串行化并在锁内重分类（上传+登记同一持锁事务），锁内复查无重复rag记录。
- **verify范围契约**：完整audit/plan/apply/verify必须连数据库（CLI缺库USAGE拒绝exit2）；缺库完整verify ok:false并逐件报告；显式`--object-only`降级（`verificationScope="object-only"`/`degraded=true`/`dbChecked=false`，不作为四方验收）；完整verify逐件核对Git原件字节SHA、meta.json.sha256/byteSize、DSL evidence.content_sha256、MinIO bucket/object_key/下载SHA、rag.fetches与rag.document_versions的object_key/content_hash及两处object_key一致。
- **TDD与证据**：RED=新增契约测试集合期ImportError（21测试）→GREEN=35/35零skip（12零DB单元+23集成，含授权缺失/错planHash/错指纹/codeSha不符/dirty工作树/证据漂移/对象漂移/DB漂移零写入、幂等noop、冲突不覆盖、注入后re-plan恢复、并发无重复、计划与输出零凭据）；演练17项全ok（证据`rag-evidence-drill-2026-09-12T08-43-47-471Z.json`）。
- **Chromium E2E阻塞项修复**：E2E门禁路径发现既有产品竞态——AUTH-US-002 reload后URL会话恢复被ChatPanel预创建会话踩掉（独立playwright网络取证：恢复GET 200后`onConversationCreated`把面板/URL改写为新空会话）。最小修复`ChatPageClient`将URL会话ID作为ChatPanel外部会话ID（URL带会话ID时不预创建，恢复失败重置路径不变）。修复后完整Chromium E2E 23/23（58.6s）。
- 边界：全程仅隔离PostgreSQL（`shv2-ctrl-pg`:54957）与隔离MinIO（`shv2-ctrl-minio-a/b`:54962/54963，演练后清理）；持久policyops与生产MinIO未连接未写入；状态保持Ready for independent review。

## 缺桶生命周期复审修复交付（2026-09-12第三轮；起点82c905b，交付提交6bd3edc，亦为第四轮起点）

独立复审在82c905b基础上发现MinIO缺桶生命周期控制缺口：2026-09-12只读核对生产容器socila-minio为bucketCount=0（与生产同步尚未授权、尚未执行一致），而`storage.py`的`MinioObjectStore.__init__`在bucket缺失时调用`make_bucket`——audit/plan/verify等服务启动或只读命令构造store即可能隐式创建`policy-originals`，违反SHV2-FR-023持久默认拒绝、SHV2-NFR-006失败关闭、plan/audit零写入契约与"fresh授权覆盖全部持久变化"。修复如下：

- **构造零建桶**：`MinioObjectStore.__init__`只建立连接信息，移除`bucket_exists`+`make_bucket`副作用；`object_store_from_env`与全部调用方核查——服务启动、健康检查、模块import、只读请求均零建桶；Compose不新增无条件初始化建桶（mc mb/init container/启动脚本均不加），bucket创建与23件原件同步一同进入fresh授权apply。
- **显式bucket生命周期接口**：`bucket_exists()`只读；`ensure_bucket()`仅在apply通过全部fresh授权校验并取得advisory锁后的写入段调用，返回本次创建True/已存在False；并发创建竞争（BucketAlreadyOwnedByYou/BucketAlreadyExists）幂等复查，权限/连接错误原样抛出。`InMemoryObjectStore`同语义（`with_bucket=False`构造缺失bucket；缺桶put拒绝）。
- **audit/verify缺桶失败关闭**：MinIO可达但bucket缺失→`BUCKET_MISSING`问题+ok=false+`bucketExists=false`，不创建bucket、不上传对象、不改RAG数据库；verify的object-only模式同样对象层失败且scope/degraded/dbChecked标记准确。
- **plan缺桶仍只读确定**：计划新增`bucketExists`/`plannedBucketCreate`（两者进入planHash；targetFingerprint只绑定真实前置状态、finalFingerprint只绑定真实预期终态——`_state_fingerprint`纳入bucket真实存在性；plannedBucketCreate是执行意图，不作为独立字段进入状态指纹）；缺桶时`plannedBucketCreate=true`、前置指纹含"bucket不存在"、终态指纹含"bucket存在且对象/RAG登记完整"、完整23件对象清单不变；同状态两次生成逐字节一致且bucket仍不存在。schema/算法版本升级`rag-evidence-sync-plan/1.1`/`RAG-EVIDENCE-SYNC-1.1`（旧计划结构校验拒绝）。
- **apply建桶授权边界**：建桶只发生在`--i-am-authorized`+计划结构+planHash+targetFingerprint+HEAD==codeSha+工作树契约+evidenceManifestHash未漂移+当前MinIO/RAG状态==计划前置指纹+endpoint/库名守卫全部通过后的持锁事务内；缺授权/错hash/错指纹/漂移→bucket仍不存在、对象数0、RAG记录零变化；apply结果新增`bucketCreated`。
- **TDD与证据**：RED=新增`TestBucketLifecycle`13测试（旧实现10失败实锤——构造即建桶`assert True is False`、audit/plan/verify无BUCKET_MISSING/plannedBucketCreate等）→GREEN=48/48零skip（构造不建桶、ensure_bucket并发恰好一次创建、audit/plan缺桶零写入、未授权/错planHash/错指纹/evidence漂移/DB漂移零建桶、授权apply建桶+上传+四方verify、复跑noop、并发apply单bucket单记录、既有bucket兼容、冲突拒绝、object-only不建桶、凭据不泄露）；演练17项全ok改为缺桶起点（证据`rag-evidence-drill-2026-09-12T12-53-58-005Z.json`）：演练开始前删除隔离bucket，audit缺桶exit4+BUCKET_MISSING、两次plan后bucket仍不存在、未授权/错hash/错指纹/外部建桶漂移全部零建桶，授权apply后bucket存在且恰好23对象。
- 边界：全程仅隔离PostgreSQL（`shv2-ctrl-pg`:54957）与隔离MinIO（`shv2-ctrl-minio-a/b`:54962/54963，演练后清理）；仅对生产MinIO执行只读bucket清单核对（bucketCount=0，未写入）；持久policyops未连接未写入；状态保持Ready for independent review。

## 第四轮复审修复交付（2026-09-13；起点6bd3edc，本修复提交HEAD）

独立复审在6bd3edc基础上发现四项缺口（f583adc=历史任务2/3交付SHA、b5a8d13=第一轮审查修复、82c905b=fresh授权与verify范围修复、6bd3edc=缺桶生命周期修复与本轮起点），修复如下：

- **MinIO对象存在性检查失败关闭（问题1）**：`storage.py`的`MinioObjectStore.exists`此前捕获所有`S3Error`返回False。修复后只有经minio 7.2.20对真实MinIO实证的"不存在"错误码（缺失对象=`NoSuchKey`、缺失bucket=`NoSuchBucket`，另含`NoSuchObject`兼容）返回False；`AccessDenied`/`InvalidAccessKeyId`/`SignatureDoesNotMatch`/连接失败/超时/服务端错误及其他未知错误原样抛出。evidence_sync audit/plan/apply/verify遇到这些错误必须失败（CLI统一脱敏输出）；write-only权限组合（stat拒绝、put可用）下apply在exists处失败且put调用次数为0，防止覆盖内容寻址对象。
- **bucketCreated真实创建归属（问题2）**：apply改用`bucket_created = self.store.ensure_bucket()`实际返回值；外部进程在`bucket_exists()`与`ensure_bucket()`之间抢先建桶时本次apply报告`bucketCreated=false`（确定性竞态注入测试，InMemory与真实MinIO双实现，不依赖随机sleep）；授权校验、advisory lock、对象上传、RAG登记与最终verify不受影响。
- **拒绝路径数据库零写入证据（问题3）**：新增`TestRejectionPathsZeroWrite` 11条与`TestAccessDeniedFailsClosed`的AccessDenied路径（跨两个测试类合计12条拒绝路径）——缺`--i-am-authorized`、错planHash、错targetFingerprint、codeSha不一致、dirty工作树、evidenceManifestHash漂移、MinIO对象状态漂移、RAG数据库状态漂移、AccessDenied等非"不存在"S3错误、OBJECT_CONFLICT、注入故障、并发竞争。每条路径在apply调用前后生成并比较：rag.sources/rag.fetches/rag.document_versions规范化行内容hash及行数、bucket存在状态、MinIO对象键/字节SHA/对象数。外部操作主动制造的漂移以"漂移后基线"为断言基准并单独记录（不计入apply写集合）；注入故障如实记录apply侧部分对象写入（MinIO非事务资源）与数据库事务整体回滚。
- **文档事实与hash语义同步（问题4）**：见PRD §22、PROGRESS、验收报告§8、traceability、ARCHITECTURE、TESTING、OPERATIONS。语义统一：planHash绑定整个计划（含bucketExists与plannedBucketCreate）；targetFingerprint只绑定真实前置状态（bucketExists、对象状态、RAG状态）；finalFingerprint只绑定真实预期终态（bucket存在、23个对象、RAG登记）；plannedBucketCreate是执行意图，不作为独立字段进入状态指纹；改变plannedBucketCreate必须改变planHash；bucket真实存在性变化必须改变targetFingerprint。
- **TDD与证据**：RED=13测试在6bd3edc旧实现失败（10×S3错误分类失败关闭、1×真实MinIO错误凭据、2×bucketCreated归属）→GREEN=81/81零skip；演练升级为22项（新增codeSha不一致、dirty工作树、RAG数据库漂移、write-only权限错误经受限IAM用户真实AccessDenied、bucket创建竞态归属；9个守卫反例输出DB+对象层before/after指纹）全ok（证据`rag-evidence-drill-2026-09-12T16-47-00-452Z.json`）。
- 边界：全程仅隔离PostgreSQL（`shv2-r4-pg`:55101）与隔离MinIO（`shv2-r4-minio-a/b`:55102/55103，任务专属容器，演练后清理）；仅对生产MinIO执行只读bucket清单核对（bucketCount=0，未写入）；持久policyops未连接未写入；状态Ready for user testing（不标记最终Accepted）。

## 第五轮待修复：ensure期间冲突对象（2026-09-13）

独立复审确认：当前apply在`ensure_bucket()`前检查冲突；若外部进程在ensure期间创建bucket并写入相同key但错误字节，后续循环只把“对象存在”计为noop，可能先提交`rag.sources/fetches/document_versions`，再由事务外verify发现SHA不符。该路径不满足SHV2-NFR-006失败关闭和零RAG写入要求。

闭环条件：ensure后、上传后及数据库提交前校验全部目标对象字节SHA；确定性竞态测试必须同时注入建桶和冲突对象，断言对象不覆盖且三张RAG表前后指纹一致。最终演练证据必须记录并匹配执行脚本Git blob SHA。实现、索引和运行验收统一由`WI-20260913-01-shanghai-rag-runtime-closure.md`承接。

## 第五轮闭环记录（2026-09-13，由WI-20260913-01任务1完成）

- `evidence_sync.apply`新增`_verify_objects_or_conflict`三检查点：`ensure_bucket()`后重新枚举全部目标对象并下载核对SHA（上传前拦截外部抢先建桶+错误同键对象→`OBJECT_CONFLICT`）；全部上传完成后、RAG登记前再次核对（`OBJECT_MISSING`/`OBJECT_CONFLICT`）；数据库事务提交前执行最终对象完整性检查（任一漂移整体回滚）。冲突对象不覆盖。
- 确定性竞态测试（无sleep）：`TestEnsureRaceConflict`（InMemory，外部ensure期间建桶+错误同键对象→旧实现提交RAG登记后才在事务外verify失败，新实现OBJECT_CONFLICT且`rag.sources/fetches/document_versions`前后指纹一致）、`TestEnsureRaceConflictRealMinio`（真实隔离MinIO同场景）、`TestPostUploadConflictCheck`（上传窗口内外部写入错误对象不计为noop）、`TestPreCommitObjectCheck`（提交前篡改→整体回滚零写入）。RED在旧实现4/4失败→GREEN。
- 演练证据（33项全ok，`rag-evidence-drill-2026-09-13T05-57-34-688Z.json`）记录执行脚本Git blob SHA `4edd7d8a…`；提交后核对`git rev-parse HEAD:scripts/rag-evidence-drill.mjs`与之一致（证据由提交中的完全相同脚本生成）。
