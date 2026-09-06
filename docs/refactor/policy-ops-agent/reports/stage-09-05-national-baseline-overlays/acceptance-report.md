# 09-05 Stage 国家baseline及广东四川权威overlay 验收报告

> Author: Jan
> Status: Reopened（里程碑A/B/C/D资产保留；阶段E于2026-09-06独立复审发现阻断缺陷，修复并重新验收前不得恢复Accepted）
> Updated: 2026-09-06

## 1. 范围与结论

本阶段执行权威PRD `docs/prd/09-05-stage-national-baseline-regional-overlays.md`（Draft）的任务2：按国家baseline、上海重分类、广东overlay、四川overlay四个里程碑建立权威政策事实、显式overlay操作数据模型、黄金测试与候选快照能力。

当前结论以§11独立复审为准：阶段E物化计数与draft/blocked状态真实存在，但其目标保护、发布门禁、参数与政策包完整性、地区身份、恢复和完整性证据存在P1/P2缺陷，原阶段E验收结论已撤回。

| 里程碑 | 提交 | 核心交付 | 状态 |
| --- | --- | --- | --- |
| A 国家baseline | `500db14` `feat: 建立国家baseline与显式overlay操作` | 0012迁移、显式operation/target_business_key、CN baseline DSL（16规则+CN-BASELINE参数包）、国家4份官方原件 | 交付并验证 |
| B 上海重分类 | `b4cba62` `feat: 完成上海规则重分类零漂移对账` | 44例冻结基线+零漂移对账测试（plan/calc/user逐字节一致） | 交付并验证 |
| C 广东overlay | `8779e02` `feat: 建立广东440000权威overlay` | 粤医保规〔2022〕6号+粤人社发〔2024〕33号原件、GD-BASE参数包、显式restrict实体 | 交付并验证 |
| D 四川overlay | `2c4c19e` `feat: 建立四川510000权威overlay` | 川人社办发〔2025〕39号原件、SC-BASE参数包、待办语义黄金化 | 交付并验证 |

## 2. 需求与验收映射

### 2.1 功能需求

| 需求 | 实现 | 测试/证据 |
| --- | --- | --- |
| NRP-FR-001 来源登记 | 沿用`sources/official-source-registry.md`白名单；本次采集域名：mohrss.gov.cn、gov.cn、hsa.gd.gov.cn、hrss.gd.gov.cn、rst.sc.gov.cn（全部在白名单内） | `evidence/*/*/meta.json`（域名=白名单域名） |
| NRP-FR-002 权威原件 | 每份文件保存original.html + http-headers.txt + meta.json（最终URL/HTTP状态/抓取时间/fetch方法/SHA-256/字节数）+ extracted-text.txt | `evidence/CN|GD|SC/DOC-*`，sha256由引用契约测试复核 |
| NRP-FR-003 文档解析 | 提取正文文本（extracted-text-v1）；DocumentTree生产管线为Agent侧既有能力，本阶段以抽取文本为解析事实源 | extracted-text.txt 与 original.html 一致（去标签） |
| NRP-FR-004 引用定位 | evidence条目含document_id/authority/official_url/locator(条/款/附件)/excerpt(逐字)/content_sha256/artifact/parse_version | `src/lib/dsl/citation-contract.test.ts`（防伪造：摘录必须逐字出现在原件文本中） |
| NRP-FR-005 国家baseline | `dsl/regions/cn_dsl_v1`：16条baseline规则（归一化/退休/养老/医保/失业/模板/门禁）+ CN-BASELINE参数包（退休年龄覆盖表、最低缴费年限时间线、失业金法定期限档、灵活就业基数区间） | `cn-baseline-golden.test.ts` 21例 |
| NRP-FR-006 地方overlay | 沪8条add规则+地方参数；GD/SC参数包与GD restrict实体；两地规则集仅继承国家16条 | `dsl-layout.test.ts`、地区黄金测试 |
| NRP-FR-007 显式操作 | 0012迁移（operation/target_business_key列+三条CHECK约束）；overlay合并器显式语义；Seed装载校验（`overlay-operation.ts`）；快照服务不再按地区推断 | `nrp-explicit-overlay.integration.test.ts` 4例（含约束拒绝矩阵） |
| NRP-FR-008 核心范围 | 退休（渐进延迟+弹性）、养老最低缴费（15→20时间线）、医保退休年限框架、失业资格与法定期限档、缴费基数（国家60%~300%区间+粤川基数上下限） | 各地区黄金用例+官方摘录 |
| NRP-FR-009 地方补贴 | 上海补贴规则保持沪属；广东/四川地方补贴未取得完整权威来源，v1不纳入 | 本报告§5待办 |
| NRP-FR-010 版本化 | 实体含jurisdiction/businessKey/version/status/effective区间；seed-params补齐effective_to装载 | SC/GD参数窗口落库断言 |
| NRP-FR-011 冲突处理 | 同级重叠/duplicate-add/unknown-key/missing-target/same-level-target均产生MergeConflict并阻止快照 | `overlay.test.ts`、`nrp-explicit-overlay.integration.test.ts`（unknown-key→PolicyConflict→阻止） |
| NRP-FR-012 草案生成 | 复用既有DraftBundle与Core二次校验链路；本阶段未产生新草案（数据由Seed权威装载，无Agent写入） | 既有SJWT/DRF测试回归通过 |
| NRP-FR-013 人工审核 | R-220守卫行（地区年限缺失→needs_agent）与SC医保年限待办体现"歧义停止"语义；管理员批准仍为快照发布前置人工动作 | `sichuan-overlay-golden.test.ts` |
| NRP-FR-014 地区快照 | CN/GD/SC/SH候选快照均可在演练库创建（resolvedPath=/CN/…、成员provenance含操作与目标键、内容哈希可重放） | `nrp-gd/sc-overlay.integration.test.ts`、`snapshot-service.integration.test.ts` |
| NRP-FR-015 黄金测试 | 四地区黄金用例：正常/边界/缺失信息/地区隔离全覆盖 | §3门禁汇总 |
| NRP-FR-016 阶段交付 | 四个里程碑四个独立提交，`英文行为: 中文总结`格式，已推送上游 | git log |

