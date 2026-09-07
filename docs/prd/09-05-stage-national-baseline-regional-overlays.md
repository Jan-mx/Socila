# 国家baseline及广东权威overlay首期交付 Stage PRD

> Author: Jan
> Status: Active
> Updated: 2026-09-07

## 文档元数据

| 字段 | 值 |
| --- | --- |
| PRD文件 | `09-05-stage-national-baseline-regional-overlays.md` |
| 类型 | Stage |
| 状态 | Active |
| 前置依赖 | `09-05-feature-socila-naming-regional-dsl.md` Accepted；地区Manifest和`SOCILA-DSL-1.0`稳定 |
| 可并行阶段 | 地区来源调查可并行；baseline抽取、overlay建模、审核和快照必须按依赖串行 |
| 后续消费者 | `09-05-feature-jurisdiction-aware-planning.md`与`09-05-feature-case-library-governance.md`，任务2后并行开发 |
| 退出门禁 | CN、上海、广东形成权威引用、可执行规则、隔离黄金测试、管理员批准和候选快照；四川按ADR-0010延期且保持blocked |
| 对应总体需求 | PRD-FR-001～006、PRD-FR-010～024、PRD-FR-030～043、PRD-NFR-001～007 |

## 1. 背景与现状

项目已经具备地区树、显式overlay、冲突和不可变快照。CN、上海及广东权威资产已进入仓库，广东新增5个权威参数尚未增量物化；四川只有3个已核实缴费基数draft参数，三项正式来源仍缺失并按ADR-0010延期。当前持久库没有候选PolicySnapshot，任务2首期仍需完成CN、上海、广东的审核与快照。

RAG Schema、解析、OCR、全文与向量检索实现已存在，但生产索引为空，现有LangGraph节点仍是固定Fake骨架。Stage必须从官方来源建立可审计事实，再生成规则、参数和测试草案；不得从现有示例数值反推正式政策。

### 1.1 历史阶段E执行前基线（2026-09-06只读核对）

里程碑A～D已经在仓库和隔离演练库完成，但权威资产尚未物化到本机持久Compose数据库`socila-postgres/policyops`。该库只应用了0011和0012增量迁移，未重新Seed，当前仍为上海旧运行基线：24条`published`规则、29个`published`参数和1个`published`规则集，`policy_snapshots=0`。

| 地区 | 仓库权威资产 | 持久库现状 | 覆盖状态 |
| --- | --- | --- | --- |
| CN | 16条规则、6个参数 | 0 | 待物化、待管理员批准 |
| 上海310000 | 重分类后8条地方规则、27个参数 | 旧版24条规则、29个参数 | 新版本待物化，旧运行行为必须保持 |
| 广东440000 | 1条医保退休`restrict`规则、5个参数 | 0 | 2025-07后缴费基数、失业条例及2030年前市级医保口径缺失，必须阻断发布 |
| 四川510000 | 0条地方规则、3个参数 | 0 | 医保退休年限、失业金标准及2026年度基数缺失，必须阻断发布 |

四川现有权威成果只有3个2025年度缴费基数参数，没有可执行地方规则；不得为了后台可见性创建占位规则或根据征求意见稿、转载推断政策含义。

### 1.2 当前基线（2026-09-07）

- 持久库已应用0014并完成四包repair：49/70/5/4/528/851/117/0、batches=8、members=78。
- 仓库广东参数已由5增至10并具有官方证据；持久库仍为5个GD参数，尚未写入新delta。
- 当前fresh audit错误地重放四地区整包并规划74/116/9/8，修复增量算法前禁止apply。
- CN/上海为awaiting_approval；广东须在delta正确物化后转awaiting_approval；四川保持blocked且不参与首期候选快照。

## 2. 目标

