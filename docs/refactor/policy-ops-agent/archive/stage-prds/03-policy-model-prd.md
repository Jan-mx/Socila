# 阶段 03：全国政策模型 PRD

## 文档元数据

| 字段 | 值 |
| --- | --- |
| 阶段 | 03 / National Policy Model |
| 状态 | Ready after Stage 02 contracts freeze |
| 前置依赖 | Next Core领域端口、本地PostgreSQL、migration |
| 可并行阶段 | 05 Ingestion/RAG（契约冻结后） |
| 后续消费者 | 06 Policy Drafting、07 Migration |
| 退出门禁 | 国家基线、三地overlay、快照和历史复算通过 |
| 对应总体需求 | PRD-FR-010～014、PRD-FR-040～043 |

## 1. 背景与现状

现有规则默认使用上海规则集和 `SHANGHAI_BASE` 参数包，地区信息主要存在于标识和Prompt中。规则、参数、规则集各自版本化，但缺少统一地区层级、继承语义、完整政策快照和同级冲突模型。直接复制每省完整规则包会造成大量重复，统一放入一套规则则会产生地区条件爆炸。

## 2. 目标

- 建立国家、省、市、区县层级和稳定地区标识。
- 通过国家基线加地区overlay表达政策差异。
- 对规则、参数、测试和政策包进行地区及有效期版本化。
- 创建不可变发布快照，支持历史规划复算。
- 显式处理同级冲突、有效期重叠和上级政策变化影响。

## 3. 非目标

- 不在首期导入全国所有地区。
- 不自动决定法律冲突或政策解释。
- 不让Agent直接创建published快照。
- 不在本阶段实现采集、OCR和RAG。

## 4. 用户故事

- **POL-US-001** 作为政策管理员，我能看到上海方案由哪些国家规则和上海覆盖组成。
- **POL-US-002** 作为规划用户，我能按目标地区和指定日期获得当时有效的政策组合。
- **POL-US-003** 作为审查者，我能从规划记录定位完整政策快照和来源。
- **POL-US-004** 作为管理员，我会在同级政策冲突时收到任务，而不是系统静默选择。

## 5. 功能需求

- **POL-FR-001** 地区实体包含稳定代码、名称、层级、父地区和启用状态。
- **POL-FR-002** 地区树禁止循环、孤儿和非法层级跳跃。
- **POL-FR-003** 政策包区分national baseline与jurisdiction overlay。
- **POL-FR-004** overlay操作限定为add、replace、restrict、exempt。
- **POL-FR-005** overlay必须指向基线业务键或声明新增业务键。
- **POL-FR-006** 规则、参数、测试携带地区、生效期、版本和状态。
- **POL-FR-007** 合并器按地区继承链和指定日期生成有效候选集。
- **POL-FR-008** 同级、同业务键、有效期重叠创建PolicyConflict并阻止发布。
- **POL-FR-009** 发布生成不可变PolicySnapshot，包含规则、参数、规则集和引用清单。
- **POL-FR-010** 规划记录引用snapshotId、resolvedJurisdictionPath和asOfDate。
- **POL-FR-011** 上级基线变化能够列出受影响overlay和快照。
- **POL-FR-012** 现有上海数据可迁入并保持规则执行顺序和黄金结果。

## 6. 数据模型

### 6.1 核心实体

- `Jurisdiction`：code、name、level、parentId、path、enabled。
- `PolicyPack`：packId、jurisdictionId、kind、status、effective interval。
- `RuleVersion`：ruleId、jurisdictionId、businessKey、version、status、effective interval、definition JSONB。
- `ParamVersion`：paramId、jurisdictionId、version、type、value/rows JSONB、effective interval。
- `TestVersion`：testId、jurisdictionId、ruleId、input、expected、source、version。
- `PolicySnapshot`：snapshotId、jurisdictionId、asOfDate、resolved path、实体版本清单、contentHash。
- `PolicyConflict`：业务键、地区、冲突版本、原因、状态和解决记录。

### 6.2 不变量

- published实体不可更新或删除，只能retire并新增版本。
- `effectiveFrom <= effectiveTo`，空结束日期表示持续有效。
- 同一地区、业务键和状态不允许未解决的有效期重叠。
- Snapshot生成后内容哈希和成员不可变。
- Snapshot中每个规则的参数引用必须能解析到唯一有效参数版本。

