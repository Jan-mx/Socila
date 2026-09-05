# 国家baseline及广东四川权威overlay Stage PRD

> Author: Jan
> Status: Draft
> Updated: 2026-09-05

## 文档元数据

| 字段 | 值 |
| --- | --- |
| PRD文件 | `09-05-stage-national-baseline-regional-overlays.md` |
| 类型 | Stage |
| 状态 | Draft |
| 前置依赖 | `09-05-feature-socila-naming-regional-dsl.md` Accepted；地区Manifest和`SOCILA-DSL-1.0`稳定 |
| 可并行阶段 | 地区来源调查可并行；baseline抽取、overlay建模、审核和快照必须按依赖串行 |
| 后续消费者 | `09-05-feature-jurisdiction-aware-planning.md` |
| 退出门禁 | CN、上海、广东、四川核心政策形成权威引用、可执行规则、隔离黄金测试和候选快照 |
| 对应总体需求 | PRD-FR-001～006、PRD-FR-010～024、PRD-FR-030～043、PRD-NFR-001～007 |

## 1. 背景与现状

项目已经具备地区树、overlay纯函数、冲突和不可变快照，但国家`CN`尚无完整独立baseline，上海24条规则以地方add形式承载完整能力。广东、四川只有非权威示例参数和测试文本，不能用于用户规划。持久化服务还会把所有非`CN`实体推断为`add`，没有完整保存`replace`、`restrict`和`exempt`语义。

RAG Schema、解析、OCR、全文与向量检索实现已存在，但生产索引为空，现有LangGraph节点仍是固定Fake骨架。Stage必须从官方来源建立可审计事实，再生成规则、参数和测试草案；不得从现有示例数值反推正式政策。

## 2. 目标

- 从权威国家文件抽取共性规则，形成`CN` baseline。
- 将现有上海规则区分为国家继承和上海特有overlay，保持上海黄金结果。
- 建立广东`440000`与四川`510000`的权威核心政策overlay。
- 显式持久化`add/replace/restrict/exempt`，不再按地区代码推断。
- 为每个政策事实保存原件、DocumentTree、稳定引用、有效期和provenance。
- 建立国家、上海、广东、四川的规则、参数、黄金测试和候选PolicySnapshot。
- 按国家、上海、广东、四川分别验收，不要求三地同时开放用户流量。

## 3. 非目标

- 不自动覆盖全国所有省市、区县和政府站点。
- 不承诺粤川与上海全部地方补贴能力完全相同。
- 不修改用户规划API、聊天地区选择或地区激活逻辑。
- 不允许Agent自动创建staging、production或激活用户地区。
- 不以搜索摘要、转载、自媒体、测试文本或现有示例参数作为政策事实源。
- 不在来源含义冲突时由模型自动作出法律解释。

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
- **NRP-FR-014 地区快照**：CN、上海、广东、四川分别生成包含继承链、成员版本、provenance和内容哈希的不可变候选快照。
- **NRP-FR-015 黄金测试**：每个地区建立核心场景黄金用例，覆盖正常、边界、缺失信息和地区隔离。
- **NRP-FR-016 阶段交付**：按国家baseline、上海重分类、广东overlay、四川overlay四个里程碑独立形成验收证据。

### 5.1 非功能需求

