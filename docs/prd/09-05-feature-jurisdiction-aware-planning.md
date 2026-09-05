# 用户规划按地区快照触发 PRD

> Author: Jan
> Status: Draft
> Updated: 2026-09-05

## 文档元数据

| 字段 | 值 |
| --- | --- |
| PRD文件 | `09-05-feature-jurisdiction-aware-planning.md` |
| 类型 | Feature |
| 状态 | Draft |
| 前置依赖 | Socila命名与地区DSL Feature Accepted；权威政策Stage至少一个地区通过全部门禁并具有候选快照 |
| 可并行阶段 | API/domain和UI可基于稳定契约并行；地区激活、E2E和发布验收必须串行 |
| 后续消费者 | 新地区上线、地区化对话、历史规划复算和地区支持运营 |
| 退出门禁 | 规划请求强制地区代码，只从活动快照计算，绝不默认上海或跨地区回退 |
| 对应总体需求 | PRD-FR-010～014、PRD-FR-040～043、POL-US-002、POL-FR-007～010、PRD-NFR-002～007 |

## 1. 背景与现状

地区政策模型已能按`jurisdictionCode`和`asOfDate`解析继承链并生成快照，但用户规划入口仍默认`RS-SHANGHAI-PLAN-V1`和`SHANGHAI_BASE`。请求Schema只有可选自由文本`basic.target_city`，没有必填行政区划代码；AI工具虽然收集目标城市，却没有将其用于规则选择，也没有把用户确认的地区作为结构化字段持久化到会话画像。

当前规则编排器直接按客户端可选的`rule_set_id`和`policy_pack_id`查询数据库，没有消费PolicySnapshot。用户即使表达广东或四川，也可能继续运行上海规则。该行为与全国政策模型、地区隔离和规划保存快照ID的需求不一致。

本Feature在权威地区政策准备完成后，建立“地区选择→活动快照→确定性执行→规划留痕”的唯一入口。地区按门禁逐个开放，不要求上海、广东、四川同时上线。

## 2. 目标

- 使`jurisdiction_code`成为规划请求和AI工具调用的必填字段。
- 禁止客户端直接指定规则集、参数包或published实体版本。
- 只允许从地区已激活PolicySnapshot加载规则和参数。
- 缺失、非法、未支持、无快照和政策冲突返回稳定错误。
- 将地区、继承链、快照和日期保存到每次规划。
- 更新聊天和直接规划入口，在计算前取得用户确认的稳定地区代码。
- 将用户确认的地区同步到会话级`UserProfile`，恢复会话时恢复地区上下文。
- 明确地区候选、用户确认、画像持久化、请求一致性和切换地区的状态规则。
- 按快照门禁逐地区激活或停用规划能力。

## 3. 非目标

- 不在本Feature中研究、补充或解释政策内容。
- 不自动激活所有地区或全国全部省市。
- 不允许自由文本城市未经确认直接决定政策结果。
- 不保留缺失地区时默认上海的兼容行为。
- 不允许用户、页面或Agent直接设置活动快照。
- 不把用户画像、对话或规划数据发送到政策OCR、Embedding或Rerank服务。
- 不在本Feature中增加账号级默认地区或`user_preferences`；地区画像按会话持久化。

## 4. 用户故事

- **JRP-US-001** 作为规划用户，我需要先确认规划地区，从而得到该地区在指定日期有效的政策结果。
- **JRP-US-002** 作为广东或四川用户，我需要系统在地区尚未开放时明确告知，而不是返回上海结果。
- **JRP-US-003** 作为复核人员，我需要从规划记录定位地区继承链和不可变快照，从而重放当时结果。
- **JRP-US-004** 作为政策管理员，我需要按地区独立激活通过门禁的快照，从而控制上线风险。
- **JRP-US-005** 作为维护者，我需要客户端无法绕过地区解析直接选择规则版本。
- **JRP-US-006** 作为对话用户，我需要已确认地区随会话画像保存和恢复，从而后续补充信息时不必重复选择且不会切换到错误地区。

## 5. 功能与工程需求

