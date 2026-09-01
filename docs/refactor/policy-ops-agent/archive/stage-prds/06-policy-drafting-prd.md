# 阶段 06：政策影响与草案生成 PRD

## 文档元数据

| 字段 | 值 |
| --- | --- |
| 阶段 | 06 / Policy Drafting |
| 状态 | Ready after Stages 03, 04 and 05 |
| 前置依赖 | PolicyContext、PolicyOpsGraph、DocumentTree/RAG |
| 后续消费者 | 07 Migration/Release |
| 退出门禁 | 真实历史政策完成Diff、影响、草案、审核和draft闭环 |
| 对应总体需求 | PRD-FR-031～043、PRD-NFR-001～006 |

## 1. 背景与现状

现有管理后台允许人工创建和编辑规则、参数和测试，但没有从政策原文到DSL的结构化影响链。Agent若只根据相似Chunk自由生成规则，容易遗漏条件、适用地区、生效期和例外。因此本阶段必须先执行完整条款树Diff，再用RAG查找既有实现，最后生成带引用且可验证的DraftBundle。

## 2. 目标

- 对新旧政策DocumentTree执行可审计结构Diff。
- 识别受影响规则、参数、测试和历史规划案例。
- 生成JSON DSL、参数和回归测试草案。
- 强制引用、Schema、依赖和回归模拟门禁。
- 完成管理员审核、编辑、驳回和幂等draft物化。

## 3. 非目标

- 不自动创建staging或production。
- 不允许模型自行裁决政策冲突。
- 不以向量相似度替代条款Diff和确定性校验。
- 不修改现有规则引擎语义以迎合生成结果。

## 4. 用户故事

- **DRF-US-001** 作为管理员，我能看到政策每条变化及其原文位置。
- **DRF-US-002** 作为规则维护者，我能查看为什么某规则、参数或测试被判定为受影响。
- **DRF-US-003** 作为审核者，我能在批准前编辑草案并看到编辑差异。
- **DRF-US-004** 作为审计者，我能从Core draft追溯到Agent Run、政策版本和引用。

## 5. 功能需求

- **DRF-FR-001** Diff识别条款新增、删除、修改、移动、拆分和合并。
- **DRF-FR-002** Diff保留新旧条款ID、文本、路径、页面和相似度证据。
- **DRF-FR-003** 影响检索同时使用业务键、参数引用、规则输入输出、全文和RAG。
- **DRF-FR-004** 每个ImpactItem包含实体、影响类型、置信度、解释和引用。
- **DRF-FR-005** DraftBundle包含基准快照、地区、有效期、规则、参数、测试、差异和provenance。
- **DRF-FR-006** 规则草案符合现有JSON DSL Schema和支持的Action类型。
- **DRF-FR-007** 参数草案保留类型、单位、来源、表头和有效期。
- **DRF-FR-008** 测试草案覆盖正常、边界、缺失输入、冲突和历史回归。
- **DRF-FR-009** 无原文引用或地区/有效期不确定的字段不能通过verify。
- **DRF-FR-010** verify执行AJV、参数引用、规则顺序、示例和回归模拟。
- **DRF-FR-011** 自动修正循环有固定上限，超过后进入人工审核。
- **DRF-FR-012** 管理员支持approve、edit-and-approve、reject。
- **DRF-FR-013** 物化接口使用幂等键且只能创建draft。
- **DRF-FR-014** Core对DraftBundle执行独立二次校验，不信任Agent结果。

## 6. Diff与影响分析

### 6.1 条款树Diff

- 优先使用稳定条号、文号和结构路径匹配。
- 无稳定ID时使用规范化文本、标题和邻接关系匹配。
- 移动条款与删除+新增区分，避免误判大范围变化。
- 表格按表头、主键列、行和单元格比较，保留单位变化。

### 6.2 影响检索

- 确定性依赖：规则输入输出、parameterRefs、rule set顺序、测试ruleId。
- 结构化检索：业务主题、地区、有效期、实体类型。
- RAG：寻找语义相关规则、证据和案例，不能单独决定影响。
- 最终候选合并去重，并记录每种检索通道的证据。

## 7. DraftBundle接口

最小结构：

- `proposalId`、`runId`、`idempotencyKey`。
- `baseSnapshotId`、`jurisdictionId`、`effectiveFrom/effectiveTo`。
- `ruleDrafts[]`、`paramDrafts[]`、`testDrafts[]`。
- `impactItems[]`、`citations[]`、`uncertainties[]`。
- `schemaResults`、`dependencyResults`、`regressionResults`。
- `modelProvenance`、`promptVersion`、`workflowVersion`。

