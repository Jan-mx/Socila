# 案例库精简、质量治理与原始数据归档 PRD

> Author: Jan
> Status: Draft
> Updated: 2026-09-05

## 文档元数据

| 字段 | 值 |
| --- | --- |
| PRD文件 | `09-05-feature-case-library-governance.md` |
| 类型 | Feature |
| 状态 | Draft |
| 前置依赖 | Socila命名与地区DSL Feature Accepted；国家baseline及粤川权威overlay Stage Accepted并提供可重放候选快照 |
| 可并行阶段 | 只读审计和评分代码可提前准备；快照校验、归档、删除和最终验收必须在任务2后串行执行 |
| 后续消费者 | 用户规划按地区快照触发Feature、地区化案例扩展、回归质量运营 |
| 退出门禁 | 原始库可恢复归档完成，活动案例精简为452/36/528，回归来源链和地区快照引用完整 |
| 对应总体需求 | PRD-FR-014、PRD-FR-032、PRD-FR-042、PRD-NFR-002～007、NRP-FR-014～016 |

## 1. 背景与现状

当前案例资产由三张逻辑关联但没有完整数据库约束的表组成：`cases`保存原始案例和转录，`showcase_cases`保存公开展示内容，`tests`保存规则示例和回归测试。展示案例通过去除`case_uid`末尾两位序号与原始案例建立逻辑关联，回归测试的`source_case_uid`只存在于导入工作簿，未持久化到`tests`。

2026-09-05只读核对基线：`cases=851`，其中451条标记为回归、无重复UID、1条缺失转录；`showcase_cases=117`且全部发布、输入与预期完整，117条均可归一化关联原始案例但只涉及116个不同原始案例；`tests=528`，其中28条规则示例、500条回归测试。451条回归案例与全部当前展示来源案例的并集为452条，其余399条没有现行回归或展示保留理由。

当前展示分类函数按性别和出生年份提前返回，导致就业状态、失业、灵活就业和补贴无法成为主分类。117条展示内容也没有质量分、政策快照、明确来源案例和可复现策展规则，不能作为地区感知规划的可靠验收资产。

本Feature在任务2提供权威地区候选快照后，建立来源链、地区、质量、归档和确定性策展机制；完成可恢复备份后物理删除399条原始案例和81条展示案例，保留全部528条测试。

## 2. 目标

- 固定案例审计基线和可复现的保留/删除集合。
- 为原始、展示和回归测试建立稳定来源链、地区、内容哈希和质量元数据。
- 使用任务2候选快照验证展示案例中的数字和预期结果。
- 将117条展示案例确定性精简为36条，覆盖性别、年龄、就业状态和补贴场景。
- 将851条原始案例精简为452条，保留全部回归案例及所有现有展示来源案例。
- 在任何删除前生成完整数据库和案例表独立归档，并完成PG17+pgvector真实恢复。
- 通过manifest哈希和事务保证只删除399+81条已审核目标。
- 保持528条测试全部存在并可运行。

## 3. 非目标

- 不新增、解释或发布国家、广东、四川政策。
- 不实现用户规划地区选择或地区活动快照激活。
- 不把当前上海案例从正文猜测为其他地区。
- 不降低规则黄金测试、展示质量、引用或隐私门禁以凑足36条。
- 不提供原始归档的浏览器下载接口。
- 不删除规则、参数、测试、计划、对话、用户、政策快照或历史备份。
- 不建立账号级案例收藏、推荐、点赞或个性化排序。

## 4. 用户故事

- **CLG-US-001** 作为政策维护者，我需要每条回归测试定位原始案例，从而理解失败的真实来源。
- **CLG-US-002** 作为规划用户，我需要看到少量、高质量且覆盖主要场景的案例，而不是117条重复展示。
- **CLG-US-003** 作为审核者，我需要展示数字绑定地区和政策快照，从而复现当时结论。
- **CLG-US-004** 作为数据负责人，我需要删除前获得可恢复原始归档和精确manifest，从而避免不可逆误删。
- **CLG-US-005** 作为管理员，我需要查看案例质量、地区、来源和淘汰原因，但不能通过Web读取归档正文。
- **CLG-US-006** 作为后续地区规划开发者，我需要稳定的36条展示案例和地区黄金资产用于接口及E2E验收。

## 5. 功能与工程需求