### 2.2 非功能需求

| 需求 | 结论 | 证据 |
| --- | --- | --- |
| NRP-NFR-001 引用100% | 参数100%；政策承载规则100%（计算框架/归一化规则白名单除外，分类表见§4） | citation-contract |
| NRP-NFR-002 地区正确 | 错地区/错有效期混入为0：链式合并按jurisdiction过滤+有效期窗口断言 | 各黄金测试+集成测试 |
| NRP-NFR-003 可重放 | 相同地区/日期快照内容哈希一致；44例零漂移对账 | GD/SC集成测试、drift测试 |
| NRP-NFR-004 隐私 | 本阶段未触碰用户画像/对话数据；采集仅公开政策文本 | 代码审查+既有隐私测试回归 |
| NRP-NFR-005 可恢复 | 未修改既有备份/恢复流程 | — |
| NRP-NFR-006 可观测 | provenance记录jurisdiction/pack/version/operation/targetBusinessKey | NRP-AC-005断言 |
| NRP-NFR-007 安全输入 | 未引入模型输入路径变化 | — |
| NRP-NFR-008 资源约束 | 未改变Worker/prefetch/文件限制 | — |

### 2.3 验收场景

- **NRP-AC-001**（CN事实+引用+有效期）：CN baseline全部政策事实引用官方原件摘录，`citation-contract`+`cn-baseline-golden`验证。✅
- **NRP-AC-002**（上海重分类零漂移）：44例冻结基线逐案对账，plan/calc/user逐字节一致，trace差异全部可由参数改名映射解释（16个同名保留用例与提交快照逐字节一致）。✅
- **NRP-AC-003**（广东只含CN+GD）：`nrp-gd-overlay.integration.test.ts`（chain=[CN,440000]、无沪实体）。✅
- **NRP-AC-004**（四川不含沪粤）：`nrp-sc-overlay.integration.test.ts`。✅
- **NRP-AC-005**（操作与目标键入provenance）：GD restrict/SH replace的provenance断言。✅
- **NRP-AC-006**（冲突阻止快照）：unknown-key目标→PolicyConflict落库+SnapshotBlockedError。✅
- **NRP-AC-007**（引用缺失不得进入审核）：引用契约100%覆盖门禁（未达标即CI红）。✅（以门禁形式实现；本阶段无Agent草案提交）
- **NRP-AC-008**（门禁通过→批准→可重放候选快照，不自动开放流量）：GD/SC候选快照在演练库创建且可重放；未改动任何用户API，未开放流量。✅
- **NRP-AC-009**（单地区失败不影响其他地区）：SH快照在GD/SC落库后照常生成且不含GD/SC成员。✅
- **NRP-AC-010**（重放一致）：同地区同日期重复创建快照contentHash一致。✅

## 3. 门禁汇总（2026-09-05本地新鲜执行）

| 验证 | 结果 |
| --- | --- |
| TDD Red | overlay显式操作测试首跑10失败/3通过；0012约束测试在无约束库上失败；CN/SC黄金与对账测试均先于实现/数据确认Red |
| Node单元（`npm test`，2 workers） | PASS；47文件/423通过、skip 0 |
| TypeScript / ESLint | PASS；`tsc --noEmit`退出0、`eslint src` 0 error/0 warning |
| 生产构建（`npm run build`） | PASS；退出0、零warning（Turbopack） |
| 数据库集成（全新PG17+pgvector `nrp_drill`，迁移×幂等+四地区Seed） | PASS；14文件/64通过、skip 0（含0012约束矩阵、显式overlay解析、四地区快照、沪迁移对账、多地区Seed隔离） |
| Agent迁移与角色（`agent.migrate --with-roles`） | PASS；migration+0002_roles幂等 |
| Python集成（`pytest -m integration`） | PASS；20通过、skip 0 |
| Python门禁（ruff/mypy/pytest非集成） | PASS；0问题、33文件0错误、94通过 |
| Auth E2E（全新PG17 `nrp_e2e`库+bootstrap+seed+standalone+mock） | PASS；10通过（40.2s） |
| Secret扫描（`scan-secrets --all`） | PASS；626候选文件零命中 |
| Gitleaks 8.29.1完整历史 | PASS；45 commits no leaks |
| allowlist哨兵回归（`verify-gitleaks-allowlist.mjs`） | PASS；3场景全过 |

## 4. 权威来源与采集记录

| docId | 文件 | 发文机关 | 来源域名 | 抓取方式 | 用途 |
| --- | --- | --- | --- | --- | --- |
| DOC-CN-NPC-DELAYED-RETIREMENT-2024 | 全国人大常委会关于实施渐进式延迟法定退休年龄的决定（含国务院办法） | 全国人大常委会（人社部专题转载） | mohrss.gov.cn | Playwright无头浏览器（反爬JS挑战） | 退休年龄/延迟节奏/最低缴费年限/弹性退休 |
| DOC-CN-SOCIAL-INSURANCE-LAW | 社会保险法（2018修正） | 全国人大常委会 | mohrss.gov.cn | 同上 | 第16/27/45/46/48条 |
| DOC-CN-GOB-2019-13 | 国办发〔2019〕13号降低社会保险费率综合方案 | 国务院办公厅 | gov.cn | 同上 | 全口径平均工资、灵活就业60%~300%基数区间 |
| DOC-CN-UNEMPLOYMENT-REGULATION | 失业保险条例（国务院令258号） | 国务院 | mohrss.gov.cn | 同上 | 第14/17/18条 |
| DOC-GD-MEDICAL-TRANSFER-2022 | 粤医保规〔2022〕6号省内转移接续暂行办法 | 广东省医保局等三部门 | hsa.gd.gov.cn | 同上 | 第六条（2030统一男30/女25）、第八条（实际缴费满10年） |
| DOC-GD-CONTRIBUTION-BASE-2024 | 粤人社发〔2024〕33号2024年缴费基数 | 广东省人社厅等四部门 | hrss.gd.gov.cn | 同上 | 9167元社平、上限27501、分市下限（2024-07-01~2025-06-30） |
| DOC-SC-CONTRIBUTION-BASE-2025 | 川人社办发〔2025〕39号2025年度缴费基数通告 | 四川省人社厅等四部门 | rst.sc.gov.cn | 同上 | 上限22938/下限4588、社平依据7646 |