所有实体使用临时ID，Core负责分配数据库ID和正式版本号。

## 8. LangGraph节点

- `diff_policy`：生成确定性条款Diff Artifact。
- `retrieve_impact`：读取Core PolicyContext和RAG候选。
- `draft_bundle`：按严格Schema生成草案。
- `verify_bundle`：执行引用和确定性校验。
- `revise_bundle`：仅根据校验错误修正，限制次数。
- `human_review`：interrupt并暴露原文、Diff、草案和校验。
- `materialize_draft`：批准后调用Core，必须幂等。

## 9. 管理员审核体验

- 并排展示原政策、新政策和结构Diff。
- 按规则、参数、测试分区展示草案和受影响实体。
- 点击任意字段可定位原文页面和条款。
- 编辑后显示管理员补丁，不覆盖Agent原始提案。
- 驳回必须填写原因；批准显示即将创建的draft数量和地区。
- 审核提交后禁用重复按钮，通过状态查询展示结果。

## 10. 安全与权限

- 管理员身份由Next Core验证，FastAPI只接收签名审计上下文。
- 前端不能直接提交published、version或数据库ID。
- Core重新计算地区、版本号和允许状态。
- Prompt中政策文本使用明确数据边界，禁止执行正文内指令。
- 审核和物化日志不保存完整个人案例输入。

## 11. 可观测与失败模式

- 记录Diff数量、影响候选、草案实体、校验错误、修正次数和人工编辑率。
- 模型输出Schema失败有限重试；确定性校验失败不会自动放宽规则。
- Core返回409时按幂等键读取已创建draft；422进入重新审核。
- 基准快照已变化时提案标记stale，必须重新运行影响分析。
- 引用文档被retire或校正时，未物化提案失效。

## 12. 交付物

- DocumentTree Diff服务和测试。
- 影响检索服务、解释和指标。
- DraftBundle Schema、生成、校验和修正节点。
- 管理员审核页面与API。
- Core draft物化接口、幂等和审计。
- 历史政策黄金集、质量报告和阶段验收报告。

## 13. 测试矩阵

| 类型 | 场景 | 通过条件 |
| --- | --- | --- |
| Diff | 增删改移拆合、表格变化 | 与人工标注一致 |
| 影响 | 规则/参数/测试/案例 | 召回率不低于90% |
| Schema | 正常和畸形DraftBundle | 畸形全部拒绝 |
| 引用 | 缺失、失效、错地区 | verify失败 |
| 回归 | 新旧规则模拟 | 报告稳定可复现 |
| 审核 | 批准、编辑、驳回、重复 | 状态与审计正确 |
| 权限 | 绕过FastAPI/前端篡改 | Core拒绝 |

## 14. 验收场景

- **DRF-AC-001** Given历史政策新旧版本，When执行Diff，Then关键变化与人工标注一致。
- **DRF-AC-002** Given受影响规则集，When执行影响检索，Then召回率达到90%且每项有解释。
- **DRF-AC-003** Given缺少引用的草案，When verify，Then不得进入human_review的可批准状态。
- **DRF-AC-004** Given管理员编辑后批准，When恢复Run，ThenCore保存管理员版本并保留Agent原稿。
- **DRF-AC-005** Given重复物化请求，When使用相同幂等键，Then只创建一组draft。
- **DRF-AC-006** Given变化后的基准快照，When批准旧提案，Then系统拒绝并要求重新分析。
- **DRF-AC-007** Given任意Agent提案，When尝试提交production状态，ThenCore拒绝并记录安全事件。

## 15. 回退与停止条件

- 影响召回低于阈值：只输出影响报告，不开放草案物化。
- 引用覆盖不足：暂停提案并修复解析/RAG，不允许Prompt补猜。
- Core契约不稳定：冻结DraftBundle版本，不继续扩展草案字段。
- 历史回放出现未解释规划变化：停止阶段07并升级政策审查。

## 16. Definition of Done

- DRF-FR-001～014全部实现并有证据。
- DRF-AC-001～007全部通过。
- 至少一份真实政策完成采集、Diff、影响、草案、审核和draft闭环。
- Agent没有staging/production路径，Core二次校验通过安全测试。
- architecture、OpenAPI、implementation-plan和progress同步。
- 创建 `feat: 实现政策影响分析与草案审核闭环` 提交并推送阶段分支。

## 17. 下一阶段输入

- 已验证的端到端政策运营闭环。
- 可迁移的Core、Agent、Checkpoint和对象数据。
- 生产部署、备份、容量和切换所需服务清单。