- **CLG-FR-001 基线审计**：执行前核对851/451/117/116/528/28/500、重复UID、缺失转录、来源文件和逻辑引用；任一关键数量变化时停止并重新取得用户决策。
- **CLG-FR-002 案例治理字段**：`cases`增加地区、内容哈希、质量分、质量状态、原因和治理时间；现有案例经权威来源确认统一标记`310000`。
- **CLG-FR-003 展示治理字段**：`showcase_cases`增加地区、明确来源案例UID、候选快照ID、质量分、质量状态、内容哈希、策展时间和策展人。
- **CLG-FR-004 回归来源链**：`tests`增加`source_case_uid`；500条回归测试从工作簿回填且全部解析到保留案例，28条规则示例允许为空。
- **CLG-FR-005 规范化哈希**：对三张表按稳定字段顺序生成SHA-256；时间戳和数据库自增ID不进入业务内容哈希。
- **CLG-FR-006 质量评分**：展示候选按输入完整40、预期完整30、来源证据20、候选快照重放10计算，总分100且输出逐项原因。
- **CLG-FR-007 资格门禁**：总分≥70、来源可解析、转录≥100字符、出生年/性别/明确就业状态、退休年龄或日期、快照重放无未解释差异、无占位符或身份泄漏才可入选。
- **CLG-FR-008 确定性策展**：按`gender × birth_year_band × employment_status`分层，在层内按`qualityScore DESC, caseUid ASC`排序并轮询选择36条。
- **CLG-FR-009 配额门禁**：36条中女性18、男性18；三个年龄段各≥6；灵活就业≥12、失业≥12；合格在职优先保留且最多3；4050≥6、大龄补贴≥4、岗位补贴≥3。无法满足时停止，不降低门槛。
- **CLG-FR-010 多标签分类**：展示分类改为多标签，不再因性别/年龄提前返回而丢失就业、险种和补贴标签。
- **CLG-FR-011 归档包**：在`backup/case-library/<UTC时间戳>/`生成完整库dump、案例三表独立dump、manifest、SHA清单、选择报告和恢复报告。
- **CLG-FR-012 真实恢复**：归档必须在全新PG17+pgvector实例恢复，逐表核对计数和规范化哈希后才能标记`restore_verified`。
- **CLG-FR-013 审计元数据**：数据库只保存归档批次、删除实体UID/原ID、内容哈希和原因，不复制原始转录正文。
- **CLG-FR-014 受控执行器**：治理脚本支持`--audit`、`--prepare-archive`、`--verify-archive`、`--apply <manifestHash>`和`--verify`；默认只执行audit。
- **CLG-FR-015 精确删除**：单事务回填治理/来源链/归档索引并删除manifest中的399条`cases`和81条`showcase_cases`；提交前重新核对ID、哈希和引用。
- **CLG-FR-016 查询与页面**：公开入口只返回36条selected+published案例；管理案例默认只显示452条active记录，可查看质量和来源；归档页面只返回批次与哈希元数据。

### 5.1 非功能需求

- **CLG-NFR-001 可恢复**：物理删除必须以真实恢复通过的归档为前置，恢复失败禁止apply。
- **CLG-NFR-002 确定性**：相同数据库快照、政策快照和算法版本生成相同评分、保留集合、36条选择及manifestHash。
- **CLG-NFR-003 零测试损失**：528条测试不得删除，回归测试数量和来源链必须在治理前后保持完整。
- **CLG-NFR-004 隐私**：原始转录、creator、videoId和正文不得进入日志、报告、Git或公开接口。
- **CLG-NFR-005 最小删除**：只有经用户授权且写入已验证manifest的399+81条可以删除；范围变化必须停止。
- **CLG-NFR-006 原子性**：归档索引、治理字段和删除在同一事务完成，失败后无半治理状态。
- **CLG-NFR-007 可审计**：记录算法版本、快照、操作者、计数、表哈希、manifestHash、恢复结果和删除结果。
- **CLG-NFR-008 不降门禁**：不能通过放宽质量分、配额、快照重放、引用、安全或测试阈值完成任务。

## 6. 实现设计

### 6.1 阶段流程

```text
只读审计
 → 来源链回放与地区确认
 → 质量评分和36条确定性选择
 → 生成删除manifest
 → 完整库/案例表归档
 → 全新PG17真实恢复
 → manifest哈希确认
 → 单事务治理与精确删除
 → 452/36/528和API/E2E验收
```

### 6.2 452条保留集合

```text
KEEP = cases WHERE is_regression=true
       UNION
       cases referenced by all current showcase_cases after explicit UID normalization
```

预期`KEEP=452`、`DELETE=399`。保留集合基于治理前117条展示来源计算，不能先删展示再重新缩小原始保留集。