- **JRP-FR-001 必填地区**：`POST /api/plan/compute`和AI`computePlan`工具必须接收`jurisdiction_code`。
- **JRP-FR-002 稳定代码**：地区代码必须存在于启用地区树，首期支持代码由地区规划发布记录决定。
- **JRP-FR-003 禁止版本注入**：公开请求不得包含`rule_set_id`、`policy_pack_id`、`snapshot_id`或实体版本；出现未登记字段时返回400。
- **JRP-FR-004 活动快照**：规划服务按地区读取唯一活动快照，不使用“最新创建快照”隐式替换。
- **JRP-FR-005 地区发布记录**：记录地区、活动快照、状态、门禁结果、激活人和激活时间。
- **JRP-FR-006 激活权限**：只有publishing application用例和新鲜管理员身份可激活、切换或停用地区。
- **JRP-FR-007 激活门禁**：引用、Schema、依赖、冲突、黄金测试和快照重放全部通过后才允许激活。
- **JRP-FR-008 快照执行**：规则引擎从快照成员还原有序规则和参数，不再按公开请求中的规则集/参数包查询。
- **JRP-FR-009 规划留痕**：每次规划保存`jurisdiction_code`、`resolved_jurisdiction_path`、`snapshot_id`和`as_of_date`。
- **JRP-FR-010 直接入口**：直接规划页面在提交前要求选择支持地区，使用地区树稳定代码。
- **JRP-FR-011 对话入口**：聊天在首次计算前确认地区；AI工具调用必须携带已确认代码。
- **JRP-FR-012 文本映射**：城市文本只可产生候选代码；零个或多个候选时必须向用户确认，不得静默选择。
- **JRP-FR-013 独立开放**：上海、广东、四川按地区分别激活，一个地区失败不影响其他已激活地区。
- **JRP-FR-014 历史复算**：历史规划始终按保存的`snapshot_id`重放，不随当前活动快照变化。
- **JRP-FR-015 地区画像**：`UserProfile`增加顶层`jurisdiction`对象，保存稳定代码、服务端解析的名称和层级、确认状态、确认时间及确认来源；不得把自由文本`target_city`当作权威地区。
- **JRP-FR-016 候选与确认**：AI从文本识别出的地区只能作为瞬时候选；只有用户通过地区选择器或明确确认后，服务端校验代码并写入已确认画像。模型不得单独把候选升级为已确认地区。
- **JRP-FR-017 会话持久化**：聊天会话创建、更新和恢复必须在`conversations.user_profile`中保存并返回已确认地区；现有无地区画像的会话恢复后必须重新确认。
- **JRP-FR-018 上下文一致性**：聊天发起计算时，请求顶层`jurisdiction_code`必须与会话画像中的已确认代码一致；缺少已确认画像或二者不一致时拒绝计算，不得覆盖画像或回退上海。
- **JRP-FR-019 地区切换**：同一会话切换地区需要用户再次明确确认；成功切换后保留历史消息，但清除旧地区派生的待处理问题、计算缓存、plan引用和snapshot引用，再使用新地区活动快照计算。

### 5.1 非功能需求

- **JRP-NFR-001 地区隔离**：跨地区规则、参数和快照混入率为0。
- **JRP-NFR-002 确定性**：相同输入、快照和日期产生相同`plan/calc/trace`。
- **JRP-NFR-003 Fail-closed**：地区、快照、门禁或数据库状态不确定时拒绝计算，不回退上海。
- **JRP-NFR-004 隐私**：地区选择不改变用户数据与政策模型服务的既有隔离边界。
- **JRP-NFR-005 可观测**：记录脱敏用户ID、地区、快照、结果、耗时和稳定失败类别。
- **JRP-NFR-006 可回退**：地区活动快照可切回此前已验收快照，但历史规划引用不变。
- **JRP-NFR-007 可测试**：地区树、活动快照、时间和Repository通过端口注入，单元测试不依赖真实数据库。
- **JRP-NFR-008 单一权威上下文**：计算以服务端校验后的请求地区为本次权威值；会话画像是持久化副本，二者必须一致且不能由客户端名称、AI候选或旧缓存覆盖。

