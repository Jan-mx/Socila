# Socila命名统一与地区DSL分层 PRD

> Author: Jan
> Status: Draft
> Updated: 2026-09-05

## 文档元数据

| 字段 | 值 |
| --- | --- |
| PRD文件 | `09-05-feature-socila-naming-regional-dsl.md` |
| 类型 | Feature |
| 状态 | Draft |
| 前置依赖 | PolicyOps七阶段重构、09-03运行配置整改、Core与Agent服务JWT鉴权 |
| 可并行阶段 | 无；目录、协议标识、服务身份和数据库迁移必须按同一命名契约切换 |
| 后续消费者 | 国家baseline及粤川overlay Stage、地区感知规划Feature |
| 退出门禁 | 活动代码和配置完成Socila硬切换，上海黄金结果无漂移，生产Seed不再写入粤川示例 |
| 对应总体需求 | PRD-FR-010～014、PRD-NFR-004～007、POL-FR-001～012、SJWT-FR-003～005 |

## 1. 背景与现状

仓库已从上海单城市工具扩展出全国地区树、政策overlay和不可变快照，但文件结构仍把通用协议、上海政策资产和历史项目缩写混在`dsl/ssp_dsl_v1`。活动代码还存在`SSP_TEST_DATABASE_URL`、`SSRP_E2E_*`、`ssp-next-core`、`ssp-anon-session`和开发Compose资源名等遗留标识。

`SSP-DSL-1.0`同时被当作格式版本和目录名称，Agent草案又使用`ssp_dsl_v1`，导致同一协议存在两种值。上海地区由Seed硬编码为`310000`，未来新增地区必须修改装载代码。广东、四川的两个示例政策包和四个示例参数由生产Seed以`published`状态写入，但这些数值不是已完成权威引用审核的正式政策。

本Feature只整理命名、协议和地区资产边界，不改变政策数字含义，不新增真实地区政策，也不把用户规划入口改造成地区感知入口。

## 2. 目标

- 建立通用Socila DSL协议与地区政策资产分层结构。
- 将规则格式标识统一为`SOCILA-DSL-1.0`，地区不编码进`dsl_version`。
- 通过地区Manifest装载上海资产，消除Seed中的上海路径和地区代码硬编码。
- 对活动代码、配置和运行契约执行一次性Socila命名硬切换。
- 将粤川非权威示例移入测试夹具，停止生产Seed写入。
- 在可恢复备份和精确目标检查后清理持久库中的固定示例记录。
- 保持上海24条规则、29个参数、执行顺序及黄金输出不变。

## 3. 非目标

- 不新增或研究国家、广东、四川真实政策。
- 不把现有上海规则重新分类为国家baseline。
- 不修改规划API的地区输入或默认上海行为。
- 不开放广东、四川用户规划。
- 不改写历史`reports/`、`archive/`或既有Git提交中的旧名称。
- 不删除旧开发Docker卷、历史备份或不可变政策快照。
- 不提供旧环境变量、Cookie、localStorage或服务JWT身份的兼容别名。

## 4. 用户故事

- **SDL-US-001** 作为维护者，我需要通用协议与地区资产分离，从而新增地区不复制或改写协议Schema。
- **SDL-US-002** 作为规则编辑者，我需要每个地区包显式声明行政区划代码和资产版本，从而避免Seed误归属。
- **SDL-US-003** 作为运维者，我需要活动标识统一为Socila，从而配置、日志和服务身份不再混用旧缩写。
- **SDL-US-004** 作为测试维护者，我需要粤川示例只存在于测试夹具，从而测试数据不会被误认为正式政策。
- **SDL-US-005** 作为数据负责人，我需要清理示例前具备可恢复备份和精确对账，从而不会误删真实政策或用户数据。

## 5. 功能与工程需求

