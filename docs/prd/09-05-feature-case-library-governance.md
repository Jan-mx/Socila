# 地区化政策案例库全量重建 PRD

> Author: Jan
> Status: Reopened
> Updated: 2026-09-09

## 文档元数据

| 字段 | 值 |
| --- | --- |
| PRD文件 | `09-05-feature-case-library-governance.md` |
| 类型 | Feature；替代原“上海案例库精简为452/36/528”方案 |
| 状态 | Reopened（2026-09-09复审）；原Accepted结论因CLI、apply和数据契约缺口撤回 |
| 前置依赖 | 任务2首期Accepted；任务3经`WI-20260907-02`修复并重新Accepted |
| 执行顺序 | 任务3修复 → 本Feature代码与隔离验收 → 持久库替换Work Item |
| 退出门禁 | 完整旧库可恢复归档、新地区案例确定性生成、沪粤36条展示、精确替换和完整E2E均通过 |

## 1. 背景与替代决定

旧案例库来自上海转录语料：历史完整基线为851条`cases`、117条`showcase_cases`和528条`tests`（其中500条旧回归、28条当时DSL示例）。旧任务4已在持久库删除399/81，当前剩余452/36/528，但独立复审发现：

- 归档清单计算文件名而非文件内容SHA，全部记录SHA与真实文件不符。
- `selection-report.json`缺失，`restore-report.json`仍为pending。
- manifest没有绑定精确行内容、快照、评分和测试来源。
- 81条已删展示案例的归档内容哈希全部为`pending`。
- 快照无可比较输出时仍可误判match并获得满分。
- 当前452/36的`quality_score`全部为空，多标签未接入实际构建路径。

因此旧CLG-FR/CLG-NFR/CLG-AC及452/36/528结论只保留为历史，不再是当前验收标准。本PRD采用新的RCL编号，全量退役旧案例及其500条来源回归测试，并依据修复后的上海、广东日期快照生成无个人数据的确定性政策案例。

2026-09-08报告所称修复仍需2026-09-09复审：受控CLI仍是空壳，apply写入场景/断言/输入/期望为空，专用E2E未验证36/18/18。任务4在这些专用反例和真实DB/E2E证据完成前保持Reopened。

治理前完整dump及独立SHA目前存在，是旧851/117/528的恢复来源；不得把现有错误case-library归档视为已验证。

## 2. 目标与非目标

### 2.1 目标

- 从治理前dump生成完整、真实可恢复的旧库离线归档。
- 删除当前剩余452条旧cases、36条旧showcase和关联500条旧回归tests。
- 保留并同步当前地区DSL的42条示例：CN19、上海9、广东10、四川4。
- 使用版本化确定性模板生成上海、广东政策案例；期望结果只由修复后的快照规划器计算。
- 公开展示固定36条：上海18、广东18。
- 每个新case生成一条`source=regression`测试；最终为`N/36/N+42`。
- 新案例无真实转录、creator、videoId、手机号、身份证号或其他个人身份数据。

### 2.2 非目标

- 不使用LLM生成结构化输入、期望结果或政策含义。
- 不把合成案例描述为真实用户案例或权威政策来源。
- 不新增、修改或批准政策实体。
- 不生成四川用户案例；四川只测试unsupported。
- 不恢复旧语料继续提供公开服务。
- 不在代码开发阶段写本机持久库。

## 3. 功能需求