- 从权威国家文件抽取共性规则，形成`CN` baseline。
- 将现有上海规则区分为国家继承和上海特有overlay，保持上海黄金结果。
- 建立广东`440000`权威核心政策overlay并作为首期交付地区；四川`510000`保留已核实资产并延期补齐。
- 显式持久化`add/replace/restrict/exempt`，不再按地区代码推断。
- 为每个政策事实保存原件、DocumentTree、稳定引用、有效期和provenance。
- 建立国家、上海、广东的规则、参数、黄金测试和候选PolicySnapshot。
- 按国家、上海、广东分别验收；四川显式blocked且不阻塞首期任务2Accepted，不要求已交付地区同时开放用户流量。

## 3. 非目标

- 不自动覆盖全国所有省市、区县和政府站点。
- 不承诺粤川与上海全部地方补贴能力完全相同。
- 不修改用户规划API、聊天地区选择或地区激活逻辑。
- 不允许Agent自动创建staging、production或激活用户地区。
- 不以搜索摘要、转载、自媒体、测试文本或现有示例参数作为政策事实源。
- 不在来源含义冲突时由模型自动作出法律解释。
- 阶段E不重新Seed、不改写案例库或测试库，不自动发布规则、生成活动快照或开放用户流量。
- 阶段E的本机持久库授权不包含远程生产数据库、数据删除、Secret轮换或其他生产切换。
- 首期不补齐四川医保退休年限、川人社办发〔2023〕18号或2026年度缴费基数，不为四川生成候选快照或开放流量。
- 不把广东整体限制到2030年后；2030年前只对缺少地市权威参数的医保退休年限进入能力级人工确认。

## 4. 用户故事

- **NRP-US-001** 作为政策管理员，我需要国家共性规则只维护一次，从而地方包只表达真实差异。
- **NRP-US-002** 作为广东或四川规划用户，我需要政策事实来自本地区和国家有效政策，从而不会收到上海口径结果。
- **NRP-US-003** 作为审核者，我需要每个规则和参数回溯到官方原件、条款和有效期。
- **NRP-US-004** 作为规则维护者，我需要地方差异显式标识overlay操作，从而替换、限制和豁免不会被误判为新增。
- **NRP-US-005** 作为发布者，我需要按地区独立验收候选快照，从而一个地区的问题不会阻止其他地区准备就绪。

## 5. 功能与工程需求

