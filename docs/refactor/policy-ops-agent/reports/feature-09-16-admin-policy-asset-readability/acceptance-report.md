# 后台政策资产中文可读化（APR）验收报告

> Author: Jan
> Status: Accepted（2026-09-17：UAT通过、squash合入main、生产迁移与部署完成）
> Updated: 2026-09-16
>
> **结论失效声明**：本报告中"四轮独立复审Critical=0、Important=0"（§3.14）与"Ready for user testing/Accepted"结论已被后续独立复审取代——复审发现Important×6（I1有效期上界方向、I2非成员overlay载体遗漏、I3显示字段污染政策快照contentHash、I4 Agent参数草案缺正式名称、I5参数引用跨地区去重覆盖、I6门禁不可拉取MinIO镜像）。下列§1～§4为基线`3272577`历史记录，非最终结论；修复以RED→GREEN逐项补齐后，须由最终HEAD新鲜门禁与新独立复审重新出具结论，用户UAT前至多Ready for user testing。

## 1. 范围与权威输入

- PRD：`docs/prd/09-16-feature-admin-policy-asset-readability.md`
- 基线：`main@a834d32`（v1.0.1+ATR）；功能分支 `codex/apr-policy-asset-readability`
- 交付工作树：`F:/Socila-apr-wt`（任务专属辅助工作树，验收后清理）
- 实现与测试路径映射：`docs/refactor/policy-ops-agent/reports/traceability.md`（09-16 APR 行）

## 2. 需求实现结论

| 需求 | 实现 | 结果 |
| --- | --- | --- |
| APR-FR-001 删除重复规则集入口 | `src/app/admin/rules/page.tsx` 移除规则集标签页、重复请求与编辑状态组件；`/admin/rule-sets` 为唯一入口 | 通过（源码契约+单元+E2E） |
| APR-FR-002 规则管理展示不变 | 搜索/筛选/地区横幅/行跳转详情全部保留；页面说明更新 | 通过（源码契约+E2E） |
| APR-FR-003 规则集正式中文名称 | `rule_sets.name` NOT NULL（0020）；四地区规则集文件与Seed/物化/POST入口强制；UI可编辑草稿名称 | 通过 |
| APR-FR-004 成员中文显示 | members视图：中文名称为主+顺序号+编号+来源地区+版本+状态；名称空→null（UI“名称不可用”） | 通过 |
| APR-FR-005 保持执行顺序 | 页面渲染顺序=持久化`rule_id[]`；无客户端排序；顺序调整confirm提示影响计算结果；保存后原样持久化 | 通过 |
| APR-FR-006 精确身份 | 读取/更新/选择器均要求`rule_set_id+jurisdiction_code+version`；缺失400、不存在404、无跨地区猜测 | 通过 |
| APR-FR-007 成员解析 | 复用`mergePolicyContext`继承链/有效期/overlay语义；`as_of_date`缺省服务器当前日期并回显；无法解析`missing=true`保留原位；无关地区拒绝 | 通过 |
| APR-FR-008 成员展开 | 表格内展开只读显示备注/输入/决策条件与动作/输出/参数引用/证据/完整详情入口；非友好节点JSON回退 | 通过 |
| APR-FR-009 规则选择器 | `/candidates`端点：名称/编号搜索、排除已加入与不可解析、稳定编号去重、保存仍为编号 | 通过 |
| APR-FR-010 参数名称/说明 | `params.name` NOT NULL + `params.description` 可选；`note`职责不变 | 通过 |
| APR-FR-011 数据补全 | CN/上海/广东/四川全部50个DSL参数条目逐项人工中文名称+说明；名称含汉字、非编号拆分、多窗口共享identity名称（契约测试钉住） | 通过 |
| APR-FR-012 参数管理展示 | 名称为主、编号/地区/版本/状态/单位/有效期为辅；展开显示说明、表格/时间线、来源、证据、overlay操作与引用规则（批量反查）；编辑/校验/定位仍按编号 | 通过 |
| APR-FR-013 统一治理 | 单一发布流水线保留，未拆分 | 通过 |
| APR-FR-014 阶段内分类 | 每阶段固定顺序规则集→规则→参数可折叠分组+数量；阶段总数显示；空分组简洁空状态；数量之和=总数（单元+E2E API对账） | 通过 |
| APR-FR-015 发布实体名称 | pipeline API返回`displayName`；卡片名称为主，操作仍用entity_type+jurisdiction+id+version | 通过 |
| APR-FR-016 历史名称真实性 | 四元精确解析；身份缺失/实体不存在→null→“名称不可用”；禁止当前名冒充（反例测试） | 通过 |
| APR-FR-017 历史兼容 | 0020：旧行编号回退、DSL资产人工名称补全、NOT NULL、新建/Seed/物化入口强制、幂等；UI“名称待补充”标记 | 通过 |
| APR-NFR-001 确定性 | 相同身份/链/日期解析结果逐字段一致（单元双跑） | 通过 |
| APR-NFR-002 性能 | 成员/候选/名称/引用反查全部批量单查询（仓储`listRuleCandidates`/`listRuleParamReferenceIndex`/history三查询） | 通过 |
| APR-NFR-003 可访问性 | 展开/折叠button+aria-expanded、aria-label、加载/空/错误状态、错误文本标记（非仅颜色） | 通过 |
| APR-NFR-004 兼容性 | 规则引擎/顺序/参数值/快照/发布门禁/回滚/overlay/历史重放零变化（黄金回归+contentHash剥离契约+物化镜像delta测试） | 通过 |
| APR-NFR-005 审计真实性 | 无法精确解析不猜测（纯函数+集成反例） | 通过 |