## 6. 实现设计

### 6.1 请求流程

```text
用户选择或确认地区
 → 校验jurisdiction_code
 → 将确认结果同步到会话UserProfile
 → 校验请求地区与会话画像一致
 → 查询地区规划发布记录
 → 验证active状态和门禁结果
 → 读取不可变PolicySnapshot
 → 还原有序规则与参数
 → 执行确定性规则引擎
 → 保存plan及快照元数据
 → 返回结果和可复核meta
```

### 6.2 模块边界

- `jurisdiction`负责代码、层级和名称解析。
- `policy`负责快照读取、完整性和冲突状态。
- `publishing`负责地区快照激活、切换和停用。
- `planning`负责消费活动快照、执行规则和保存规划。
- `conversation`负责会话级地区画像的保存、读取和切换清理，不负责选择政策版本。
- Route Handler只负责认证、Schema解析、用例调用和错误映射。
- Conversation/AI只能通过planning application端口计算，不能直接查询Drizzle或规则表。

## 7. 数据模型与不变量

新增会话地区画像：

```ts
interface UserProfileJurisdiction {
  code: string;
  name: string;
  level: "national" | "province" | "city" | "district";
  confirmed: true;
  confirmedAt: string;
  source: "selector" | "conversation-confirmation";
}

interface UserProfile {
  // 现有basic/social/status/subsidy/mi/objective字段保持不变
  jurisdiction?: UserProfileJurisdiction;
}
```

`name`、`level`和`confirmedAt`由服务端根据地区树与服务端时钟写入；客户端和模型提供的同名字段不可信。`basic.target_city`继续保留用户原始表达，但不得参与政策选择或覆盖`jurisdiction`。

新增地区规划发布记录：

```ts
interface JurisdictionPlanningRelease {
  jurisdictionCode: string;
  activeSnapshotId: string | null;
  status: "inactive" | "active";
  gateResults: Record<string, unknown>;
  activatedAt: Date | null;
  activatedBy: string | null;
  updatedAt: Date;
}
```

约束：

- 每个地区最多一条当前发布记录和一个活动快照。
- `active`必须具有非空快照、激活人、时间及全部通过的门禁结果。
- 快照地区必须与发布记录地区相同。
- 激活新快照不修改或删除旧快照。
- `plans.snapshot_id`、地区路径和日期创建后不得随活动快照切换而变化。
- 已确认`UserProfile.jurisdiction.code`必须存在于启用地区树；地区名称和层级必须与服务端地区树一致。
- 同一聊天计算中，请求地区、画像地区、活动快照地区和最终plan地区必须完全相同。
- 地区切换不得删除历史消息，但旧地区派生状态不得进入新地区计算。

## 8. API、事件与类型

### 8.1 用户画像地区契约

聊天会话的`user_profile`可以包含：

```ts
type UserProfileJurisdiction = {
  code: string;
  name: string;
  level: "national" | "province" | "city" | "district";
  confirmed: true;
  confirmedAt: string;
  source: "selector" | "conversation-confirmation";
};
```

AI的`updateProfile`工具可以提交地区候选，但不能直接提交`confirmed=true`。服务端只有在观察到用户选择或明确确认后，才将规范化地区写入会话画像。

### 8.2 规划请求

```ts
type PlanComputeRequest = {
  user: UserProfile;
  jurisdiction_code: string;
  as_of_date?: string;
};
```

请求使用strict Schema；`rule_set_id`、`policy_pack_id`、`snapshot_id`及未知字段均拒绝。

### 8.3 规划响应

```ts
type PlanMeta = {
  jurisdiction_code: string;
  resolved_jurisdiction_path: string;
  snapshot_id: string;
  as_of_date: string;
  rules_executed: number;
};
```

### 8.4 稳定错误