### 6.3 36条策展算法

年龄段固定为`before_1970`、`1970_1979`、`from_1980`；就业状态只接受`employed/flexible/unemployed`。每层按分数和UID排序，按固定字典序循环取1条，直至36条；配额不足时用最高分未选案例替换最低分已选案例，同时保持已满足配额。交换过程、原因和最终顺序写入`selection-report.json`。仍不满足全部约束时拒绝生成可执行manifest。

## 7. 数据模型与不变量

```ts
type CaseQualityStatus = "eligible" | "active" | "archive_candidate" | "quarantined";
type ShowcaseQualityStatus = "selected" | "archive_candidate" | "quarantined";

interface CaseArchiveBatch {
  id: string;
  status: "prepared" | "restore_verified" | "applied" | "rolled_back";
  sourceCounts: Record<string, number>;
  retainedCounts: Record<string, number>;
  deletedCounts: Record<string, number>;
  tableHashes: Record<string, string>;
  manifestHash: string;
  storagePath: string;
  createdAt: Date;
  createdBy: string;
}

interface CaseArchiveEntry {
  archiveBatchId: string;
  entityType: "case" | "showcase_case";
  entityId: number;
  caseUid: string | null;
  contentHash: string;
  archiveReason: string;
}
```

不变量：

- 500条回归测试必须有来源UID且解析到保留案例。
- 36条展示案例必须有来源案例、地区和候选快照。
- 归档批次未达到`restore_verified`不能apply。
- manifest中的ID集合、内容哈希和当前数据库不一致时不能删除。
- 归档元数据不保存正文；原始内容只存在受控归档文件。
- 治理后`cases=452`、`showcase_cases=36`、`tests=528`。

## 8. API、命令与页面

治理命令：

```text
node scripts/govern-case-library.mjs --audit
node scripts/govern-case-library.mjs --prepare-archive
node scripts/govern-case-library.mjs --verify-archive <manifestHash>
node scripts/govern-case-library.mjs --apply <manifestHash>
node scripts/govern-case-library.mjs --verify <manifestHash>
```

- `/api/showcase-cases`只返回`quality_status=selected AND is_published=true`。
- `/cases`只展示同一36条记录。
- 管理案例查询默认限定`quality_status=active`，显式过滤才能查看quarantined元数据。
- 归档管理接口只返回批次、计数、哈希、时间和原因，不返回dump路径之外的正文或下载URL。
- 所有治理写操作只允许管理员和本地受控脚本执行，不提供普通用户入口。

## 9. 迁移、归档与兼容

1. 使用版本化migration新增治理字段、来源链和归档元数据表，不在migration中动态删除案例。
2. 历史`tests.source_case_uid`通过上海回归工作簿回填；无法唯一映射时停止。
3. 现有案例和展示案例地区回填`310000`，但必须先核对来源文件，不扫描正文猜地区。
4. 写操作由manifest驱动脚本完成，先归档和恢复，后单事务apply。
5. 回退优先事务回滚；提交后需要回退时从完整dump恢复，不通过Seed重建原始案例。
6. 旧应用在回退期间可能看不到新治理字段，但不得重新导入851/117覆盖已治理数据库。

## 10. 安全、隐私与可观测

- `backup/case-library/`保持Git忽略，归档不得进入镜像或提交。
- 日志和报告只记录计数、UID摘要、哈希和稳定失败类别。
- 公开展示只使用去标识化用户描述和规则结果，不暴露creator、videoId或转录正文。
- 管理员页面不提供原始归档下载；恢复仅走OPERATIONS受控流程。
- 记录audit、archive、restore、apply、verify各阶段耗时、结果和操作者。
- 删除399+81的用户授权只覆盖本PRD固定基线；数量或哈希改变时授权失效。

## 11. 失败模式、重试与回退

| 失败 | 行为 | 回退 |
| --- | --- | --- |
| 基线数量或UID变化 | 停止，不生成manifest | 重新审计并请求用户决策 |
| 回归来源无法唯一映射 | 停止 | 修复工作簿或映射规则 |
| 合格案例不足36或配额不满足 | 停止 | 补充/修正案例，不降低门槛 |
| 快照重放有未解释差异 | quarantined | 政策或案例修正后重评 |
| dump、SHA或恢复失败 | 禁止apply | 修复归档链路后重新生成批次 |
| manifest与当前行哈希不一致 | 事务中止 | 重新audit和prepare |
| 删除事务失败 | 整体回滚 | 使用同一verified manifest重试 |
| 提交后验收失败 | 停写案例管理 | 从完整dump恢复并记录rolled_back |