## 3. 新鲜门禁结果（2026-09-16，最终代码状态）

（以下执行记录全部在`F:/Socila-apr-wt`本地、最终代码状态下新鲜运行；工作树状态=交付内容。执行时工作树含三轮独立复审的全部修复。）

- **§3.1 Red阶段**：Batch1单元9文件首跑25失败/16通过（模块缺失+断言失败）；Batch2集成三套件（apr-rule-sets 8、apr-params-publish 5、apr-0020-migration 1）实现前按预期Red（NOT NULL违规/模块不存在）；源码契约测试对旧页面Red（重复标签页仍存在）。
- **§3.2 单元聚焦**：APR新增/更新单元文件11个（display-names 9、apr-dsl-display-assets 8、rule-set-members 15、rule-selector 8、publish-history-names 7、asset-display 9、param-references 5、apr-display-metadata 3、entity-edit-policy 13、apr-admin-ui-contract 13、migration-lf 7=97用例）全过；Red→Green记录见§3.1。
- **§3.3 完整单元套件（`npm test`）**：103文件/1037通过、0失败、0skip。
- **§3.4 完整数据库套件（`npm run test:db`，全新PG17+pgvector演练库，`scripts/apr-db-gate.mjs`编排）**：32文件/176通过、0失败、0skip（含APR三套件23用例与既有golden/overlay/materializer/rcl/sdl/multi-region/snapshot-service套件）。migration×2幂等、bootstrap×2幂等、seed×2幂等；seed后SQL DO块核对：四规则集name全部人工中文名、无回退名称、params无空名称、当前Seed params零`name=param_id`回退行。
- **§3.5 Agent迁移与Python集成**：`agent.migrate --with-roles`×2幂等；`pytest -m integration` 131通过/137deselect/0skip（APR未改Python代码；集成含服务JWT/RAG MinIO双实例演练）。
- **§3.6 Python单元门禁**：ruff 0问题；mypy 36文件0错误；`pytest -m "not integration"` 137通过/131deselect/0skip（首轮2失败为新venv冷编译jieba第三方DeprecationWarning被`-W error`升级的既有已知环境现象——pyproject注释记载，`.pyc`缓存生成后复跑全过；Python源码零diff vs main）。
- **§3.7 TypeScript**：`npx tsc --noEmit`退出0。
- **§3.8 ESLint**：`npx eslint src e2e --max-warnings 0`退出0（0 error/0 warning）。
- **§3.9 Build**：`npm run build`退出0，仅1条既有citation-verifier动态fs访问warning（历史基线，非本Feature引入）。
- **§3.10 Chromium E2E**：`e2e/apr-admin-readability.spec.ts` 4/4通过（全新apr_e2e3库：迁移+Jan引导+seed，standalone最终构建，Chromium）。覆盖APR-AC-001/002/003/004/005/007/008/009/010/011；其中阶段分组数量对账以API级`Σ分类=阶段总数`与`全部实体displayName非null`断言。
- **§3.11 Secret扫描**：`node scripts/scan-secrets.mjs --all` 988候选文件零命中（squash提交时含docs状态同步复跑为994文件零命中，见"交付记录"段）。
- **§3.12 差异检查**：`git diff --check main`退出0；61→65文件全部位于APR范围（复审用git diff+grep验证无无关文件、diff新增行凭据形态正则零命中）。
- **§3.13 案例库/引用契约**：`npx tsx scripts/rcl-case-library-v2-doc.ts --check`通过（manifestHash `d4a2b01c…`、problems=[]）；citation-contract/dsl-layout/region-manifest等DSL契约在§3.3单元套件全过。
- **§3.14 独立复审**：四轮。第一轮：Critical×1（反例URL"两次相同"断言经od字节级核实为误报——第二条实际为斜杠非法日期`2026/01/01`，测试有效且有判别力）＋Important×2（params/rule-sets的name/description写路径缺assertDisplayMeta、验收报告占位）＋Minor×6（候选状态显示、引用按地区链过滤、getLatestRuleSetVersion死入口删除、E2E数量对账与TESTING文件数、ARCHITECTURE机制表述、跨键载体约束——均修复）；第二轮：Critical 0／Important×1（rules实体name同口径缺口）／Minor×5（agent草案HTML回退、POST/PATCH成员校验不对称、e2e头注释、条件化断言钉住、报告回填）——全部修复；第三轮：Critical 0／Important×2（F1 PATCH反例判别力重写为"先建草稿→400文案须来自name校验"模式；文档占位）／Minor×3（门禁maxBuffer/枚举吞错/日志、空rules语义钉、TESTING补记）——全部修复；第四轮确认：**Critical=0、Important=0、Minor×4**（①§3回填——本报告即执行；②脚本加固——已实施；③F1测试预清理+重复断言删除——已实施；④文档补记——TESTING.md/ARCHITECTURE.md已记录）全部关闭。
- **Docker零残留（AGENTS口径）**：`scripts/apr-db-gate.mjs` finally删除任务容器`apr-drill-pg`/`apr-drill-minio-a`/`apr-drill-minio-b`后按容器/卷/网络三类枚举，`apr-*`零残留；`socila-*`九容器与`socila_pg-data`/`socila_minio-data`/`socila_caddy-data`卷执行前后未触碰。E2E容器`apr-e2e-pg`（含apr_drill2/apr_e2e2/apr_e2e3验收库）在交付提交`1da63e0`推送后删除，容器/卷/网络三类枚举`apr-*`残留0，`socila-*`九容器与三数据卷执行前后未触碰；辅助工作树`F:/Socila-apr-wt`在docs记录提交推送后删除（删除前验证clean且已完整推送）。交付记录：squash后单一提交`1da63e0`（feat: add APR Chinese display metadata for admin policy assets: 后台政策资产中文可读化，72文件）已推送origin分支`codex/apr-policy-asset-readability`；提交前staged全量diff逐文件核对属APR范围、新增行凭据正则仅命中隔离测试容器默认弱口令构造参数（非真实凭据）、`git diff --cached --check`退出0、`scan-secrets --all`994文件零命中、0020 blob零CR、LF契约测试自最终HEAD复验7/7；Gitleaks 8.29.1对最终历史（8提交/10.94MB）扫描零发现。