- **RCL-FR-001 旧库事实源**：旧完整库以治理前dump为准，包含851 cases、117 showcase、500旧回归tests及28历史DSL示例。
- **RCL-FR-002 完整旧档案**：对旧三类目标逐行记录table、ID、UID、规范化内容SHA、来源和删除原因。
- **RCL-FR-003 真文件SHA**：归档清单对真实文件字节计算SHA-256；`sha256sums.txt`最后生成且不包含自身。
- **RCL-FR-004 恢复证明**：记录来源dump SHA、PostgreSQL/pgvector版本、恢复目标、全部表/sequence计数和规范化哈希。
- **RCL-FR-005 不可变报告**：必须存在选择报告、manifest和最终`restore-report.json`；pending、缺文件或hash不符禁止apply。
- **RCL-FR-006 精确manifest**：绑定旧目标行、新数据行、快照ID/hash、scenarioKey、asOfDate、完整输入/期望/断言、覆盖义务、证据、评分和测试来源映射。
- **RCL-FR-007 场景Schema**：每个案例包含稳定UID、地区、日期、能力、输入、断言、覆盖义务、证据引用、snapshot ID/hash和generator版本。
- **RCL-FR-008 确定性生成**：同一模板、snapshot和generator版本产生逐字节一致产物与manifestHash。
- **RCL-FR-009 覆盖义务**：覆盖每个用户可见规则分支、needs-agent分支、有效期边界和地区隔离路径。
- **RCL-FR-010 广东必选场景**：覆盖2026医保缺参、2030男女年限、广州/深圳失业金额、缺失/非法领取地市、缴费基数和最低工资边界。
- **RCL-FR-011 上海必选场景**：覆盖退休、养老缴费、医保、失业、灵活就业与补贴的正常、边界和需确认路径。
- **RCL-FR-012 地区范围**：用户案例仅310000与440000；CN只在内部DSL/基线测试，510000只在unsupported测试。
- **RCL-FR-013 一对一回归**：每个新case恰有一条地区回归test并引用source_case_uid。
- **RCL-FR-014 展示策展**：36条严格上海18、广东18；每地区男女9/9、三个年龄段各6、employed/flexible/unemployed各6。
- **RCL-FR-015 质量落库**：case和showcase保存总分、逐项分解、原因、snapshot和证据；active/selected行不得为空。
- **RCL-FR-016 可比较重放**：至少一个声明断言被实际计算并比对才能获得重放分；缺少可比字段为失败。
- **RCL-FR-017 多标签**：地区、性别、年龄、就业、险种、政策能力和needs-agent标签同时保留，不提前返回单分类。
- **RCL-FR-018 原子替换**：单事务删除当前旧452/36/500、同步42条DSL示例并插入新`N/36/N`；所有manifest场景字段必须原样落库，禁止null或空对象占位。
- **RCL-FR-019 并发裁决**：批次`FOR UPDATE`、`restore_verified→applying→applied`条件更新和目标唯一约束保证一次成功。
- **RCL-FR-020 查询契约**：公开仅返回36条selected+published；管理查询使用`active AND filters`。
- **RCL-FR-021 受控执行器**：audit、prepare-archive、verify-archive、generate、plan-replacement、apply和verify必须调用真实实现并输出可验证结果；只打印模式名后退出视为失败，默认只读audit。
- **RCL-FR-022 迁移兼容**：0016历史SQL不改；0018使用idx17/`1788796860000`，移除地区默认、补生成元数据、质量分解、批次状态和唯一约束。

## 4. 场景与数据契约

```ts
type RegionalPolicyScenario = {
  scenarioKey: string;
  caseUid: string;
  jurisdictionCode: "310000" | "440000";
  asOfDate: string;
  capability: string;
  input: Record<string, unknown>;
  assertions: Array<{ path: string; operator: "eq" | "contains" | "is_null"; value?: unknown }>;
  coverageObligations: string[];
  evidence: Array<{ documentId: string; locator: string }>;
  snapshotId: string;
  snapshotContentHash: string;
  generatorVersion: string;
  showcaseEligible: boolean;
};
```

- UID格式固定为`RPC-<地区>-<场景键>-V1`；测试ID为`RPCT-<地区>-<场景键>-V1`。
- 结构化模板是输入事实源；生成产物进入Git并接受diff审查。
- 完整`calc/plan/warnings/questions/meta`可作为生成结果保存，但必须同时存在显式断言，避免用同一引擎自证。
- `N`等于覆盖manifest中唯一case UID数量。任何代码不得硬编码旧452或500。

## 5. 归档封装顺序

1. 在全新PG17+pgvector恢复治理前完整dump。
2. 核对851/117/528和500旧回归来源。
3. 生成完整库dump、cases/showcase/tests独立dump和选择报告。
4. 生成绑定精确行与内容hash的manifest。
5. 对已存在文件计算真实SHA并写manifest。
6. 在第二个全新实例从本归档恢复并完成表、sequence和扩展对账。
7. 写最终restore report。
8. 最后生成不自包含的`sha256sums.txt`并再次逐文件验证。
9. 只有全部结果一致，数据库批次才可标记`restore_verified`。

## 6. 迁移与持久替换