说明：gov.cn/mohrss对curl返回403/反爬挑战，采集统一使用Playwright无头Chromium（真实浏览器指纹执行挑战后保存渲染后的原始HTML），HTTP状态、响应头、最终URL、SHA-256均记录于meta.json。搜索引擎仅用于发现官方URL，事实一律取自实际抓取的页面正文。

## 5. 按PRD停止并转人工裁决的事项（不猜测）

| 待办 | 事实状态 | PRD依据 |
| --- | --- | --- |
| 四川医保退休年限 | 省级统一文件（《四川省基本医疗保险关系省内转移接续实施办法》）截至采集日仅见2025-03征求意见稿及媒体转载，未检索到正式印发原文；现行年限按市（州）执行 | §10"政策含义存在合理歧义时停止自动流程"；非目标"不以搜索摘要、转载作为事实源" |
| 四川失业保险金标准（当地最低工资90%） | 依据川人社办发〔2023〕18号（失业保险省级统筹），但原文未在rst.sc.gov.cn/sc.gov.cn获取，仅非白名单站点转载 | NRP-FR-002/FR-009 |
| 广东2025-07起的缴费基数上下限 | 粤人社发〔2025〕32号未在hrss.gd.gov.cn检索到原文（仅有税务局等白名单外转载）；现有GD基数参数以2024年度窗口（2024-07-01~2025-06-30）编码，窗口外自动失效 | NRP-FR-002/FR-010 |
| 广东失业保险待遇（省条例第十九条90%） | 《广东省失业保险条例》全文仅见于白名单外地市转载 | NRP-FR-009 |
| 候选快照的管理员批准 | 四地区候选快照能力已验证，但发布需政策管理员人工批准，Agent不自动发布、不开放用户流量 | §6.2地区门禁、PRD非目标 |
| RAG生产索引 | 保持既有空态观察项；本阶段采集的原件与DocumentTree/抽取文本为后续索引输入 | PROGRESS既有观察项 |

## 6. 重分类与漂移说明（NRP-AC-002）

- 规则归属：16条国家统一口径规则（R-010/011/012/020/110/115/120/200/210/220/300/400/410/420/700/900）迁入CN baseline；8条上海执行标准（R-310等待期、R-500~540补贴互斥、R-600补差提醒）留沪add。
- 参数改名（值不变，已解释漂移）：`P-SH-MEDICAL-LIFETIME-MALE/FEMALE/REQUIRED-YEARS`→`P-MI-LIFETIME-*`；`P-SH-UNEMPLOYMENT-MAX-MONTHS`→CN baseline `P-UNEMPLOYMENT-MAX-MONTHS`（24不变）；`T-SH-UNEMPLOYMENT-DURATION-BY-YEARS`→上海对CN基线表`T-UNEMPLOYMENT-DURATION-BY-YEARS`的显式replace（行内容不变）。trace中lookup的table_param_id与set的var表达式随改名映射解释。
- CN规则相对上海原件的唯一行为增强：R-220新增`row_1b_local_years_missing`守卫行（地区年限参数缺失→needs_agent+warning）。参数存在时该行不触发，上海解析零影响；这是"国家框架+地区参数"语义的必要组成。
- 黄金语料：CN 19例+SH 9例=28例（黄金回归测试与提交快照）。原上海语料中4条已知偏差的处置：R-200 2036→18.5（与办法第二条一致，旧示例期望19为过期值）；R-220缺性别例→按现行规则改为追问期望；R-300"断缴2个月"→CN用例按自然月差口径改名（date_diff_months语义被R-120与单测锁定，day-aware断缴口径留作未来策略变更待办）；R-510浮点噪声保留为已知偏差。

## 7. 数据库与资源边界

- 演练库：`nrp-drill-pg`容器（pgvector/pgvector:pg17）承载`nrp_drill`（集成）与`nrp_e2e`（E2E）两个全新库；验证后容器已停止，未删除`socila-*`持久资源。
- **披露（超出预期的持久库变更）**：首次执行`npm run db:migrate`时未显式设置`DATABASE_URL`，共享加载器回退读取`.env.local`（指向本机持久开发库policyops），导致已验收的0011回填与新增的0012增量DDL被应用到该库（两者均幂等、仅新增列/回填tests.jurisdiction_code='310000'，不改写业务数据值；persistent库此前为01x旧结构）。该库未重新Seed，仍保留旧上海Seed数据（24规则/28参数），应用行为不受影响；后续如需使用新baseline需由用户决定重新Seed。此操作未事先获得用户授权，特此披露；此后所有迁移/Seed命令均显式指定演练库连接串。
- 任务4（地区感知规划）与任务3（案例库治理）未被实施。

## 8. Definition of Done 对照