## 4. 边界与未执行事项

- 未连接、未写入生产`policyops`；`socila-*`容器与`socila_pg-data`/`socila_minio-data`/`socila_caddy-data`卷未触碰（执行前后docker枚举记录）。
- 0020仅交付代码并在隔离库验证；对持久库/生产库执行属独立授权动作，未执行。
- 未创建PR、未合并main、未创建Tag/Release、未部署。
- 主工作树用户改动（AGENTS.md、playwright-report、未跟踪PRD原件）未纳入交付。

## 5. 修复轮（2026-09-16，后续独立复审Important×6关闭记录）

### 5.1 缺陷与修复（全部RED→GREEN）

| # | 缺陷（审查基线`3272577`） | 修复 | RED证据 | GREEN证据 |
| --- | --- | --- | --- | --- |
| I1 | `listRuleCandidates`有效期上界写反（`as_of>=effective_to`：选中过期行、漏选窗口内行） | `effective_from<=as_of AND (to IS NULL OR to>=as_of)`，与同文件`getEffectiveRules`/`listParamsForPreview`同型 | 临时还原旧方向跑`apr-validity-window.integration.test.ts`：4失败（生效日/窗口中漏选、终止后误选、多窗口漏选） | 6/6 |
| I2 | 候选仅按成员编号装载：非成员overlay载体（GD`R-GD-MI-RETIRE-RESTRICT`restrict→`R-220-MEDICAL-LIFETIME-GAP`）不进merge，成员误显示纯CN baseline且展开隐藏附加内容 | 装载改`rule_id∈成员 OR target_business_key∈成员`（0012 CHECK保证baseline/add目标为NULL，无假阴性面）；`RuleSetMemberView`新增`overlays`（restrict取自merge restrictions载荷、exempt按provenance三元组匹配，应用顺序）；保存校验共用同装载；页面分区渲染基础内容+overlay载体内容（载体绝不进执行顺序） | 域单测3例RED（无overlays字段）；集成`apr-overlay-carriers`2例RED（operation为baseline非restrict） | 域20/20、集成4/4 |
| I3 | 快照`toMember`写完整Drizzle行payload：params`name/description`与rule_set`name`进入contentHash（0020前后漂移，违反NFR-004） | 统一入口`snapshotMembersContentHash`（排序→`projectSnapshotMemberForHash`剥离param name/description与rule_set name→canonical SHA-256）；创建与`release-gates.canonicalMemberHash`（compute/replay委托）共享；存储payload不动（历史快照不可变；0020前payload无显示字段→投影no-op零漂移）；规则既有name不动 | `apr-snapshot-display-hash.integration.test.ts`用例1/4 RED（仅改名哈希漂移实测两组不同哈希） | 4/4+既有snapshot 6/6 |
| I4 | `ParamDraftSchema.name`可选且回退`param_id`、非法description静默置null（违反FR-017"编号回退仅限0020旧行"） | zod name必填trim非空无尖括号+description携带须安全；事务内服务级防线（直连`materializeDraftBundle`同样422，整体回滚含JTI与台账）；写入取校验值；Python`ParamDraft`加可选透传字段 | `materialize-param-draft-name.integration.test.ts`7例全RED（旧实现正常写入回退名） | 7/7（含四表零写入、直连防线、修正重试台账恰1、status===422断言） |
| I5 | 参数引用反查内层键仅`ruleId`：CN与地区同编号互相覆盖 | 去重身份`jurisdictionCode ruleId`（版本比较限同地区），输出按(ruleId,jurisdictionCode)双键排序 | `param-references.test.ts`3例RED（三地区身份坍缩为1条） | 9/9 |
| I6 | 门禁用`minio/minio:latest`（manifest denied、非确定） | 运行时从`infra/prod/docker-compose.ci.yml`解析CI批准`quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z@sha256:14cea493d9a34af32f524e538b8346cf79f3321eff8e708c1e2960462bd8936e`（单一真相源，形状校验失败即抛）；digest已`docker pull`验证可用 | `apr-gate-contract.test.ts`2例RED（旧脚本含latest） | 4/4 |