- **NRP-NFR-001 引用完整**：进入审核的规则和参数字段引用覆盖率100%。
- **NRP-NFR-002 地区正确**：错误地区或错误有效日期候选进入结果的比例为0。
- **NRP-NFR-003 可重放**：相同地区、日期和快照产生相同规则集合、参数和黄金结果。
- **NRP-NFR-004 隐私**：政策模型、Embedding、Rerank和OCR不得接收用户身份、对话、画像或规划结果。
- **NRP-NFR-005 可恢复**：PostgreSQL、MinIO原件、RAG数据和Checkpoint随既有备份流程恢复。
- **NRP-NFR-006 可观测**：记录来源、解析、检索、模型、Prompt、Token、审核、冲突和快照关联ID。
- **NRP-NFR-007 安全输入**：政策文本按不可信输入处理，不能修改系统指令、权限或工具范围。
- **NRP-NFR-008 资源约束**：沿用Personal Demo的单Worker、prefetch 1及文件大小/页数限制。

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
```

不变量：

- `CN`实体只能使用`baseline`，地区实体不能使用`baseline`。
- `replace/restrict/exempt`必须解析到继承链上唯一上级业务键。
- `add`不得覆盖已经存在的有效业务键。
- published实体不可原地修改；修订通过新版本完成。
- 未确认OCR关键字段不得进入可审核DraftBundle。
- 快照成员和内容哈希创建后不可修改或删除。

## 8. API、事件与类型

本Stage复用并补齐PolicyOps内部接口：

- 来源登记、文档摄取、文档详情和OCR校对。
- 按`jurisdictionCode`、`asOfDate`和发布状态执行检索。
- `ResolvePolicyContext(jurisdictionCode, asOfDate)`返回合并实体、provenance和冲突。
- `CreatePolicySnapshot(jurisdictionCode, asOfDate, actor)`只接受门禁通过的实体。
- DraftBundle必须携带overlay操作、目标业务键、引用和基准快照。

不新增浏览器直接访问FastAPI的路径，不允许客户端直接指定published实体版本。

## 9. 迁移与兼容

- 新增overlay操作和目标业务键时使用版本化migration，先在全新库和上海数据副本验证。
- 上海重分类使用新实体版本和新快照，不原地改写历史published快照。
- 旧上海规则集在新候选快照验收前保持可回退。
- 广东、四川测试夹具不能迁入正式政策表；真实政策使用新的权威业务键和引用。
- 任一地区验收失败只回退该地区草案和候选快照，不删除原件或其他地区数据。

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

## 12. 交付物

- CN国家baseline DSL、参数、引用和黄金测试。
- 上海规则重分类及零漂移对账。
- 广东和四川核心政策overlay、引用和黄金测试。
- 显式overlay操作数据模型、migration和Repository实现。
- 四个地区的候选快照及独立门禁结果。
- 原件、DocumentTree、RAG索引、审核和冲突证据。
- 当前架构、测试、运维、traceability、PROGRESS和阶段验收报告。

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

## 14. 验收场景

- **NRP-AC-001** Given国家官方政策，When生成CN baseline，Then每个事实具有稳定引用和有效期。
- **NRP-AC-002** Given上海现有规则，When重分类为baseline和overlay，Then黄金结果逐案一致。
- **NRP-AC-003** Given广东查询，When解析政策上下文，Then只包含CN和广东有效实体。
- **NRP-AC-004** Given四川查询，When解析政策上下文，Then不包含上海或广东地方实体。
- **NRP-AC-005** Given地方替换、限制或豁免，When创建快照，Then操作和目标键保存在provenance中。
- **NRP-AC-006** Given同级重叠或未知目标键，When解析，Then创建Conflict并阻止快照。
- **NRP-AC-007** Given引用缺失或OCR关键字段未确认，When提交草案，Then不得进入可批准状态。
- **NRP-AC-008** Given任一地区全部门禁通过，When管理员批准，Then生成可重放的候选快照但不自动开放用户流量。
- **NRP-AC-009** Given某地区验收失败，When检查其他地区，Then已通过地区的候选快照不受影响。
- **NRP-AC-010** Given相同地区、日期和快照，When重复执行，Then规则、参数和结果哈希一致。

## 15. Definition of Done

- NRP-FR-001～016、NRP-NFR-001～008具有实现和测试映射。
- NRP-AC-001～010按国家、上海、广东、四川分别取得新鲜证据。
- 权威引用覆盖100%，错地区和错有效期混入为0。
- 上海黄金结果无未解释漂移。
- 无未解决Conflict的地区才可形成候选快照。
- Agent只创建draft，管理员审核和发布门禁保持有效。
- README、架构、测试、运维、traceability、PROGRESS和报告同步。
- 每个已接受里程碑使用独立`英文行为: 中文简短总结`提交并推送，不创建PR或合并main。

## 16. 下一阶段输入

- 至少一个通过全部门禁、管理员批准且可重放的地区候选快照。
- 稳定的地区继承、显式overlay、冲突和快照读取接口。
- 国家、上海、广东、四川各自的支持状态和门禁结果。
- 地区感知规划Feature可消费的规则、参数及快照契约。