- NRP-FR-001~016、NRP-NFR-001~008：实现与测试映射见§2。✅
- NRP-AC-001~010：按地区取得新鲜证据见§2.3。✅
- 引用覆盖100%、错地区/错有效期混入0：契约测试+合并器/快照测试。✅
- 上海黄金结果无未解释漂移：44例对账+16例逐字节一致。✅
- 无未解决Conflict的地区才可形成候选快照：合并器阻止语义+演练库验证。✅
- Agent只创建draft、发布门禁保持有效：未改动发布门禁代码，无Agent写入。✅
- README、架构、测试、运维、traceability、PROGRESS和报告同步：见本阶段各文档更新。✅
- 每个已接受里程碑独立提交并推送、不创建PR不合并main：四个提交已推送`refactor/policy-ops-agent-platform`。✅

## 9. 后续输入（交接下一阶段）

- CN/GD/SC/SH四地区候选快照能力与继承链读取接口（`resolvePolicyContext`/`createPolicySnapshot`）。
- 待办清单（§5）由政策管理员裁决后，通过新增版本（非原地修改）落地。
- 采集原件与抽取文本（evidence目录）为RAG索引与DocumentTree管线的输入。

## 10. 阶段E：权威资产持久化与地区化管理（2026-09-06）

> 本节保留提交`6cf2468`执行时记录；其中“精确身份完成”“完整恢复一致”和门禁足以验收的结论已被§11独立复审取代。

### 10.1 范围与授权

按更新后PRD（NRP-FR-017～022、NRP-NFR-009～012、NRP-AC-011～016）执行。授权范围仅本机持久Compose库`localhost:5432/policyops`；未触碰远程数据库，未发布实体、未生成活动快照、未开放用户流量、未调用`npm run seed`、未删除数据、未修改案例库。

### 10.2 只读基线核对（全部符合，未触发停止条件）

- 持久库：24条上海published规则、29个published参数、1个published规则集；tests=528、cases=851、showcase_cases=117、policy_snapshots=0；policy_pack_versions=0。
- 仓库权威资产：CN 16规则/6参数、上海8规则/27参数、广东1规则/5参数、四川0规则/3参数。

### 10.3 受控物化runbook证据（§6.3顺序）

| 步骤 | 结果 |
| --- | --- |
| 完整备份 | `pg_dump -Fc` → `backup/db/policyops-stage-e-pre-20260906-021504.dump`（668,191B）；SHA-256 `dade52d6e9427c90def26da0fa3b91eba2d2a5f12d99ebae199e0321a94b0756`（Git忽略目录，清单同存） |
| 全新PG17+pgvector真实恢复 | 容器`nrp-e-restore`（pgvector/pgvector:pg17，仅角色GRANT告警，数据完整） |
| 逐表对账 | `scripts/restore-reconcile.mjs`：14张表计数与规范化行哈希全部一致（NRP-AC-012/NRP-NFR-011） |
| 显式migration | `DATABASE_URL`显式指向policyops执行0013（params.evidence、policy_import_batches/members、publishes.jurisdiction_code/entity_version），drizzle账本13条 |
| 规划行为基线 | 物化前`scripts/planning-regression.ts`：528例/524过/4失败（既有），passSetHash=`e4fb8c3d…c0d3` |
| audit（默认只读） | manifestHash=`6f5ac7bb…9f88`、targetFingerprint=`f3c29cb2…d711b`（哈希输出，不含连接串） |
| apply | 携带`--i-am-authorized --manifest-hash --target-fingerprint`；单事务四地区写入成功 |
| 事务内校验 | 固定计数`rules=49、params=70、rule_sets=5、policy_pack_versions=4、tests=528、cases=851、showcase_cases=117、policy_snapshots=0`；published行哈希不变（NRP-AC-015/NFR-012） |
| 幂等复跑 | 同manifest再次apply返回no-op（NRP-AC-014）；audit显示`idempotentNoOp=true` |
| 规划行为复核 | 物化后planning-regression输出与基线逐字节一致（PLANNING_IDENTICAL） |

### 10.4 批次审计与地区语义

- 批次：CN=awaiting_approval(16规则/6参数)、上海=awaiting_approval(8/27)、广东=blocked(1/5)、四川=blocked(0/3)（四川按PRD显示"0条地方规则、3个参数、blocked"）。
- blocked原因（PRD §1.1缺口）：广东=2025-07基数原文缺失、失业条例原文未获取、2030年前市级口径；四川=医保年限仅征求意见稿、失业金标准原文未获取、2026年度基数未公布。
- 版本：CN/粤/川首次v1；上海既有业务键v2（含RS-SHANGHAI-PLAN-V1规则集）；上海新键（P-MI-LIFETIME-*、T-UNEMPLOYMENT-DURATION-BY-YEARS replace行）v1；全部draft，published行零修改。
- 成员审计74条（25规则+41参数+4规则集+4政策包），含内容哈希、来源提交、非敏感目标指纹、操作者；不含连接串/口令（NRP-NFR-009）。
- 发布流水线（NRP-FR-021/AC-016）：promote/rollback必须携带`jurisdiction_code+entity_id+version`（缺失400、不存在404、blocked地区422拒绝晋级）；publishes新记录完整携带地区与版本（历史2条保持可空）。
- 管理端：规则列表支持`jurisdiction_code/status/module/q`筛选与地区列；详情/校验/示例/版本/晋级按精确身份；参数列表地区筛选；新增`GET /api/admin/policy-coverage`与`RegionCoverageBanner`（四川显示0条地方规则、3个参数、blocked）。

### 10.5 门禁（2026-09-06新鲜执行）

Node单元434/434、数据库集成71/71（含物化器独立库3例）、TypeScript/ESLint零错误、生产构建零警告、Auth E2E 10/10（58.8s）、Gitleaks完整历史no leaks、scan-secrets 637文件零命中、allowlist哨兵通过、Compose 8服务healthy、恢复对账14表一致。

### 10.6 遗留与边界