### 5.2 修复轮独立复审与处置

- **复审A（修复范围逐项验证，只读）**：结论**Critical=0、Important=0**，I1～I6逐项"关闭"；6条Minor中3条已顺手加固（`listRuleCandidates`确定性ORDER BY→overlays挂载顺序稳定；I4测试补`.status===422`断言；gate脚本声明compose解析假设注释）。
- **复审B（APR全量范围同类缺陷扫描）**：对I1～I6确认"修复方向正确、关闭"；另报Important×6/Minor×11，处置如下——
  - **I-B1（已修）**：非成员replace载体下展开/详情用成员编号拼三元素身份必404。修复：视图新增`contentRuleId`（内容来源行自身编号，replace后=载体编号），页面展开URL与详情链接改用之；域单测2例（RED实证）+契约断言。
  - **I-B2（已修）**：FR-012要求展开显示"证据"但页面无`p.evidence`渲染（以行数据变量冒充）且seed不装载evidence。修复：`seed-params`装载DSL evidence；参数展开新增"证据（引用依据）"区（title/official_url/authority/document_id/抓取日期）；契约断言钉住（不得复用行变量）。
  - **I-B3（已修）**：FR-017"校验必须识别未补全状态"无实现。修复：`validateParamRecord`新增`display_name`检查项与`results.name_pending`（缺失/空白/编号回退→不通过）；按PRD"兼容回退不得阻止读取"不纳入valid聚合；单测2例（RED实证）。
  - **I-B4（登记，不改代码）**：规则草案name回退（M3先例）与params口径差异。裁定依据：PRD FR-017强制对象为"规则集和参数"（§7数据模型同），`rules.name`为APR前既有业务字段；UI对回退名如实标记"名称待补充"不冒充。已记录口径，如需扩展到规则须先修订PRD。
  - **I-B5（登记，不改代码）**：`POST /api/admin/params`、`POST /api/admin/rules`整body展开写库为APR前既有面（本仓库NRP时代引入），非本轮6项、修复将改变既有API契约。建议独立Work Item（受控字段POST白名单）。
  - **I-B6（已修）**：I4的Core强制使Agent侧确定性校验不同步（无name提案可获批却在Core必422）。修复：`verify_bundle`新增参数草案名称/说明同口径检查（can_review=False）；`test_drafting`/`test_closed_loop`fixtures补name；新增pytest用例，10/10通过。
  - **Minor处置**：M-B1引用索引仅published（已修+集成判别用例）；M-B2引用列表React key加地区身份（已修）；M-B9管理端默认日期统一UTC口径（已修）；M-B11 E2E草稿创建幂等复用（已修；历史断言条件式保留并记录理由——E2E承诺不改动发布状态机，"名称不可用"语义由单测覆盖）；M-B3/M-B4（快照provenance无载体键/版本胜出不对称，NRP域预存在设计）、M-B5（引擎getEffectiveRules无地区过滤，预存在潜伏、当前DSL无跨区同编号）、M-B6（非APR脚本的latest镜像）、M-B8（白名单蛇形键、预存在）、M-B10（继承链异常伪装400，排障质量）——登记为边界与后续Work Item建议，不属于本轮授权范围。