- **NRP-FR-001 来源登记**：每个来源记录地区、发文机关、正式入口、允许域名、内容类型、频率、状态和负责人。
- **NRP-FR-002 权威原件**：保存原始响应或附件、最终URL、抓取时间、HTTP元数据、内容哈希和对象键。
- **NRP-FR-003 文档解析**：HTML、PDF、DOCX、XLSX等原件生成DocumentTree、派生Markdown、页面资源和质量信息。
- **NRP-FR-004 引用定位**：政策事实引用必须包含documentVersion、结构路径、条款或页码、原文摘录及解析版本。
- **NRP-FR-005 国家baseline**：退休、养老、医保、失业及缴费的国家共性资格、期限和计算框架归属`CN`。
- **NRP-FR-006 地方overlay**：上海、广东、四川只保存对国家规则的新增、替换、限制、豁免及地方参数。
- **NRP-FR-007 显式操作**：规则、参数和规则集版本必须持久化overlay操作及目标业务键；不得根据`jurisdiction_code`推断操作。
- **NRP-FR-008 核心范围**：首版覆盖法定/渐进退休、养老最低缴费、退休医保年限与补缴、失业资格与期限、缴费基数和必要费率。
- **NRP-FR-009 地方补贴**：只有权威来源完整描述适用对象、资格、金额或公式、期限、互斥和有效期时才可纳入。
- **NRP-FR-010 版本化**：每个规则、参数、测试和政策包包含地区、业务键、版本、状态、生效区间及来源。
- **NRP-FR-011 冲突处理**：同级重叠、来源矛盾、未知目标键或依赖缺失生成PolicyConflict并阻止快照。
- **NRP-FR-012 草案生成**：Agent生成带引用的DraftBundle；Core必须二次执行Schema、引用、地区、状态和幂等校验。
- **NRP-FR-013 人工审核**：政策管理员可批准、编辑后批准或驳回；无法确定政策含义时必须人工裁决。
- **NRP-FR-014 地区快照**：首期为CN、上海、广东分别生成包含继承链、成员版本、provenance和内容哈希的不可变候选快照；四川延期期间不得生成候选快照。
- **NRP-FR-015 黄金测试**：每个地区建立核心场景黄金用例，覆盖正常、边界、缺失信息和地区隔离。
- **NRP-FR-016 分地区交付**：首期按国家baseline、上海重分类、广东overlay三个地区里程碑形成验收证据；四川资产与blocked语义保留并转`WI-20260907-01-sichuan-policy-followup.md`独立验收。
- **NRP-FR-017 受控物化**：提供独立的地区政策物化命令；默认仅执行`audit`，不得调用`npm run seed`。任何数据库操作必须显式读取进程级`DATABASE_URL`，禁止回退读取`.env.local`；`apply`必须同时校验授权参数、目标指纹和预期manifest哈希。
- **NRP-FR-018 强制草案与版本**：仓库资产进入持久库时一律强制为`draft`，不得信任文件中的`published`声明。CN、广东和四川首次业务键使用v1；上海已有业务键创建v2，新业务键可使用v1；任何既有`published`行不得原地更新。
- **NRP-FR-019 批次审计与幂等**：按地区记录物化批次及成员，保存manifest哈希、来源提交、非敏感目标指纹、实体计数、业务键、版本、内容哈希、就绪状态、阻断原因、操作者和时间；同一地区相同manifest重复执行必须返回no-op。
- **NRP-FR-020 参数证据与政策包**：`params`必须保存完整结构化`evidence`；CN、上海、广东和四川分别创建一个`draft policy_pack_version`，参数快照必须包含原值、有效期、operation、目标业务键和引用。
- **NRP-FR-021 地区化管理身份**：规则、参数、规则集、详情、版本和发布流水线必须展示并使用地区身份；同名实体通过`jurisdiction_code + entity_id + version`唯一定位，不得按`rule_id`或`param_id`猜测地区。
- **NRP-FR-022 覆盖状态**：CN、上海和完成本阶段delta后的广东标记为`awaiting_approval`；四川保持`blocked`并保存三项延期原因。广东2030年前缺少地市医保退休年限时由R-220输出`needs_agent`与`W-MI-LOCAL-YEARS-MISSING`，不阻断其他政策模块。blocked四川不得晋级、生成候选快照或作为用户流量依据。

### 5.1 非功能需求

- **NRP-NFR-001 引用完整**：进入审核的规则和参数字段引用覆盖率100%。
- **NRP-NFR-002 地区正确**：错误地区或错误有效日期候选进入结果的比例为0。
- **NRP-NFR-003 可重放**：相同地区、日期和快照产生相同规则集合、参数和黄金结果。
- **NRP-NFR-004 隐私**：政策模型、Embedding、Rerank和OCR不得接收用户身份、对话、画像或规划结果。
- **NRP-NFR-005 可恢复**：PostgreSQL、MinIO原件、RAG数据和Checkpoint随既有备份流程恢复。
- **NRP-NFR-006 可观测**：记录来源、解析、检索、模型、Prompt、Token、审核、冲突和快照关联ID。
- **NRP-NFR-007 安全输入**：政策文本按不可信输入处理，不能修改系统指令、权限或工具范围。
- **NRP-NFR-008 资源约束**：沿用Personal Demo的单Worker、prefetch 1及文件大小/页数限制。
- **NRP-NFR-009 目标保护**：阶段E只允许显式授权的本机`localhost:5432/policyops`目标；连接串、口令和完整URL不得写入日志、manifest、审计表或Git。
- **NRP-NFR-010 原子幂等**：历史首次四地区物化及每次后续确定性delta分别在单个数据库事务中完成；任一计数、哈希、引用或版本不符时全部回滚，不得留下部分实体或批次。
- **NRP-NFR-011 可恢复**：apply前必须完成完整`pg_dump -Fc`、SHA-256清单及全新PG17+pgvector容器真实恢复，并逐表核对计数和规范化行哈希。
- **NRP-NFR-012 零运行漂移**：阶段E完成后旧上海24条规则、29个参数及规则集继续保持`published`且内容哈希不变；新增draft不得改变现有规划、测试、案例、快照或用户流量。