| HTTP | 错误码 | 场景 |
| --- | --- | --- |
| 400 | `JURISDICTION_REQUIRED` | 缺少地区代码 |
| 400 | `INVALID_INPUT` | 未知字段或请求结构错误 |
| 422 | `JURISDICTION_INVALID` | 地区树中不存在或已禁用 |
| 422 | `JURISDICTION_UNSUPPORTED` | 地区存在但尚未激活规划 |
| 409 | `POLICY_SNAPSHOT_UNAVAILABLE` | 活动记录缺少可用快照 |
| 409 | `POLICY_CONFLICT` | 地区存在未解决政策冲突 |
| 409 | `JURISDICTION_CONTEXT_MISMATCH` | 请求地区与会话已确认画像不一致 |
| 503 | `POLICY_STORE_UNAVAILABLE` | 数据库或快照存储不可用 |

错误响应不得泄露候选规则、数据库或内部版本细节。

## 9. 迁移与兼容

- 使用版本化migration新增地区规划发布记录及必要约束，不修改历史快照内容。
- 旧请求缺少`jurisdiction_code`时直接返回`JURISDICTION_REQUIRED`，不提供默认上海窗口。
- 历史`conversations.user_profile`中没有`jurisdiction`时不自动从`basic.target_city`回填；会话继续可读，但首次新计算前必须重新确认地区。
- 已有`basic.target_city`只作为原始文本保留，不转换成已确认地区，也不批量改写历史会话。
- 现有上海用户入口在发布前必须同步增加地区选择，否则不得部署新API。
- 初次激活从权威政策Stage已验收候选快照中选择；禁止通过数据库手工UPDATE绕过publishing用例。
- 回退应用时保留新增发布记录；旧应用继续按原上海入口运行属于明确的版本级回退行为。

## 10. 安全、隐私与可观测

- 地区代码、活动状态、快照ID和客户端meta均视为不可信输入，服务端重新解析。
- 客户端或模型不得自行设置画像中的地区名称、层级、确认时间或`confirmed=true`；这些字段由服务端规范化。
- 激活、切换和停用地区需要新鲜管理员校验并记录actor、前后快照、原因和门禁结果。
- 规划日志不记录完整用户输入，只记录requestId、ownerUserId、地区、快照、耗时和结果类别。
- 规划数据不得进入政策采集、OCR、Embedding或Rerank请求。
- 连续出现无效地区、无快照或跨地区请求时形成可观测指标，但不自动修改地区状态。

## 11. 失败模式、重试与回退

| 失败 | 行为 | 可重试/回退 |
| --- | --- | --- |
| 缺少或非法地区 | 拒绝计算 | 用户重新选择 |
| 地区未激活 | 返回不支持 | 等待该地区门禁完成 |
| 活动快照缺失或哈希异常 | fail-closed并告警 | 管理员切回已验收快照 |
| 未解决Conflict | 阻止计算 | 政策管理员解决后重试 |
| 数据库不可用 | 返回503，不生成plan | 有限重试 |
| AI映射多个地区 | 请求用户确认 | 不自动选择 |
| 请求地区与画像地区不一致 | 返回409，不修改画像且不创建plan | 用户确认保持原地区或执行显式切换 |
| 地区切换清理失败 | 整体回滚，继续保留原地区画像和派生状态 | 修复后重新确认切换 |
| 新快照结果异常 | 停用或切回旧快照 | 历史plan保持原快照 |

## 12. 交付物

- 严格地区感知规划请求和响应契约。
- 地区活动快照表、migration、Repository和publishing用例。
- 快照驱动的planning应用用例及规则执行适配。
- 聊天和直接规划地区选择界面及AI工具契约。
- 会话地区画像Schema、候选确认、持久化、恢复和切换清理用例。
- 地区错误映射、审计、指标和回退入口。
- 单元、契约、数据库集成和Chromium E2E测试。
- 当前架构、测试、运维、traceability、PROGRESS和验收报告。

## 13. 测试矩阵