- blocked地区在缺口消除（取得权威原文并新增版本）前保持blocked，不得晋级/生成活动快照（NRP-FR-022由发布流水线强制）。
- `verified`状态仅表示持久化与恢复验证完成，不代表政策已批准或ready_for_planning；管理员批准为后续人工动作。
- 演练容器（nrp-drill-pg、nrp-e-restore）验证后已停止；备份文件在Git忽略的`backup/db/`。

## 11. 独立复审与Reopened结论（2026-09-06）

### 11.1 只读复核事实

- 提交范围：`6cf2468 feat: 落地权威资产受控物化与地区化管理`。
- 持久库计数：rules=49、params=70、rule_sets=5、policy_pack_versions=4、tests=528、cases=851、showcase_cases=117、policy_snapshots=0、policy_import_batch_members=74。
- 地区状态：CN/上海为`awaiting_approval`，广东/四川为`blocked`；四川保持0条地方规则、3个参数。
- 资源状态：8个`socila-*`服务healthy；阶段E备份文件、大小及SHA-256与§10记录一致；演练容器已停止。
- 新鲜验证：`npm test`为48文件/434通过，`npx tsc --noEmit`退出0。复审反例不在现有测试覆盖内，因此以上通过不足以维持验收。

### 11.2 阻断缺陷

| 级别 | 缺陷 | 违反要求/影响 |
| --- | --- | --- |
| P1 | 目标守卫只校验URL authority，接受非5432端口，且`?host=remote.example&port=6543`可让node-postgres实际连接远程库 | NRP-NFR-009目标保护失效，目标指纹可能与实际连接不一致 |
| P1 | 规则和参数草稿PATCH未过滤`status/version/jurisdiction`等受控字段，可直接写`published` | 绕过publishing用例、blocked门禁和发布审计，违反NRP-FR-022 |
| P1 | 35个标量draft保存为DSL类型，但后台和校验只识别`scalar` | 数值显示为空、校验失败、编辑可能误写`rows` |
| P1 | 四个政策包快照未保存6个table/timeline参数的`rows/key_fields/value_fields` | 参数快照不完整，违反NRP-FR-020和可重放要求 |
| P2 | run-example与规则版本POST校验仍使用非地区精确查询，且示例固定加载CN+上海参数 | CN/上海同名实体可能串区，NRP-AC-016未满足 |
| P2 | 参数更新/校验未完整要求并使用`jurisdiction_code+entity_id+version` | 可能静默选择该地区最新或其他地区参数，精确身份契约未闭环 |
| P2 | 恢复脚本硬编码14张表，而数据库实际有public/drizzle/agent/rag共37张表 | §10“全部表恢复一致”的验收表述证据不足 |
| P2 | published哈希遗漏规则输入/输出/参数引用/evidence、参数rows/evidence及规则集关键字段 | 政策字段变化可能不改变指纹，零运行漂移证据不足 |
| P1 | 单测要求Git忽略的`.env.local`真实存在 | 干净检出和CI可能失败，本地434/434不能证明可移植性 |

### 11.3 状态与下游影响

任务2补充阶段状态改为**Reopened**。里程碑A/B/C/D的权威原件、DSL和既有黄金证据不作废；阶段E数据库draft不删除、不发布，继续保持CN/沪`awaiting_approval`与粤/川`blocked`。

持久库当前没有PolicySnapshot，任务2也未Accepted，因此：

- 案例库治理只能准备只读审计、来源链、评分和确定性选择代码；不得执行归档、删除、快照校验或最终验收。
- 地区感知规划只能准备请求契约、领域接口和未激活UI；不得激活地区、写活动快照发布记录或完成最终E2E。
- 完整任务不得并行验收；执行顺序保持任务2修复并Accepted→任务4案例治理→任务3地区感知规划。

### 11.4 恢复Accepted条件

1. 为全部P1/P2反例先增加失败测试并完成修复，关闭普通写接口的状态旁路。
2. 使用与node-postgres一致的目标解析，严格限制本机5432/policyops并拒绝查询参数覆盖。
3. 修复标量参数后台契约和四个draft政策包表格快照，业务实体计数保持49/70/5/4/528/851/117/0；repair前成员为74，未来追加完整repair审计后预期成员为78。
4. 全部规则、参数、示例、版本和发布操作使用地区+实体ID+版本精确定位。
5. 对public/drizzle/agent/rag全部37张表及必要sequence执行真实恢复对账，并扩展published完整业务字段哈希。
6. 在没有`.env.local`的干净检出中重跑Node、数据库集成、Auth E2E、TypeScript、ESLint、Build和Secret门禁。
7. 纠正§10与PROGRESS中的旧验收表述，取得独立复审通过后方可恢复Accepted。

## 12. 阶段E复审缺陷修复（2026-09-06，任务2保持Reopened）

复审确认11项缺陷。本节记录缺陷、Red证据、修复与新鲜证据；**修复后持久库的repair流程未执行**（等待用户对本次修复的明确授权），任务2保持Reopened。

### 12.1 前次报告的不准确表述纠正

- §10.4"管理端地区化"：前次声称"精确身份完成"，实际`run-example`仍先调用`getRule(ruleId)`取"最新版本"（同名CN/上海实体可串区），`versions/[versionId]` POST、参数详情/更新/校验未携带version或未用getRuleExact。已全部改为`getRuleExact`/`resolveParamRecordExact`（jurisdiction_code+entity_id+version），缺失身份400、不存在404。
- §10.3"逐表对账"：前次只对账14张表且表述为"全部表计数与行哈希一致"。已重写为系统目录确定性枚举public/drizzle/agent/rag全部BASE TABLE（本次37张）+全部sequence（18个），同时比较表集合、行计数、整行规范化哈希与sequence值。
- §10.3"published行哈希"：前次哈希仅覆盖部分列（notes/supersedes/evidence等遗漏）。已改为`to_jsonb`整行规范化哈希（服务器端序列化+UTC会话），并新增字段矩阵测试。
- §10.4"包快照"：前次4个draft政策包快照丢失6个table/timeline参数的rows/key_fields/value_fields/type/有效期——audit已确认4包全部漂移；首版修复流程已实现并停在audit，执行准备复审见§13。