## 6. 实现设计

### 6.1 建设顺序

```text
官方来源登记
 → 原件采集与哈希去重
 → DocumentTree与人工校对
 → 国家事实抽取
 → CN baseline草案
 → 上海/广东/四川差异分析
 → 显式overlay草案
 → 引用、依赖和黄金测试
 → 管理员审核
 → 地区候选快照
```

国家baseline必须先于地方overlay稳定。上海现有规则逐条分类：属于全国统一口径的迁入`CN`，属于上海执行标准的保留在`310000`。迁移前后使用同一批上海黄金案例比较`plan/calc/trace`。

### 6.2 地区门禁

每个地区分别计算`ready_for_planning`，仅表示可供后续规划Feature接入，不直接改变用户流量。条件包括引用、Schema、参数依赖、地区隔离、有效期、冲突、黄金结果、快照重放和管理员批准全部通过。

### 6.3 历史首次阶段E受控物化顺序

```text
只读基线与旧行规范化哈希
 → 生成确定性物化manifest
 → 完整数据库备份与SHA-256清单
 → 全新PG17+pgvector真实恢复及逐表对账
 → 显式DATABASE_URL执行增量migration
 → 单事务写入四地区draft及批次审计
 → 旧行哈希、固定计数和上海运行行为复核
 → 后台地区化展示验证
```

物化manifest只包含规则、参数、规则集和政策包版本，不包含`tests`、`cases`、`showcase_cases`、快照或发布事件。apply前选中的DSL及证据文件必须来自已提交内容；任何目标、哈希、计数或工作树来源不确定时停止。

### 6.4 draft政策包快照repair加固

阶段E已物化draft政策包若与当前已提交Manifest的完整参数快照不一致，只能通过受控`repair`纠正。repair复用显式DATABASE_URL、授权参数、manifest哈希和目标指纹门禁，并额外满足：

- 目标指纹绑定待修复draft包的行ID、地区、pack ID、版本、状态、快照哈希及批次成员哈希，避免audit后发生的编辑被覆盖。
- 在同一事务内锁定并重新校验全部目标行；状态、版本或旧哈希不符时零写入退出。
- 原物化批次与成员保持不可变；每个修复包创建确定性的`repaired`批次和一条新成员记录。
- 修复批次继承地区readiness和blocking reasons；粤川不得因repair丢失阻断原因。
- 并发repair由数据库唯一约束裁决；唯一冲突后仅在目标已完全一致时返回no-op。
- repair只改变draft包快照和新增修复审计行，不改变published资产、业务实体计数、规划行为或地区开放状态。

repair加固由`WI-20260906-01-stage-e-pack-repair-hardening.md`完成，持久库0014与四包repair由`WI-20260906-02-stage-e-persistent-repair.md`在明确授权下执行并验收（证据见验收报告§14～§15）。旧audit只作为历史证据；未来出现新漂移时仍必须使用当前HEAD的fresh audit和新的明确授权。

### 6.5 广东增量物化与能力级缺口

阶段E原物化与repair已经完成，当前持久库基线为49/70/5/4。后续广东更新必须采用既有状态感知的delta，不得再次物化整个四地区Manifest：