- 0018源journal固定为idx17/`1788796860000`，晚于0017且对应2026-09-08实际开发窗口。
- 0018删除`cases/showcase_cases.jurisdiction_code`默认值，新增scenario/generator/asOf/snapshotHash/input/expected/coverage/evidence/qualityBreakdown字段。
- 0018为归档目标增加唯一约束，批次CHECK增加`applying`。
- 代码与隔离验收完成后，持久替换仍由`WI-20260907-04`单独执行。
- 替换前当前452/36/500必须逐行匹配完整旧档案子集；不一致立即停止，不默认恢复旧dump。
- 旧归档、治理前dump和治理后dump均保留在Git忽略目录，不进入镜像或仓库。

## 7. 非功能需求

- **RCL-NFR-001 可恢复**：删除前必须有从本归档真实恢复的证据。
- **RCL-NFR-002 确定性**：场景、期望、策展、manifest和最终计数重复生成一致。
- **RCL-NFR-003 精确授权**：授权只覆盖fresh manifest列出的删除和插入集合。
- **RCL-NFR-004 隐私**：新案例无真实身份数据；旧正文不进入日志、Git、API或报告。
- **RCL-NFR-005 原子性**：替换失败时旧库、新库、归档索引和批次状态全部回滚。
- **RCL-NFR-006 幂等与并发**：相同manifest复跑no-op，并发只有一组成功。
- **RCL-NFR-007 Fail-closed**：SHA、快照、来源、断言、配额或计数不确定时拒绝生成或apply。
- **RCL-NFR-008 可审计**：记录算法、generator、快照、操作者、目标指纹、计数和恢复结果。

## 8. 验收场景

- **RCL-AC-001** 修改任一归档文件后SHA验证失败。
- **RCL-AC-002** 缺少selection/restore报告或report为pending时apply零写入拒绝。
- **RCL-AC-003** 任一旧目标ID、内容hash、测试来源或snapshot漂移时旧manifest失效。
- **RCL-AC-004** 完整旧851/117/500从归档真实恢复并逐表、sequence一致。
- **RCL-AC-005** 相同场景模板重复生成相同N、产物和manifestHash。
- **RCL-AC-006** 无可比较断言、错误snapshot或hash不一致的场景不能入库。
- **RCL-AC-007** 新cases仅沪粤且一对一关联地区回归tests。
- **RCL-AC-008** showcase严格36、沪粤18/18并满足各自9/9、6/6/6、6/6/6配额；数据库和Chromium E2E均精确断言。
- **RCL-AC-009** case/showcase质量分和分解全部非空，多标签完整。
- **RCL-AC-010** 两个并发apply只有一个写入，另一个返回确定性no-op/已应用结果。
- **RCL-AC-011** 替换成功后计数为`N/36/N+42`且42条DSL示例完整；新case/showcase/test场景字段与manifest逐字节一致且非空。
- **RCL-AC-012** 公开API只返回36条；管理q/topic不能返回非active记录。
- **RCL-AC-013** 四川规划负例稳定unsupported且不生成case。
- **RCL-AC-014** 0018从零执行两次幂等，不改0016 SQL哈希。
- **RCL-AC-015** 专用Chromium E2E覆盖公开36条、沪粤18/18、治理字段、管理过滤、归档元数据与匿名/普通用户/管理员权限。

## 9. Definition of Done

- RCL-FR-001～022、RCL-NFR-001～008和RCL-AC-001～015均有实现、专用测试和traceability。
- 旧完整库归档可恢复；现有错误归档不再被标记为通过证据。
- 新案例确定性生成，最终`N/36/N+42`与manifest逐项一致。
- 上海、广东公开各18条；CN和四川严格留在内部测试边界。
- 代码阶段不写持久库；真实替换只有在fresh audit后取得用户明确授权才执行。
- Node、DB、Chromium、TypeScript、ESLint、Build、Python和安全门禁新鲜通过且零skip。
- README、PROGRESS、ARCHITECTURE、TESTING、OPERATIONS、traceability和复审报告同步。

## 10. 关联任务

- `WI-20260907-02-task3-temporal-entry-hardening.md`：阻塞本Feature的前置任务。
- `WI-20260907-03-regional-policy-case-rebuild.md`：本Feature代码交付。
- `WI-20260907-04-persistent-case-library-replacement.md`：代码Accepted后的持久执行。