### 5.3 修复轮终态门禁（2026-09-16/17，最终HEAD新鲜运行）

| 验证 | 结果 |
| --- | --- |
| TDD RED/GREEN | 六项I1～I6与复审B四项I-B1/B2/B3/B6全部先RED后GREEN（证据见§5.1/§5.2） |
| Node单元（`npm test`） | PASS；104文件/1057用例、0失败、0skip（修复轮净增20用例） |
| TypeScript / ESLint | PASS；`tsc --noEmit` 0；`eslint src e2e --max-warnings 0` 0问题 |
| 数据库门禁（`scripts/apr-db-gate.mjs`，GATE_EXIT=0） | PASS；全新apr-drill-pg（pgvector/pgvector:pg17）+双MinIO（quay.io固定digest）；migration×2/bootstrap×2/seed×2幂等+seed名称DO块核对；`test:db` **36文件/198用例全过0skip**（含修复轮全部新集成用例）；agent.migrate --with-roles×2幂等；`pytest -m integration` **131通过/0skip/138deselect**；finally清理后容器/卷/网络三类枚举`apr-*`零残留 |
| Python门禁（services/agent） | PASS；ruff 0、mypy 36文件0错误、`pytest -m "not integration"` 138通过（+1 I-B6用例）；jieba冷编译预热方式同§3.6既载现象 |
| Chromium E2E（APR spec） | PASS；`e2e/apr-admin-readability.spec.ts` **5/5**（全新apr_e2e_fix库+最终standalone build；含修复轮广东overlay分区展开用例与草稿创建幂等加固） |
| Build | PASS；`npm run build`退出0（standalone） |
| Secret / 差异 | PASS；`scan-secrets --all` 994文件零命中；`git diff --check`退出0 |
| 门禁稳定性处置 | 前两次gate运行出现`rcl-rewrite-cli`(6→3)与`identity`(1)共4~7例失败：逐例定位为**5s执行预算超时的时序脆弱**（identity连续bcrypt计算、rcl多次tsx子进程演练；超时中断还级联污染共享库计数断言），两文件本轮零改动、断言与低负载机器一致。处置：`vitest.integration.config.ts`提升集成用例执行预算至30s（不改任何断言/skip纪律），两文件复跑19/19后第三次gate全量GATE_EXIT=0 |
| 独立复审终局 | 复审A：Critical=0、Important=0（I1～I6逐项关闭）；复审B：I1～I6确认关闭，新增I-B1/B2/B3/B6已修复（判别力测试RED→GREEN），B4/B5与预存在Minor登记于§5.2边界 |