- 以地区、实体类型、业务键、有效期窗口、既有版本和规范化内容识别已物化实体；内容与窗口均相同的CN、上海、四川及广东实体跳过。
- `P-GD-CONTRIB-BASE-UPPER`与`T-GD-CONTRIB-BASE-LOWER-BY-CITY`旧窗口保持v1，新窗口使用v2。
- `P-GD-PENSION-CALC-BASE-2025`、`T-GD-MIN-WAGE-BY-CITY`、`P-GD-UNEMPLOYMENT-BENEFIT-RATE`使用v1。
- 新增广东失业保险金金额规则，以已确认领取地市对应最低工资×0.9计算；领取地市或最低工资无法解析时输出`needs_agent`，不得猜测金额。广东规则集创建下一版本并纳入该规则，GD政策包创建v2。
- 本次delta完成后的业务计数为rules=50、params=75、rule_sets=6、policy_pack_versions=5、tests=528、cases=851、showcase_cases=117；候选快照创建前policy_snapshots=0。
- 本次delta只新增1个广东applied批次和8个成员（5参数+1规则+1规则集版本+1政策包版本）；实际audit必须逐项列出相同集合。
- apply事务内目标计数由当前指纹和确定性delta计算，不再把首次物化固定计数作为通用后续目标。同delta重复或并发执行只允许一组结果。

广东2030年前缺少统筹地市医保退休累计缴费年限时，国家规则`R-220-MEDICAL-LIFETIME-GAP`已有缺参守卫：仅医保退休年限结论保持空并输出`needs_agent=true`与`W-MI-LOCAL-YEARS-MISSING`，养老、缴费基数、最低工资、失业资格/期限/金额等可计算模块继续执行。2030-01-01起省级男30年、女25年参数自动进入有效集合。

## 7. 数据模型与不变量

为政策实体补充或规范：

```ts
type OverlayOperation = "baseline" | "add" | "replace" | "restrict" | "exempt";

interface PolicyEntityVersion {
  jurisdictionCode: string;
  businessKey: string;
  version: number;
  operation: OverlayOperation;
  targetBusinessKey: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "draft" | "staging" | "published" | "retired";
  citations: Citation[];
}

interface PolicyImportBatch {
  jurisdictionCode: "CN" | "310000" | "440000" | "510000";
  manifestHash: string;
  sourceCommit: string;
  targetFingerprint: string;
  status: "prepared" | "applied" | "verified" | "failed" | "repaired";
  readiness: "awaiting_approval" | "blocked";
  blockingReasons: string[];
  entityCounts: Record<string, number>;
  actor: string;
}

interface PolicyImportBatchMember {
  batchId: string;
  entityType: "rule" | "param" | "rule_set" | "policy_pack_version";
  entityRowId: number;
  businessKey: string;
  version: number;
  contentHash: string;
}
```

不变量：

- `CN`实体只能使用`baseline`，地区实体不能使用`baseline`。
- `replace/restrict/exempt`必须解析到继承链上唯一上级业务键。
- `add`不得覆盖已经存在的有效业务键。
- published实体不可原地修改；修订通过新版本完成。
- 未确认OCR关键字段不得进入可审核DraftBundle。
- 快照成员和内容哈希创建后不可修改或删除。
- 批次和成员审计不得存储连接串、口令、Authorization或原始用户数据。
- 已写入的物化批次和成员是历史审计记录；repair不得改写原记录，只能新增确定性的修复批次和成员。
- `verified`只表示持久化与恢复验证完成，不代表政策已批准、published或ready_for_planning。
- 四川批次的规则成员数必须为0；任何占位规则都属于验收失败。

## 8. API、事件与类型

本Stage复用并补齐PolicyOps内部接口：

- 来源登记、文档摄取、文档详情和OCR校对。
- 按`jurisdictionCode`、`asOfDate`和发布状态执行检索。
- `ResolvePolicyContext(jurisdictionCode, asOfDate)`返回合并实体、provenance和冲突。
- `CreatePolicySnapshot(jurisdictionCode, asOfDate, actor)`只接受门禁通过的实体。
- DraftBundle必须携带overlay操作、目标业务键、引用和基准快照。
- 管理列表支持`jurisdiction_code`和状态筛选；规则列表同时支持`module`与`q`，其中`q`检索规则编号和名称。
- 规则详情、校验、示例执行、版本、晋级与回滚必须携带`jurisdiction_code`和`version`；缺失精确身份返回400，不存在返回404，不得选择其他地区同名实体。
- 发布请求固定为`entity_type + jurisdiction_code + entity_id + version`；发布审计同时记录地区和实体版本。