## 12. 交付物

- 案例治理Schema和版本化migration。
- 质量评分、UID归一化、确定性36条选择和多标签分类模块。
- 回归测试与展示案例来源链回填。
- `govern-case-library.mjs`五种受控模式。
- 完整数据库及案例表归档、manifest、SHA、选择和恢复报告。
- 管理员质量/来源/归档元数据页面与公开案例过滤。
- 单元、数据库集成、恢复、API和Chromium E2E测试。
- 当前架构、测试、运维、traceability、PROGRESS和验收报告。

## 13. 测试矩阵

| 类型 | 场景 | 通过条件 |
| --- | --- | --- |
| 审计 | 851/451/117/116/528基线 | 数量、UID和引用与manifest一致 |
| 来源链 | 500回归、117展示 | 全部解析且地区正确 |
| 评分 | 完整、缺失、占位、隐私、快照漂移 | 分数和原因稳定，低质拒绝 |
| 策展 | 分层、轮询、配额、交换 | 相同输入固定选择36条 |
| Archive | 完整库及三表dump、SHA | 文件齐全且哈希一致 |
| Restore | 全新PG17+pgvector | 计数和表哈希与源库相同 |
| Apply | 正确/错误manifestHash、并发变化 | 只正确manifest成功，其他回滚 |
| 数据完整 | 删除399+81 | 452/36/528且来源链无断裂 |
| API/UI | 公开案例、管理过滤、归档元数据 | 公开仅36条，正文不可下载 |
| 回归 | 528测试、上海黄金和地区黄金 | 数量不减、结果无未解释漂移 |
| 安全 | Secret、日志、Git候选和归档路径 | 无用户正文或凭据泄漏 |

## 14. 验收场景

- **CLG-AC-001** Given治理前数据库，When执行audit，Then基线精确为851/451/117/116/528且无重复UID。
- **CLG-AC-002** Given500条回归测试，When回填来源，Then全部解析到452条保留案例且无歧义。
- **CLG-AC-003** Given117条展示案例，When规范化来源UID，Then117/117成功并解析到116个原始案例。
- **CLG-AC-004** Given相同数据库和候选快照，When重复评分选择，Then分数、36条集合、顺序和manifestHash一致。
- **CLG-AC-005** Given最终36条，When检查配额，Then性别、年龄、就业和补贴约束全部满足。
- **CLG-AC-006** Given低于70、就业未知、来源缺失或快照漂移案例，When策展，Then不能被选中。
- **CLG-AC-007** Given归档批次，When在全新PG17恢复，Then851/117/528及规范化哈希与源库一致。
- **CLG-AC-008** Given未验证或错误manifestHash，When调用apply，Then拒绝且数据库零变化。
- **CLG-AC-009** Givenverified manifest且行未变化，When执行apply，Then只删除399条原始和81条展示案例。
- **CLG-AC-010** Given治理完成，When核对数据库，Thencases=452、showcase=36、tests=528且来源链完整。
- **CLG-AC-011** Given公开案例请求，When调用页面和API，Then只返回36条selected+published案例。
- **CLG-AC-012** Given管理员查看归档，When调用Web接口，Then只返回元数据且无法获取原始正文或dump。
- **CLG-AC-013** Given删除事务任一步失败，When回读数据库，Then治理字段、归档索引和业务行全部回滚。
- **CLG-AC-014** Given完整项目门禁，When验收，ThenNode、DB集成、E2E、Build、Secret和资源清理全部通过。

## 15. Definition of Done

- CLG-FR-001～016、CLG-NFR-001～008均有实现和测试映射。
- CLG-AC-001～014取得新鲜证据。
- 归档真实恢复通过后才执行删除，归档和旧备份均保留。
- 最终计数固定为452/36/528，测试和来源链无损。
- 36条案例满足全部质量和覆盖门禁并绑定地区候选快照。
- 公开接口不泄漏原始案例或归档内容。
- README、架构、测试、运维、traceability、PROGRESS和验收报告同步。
- 完整暂存差异和Secret候选检查通过。
- 使用`feat: 完成案例库精简与质量治理`单提交推送上游，不创建PR或合并main。

## 16. 下一阶段输入

- 452条活跃上海原始案例和完整回归来源链。
- 36条绑定地区及候选快照的高质量展示案例。
- 528条完整测试及治理前可恢复归档。
- 地区感知规划Feature可用于API、聊天和E2E验收的稳定案例资产。