## 7. 合并算法

1. 解析目标地区从国家到最具体地区的继承链。
2. 按asOfDate加载国家baseline。
3. 逐级应用overlay，记录add、replace、restrict、exempt操作。
4. 对每个业务键验证唯一结果、依赖完整性和执行顺序。
5. 发现同级冲突或无法解释引用时产生Conflict并停止快照生成。
6. 生成有效规则、参数和规则集列表及内容哈希。

合并结果必须携带provenance，说明每个最终实体来自哪一级和哪个版本。

## 8. API与领域接口

- `ResolvePolicyContext(jurisdictionCode, asOfDate)`：返回候选上下文或冲突。
- `CreatePolicySnapshot(jurisdictionCode, asOfDate, actor)`：通过门禁后生成不可变快照。
- `GetSnapshot(snapshotId)`：读取完整成员和provenance。
- `ListPolicyConflicts(filters)`、`ResolvePolicyConflict(decision)`。
- `ListImpactedOverlays(baseEntityVersionId)`：供Agent和管理员影响分析。
- 接口不得接受客户端直接指定published实体版本绕过解析器。

## 9. 数据迁移

- 建立国家、中国省市区基础种子及唯一代码。
- 将现有上海规则集作为上海overlay导入，保持原版本和顺序。
- 对可明确属于国家基线的共性规则分批抽取，不在一次migration中重写全部语义。
- 迁移前后运行上海黄金案例并比较plan、calc和trace。
- 旧 `ruleSetId/policyPackId` 通过兼容映射解析到新snapshot，直到公开API迁移完成。

## 10. 安全、审计与可观测

- 只有管理员和受限application用例能创建draft版本和快照。
- 每次冲突解决记录决策人、理由、引用和前后差异。
- 记录地区解析耗时、候选数、overlay数、冲突数和snapshot hash。
- 不在日志输出完整规则正文或用户输入。

## 11. 交付物

- 地区和政策版本migration。
- 地区树、overlay合并器、冲突服务和快照服务。
- 管理后台地区、冲突和快照视图。
- 上海迁移脚本与对账报告。
- 三地示例数据、测试和阶段验收报告。

## 12. 测试矩阵

| 类型 | 场景 | 通过条件 |
| --- | --- | --- |
| 单元 | 地区树、有效期、overlay操作 | 边界和非法输入被覆盖 |
| 属性 | 任意合法树合并 | 结果唯一、顺序稳定、输入不变 |
| 集成 | Snapshot事务 | 成员、hash和引用原子写入 |
| 回归 | 现有上海黄金案例 | plan/calc/trace保持一致 |
| 冲突 | 同级重叠和缺失依赖 | 阻止快照并创建任务 |
| 历史 | 不同asOfDate | 选择对应历史版本 |

## 13. 验收场景

- **POL-AC-001** Given国家基线和上海overlay，When解析上海，Then返回合并结果及逐实体provenance。
- **POL-AC-002** Given广东和四川overlay，When解析任一地区，Then不会加载另一地区实体。
- **POL-AC-003** Given同级重叠规则，When创建快照，Then失败并生成PolicyConflict。
- **POL-AC-004** Given已发布快照，When尝试修改成员，Then数据库和服务层均拒绝。
- **POL-AC-005** Given历史日期，When复算规划，Then使用当日快照且结果可重放。
- **POL-AC-006** Given现有上海案例，When迁移后执行，Then黄金输出一致。

## 14. 失败与回退

- 地区种子错误：回滚种子migration，不删除现有业务数据。
- 上海迁移结果漂移：保留旧解析适配并停止抽取国家基线。
- overlay合并产生未知冲突：标记阻塞，不使用优先级猜测。
- Snapshot生成中断：事务回滚，不产生半快照。

## 15. Definition of Done

- POL-FR-001～012全部实现并可追踪。
- POL-AC-001～006全部通过。
- 国家、上海、广东、四川地区模型和示例快照可用。
- 上海迁移对账及黄金回归通过。
- OpenAPI、architecture、implementation-plan和progress同步。
- 创建 `feat: 建立全国政策基线与地区覆盖模型` 提交并推送阶段分支。

## 16. 下一阶段输入

- 稳定的Jurisdiction、PolicySnapshot、Conflict和影响查询接口。
- Agent可读取的PolicyContext契约。
- RAG Chunk必须使用的地区和有效期元数据规范。