- **SDL-FR-001 协议标识**：规则格式的唯一规范值为`SOCILA-DSL-1.0`；上海、广东、四川及未来地区共享该值。
- **SDL-FR-002 目录分层**：通用Schema和发布工作流位于`dsl/protocol/socila_dsl_v1`；上海规则、参数、规则集、示例和Manifest位于`dsl/regions/shanghai_dsl_v1`。
- **SDL-FR-003 地区Manifest**：上海Manifest至少声明`dsl_version`、`region_slug=shanghai`、`jurisdiction_code=310000`、`bundle_version=1`、规则清单、参数包、规则集和示例测试相对路径。
- **SDL-FR-004 Seed发现**：Seed从地区Manifest取得路径与地区代码，验证Manifest和实际文件集合一致；不得在装载器中硬编码`310000`或上海目录。
- **SDL-FR-005 上海稳定标识**：保留`SHANGHAI_BASE`、`RS-SHANGHAI-PLAN-V1`、`P-SH-*`及上海迁移测试名称，这些名称正确表达地域归属。
- **SDL-FR-006 活动命名切换**：`ssp-web`改为`socila-web`，`SSP_TEST_DATABASE_URL`改为`SOCILA_TEST_DATABASE_URL`，`SSP_PG_DEV_PASSWORD`改为`SOCILA_PG_DEV_PASSWORD`，全部`SSRP_E2E_*`改为`SOCILA_E2E_*`。
- **SDL-FR-007 浏览器与进程标识**：匿名Cookie、legacy localStorage键、全局限流桶及临时目录前缀统一使用`socila`；旧名称不再读取或写入。
- **SDL-FR-008 服务身份**：Next服务JWT issuer从`ssp-next-core`改为`socila-next-core`，Agent到Core的audience同步修改；Node、Python、CI冒烟和固定向量必须原子切换。
- **SDL-FR-009 开发资源**：开发Compose容器、卷、测试默认库使用`socila`名称；旧资源不得自动删除。
- **SDL-FR-010 数据文件**：`data/ssp-test-cases-from-transcripts.xlsx`改为`data/shanghai-test-cases-from-transcripts.xlsx`，重命名前后SHA-256必须一致。
- **SDL-FR-011 数据库规范化**：版本化migration将`rules.dsl_version`中的已知旧值`SSP-DSL-1.0`和`ssp_dsl_v1`更新为`SOCILA-DSL-1.0`，其他未知值保持不变并阻止自动继续。
- **SDL-FR-012 示例测试化**：`GD-EXAMPLE-BASE`、`SC-EXAMPLE-BASE`及其四个固定参数移入测试夹具；生产Seed不得继续写入。
- **SDL-FR-013 示例清理**：持久库清理只能匹配两个固定包ID、四个固定参数ID、预期地区和版本；存在额外业务键、引用或不一致时中止。
- **SDL-FR-014 文档边界**：当前README、架构、测试和活动PRD使用新名称；历史报告和归档保留当时的原始路径与标识。

### 5.1 非功能需求

- **SDL-NFR-001 无语义漂移**：目录和命名变化不得改变上海`plan`、`calc`、`trace`及规则执行数量。
- **SDL-NFR-002 可恢复**：任何持久数据删除前必须完成新鲜custom-format备份、SHA-256清单、PG17+pgvector真实恢复和逐表对账。
- **SDL-NFR-003 原子切换**：服务JWT两端及所有CI消费者必须在同一提交切换，不能形成混合身份窗口。
- **SDL-NFR-004 Fail-fast**：旧环境变量不作为回退；缺少新变量时测试和脚本明确失败。
- **SDL-NFR-005 最小删除**：migration只删除固定示例记录，绝不删除政策快照、用户、规划、对话、案例或备份。
- **SDL-NFR-006 可审计**：迁移前后记录目标行、表计数、哈希、备份文件和恢复结果，不记录Secret或用户数据。
- **SDL-NFR-007 安全门禁**：不得降低Secret、Gitleaks、服务JWT、引用或发布门禁；新误报只允许精确核实的fingerprint。

## 6. 实现设计

目标目录：

