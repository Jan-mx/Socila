# 09-05 Stage 国家baseline及广东四川权威overlay 验收报告

> Author: Jan
> Status: Active（里程碑A/B/C/D代码与证据已交付；候选快照的管理员批准与用户流量开放为后续人工动作）
> Updated: 2026-09-05

## 1. 范围与结论

本阶段执行权威PRD `docs/prd/09-05-stage-national-baseline-regional-overlays.md`（Draft）的任务2：按国家baseline、上海重分类、广东overlay、四川overlay四个里程碑建立权威政策事实、显式overlay操作数据模型、黄金测试与候选快照能力。

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