| 类型 | 场景 | 通过条件 |
| --- | --- | --- |
| Schema | 缺失、非法、未知字段 | 返回规定错误且不计算 |
| Domain | 地区树和文本候选映射 | 唯一映射或明确要求确认 |
| Application | 活动、未激活、无快照、冲突 | fail-closed且错误稳定 |
| Snapshot | 地区匹配和哈希完整性 | 只执行目标活动快照 |
| 隔离 | 上海、广东、四川 | 规则、参数和结果无串区 |
| 历史 | 活动快照切换后重放旧plan | 仍使用原snapshotId |
| 权限 | 激活、切换和停用 | 仅新鲜admin成功并留痕 |
| API | 直接规划和AI工具 | 均要求同一地区代码 |
| 画像 | 候选、确认、保存、恢复、切换 | 只有用户确认可写入，恢复一致且旧派生状态清除 |
| 一致性 | 请求、画像、快照和plan地区 | 四者完全一致；不一致返回409 |
| E2E | 选择支持/未支持地区 | 支持地区成功，未支持明确阻止 |
| 故障 | 数据库和快照不可用 | 503或409，不回退上海 |

## 14. 验收场景

- **JRP-AC-001** Given缺少地区代码，When提交规划，Then返回400 `JURISDICTION_REQUIRED`且不创建plan。
- **JRP-AC-002** Given未知地区，When提交规划，Then返回422 `JURISDICTION_INVALID`。
- **JRP-AC-003** Given存在但未激活地区，When提交规划，Then返回422 `JURISDICTION_UNSUPPORTED`且不使用上海规则。
- **JRP-AC-004** Given已激活上海快照，When计算，Then只执行该快照成员并保存完整meta。
- **JRP-AC-005** Given已激活广东或四川快照，When计算，Then结果不包含其他地方实体。
- **JRP-AC-006** Given请求包含规则集、参数包或快照ID，When解析，Then返回400且不能绕过解析器。
- **JRP-AC-007** Given地区存在未解决Conflict，When计算，Then返回409 `POLICY_CONFLICT`。
- **JRP-AC-008** Given切换活动快照，When重放历史规划，Then使用历史保存快照且结果一致。
- **JRP-AC-009** GivenAI识别到多个地区候选，When准备工具调用，Then先要求用户确认而不调用计算。
- **JRP-AC-010** Given普通用户或过期admin，When尝试激活地区，Then被拒绝且无数据库变化。
- **JRP-AC-011** Given快照存储不可用，When计算，Then返回503且不创建部分plan。
- **JRP-AC-012** Given一个地区门禁失败，When检查其他活动地区，Then其规划能力保持可用。
- **JRP-AC-013** Given用户在聊天中确认上海，When会话持久化并重新打开，Then画像恢复`310000`及服务端规范化名称、层级和确认元数据。
- **JRP-AC-014** Given模型只识别出广东候选但用户尚未确认，When准备计算，Then不得写入已确认画像或调用规划工具。
- **JRP-AC-015** Given请求地区与会话画像地区不同，When调用规划，Then返回409 `JURISDICTION_CONTEXT_MISMATCH`且画像、plan和快照引用均不变化。
- **JRP-AC-016** Given用户明确把会话从上海切换到广东，When切换事务成功，Then历史消息保留、旧地区派生状态被清除，后续计算只使用广东活动快照。

## 15. Definition of Done

- JRP-FR-001～019、JRP-NFR-001～008均有实现和测试映射。
- JRP-AC-001～016取得新鲜证据。
- 所有规划入口强制地区代码，旧请求不默认上海。
- 已确认地区按会话画像持久化；候选不得由模型自动升级，地区切换不会复用旧派生状态。
- 用户不能直接指定规则集、参数包、快照或实体版本。
- 每个成功plan保存地区、继承链、快照和日期。
- 地区逐个通过门禁并由publishing用例激活。
- Node、数据库集成、Auth E2E、TypeScript、ESLint、Build和Secret门禁通过。
- README、架构、测试、运维、traceability、PROGRESS和报告同步。
- 每个Accepted任务使用`英文行为: 中文简短总结`提交并推送，不创建PR或合并main。

## 16. 下一阶段输入

- 可按地区逐步扩展的稳定规划入口。
- 用户规划与不可变政策快照之间的完整审计链。
- 新地区只需完成权威政策门禁和快照激活，不再修改规划协议。
- 可用于后续地区化案例、运营指标和历史复算的稳定元数据。