```text
dsl/
├─ README.md
├─ protocol/socila_dsl_v1/
│  ├─ README.md
│  ├─ schema/
│  │  ├─ socila_rule_dsl.schema.json
│  │  ├─ socila_policy_params.schema.json
│  │  └─ user_profile.schema.json
│  └─ workflows/publish_workflow_default.json
└─ regions/shanghai_dsl_v1/
   ├─ rules/
   ├─ params/policy_params_shanghai_base.json
   ├─ rule_sets/rule_set_shanghai_plan_v1.json
   ├─ tests/rule_examples_as_tests.json
   └─ rules_manifest.json
```

地区发现器读取`dsl/regions/*_dsl_v1/rules_manifest.json`，先用协议Schema校验Manifest引用，再将`jurisdiction_code`传给规则、参数和规则集Seed。当前只装载上海；未来地区沿用相同接口。

粤川测试夹具由区域隔离集成测试显式安装，并在测试数据库生命周期结束时清理。生产Seed不依赖测试夹具。

## 7. 数据模型与不变量

地区Manifest：

```ts
interface RegionDslManifest {
  dsl_version: "SOCILA-DSL-1.0";
  region_slug: string;
  jurisdiction_code: string;
  bundle_version: number;
  params_file: string;
  rule_set_file: string;
  tests_file: string;
  rules: Array<{ rule_id: string; file: string }>;
}
```

不变量：

- `dsl_version`表示JSON格式，不表示地区或政策内容版本。
- `jurisdiction_code`使用地区树中的稳定行政区划代码。
- 地区资产版本与规则、参数实体版本独立递增。
- 上海Manifest列出的规则集合与目录中的24个规则文件完全一致。
- 已发布快照保持不可变，示例清理不修改历史快照成员。

## 8. API、事件与类型

本Feature不修改公开HTTP业务API。内部契约变化包括：

| 契约 | 旧值 | 新值 |
| --- | --- | --- |
| DSL格式 | `SSP-DSL-1.0`/`ssp_dsl_v1` | `SOCILA-DSL-1.0` |
| Next服务issuer | `ssp-next-core` | `socila-next-core` |
| Agent到Core audience | `ssp-next-core` | `socila-next-core` |
| DB集成环境变量 | `SSP_TEST_DATABASE_URL` | `SOCILA_TEST_DATABASE_URL` |
| Auth E2E变量 | `SSRP_E2E_*` | `SOCILA_E2E_*` |

旧服务JWT身份统一返回现有`401 SERVICE_AUTH_INVALID`，不增加可枚举错误。

## 9. 迁移与兼容

1. 在演练库验证旧DSL值规范化及六条示例精确清理。
2. 对持久库生成新鲜备份、SHA清单并完成真实恢复对账。
3. 查询六个固定ID、地区、版本和快照引用；任何异常立即停止。
4. 执行版本化migration；重复执行必须无新增变化。
5. 重建Web、Agent、Worker和Beat，使服务JWT身份同步生效。
6. 旧Cookie、localStorage、测试变量和开发Compose名称不兼容；旧Docker卷仅保留，不自动删除。

回退使用备份恢复数据库和上一版本应用；不能通过重新Seed恢复已删除示例。

## 10. 安全、隐私与可观测

- 备份保存在Git忽略目录，不输出连接串或数据内容。
- migration日志只记录固定业务键、数量和结果。
- 服务JWT Secret及签名算法不因身份改名而变化。
- 浏览器旧匿名标识失效不得影响已认证用户的`owner_user_id`资源。
- 命名扫描排除历史报告、归档及package-lock完整性字符串，但不得排除活动代码和配置。

## 11. 失败模式、重试与回退