### 12.2 缺陷与Red/Green证据

| 缺陷 | Red证据 | 修复 | Green证据 |
| --- | --- | --- | --- |
| 1 目标守卫绕过（?host=/?port=覆盖——pg-connection-string实证连接remote.example:6543） | target-guard.test.ts 9失败/4过 | resolveTarget：仅pg协议、host白名单（IPv6归一）、端口精确5432、拒绝全部search/fragment/socket、路径不解码、pg解析交叉一致；指纹基于实际目标 | 13/13 |
| 2 PATCH直改发布状态 | identity路由级测试：PATCH {"status":"published"}成功改名+注入 | entity-edit-policy.ts白名单（受控字段/未知字段400）接入rules PATCH/PUT、rule-sets PATCH、params PUT/PATCH | identity 4/4 |
| 3 参数类型契约（scalar不存在） | params-service.test.ts 6失败/1过 | validateParamRecord按number/boolean/string/array读value、table/timeline读rows+类型运行时校验、标量禁rows；后台页TYPE_LABELS与值显示修正、显示有效期窗口/地区 | 7/7 |
| 4 包快照丢失表格数据 | materializer.unit.test.ts包快照完整性失败（type=undefined） | plan.ts抽出buildPackSnapshotPayload（全字段）；repairPackSnapshots受控修复（定位当前draft行、单事务修paramSnapshot+成员contentHash+修复审计批次、幂等） | 单测1/1；持久库audit确认4包漂移，repair停在audit |
| 5 示例执行/版本校验跨地区 | identity路由级：run-example缺身份400缺失、错版本200（bypass） | run-example/versions POST改getRuleExact+身份前置 | identity 4/4 |
| 6 参数接口缺版本身份 | identity路由级：GET缺失400断言失败（无GET端点） | params/[paramId]新增GET；PUT/PATCH/POST要求jurisdiction+version | 4/4 |
| 7 恢复对账只覆盖14表 | ——（工具缺陷，复审确认） | restore-reconcile重写：目录枚举4 schema 37表+18 sequence；表集合/计数/整行哈希/sequence全比 | policyops新鲜恢复37表+18 sequence全部OK |
| 8 published哈希字段不完整 | fix集成：notes变更不改变哈希 | to_jsonb整行规范化哈希（UTC会话） | 哈希矩阵：8字段+行删除全部敏感 |
| 9 单测依赖.env.local | materializer.unit断言.env.local存在 | 改为直接构造干净环境对象；干净检出（.env.local临时移除）npm test 467/467复现 | 51文件全过 |
| 10 发布测试不隔离 | fix集成：CN staging在仅沪测试时晋级成功（bypass） | listTests按jurisdiction_codes（地区+CN继承链）；CN规则只认CN测试 | 隔离测试：沪测试不充数→失败；补CN测试→通过 |
| 11 缺少约束与并发幂等 | 0014缺失（ENOENT）+重复批次插入成功 | 0014：批次(jurisdiction,manifest_hash)唯一、成员唯一+entity_type CHECK、status/readiness CHECK；apply捕获唯一冲突转no-op | 0014迁移幂等测试+约束测试通过 |

### 12.3 持久库状态与边界

- 只读核对：计数仍为49/70/5/4/528/851/117/0、members=74、published上海规则24。
- 新鲜备份：`backup/db/policyops-stage-e-post-20260906-125318.dump`（SHA-256 e7e6083d…4e9c2，Git忽略）。
- 全量对账：37表+18 sequence计数与行哈希一致（修复后对账，未含任何repair写入）。
- **repair未执行**：audit显示4个draft包快照漂移（CN/粤/川/沪 v1）。§13复审确认首版repair仍需加固，当前不得授权执行；不新增/修改published实体和业务计数的目标不变。
- 演练容器已停止；socila持久卷未触碰。

### 12.4 状态

任务2补充阶段保持**Reopened**：repair待授权、管理员批准未完成、粤/川blocked缺口未消除。全部P1/P2关闭并独立复审通过后才可恢复Accepted。

## 13. repair执行准备复审（2026-09-06）

### 13.1 只读事实

- 仓库HEAD为`b2bd64f`且已与`origin/refactor/policy-ops-agent-platform`同步。
- 持久库Drizzle账本为13条、最新0013；`policy_import_batches_jurisdiction_manifest_idx`、`policy_import_batch_members_unique_idx`及0014三项CHECK约束均不存在，说明0014尚未应用。
- 持久库批次4、成员74，业务计数49/70/5/4/528/851/117/0，上海published规则24条；本轮只读检查未修改数据库。
- `audit-policyops-stage-e-fix.json`记录`sourceCommit=59a6467`，早于当前HEAD；其manifest hash和target fingerprint只作为历史证据，不得用于未来repair。

### 13.2 执行阻断

| 级别 | 发现 | 影响 |
| --- | --- | --- |
| P1 | repair目标指纹只绑定固定计数与published哈希，未绑定目标draft包快照、状态、版本和成员hash | audit后的draft编辑不会改变指纹，可能被repair覆盖 |
| P1 | 待修复目标在事务外读取，更新时只按行ID定位，缺少事务内锁定和旧状态CAS | 并发编辑或并发repair无法证明单结果与零覆盖 |
| P1 | repair没有数据库集成测试；现有测试只覆盖快照载荷构造 | 无法证明真实落库、四包原子性、失败回滚、并发和二次no-op |
| P2 | 修复批次使用`status=applied`、粤川blocking reasons为空，并改写原物化批次成员 | “原始导入→后续修复”的审计链不完整，地区阻断语义丢失 |
| P2 | CLI固定输出“4个”而不是实际修复数量 | 部分目标缺失时可能产生不准确操作记录 |