```text
GET /api/admin/rules?jurisdiction_code=&status=&module=&q=
GET /api/admin/params?jurisdiction_code=&status=
GET /api/admin/rules/{ruleId}?jurisdiction_code=&version=
POST /api/admin/publish/promote
POST /api/admin/publish/rollback
```

```ts
interface PublishEntityRequest {
  entity_type: "rule" | "param" | "rule_set";
  jurisdiction_code: string;
  entity_id: string;
  version: number;
}
```

不新增浏览器直接访问FastAPI的路径，不允许客户端直接指定published实体版本。

## 9. 迁移与兼容

- 新增overlay操作和目标业务键时使用版本化migration，先在全新库和上海数据副本验证。
- 上海重分类使用新实体版本和新快照，不原地改写历史published快照。
- 旧上海规则集在新候选快照验收前保持可回退。
- 广东、四川测试夹具不能迁入正式政策表；真实政策使用新的权威业务键和引用。
- 任一地区验收失败只回退该地区草案和候选快照，不删除原件或其他地区数据。
- 阶段E新增migration只能增加审计结构、参数证据及发布地区身份；历史发布记录允许地区和版本为空，新发布记录必须完整。
- 阶段E不得使用现有Seed作为持久库导入路径，因为Seed还会写入案例和测试并直接产生published参数。
- 首次阶段E物化与repair后的历史基线保持：`rules=49`、`params=70`、`rule_sets=5`、`policy_pack_versions=4`、`tests=528`、`cases=851`、`showcase_cases=117`、`policy_snapshots=0`。广东delta物化完成后的新基线为`rules=50`、`params=75`、`rule_sets=6`、`policy_pack_versions=5`，其余业务计数不变；不得改写历史报告中的首次基线。

## 10. 安全、隐私与可观测

- 只允许官方白名单域名；重定向后继续校验域名和公共IP，阻止SSRF。
- 原始政策、DocumentTree和校对记录是审计事实源，模型输出不是事实源。
- 日志记录对象ID、模型、耗时和结果摘要，不记录Secret、Authorization、完整向量或用户资料。
- 模型或来源不可用时保留任务状态，不切换未经批准的模型或非官方来源。
- 政策含义存在合理歧义时停止自动流程并创建人工任务。

## 11. 失败模式、重试与回退

| 失败 | 行为 | 可重试/回退 |
| --- | --- | --- |
| 来源非白名单或解析到私网 | 拒绝抓取 | 管理员核实来源后重新登记 |
| 原生解析与OCR关键字段冲突 | 进入人工校对 | 校对后重建派生产物 |
| 国家与地方语义无法分类 | 创建政策决策任务 | 不生成可发布overlay |
| 目标业务键不存在 | PolicyConflict | 修正草案后重试 |
| 引用或参数依赖不完整 | 阻止审核 | 补齐证据后重跑 |
| 地区黄金测试失败 | 地区不标记ready | 回退该地区新版本 |
| 外部模型429/503 | 有限退避 | 超限后保留队列状态 |
| 未显式设置DATABASE_URL或目标不是授权库 | 拒绝执行，不读取dotenv回退 | 修正显式目标后重新audit |
| manifest哈希、来源提交或资产计数不符 | apply前停止 | 重新生成并人工复核manifest |
| 备份恢复计数或行哈希不符 | 禁止migration和物化 | 修复备份/恢复流程后重试 |
| 发现既有published实体需要原地更新 | 拒绝物化 | 生成下一版本并重新audit |
| 四地区任一写入或验证失败 | 整个物化事务回滚 | 保留备份和失败证据后重试 |
| repair目标在audit后发生变化 | 拒绝repair且零写入 | 重新audit并人工核对新的目标状态 |
| 并发repair命中唯一约束 | 事务复核最终快照 | 已完全一致则no-op，否则报错并人工检查 |
| 广东医保退休市级年限缺失 | 仅对应能力输出needs_agent，其他模块继续 | 后续取得市级原件并新增参数版本 |
| 四川存在延期缺口 | 保持blocked、无候选快照且不阻塞首期 | 按WI-20260907-01取得三项正式来源后独立验收 |