**终态：Ready for user testing（用户人工验收前不标记Accepted）。**

### 5.5 合并与生产生效记录（2026-09-17）

| 事项 | 结果 |
| --- | --- |
| 用户UAT | 通过（本地隔离演练环境：0020后全新库+standalone构建，Jan管理员实测四页与广东restrict分区展开） |
| 合并 | PR#2以**squash单提交**合入main：`3f387db`（用户指定合并方式；e2e-gates首次运行失败经裁决为APR新增5个管理端用例的Jan登录打满用户级5次/5分钟限流窗口所致——`loginViaApi`增加按账号会话缓存后本地重演15/15全绿，CI重跑六项success） |
| 生产迁移 | 0019+0020对持久policyops执行（`run-migrations`退出0）：journal 18→**20**；42表行数对账仅预期差异（账本+2、0019新增2张0行审计表），**全部业务表行数零变化**；rule_sets 6/6人工名、params 75行=55人工名+20编号回退+0空名 |
| 生产部署 | `docker build` web:latest/agent:latest（源=3f387db检出；回滚锚web:pre-apr/agent:pre-apr已留）；`compose up -d web agent worker beat`滚动替换；九容器healthy（migrate为一次性Exited 0）；冒烟web `/api/health`={"status":"ok","database":"ok"}、agent `/internal/health`={"status":"ok"}、入口/api/health 200；容器BUILD_ID与APR chunk（contentRuleId/生效overlay）核验为本次构建 |
| 生产备份 | `backup/db/policyops-pre-apr-20260917-024229.dump`+SHA-256（fe2624cf…），恢复对账42表一致 |

### 5.4 修复轮边界与未执行事项

- 未连接、未写入生产`policyops`；`socila-*`容器与`socila_pg-data`/`socila_minio-data`/`socila_caddy-data`卷未触碰（枚举记录见§5.3）。
- 0020对持久/生产库执行、生产部署、PR、main合并、Tag/Release均未执行（待用户授权/决定）。
- 迭代与验收任务资源（`apr-fix-pg`、`apr-e2e-fix-pg`、`apr-rag-minio-repro(-b)`、gate自建`apr-drill-*`、辅助工作树`F:/Socila-apr-fix-wt`）在提交推送后清理，见§5.3零残留记录。
- 修复轮测试期间发现的4个非APR spec E2E失败（auth/SHV2/JRP/RCL各1）为全新验收库缺少相应feature持久化数据所致（失败点为登录或空数据，与本轮改动无交集）；APR spec全部通过。