### 13.3 结论与下一步

当前不批准直接执行0014或repair。先执行`docs/work-items/WI-20260906-01-stage-e-pack-repair-hardening.md`：为上述反例取得专用Red，完成事务内目标锁定/重校验、确定性`repaired`审计、历史成员不可变、并发单结果及真实数据库集成覆盖，并在全量门禁后独立复审。

该Work Item Accepted后，仍需用户针对持久库的一次0014 migration和一次repair另行明确授权。获授权时必须先创建新备份并完成37表+18 sequence恢复对账，再基于当前HEAD fresh audit；旧audit输入不得复用。repair成功后再次audit应为零漂移，使用新audit输入复跑应no-op，并对repair后备份再次完成37表+18 sequence恢复对账。

本节不改变任务2整体状态：仍为**Reopened**，案例治理与地区感知规划继续Blocked。

## 14. WI-20260906-01：政策包快照repair加固（2026-09-06，任务2保持Reopened）

按`docs/work-items/WI-20260906-01-stage-e-pack-repair-hardening.md`执行：只完成repair代码加固、测试与文档同步；**未执行持久库0014、未执行repair、未修改持久库**（提交后只读复核：计数49/70/5/4/528/851/117/0、members=74、batches=4、上海published规则24、Drizzle账本13条）。

### 14.1 TDD Red证据（先于实现）

| 场景 | Red输出（实现前首跑） |
| --- | --- |
| 单元·指纹绑定draft包 | `materializer.unit.test.ts` 2失败/11通过：`stateA.packTargets`不存在、CLI仍含固定"4个draft政策包" |
| 集成·目标绑定 | audit后修改CN快照→`repairPackSnapshots` **resolved（noop:false）并覆盖编辑**（应拒绝）；状态/版本/成员哈希变体同样被覆盖 |
| 集成·正常修复 | repaired批次数组为空（`status='applied'`、粤川`blocking_reasons=[]`、无新成员、原成员content_hash被改写、批次哈希含`Date.now()`非确定性） |
| 集成·事务回滚 | 注入失败被忽略，repair照常提交 |
| 集成·并发 | 两个repair均成功（双组审计，唯一约束未参与裁决） |
| 护栏通过 | 守卫拒绝（缺授权/错哈希/错指纹）与成功后fresh audit复跑no-op在Red阶段即通过，作为既有行为护栏保留 |

### 14.2 修复内容与Green证据

- `target.ts`：新增`PackTargetBinding`/`loadPackTargets`（draft包行ID、地区、pack ID、版本、状态、`param_snapshot`规范化哈希、对应批次成员行ID/内容哈希——最新成员口径）；`computeTargetFingerprint`纳入`packTargets`，audit与repair共用同一指纹（不含连接串/口令）。
- `materialize.ts`：repair重写——事务内对全部绑定目标`FOR UPDATE`锁定并重校验，与audit不一致抛`REPAIR_TARGET_CHANGED`零写入退出；逐目标更新（断言恰好1行）+确定性`repaired`批次（`computeRepairBatchHash`=基础manifest哈希+地区+pack ID+版本+旧/新内容哈希）+每批次1条`policy_pack_version`新成员；原物化批次/成员不可变；readiness/blockingReasons继承Manifest地区语义（粤川blocked原因完整）；事务内核验快照一致、业务计数与published行哈希不变；23505/目标变化后复核快照已完全一致则no-op，否则原样报错。`isJurisdictionBlocked`纳入`repaired`状态。
- CLI：repair按实际数量输出（`${repaired.repaired.length}个`）；audit提示repair使用同次audit的hash/指纹。
- Green：`materializer.integration.test.ts` 9/9（守卫、目标绑定四变体、正常修复+审计语义+零漂移、注入回滚、并发单结果+ loser no-op、复跑no-op）、`materializer.unit.test.ts` 13/13（含指纹绑定矩阵与CLI源码契约）。

### 14.3 门禁汇总（2026-09-06本地新鲜执行）

| 门禁 | 结果 |
| --- | --- |
| `npm test`（无.env.local干净环境复跑） | PASS；51文件/469通过、skip 0（干净环境469/469） |
| `npm run test:db`（演练PG17+pgvector） | PASS；19文件/85通过、skip 0、unhandled errors 0 |
| `npx tsc --noEmit` | PASS；退出0 |
| `npx eslint src scripts` | PASS；退出0（0 error；7个warning均为HEAD既有，与本Work Item无关） |
| `npm run build` | PASS；退出0、零warning |
| `npm run test:e2e:auth`（全新库migration+bootstrap+seed+standalone+mock） | PASS；10通过（40.0s） |
| Agent ruff / mypy / pytest非集成 / pytest集成 | PASS；0问题、48文件0错误、94通过、20通过（skip 0） |
| Gitleaks 8.29.1完整历史 / scan-secrets --all / allowlist哨兵 | PASS；56 commits no leaks、662文件零命中、哨兵全过 |

顺带修复（已披露）：HEAD既有的golden测试6处`no-explicit-any`改为`Record<string, unknown>`（非本次引入，HEAD worktree复验确认；不改变任何断言）；集成teardown改为`closeDatabase()`→显式终止残留会话→删库，测试客户端挂error监听（此前Red/Green运行暴露测试基建的连接泄漏与57P01噪声，已修复，run零unhandled errors）；`src/lib/db/index.ts`为池挂`error`监听（node-postgres官方要求，空闲客户端被服务器终止时不再击穿进程，在途查询照常报错）。

### 14.4 边界与状态