## 12. 交付物

- CN国家baseline DSL、参数、引用和黄金测试。
- 上海规则重分类及零漂移对账。
- 广东核心政策overlay、引用、黄金测试和能力级缺参守卫；四川保留既有安全隔离证据并延期。
- 显式overlay操作数据模型、migration和Repository实现。
- CN、上海、广东三个首期地区的候选快照及独立门禁结果；四川明确无候选快照。
- 原件、DocumentTree、RAG索引、审核和冲突证据。
- 当前架构、测试、运维、traceability、PROGRESS和阶段验收报告。
- 阶段E受控物化命令、确定性manifest、批次及成员审计、参数证据和四个draft政策包版本。
- 地区化规则、参数、规则集和发布管理界面；四川显示“0条地方规则、3个参数、blocked”。
- 本机持久库完整备份、真实恢复、物化前后计数及旧上海行哈希对账证据。

## 13. 测试矩阵

| 类型 | 场景 | 通过条件 |
| --- | --- | --- |
| 来源 | 官方域名、重定向、哈希去重 | 非官方/私网拒绝，原件可追踪 |
| 解析/OCR | 文本、扫描、表格、关键数字 | 冲突进入人工校对 |
| Domain | baseline和四种overlay | 结果唯一、顺序稳定、输入不变 |
| 地区隔离 | CN、上海、广东、四川 | 无跨地区污染 |
| 有效期 | 历史、当前、废止版本 | 只选择目标日期有效实体 |
| 引用 | 规则及参数所有字段 | 覆盖率100% |
| 黄金 | 各地区核心规划场景 | 通过率100% |
| 上海迁移 | 重分类前后执行 | `plan/calc/trace`无未解释漂移 |
| 快照 | 创建、重放、篡改 | 可重放且更新/删除被拒绝 |
| RAG | 地区过滤、召回和引用 | 错地区/日期0，达到既有阈值 |
| 物化命令 | 默认audit、显式目标、授权参数、manifest哈希 | 缺一项即拒绝apply，不发生写入 |
| 版本与幂等 | 旧上海副本、四地区重复物化 | published不变；版本精确；相同manifest no-op |
| 事务与恢复 | 中途失败、完整dump、全新PG17恢复 | 无部分写入；恢复计数和行哈希一致 |
| 管理身份 | 同名CN/上海实体、粤川筛选 | 详情和发布不串区；四川覆盖状态准确 |
| 增量物化 | WI-02后基线应用广东新Manifest | 只新增5参数、1规则、1规则集版本和1政策包版本；CN/沪/川零新增 |
| 能力级缺口 | 广东2030年前医保退休参数缺失 | needs_agent+稳定warning；其他模块结果继续生成 |
| 持久库回归 | 物化前后业务表与上海规划 | 新基线50/75/6/5满足；528/851/117及旧上海行为不变 |
| repair守卫与原子性 | 错授权/hash/指纹、audit后变化、中途失败 | 零写入或整事务回滚，不覆盖新draft状态 |
| repair审计与幂等 | 四包修复、并发、成功后fresh audit复跑 | `repaired`批次/成员完整；并发单结果；复跑no-op |

## 14. 验收场景

