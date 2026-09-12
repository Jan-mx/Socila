# WI-20260911-01：上海官方原文采集与政策纠偏

> Author: Jan
> Status: Ready for independent review（2026-09-12 MinIO原件链路修复交付：18/18测试+真实23件演练12项全ok；同日控制契约复审修复：35/35测试+17项演练全ok。独立复审确认前不标记Accepted）
> Updated: 2026-09-12

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