| 失败 | 行为 | 回退 |
| --- | --- | --- |
| Manifest与文件集合不一致 | Seed失败，不写数据库 | 修正Manifest后重试 |
| 出现未知`dsl_version` | migration中止 | 人工分类后重新执行 |
| 示例ID指向非预期地区或版本 | 删除中止 | 保留现场并请求用户决策 |
| 备份或恢复对账失败 | 禁止清理数据 | 修复备份链路后重做 |
| JWT两端身份不一致 | 服务调用401 | 回退同一版本镜像，不做单边降级 |
| 上海黄金结果漂移 | Feature拒绝验收 | 回退目录/装载变更并定位差异 |

## 12. 交付物

- 通用协议和上海地区DSL目录。
- 地区Manifest类型、验证和通用Seed装载器。
- Socila命名硬切换代码、配置和固定测试向量。
- 粤川区域测试夹具及生产Seed清理。
- DSL值规范化和示例精确清理migration。
- 备份恢复、数据库对账、测试和命名验收报告。
- 当前架构、测试、运维、traceability和PROGRESS更新。

## 13. 测试矩阵

| 类型 | 场景 | 通过条件 |
| --- | --- | --- |
| 契约 | 活动路径和运行标识扫描 | 无遗留SSP/SSRP运行标识 |
| DSL | Manifest、Schema、规则集合 | 24条规则和29个参数完整且规范值唯一 |
| 黄金 | 上海规则内存及数据库执行 | `plan/calc/trace`无漂移 |
| Seed | 全新库执行生产Seed | 不含粤川示例published数据 |
| 集成 | 安装粤川测试夹具 | 地区隔离通过，测试结束无残留 |
| Migration | 旧值、部分示例、重复执行 | 只改已知值和固定记录，幂等 |
| JWT契约 | Node/Python交叉签发验证 | 新身份通过，旧身份401 |
| 恢复 | 新鲜dump恢复与逐表对账 | 恢复库与源库精确一致 |
| E2E/构建 | 新环境变量和standalone | 全部退出0、零skip、无警告 |
| 安全 | Secret、Gitleaks完整历史 | 零未解释发现 |

## 14. 验收场景

- **SDL-AC-001** Given上海地区目录，When执行Seed，Then24条规则和29个参数以`310000`及`SOCILA-DSL-1.0`落库。
- **SDL-AC-002** Given未来地区Manifest，When执行发现器，Then无需修改上海常量即可识别地区元数据。
- **SDL-AC-003** Given活动仓库，When执行命名契约扫描，Then旧运行标识只存在于历史报告、归档和允许的历史指纹。
- **SDL-AC-004** Given旧服务身份，When调用内部端点，Then统一401；新身份双向调用成功。
- **SDL-AC-005** Given全新数据库，When执行生产Seed，Then粤川示例包和参数均不存在。
- **SDL-AC-006** Given临时测试库，When运行地区隔离测试，Then粤川夹具可用且互不串入。
- **SDL-AC-007** Given含六条示例的持久库，When完成备份恢复后执行migration，Then只删除固定目标且其他数据不变。
- **SDL-AC-008** Given重构前后的上海资产，When运行黄金回归，Then规则数量、通过率和逐案输出一致。
- **SDL-AC-009** Given旧测试变量，When运行门禁，Then明确fail-fast；改用新变量后通过。
- **SDL-AC-010** Given被重命名的Excel，When比较SHA-256，Then内容完全一致。

## 15. Definition of Done

- SDL-FR-001～014、SDL-NFR-001～007均有实现和测试映射。
- SDL-AC-001～010取得新鲜证据。
- 备份恢复和示例删除对账通过，未触碰历史快照及用户数据。
- 当前文档使用新名称，历史证据保持原貌。
- 受影响README从Updating恢复Active，PRD状态在验收后改为Active。
- 完整暂存差异及Secret候选检查通过。
- 使用`refactor: 统一Socila命名与地区DSL`单提交推送上游，不创建PR或合并main。

## 16. 下一阶段输入

- 稳定的`SOCILA-DSL-1.0`协议Schema和地区Manifest契约。
- 只包含上海正式资产的生产Seed。
- 不含粤川非权威示例的运行数据库。
- 可供国家baseline和地区overlay使用的通用装载与版本边界。