- **NRP-AC-001** Given国家官方政策，When生成CN baseline，Then每个事实具有稳定引用和有效期。
- **NRP-AC-002** Given上海现有规则，When重分类为baseline和overlay，Then黄金结果逐案一致。
- **NRP-AC-003** Given广东查询，When解析政策上下文，Then只包含CN和广东有效实体。
- **NRP-AC-004** Given延期四川查询，When解析政策上下文或请求候选快照，Then不包含上海或广东地方实体且不得生成四川候选快照。
- **NRP-AC-005** Given地方替换、限制或豁免，When创建快照，Then操作和目标键保存在provenance中。
- **NRP-AC-006** Given同级重叠或未知目标键，When解析，Then创建Conflict并阻止快照。
- **NRP-AC-007** Given引用缺失或OCR关键字段未确认，When提交草案，Then不得进入可批准状态。
- **NRP-AC-008** GivenCN、上海或广东全部门禁通过，When管理员批准，Then分别生成可重放候选快照但不自动开放用户流量；四川不参与首期批准。
- **NRP-AC-009** Given某地区验收失败，When检查其他地区，Then已通过地区的候选快照不受影响。
- **NRP-AC-010** Given相同地区、日期和快照，When重复执行，Then规则、参数和结果哈希一致。
- **NRP-AC-011** Given未显式设置数据库目标、目标指纹错误或缺少授权参数/manifest哈希，When请求apply，Then命令拒绝且持久库零写入。
- **NRP-AC-012** Given物化前完整备份，When在全新PG17+pgvector中恢复，Then逐表计数和规范化行哈希与源库一致，否则不得继续。
- **NRP-AC-013** GivenWI-02后持久库基线，When物化广东delta，Then只新增5参数、1规则、1规则集版本和1政策包版本；旧窗口版本不变，CN/上海/四川零新增且旧published行内容不变。
- **NRP-AC-014** Given相同广东delta已验证，When再次apply或并发apply，Then只产生一组结果并返回幂等no-op；任一写入失败时新增实体和批次全部回滚。
- **NRP-AC-014 repair补充** Givenfresh audit绑定四个draft政策包，When执行repair或发生并发，Then只修复完全匹配的目标、保留原审计记录、仅新增一组`repaired`审计；任一失败全部回滚，成功后fresh audit复跑为no-op。
- **NRP-AC-015** Given广东delta成功且候选快照尚未创建，When核对持久库，Then业务计数严格为50/75/6/5/528/851/117/0，广东为awaiting_approval、四川保持blocked且四川零新增实体。
- **NRP-AC-016** GivenCN与上海存在同名业务键，When管理员查看详情或请求发布，Then必须用地区、实体ID和版本精确定位；缺失身份被拒绝且不得跨地区操作。

## 15. Definition of Done

- NRP-FR-001～022、NRP-NFR-001～012具有实现和测试映射。
- NRP-AC-001～016按首期CN、上海、广东取得新鲜证据；四川取得blocked、无候选快照和跨地区零污染证据。
- 权威引用覆盖100%，错地区和错有效期混入为0。
- 上海黄金结果无未解释漂移。
- 无未解决Conflict的地区才可形成候选快照。
- Agent只创建draft，管理员审核和发布门禁保持有效。
- 阶段E备份真实恢复、确定性delta、单事务增量物化、动态目标计数和幂等复跑全部通过。
- draft政策包repair具有专用数据库集成Red/Green证据，证明目标绑定、事务锁、并发裁决、审计不可变和幂等。
- 旧上海published资产及规划行为无漂移，tests/cases/showcase_cases计数不变；首期只新增CN、上海、广东3个候选PolicySnapshot，四川为0。
- CN、上海、广东未完成管理员批准和候选快照时任务2不得标记Accepted；四川三项延期缺口不阻塞首期，但必须保持blocked、无候选快照且不得描述为已支持。
- README、架构、测试、运维、traceability、PROGRESS和报告同步。
- 每个已接受里程碑使用独立`英文行为: 中文简短总结`提交并推送，不创建PR或合并main。

## 16. 下一阶段输入

- CN、上海、广东三个首期地区均具有通过门禁、管理员批准且可重放的候选快照。
- 稳定的地区继承、显式overlay、冲突和快照读取接口。
- 国家、上海、广东的首期支持状态，以及四川Deferred/Blocked门禁结果。
- 地区感知规划Feature可消费的规则、参数及快照契约。