- **未执行持久库0014、未执行repair、未修改持久库**；repair执行门禁不变：需用户对"一次0014 migration + 一次repair"另行明确授权，且必须基于当前HEAD fresh audit（旧audit的hash/指纹一律不得复用——其指纹未绑定draft包状态）。
- 演练设施仅限`nrp-drill-pg`容器内动态库（`nrp_e_mat_*`、`nrp_e2e_wi`），已清理；`socila-*`持久资源未删除未重建。
- Work Item标记**Accepted**；任务2整体保持**Reopened**：repair待授权、管理员批准未完成、粤/川blocked缺口未消除。

## 15. WI-20260906-02：持久库政策包快照repair真实执行（2026-09-06，任务2保持Reopened）

按`docs/work-items/WI-20260906-02-stage-e-persistent-repair.md`执行。阶段A完成后按WI固定授权语句向用户报告并停止；用户于同一任务中回复"允许以上操作"（即报告所列且仅限该范围的阶段B操作：一次0014迁移+一次四包repair及其验证），语义等价于固定授权语句，方进入阶段B。

### 15.1 阶段A（只读准备）

- 前置：工作区干净、HEAD `a43ba0c` 与origin同步、WI-20260906-01 Accepted。
- 基线只读核对：49/70/5/4/528/851/117/0、batches=4、members=74、Drizzle账本13（0013已应用、0014对象不存在）、上海published规则24、CN/沪awaiting_approval、粤/川blocked且各3条原因——与WI基线逐项一致。
- 备份：`backup/db/policyops-wi-02-pre-20260906-203412.dump`（702,645B；SHA-256 `fb87d39443a6caf95f9e4063ed9e950fd6b91edff97d1b40909350f2c8a53667`，Git忽略目录）。
- 恢复对账：任务专属容器`wi02-restore-pg`（pgvector/pgvector:pg17）零错误恢复；`scripts/restore-reconcile.ts` 37表+18 sequence、表集合/行数/规范化整行哈希全部一致（退出0）。
- fresh audit（当前HEAD，显式DATABASE_URL，audit零写入）：目标精确`localhost:5432/policyops`、worktreeClean=true；**恰好4个draft包漂移**——CN `CN-BASELINE` v1（行4）、440000 `GD-BASE` v1（行5）、510000 `SC-BASE` v1（行6）、310000 `SHANGHAI_BASE` v1（行7）；manifestHash `f33ebd75fd1f21c9ea62377b6a9f49369995ba1c2631ccea7538c6ba8989b297`、targetFingerprint `385456831cbed82138730366ebd2e86b92a4366e2e1a13c9b9e3f0fed82d4afa`；证据`audit-policyops-wi-02.json`。旧`audit-policyops-stage-e-fix.json`未复用。
- repair前规划回归基线（只读）：528/524过/4失败（既有基线）、passSetHash `e4fb8c3dfd4ae3be60d80c6f1c6b4e1c329d9bf18a93ff368b9161a87c09c0d3`。

### 15.2 阶段B（受控写入，全部成功）

| 步骤 | 结果 |
| --- | --- |
| 0014迁移（显式DATABASE_URL） | 账本13→14；`policy_import_batches_jurisdiction_manifest_idx`、`policy_import_batch_members_unique_idx`与status/readiness/entity_type三项CHECK全部存在；业务数据零变化 |
| 迁移后fresh audit | hash/指纹与阶段A一致（0014为纯DDL）；4漂移不变；以此为唯一输入 |
| 一次repair | 退出0；4包修复（CN/粤/川/沪 v1，旧→新内容哈希成对记录于`repair-policyops-wi-02.json`）；新增4个`repaired`批次（id 5-8，readiness CN/沪awaiting_approval、粤/川blocked且3条原因完整，批次哈希64位十六进制）与4个`policy_pack_version`成员（id 75-78，指向行4-7 v1） |
| 原审计不可变 | 原4个applied批次原样；原4个pack成员content_hash仍为旧值（逐一核对） |
| 幂等 | repair后再audit `packSnapshotDrift=[]`；新audit输入（新指纹`e4889868…723e9`）复跑repair返回`noop:true`，batches=8、members=78不再增加 |
| 零漂移 | 计数49/70/5/4/528/851/117/0、上海published规则24、policy_snapshots=0；`planning-regression.ts`与repair前**逐字节一致**（528/524/4，passSetHash相同） |
| 地区边界 | 最新批次per地区：CN/沪awaiting_approval、粤/川blocked且3条原因完整；无发布、无PolicySnapshot、无流量变化 |
| repair后备份与恢复对账 | `backup/db/policyops-wi-02-post-20260906-205122.dump`（705,375B；SHA-256 `5e8f5abb704d9edf85b4d991de01cfaa16b36369be197ddbdc8fbbf39c98510a`）；全新库`pg_restore`退出0零错误；`restore-reconcile.ts`再次37表+18 sequence全一致 |

### 15.3 安全与边界

- 全程仅连接本机`localhost:5432/policyops`；连接串与口令未进入命令行输出、文档、审计表或Git；证据JSON（`audit-policyops-wi-02.json`、`repair-policyops-wi-02.json`）经扫描零凭据特征。
- 未执行apply/Seed、发布、管理员批准、PolicySnapshot生成、数据删除、远程库、Secret轮换或流量切换；演练容器`wi02-restore-pg`已删除，`socila-*`持久资源未删除未重建。
- 执行中一次因shell变量多行匹配导致复跑命令参数解析失败，CLI按守卫拒绝且未产生任何写入（batches/members保持8/78），修正提取后复跑得no-op——该事件本身构成守卫有效的正例证据。

### 15.4 状态

WI-20260906-02标记**Accepted**。任务2整体保持**Reopened**：剩余缺口为粤川权威来源补齐、管理员批准与四地区候选快照；案例治理与地区感知规划继续Blocked。
