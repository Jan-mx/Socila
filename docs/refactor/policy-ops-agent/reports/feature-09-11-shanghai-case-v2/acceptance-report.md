# 09-11 Feature：上海政策纠偏与36条案例V2全量重建 — 验收报告

> Author: Jan
> Status: Ready for independent review（2026-09-12修复交付；独立复审确认前不标记最终Accepted）
> Updated: 2026-09-12

## 1. WI-20260911-01 上海官方原文采集与政策纠偏

### 1.1 采集范围（23份官方原文，全部白名单域名）

全部位于 `docs/refactor/policy-ops-agent/reports/stage-09-05-national-baseline-overlays/evidence/310000/`，每份含`original.html`、`extracted-text.txt`、`http-headers.txt`、`meta.json`（SHA-256为original.html原始字节哈希；采集方式`playwright-chromium-headless`；采集日期2026-09-11）：

| document_id | 来源页/文号 | 支撑事实 |
| --- | --- | --- |
| DOC-SH-CONTRIB-BASE-2026 | rsj.sh.gov.cn 2026-08-24问答 | 2026-07-01起基数上限37731/下限7546 |
| DOC-SH-CONTRIB-RATES-2025 | rsj.sh.gov.cn 2025-01-20问答 | 单位费率：养老16%、医疗9%（含生育）、失业0.5% |
| DOC-SH-UI-BENEFIT-2026 | 沪人社规〔2026〕7号 | 失业金2340/1872/1690，2026-07-01起执行，有效期至2028-06-30 |
| DOC-SH-UI-BENEFIT-2025 | 沪人社规〔2025〕9号 | 历史窗口：2305/1844/1650（2025-07-01～2026-06-30） |
| DOC-SH-UI-BENEFIT-2024 | 沪人社规〔2024〕13号 | 历史窗口：2255/1804/1595（2024-07-01～2025-06-30） |
| DOC-SH-MIN-WAGE-2025 | 沪人社规〔2025〕10号 | 月最低工资2740（自2025-07-01；同时证明调整前值2690） |
| DOC-SH-FLEX-RATES | rsj.sh.gov.cn问答（2024-03-07） | 灵活就业养老20%、医保10%（2024-03-01起）；基数60%–300%由本人选择 |
| DOC-SH-MI-FLEX-WAITING-2025 | 沪医保规〔2025〕7号 | 灵活就业职工医保等待期6个月；中断3个月内衔接豁免；2025-09-10施行（有效期至2030-09-09；沪人社医发〔2012〕45号同时废止） |
| DOC-SH-MI-RETIREE-CONDITIONS | ybj.sh.gov.cn问答（2026-06-29） | 退休医保待遇：缴费年限（含视同）累计超过15年 |
| DOC-SH-SUBSIDY-DURATION-2023 | rsj.sh.gov.cn问答 | 灵活就业补贴期限：累计≤3年；距退休不足5年可延长至退休 |
| DOC-SH-FLEX-SUBSIDY-CONDITIONS-2022 | rsj.sh.gov.cn问答 | 补贴资格：认定就业困难+灵活就业+按时足额缴费 |
| DOC-SH-FLEX-SUBSIDY-STANDARD-2022 | rsj.sh.gov.cn问答 | 补贴标准=按下限基数计算的应缴社会保险费的50% |
| DOC-SH-EMPLOYER-SUBSIDY-STANDARD-2022 | rsj.sh.gov.cn问答 | 岗位补贴=月最低工资50%；社保补贴=单位部分50% |
| DOC-SH-EMPLOYER-SUBSIDY-DURATION-2024 | rsj.sh.gov.cn问答 | 用人单位补贴期限累计≤3年；期满距退休不足2年可延长至退休 |
| DOC-SH-EMPLOYER-SUBSIDY-BASIS-2024 | rsj.sh.gov.cn问答 | 政策依据：沪人社规〔2022〕8号、沪人社就〔2023〕404号 |
| DOC-SH-EMPLOYMENT-ASSISTANCE-2022 | 沪人社规〔2022〕8号（规范性文件） | 上述补贴全部口径的正式文件（2022-01-01起，有效期至2026-12-31；含"大龄"=男45/女40定义） |
| DOC-SH-UI-CLAIM-RULES-2026 | 沪人社规〔2026〕18号《上海市失业保险金申领发放实施办法》 | 失业金期限表：满1年不满2年领2个月、每增1年加2个月、最长24个月（2026-08-16施行，有效期至2031-08-15）；延长领取条件（期满未就业且距退休不足1年）；领取期间医疗费由失业基金列支 |
| DOC-SH-UI-EXTENDED-CONDITIONS-2026 | rsj.sh.gov.cn问答（2026-08-17） | 延长领取自动发放、仅可享受一次 |
| DOC-SH-UI-STANDARD-EXPLAIN-2026 | rsj.sh.gov.cn问答（2026-07-06） | 延长领取1690=第13-24月标准80%（1497.6）低于最低生活保障标准，按低保托底 |
| DOC-SH-UI-OLDER-PENSION-STANDARD-2025 | rsj.sh.gov.cn问答（2025-01-20） | 大龄领金人员按灵活就业最低缴费标准部分由失业基金支付 |
| DOC-SH-UI-OLDER-PENSION-APPLY-2025 | rsj.sh.gov.cn问答（2025-01-20） | 距退休不足1年内实际缴纳月数、退休后一次性支付 |
| DOC-SH-UI-OLDER-PENSION-FUND-2025 | rsj.sh.gov.cn问答（2025-01-20） | 领金地与参保地须一致 |
| DOC-SH-UI-OLDER-SUBSIDY-EXCLUSION-2025 | rsj.sh.gov.cn问答（2025-01-20） | 大龄领金参保养老期间不得同时享受灵活就业补贴及岗位补贴 |

规范性文件优先：沪人社规〔2022〕8号与沪人社规〔2026〕18号均为规范性文件正式文本；问答页仅作为独立补充证据或无规范性文件时的事实来源（基数37731/7546在白名单域名内未检索到对应规范性文件正式文本，以人社局官网问答为事实来源并已在DSL note中注明）。

### 1.2 纠偏内容（对照PRD §6.4/§6.5）

**纠正的2026-09-01有效事实**：基数7546/37731（2026-07-01）；失业金三档2340/1872/1690（2026-07-01，有效期至2028-06-30）；最低工资2740（2025-07-01）；灵活就业养老20%/医保10%；医保等待期6个月+3个月豁免（2025-09-10起）；退休医保年限统一15年；补贴一般≤3年+距退休5年（灵活）/2年（用人单位）可延长。

**移除的无依据/伪引用事实**（§6.5，全部记录于Git diff与本报告）：
- `P-MI-LIFETIME-MALE-YEARS=25`/`FEMALE-YEARS=20`：改为15/15（官方来源不区分性别）。
- `P-SH-4050-MAX-YEARS-NEAR-RETIRE=8`：删除；新增`P-SH-4050-NEAR-RETIRE-THRESHOLD-YEARS=5`与用人单位侧`P-SH-JOB-SUBSIDY-*`参数。
- `T-SH-PAY-GAP-MONTHS=[7,8]`与`P-SH-PAY-GAP-AFFECTS-NEXT-MONTH`（source=transcript）：删除；R-600重构为"当期正式通知生效信息+个人实际缴费月份"口径（新增输入`user.social.months_paid_at_old_base`，缺失→needs_agent追问）。
- `source="policy"`/`source="transcript"`伪引用：全部替换为结构化evidence或删除。
- 2025年度基数7460/37302：在三个白名单域名内未找到正式原文（原为伪引用），按§6.5移除该窗口；2026-06-30及之前as-of对该参数缺席（fail-closed）。
- 旧失业期限表（3/6/9/12/15/18/21/24，伪引用）：按沪人社规〔2026〕18号纠正为2/4/6/…/24（replace国家基线表，窗口2026-08-16～2031-08-15）。
- `T-SH-UNEMPLOYMENT-DURATION-BY-YEARS`遗留重复表：删除（其内容并入replace条目）。
- `P-SH-PENSION-RATE-EMPLOYEE/MEDICAL-RATE-EMPLOYEE/UNEMPLOYMENT-RATE-EMPLOYEE`：无任何规则消费且未取得官方原文，移除（记录于本节）。
- R-520原"距退休≤36个月窗口"（无依据推断）：删除，按沪人社规〔2022〕8号二重写为用人单位吸纳口径；R-510/R-521改为读取政策参数（基数下限、最低工资）而非用户自填数值，保证"数值单源"。

**历史保留**：失业金三档三个连续窗口（2024-07-01起）、最低工资两窗口（2024-07-01起），均带逐字摘录证据。

### 1.3 新规则与黄金示例

- `R-SH-UI-AMOUNT`（priority 430，规则集`R-420`之后）：领取阶段显式输入或按已领取月数推导1-12/13-24档；缺阶段、资格不确定、已领≥24个月未确认延长资格、as-of无有效参数→`needs_agent`不估算。
- `R-SH-FLEX-CONTRIBUTION`（priority 440）：非灵活就业→`calc.flex.applicable=false`；缺基数/费率参数或基数越界→警告+`needs_agent`不截断；按下限7546缴费→养老1509.2、医保754.6、合计2263.8（round2）。
- 上海example 9→11、全地区42→44（`DSL_EXAMPLE_COUNT=44`常量，manifest/executor/generator同步）。

### 1.4 TDD Red→Green证据（2026-09-11本地新鲜执行）

| 阶段 | 证据 |
| --- | --- |
| Red | `citation-contract.test.ts`加入上海后2项失败（`P-SH-CONTRIB-BASE-LOWER 缺少权威引用`、`R-310-MI-WAITING-PERIOD 缺少权威引用`）；`shanghai-policy-v2.test.ts`因`@/lib/dsl/param-windows`不存在整套件加载失败 |
| Green（单元） | `npm test`：77文件/771通过、skip 0（含shanghai-policy-v2 23例、citation-verifier反例6例、新规则行为12例、示例计数44/沪11） |
| 冻结夹具 | `golden-snapshot.json`经`WRITE_GOLDEN_SNAPSHOT=1`重新生成；SHV2漂移基线`evidence/shanghai-policy-v2/shv2-frozen-baseline.json`（46例=30示例+10延迟退休+6全编排）经`WRITE_SHV2_DRIFT_BASELINE=1`生成；旧`pre-reclass-baseline.json`（NRP-AC-002证据）未改写，测试断言其仍为44例 |
| Green（隔离库audit delta） | 新增`shv2-shanghai-delta.integration.test.ts` 3例通过：以基线提交`d7fd63a`物化四地区镜像（26规则/46参数）后audit当前仓库→计划只含上海（10规则+31参数+1规则集+1包），CN/广东/四川零实体，包快照漂移仅310000，apply后仅上海批次携带成员，复跑audit/apply均no-op（SHV2-AC-004） |

### 1.5 配套代码修正（保持既有门禁语义）

- `applyMaterialization`新增场景注入项`expectedTotalCounts`（默认仍为`EXPECTED_TOTAL_COUNTS`=50/75/6/5，生产守卫不降级）；隔离测试按各自场景显式注入并逐场景执行核对。
- `shanghai-migration.integration.test.ts`快照对账基准日2026-01-01→2026-09-01（新规则2026-07-01起生效，旧日期合法缺席）。
- `migration-lf.contract.test.ts`全新checkout用例显式30秒（真实git子进程在并行负载下超5秒默认值，与identity-container先例同策略；断言不变）。
- `services/agent/pyproject.toml`：新增`-W ignore::DeprecationWarning:jieba`——jieba 0.42.1源码冷编译时的第三方DeprecationWarning噪声；项目自身代码仍为error（不降级）。DB门禁第3轮复现（2 rag用例失败），第4轮全绿验证。

### 1.6 WI-1门禁结果（2026-09-11本地新鲜执行）

| 门禁 | 结果 |
| --- | --- |
| `npm test` | PASS：77文件/771通过、skip 0 |
| `npm run test:db`（随机端口55000-59999全新PG17+pgvector容器，`scripts/db-gate-task34.mjs`） | PASS（第4轮exit 0：migration×2、bootstrap×2、seed×2、`test:db`全量、agent.migrate×2、`pytest -m integration`全部阶段通过）。第3轮完整summary为27文件/144测试、143通过/1失败/0 skip，唯一失败（rcl-cli verify期望78→80）修复后单文件复验12/12；第1～3轮失败项逐项修复见§1.5 |
| Agent Python | PASS：`pytest -m integration` 20/20、`pytest -m "not integration"` 94、ruff 0问题、mypy 33文件0错误 |
| TypeScript / ESLint | PASS：`tsc --noEmit`退出0；`eslint src scripts` 0 error（9条既有warning未新增） |
| Secret扫描 | PASS：`scan-secrets --all` 796候选文件零命中 |
| Gitleaks 8.29.1完整历史 | PASS：95 commits、no leaks found |
| 持久库边界 | 未连接、未写入`localhost:5432/policyops`；未创建政策draft、快照或release |

### 1.7 残留与移交

- 上海基数调整（2026年度）的规范性文件正式文本未在白名单域名发布，当前以人社局官网问答为来源；如后续发布正式通知，应采集并作为该参数窗口的更高级别证据。
- 个人缴费费率（养老8%/医保2%/失业0.5%）未纳入上海参数包（无规则消费且未取得原文）；如未来规则需要，须先立项采集。
- 上海政策delta的持久物化、管理员批准、快照创建与release切换均不在本Work Item授权内（PRD §18三个授权点）。

## 2. WI-20260911-02 RCL-GEN-2.0案例、Markdown案例库、API与UI（2026-09-11本地新鲜执行）

### 2.1 交付内容

- `src/lib/case-governance/generator-v2.ts`：`RCL-GEN-2.0`（SHV2-FR-008）；UID `RPC/RPCT-<地区>-<场景键>-V2`；上海18条按PRD §8.2固定轮转矩阵（年龄段=(能力+状态) mod 3、性别=(能力+状态) mod 2），六能力各3条且每能力employed/flexible/unemployed各1（SHV2-AC-007）；广东18条保持五类既有能力与as-of（2030医保场景2030-01-01，其余2026-09-01，§8.4）；`eq`断言路径在引擎输出中不存在即抛错，生成后断言自洽重放fail-closed（SHV2-FR-010）。
- `case-content-v2.ts`：36条非空case_text（≥200字、含合成声明/as-of/人物条件/结论边界/风险提示）、独立标题、自然语言问题、结构化回答（结论/关键测算/个人条件/政策依据/缺失事项/合成声明，SHV2-FR-012、§9.4）；数值单源——文案数字只来自input/expected/asOfDate/policySources，模块内无算术派生与政策常量（SHV2-FR-015）。
- 人物输入契约（§8.5，SHV2-FR-011）：36条完整生日（birth_year/month/day/birth_date一致）；女性显式female_retire_type（worker50/cadre55）；失业场景带失业保险年限、领取阶段或已领月数、on_unemployment_benefit；灵活就业带缴费基数；补贴带就业困难认定与距退休月数（与引擎退休日期推导一致）；字段缺失场景以needs_agent反例验证不默认填充。
- `dsl-evidence-index.ts`+`case-nature.ts`：每条案例的policySources按"as-of有效链上规则输出∩断言路径 + 参数refs + 显式补充"解析，12字段完整（documentId/title/authority/officialUrl/locator/excerpt/contentSha256=64位hex），SHA/URL与仓库meta.json逐条一致（SHV2-FR-014）；上海来源全部落在白名单域名；广东不再使用泛化占位DOC-GD-POLICY-2026。
- API：`/api/showcase-cases`与`/api/admin/cases`既有字段兼容，新增`caseNature`（RCL-GEN-*=synthetic，其余=human_curated，人工案例不被强制改写）与`policySources`（SHV2-FR-013/AC-012、NFR-005）。
- 页面：公开案例页改为"合成政策案例"，删除"真实咨询记录/真实社保规划案例/真实咨询样本/真实案例"（首页/导航/工具卡同步）；卡片显示地区、能力、人物条件与问题；详情含完整问答、计算日期、风险提示、政策依据（安全外链rel=noopener noreferrer）；不展示V1统一占位问答，不可读记录显示"待生成V2案例文档"，页面层不虚构正文（SHV2-AC-010/§10.2）。管理后台"案例原文"→"合成案例文档"，展示输入/期望/断言/生成器版本/快照hash/政策来源（SHV2-AC-012/§10.3）。
- Markdown案例库：`docs/refactor/policy-ops-agent/case-library/shanghai-guangdong-v2.md`（36条完整明细：UID/地区/能力/as-of/画像/问题/结论/input/expected/assertions/snapshot ID与hash/政策标题/发布机关/官方URL/条款定位/原文摘录）+`shanghai-guangdong-v2.manifest.json`（无时间戳、manifestHash正文确定性重算）；`scripts/rcl-case-library-v2-doc.ts`支持`render`与`--check`（manifestHash/逐案例contentHash/36-18-18/Markdown逐字节，漂移退出2）；`scripts/rcl-case-library.ts`新增`generate-v2`模式经真实活动快照生成；`.gitattributes`固定案例库eol=lf（SHV2-FR-016/AC-013）。

### 2.2 TDD Red→Green

- Red：`generator-v2.test.ts`、`case-library-doc.test.ts`、`synthetic-copy.test.ts`首跑全部因模块不存在加载失败（3 files failed）。
- Green：58/58通过（generator-v2 40、case-library-doc 10、synthetic-copy 8）；case-library-doc含"已提交manifest与内存生成器逐条一致"交叉校验（快照绑定与contentHash除外），证明数据库快照路径与内存链路同构。

### 2.3 门禁结果（2026-09-11本地新鲜执行）

| 门禁 | 结果 |
| --- | --- |
| `npm test` | PASS：80文件/829通过、skip 0 |
| `npx tsc --noEmit` / `npx eslint src scripts` | PASS：退出0；0 error（既有10 warning未新增） |
| `npm run build` | PASS：退出0（standalone产物） |
| `test:db`（隔离PG17+pgvector，项目标准参数） | PASS：27文件/144通过、skip 0（含SHV2 delta 3例；重物化用例显式30秒超时——全量并行负载下超5秒默认值，断言不变，与identity-container先例同策略） |
| agent.migrate --with-roles ×2 | PASS：幂等 |
| pytest -m integration / "not integration" | PASS：20/20（补`SOCILA_TEST_DATABASE_URL`后RAG 3例恢复，零skip）、94通过；ruff 0问题、mypy 33文件0错误 |
| Chromium E2E | PASS：23/23（auth 10+SHV2 4+task3 5+task4 4） |
| Markdown `--check` | PASS：已提交文档ok=true；篡改副本（2340→2350）退出2并报"逐字节不一致" |
| scan-secrets --all | PASS：899候选文件零命中 |
| Gitleaks 8.29.1完整历史 | PASS：96 commits no leaks（worktree经临时独立克隆扫描后删除） |
| allowlist哨兵 | PASS：3场景全过 |

### 2.4 环境与边界

- 隔离环境：任务专属容器`shv2-task2-pg`（pgvector/pgvector:pg17，宿主随机端口54955）；`shv2_e2e`库完成migration+bootstrap+seed+`e2e-rcl-setup`（沪粤快照激活+V1替换演练36/36/80）后运行`generate-v2`与全套E2E；`shv2_drill`全新库承载`test:db`/agent.migrate/pytest。
- 已知环境事实：E2E管理员口令哈希与`scripts/db-gate-task34.mjs`内置哈希不匹配（bcrypt同盐重算确认），历史E2E的哈希来自先前会话本地值；本轮在隔离库内将Jan口令哈希更新为与spec口令匹配的本地计算值，未写入任何仓库文件。
- 边界：持久`policyops`全程未连接未写入；未创建持久快照或release；`shv2_e2e`库内快照/替换均为隔离演练；`transcript_text`不在生成器输出中（V2改写保持NULL属WI-20260911-03）；非RCL人工案例路径保持human_curated且零改写。

## 3. WI-20260911-03 0019审计迁移与受控原位改写（2026-09-11本地新鲜执行）

### 3.1 交付内容

- `drizzle/0019_case_rewrite_audit.sql`：只创建`case_rewrite_batches`（id/plan_hash唯一/code_sha/来源与目标指纹/finalFingerprint/新旧生成器版本/source manifest与attestation/快照绑定/行计数/status CHECK/操作者与时间）与`case_rewrite_entries`（batch+实体类型+整数ID唯一；新旧UID/新旧内容hash/新旧快照hash/evidence hash均为64位hex CHECK；完整before/after JSON；外键RESTRICT不级联删除历史审计）。journal追加0019（when=1788797000000，严格单调）；migration-lf契约更新为"0010～0018不高于持久账本max、0019为唯一新迁移"（SHV2-FR-017、AC-014）。
- `src/lib/case-rewrite/rewrite-v2.ts` + `scripts/rcl-case-rewrite-v2.mjs`（audit/plan/apply/verify）：匹配身份为人物槽位（地区×性别×年龄段×就业状态——V2按§8.2矩阵重新分配能力属改写内容）；计划绑定codeSha/来源工件指纹与attestation/前置指纹/finalFingerprint/3快照绑定/108条entries；apply单事务（REPEATABLE READ+任务专属advisory xact lock+FOR UPDATE锁定108行，逐行旧hash核对→原位UPDATE→新hash与行体核对，清空回归test运行结果，写1个applied批次+恰好108条entries，COMMIT前finalFingerprint核对）；复跑noop、部分完成/不一致`REWRITE_STATE_DRIFT`禁止补写；防误写：policyops库名在任何连接前拒绝（SHV2-FR-018～023、AC-015～018）。
- `scripts/rcl-rewrite-drill-v2.mjs`：全新库隔离演练编排（baseline→generate-v2→audit/plan→守卫反例→apply→verify/noop→0019×2幂等→post dump第三实例恢复对账→计数/审计核对），输出证据JSON。

### 3.2 TDD Red→Green

- Red：单元14例模块缺失失败；迁移集成（无0019表）与CLI集成失败。
- Green：单元14/14；迁移集成4/4；CLI集成8/8（守卫三反例/行漂移/apply全量断言/verify/noop/篡改drift/并发/故障注入回滚/policyops拒绝）。

### 3.3 门禁结果（2026-09-11本地新鲜执行）

| 门禁 | 结果 |
| --- | --- |
| `npm test`（提交态复跑migration-lf契约） | PASS：契约7/7；全量见§4提交态记录 |
| `test:db`（全新库shv2_drill3） | PASS：29文件/156通过、skip 0 |
| `npx tsc --noEmit` / `npx eslint src scripts` / `npm run build` | PASS：全部退出0；0 error |
| agent.migrate --with-roles ×2 | PASS：幂等 |
| pytest integration / not integration | PASS：20/20零skip、94通过；ruff 0、mypy 0 |
| Chromium E2E（V2终态库） | PASS：23/23——shv2_e2e经受控改写（planHash `fe92d7d8…`、verify ok）后，公开页36条可读问答/政策依据安全外链、管理后台结构化字段且无"待生成V2"提示全部生效 |
| 隔离演练 | PASS：9步全ok（证据`rewrite-drill-evidence-2026-09-11T19-01-07-253Z.json`）：最终36/36/80、1批次、108entries、36条V2干净case、post dump第三实例恢复对账一致 |
| scan-secrets --all | PASS：914文件零命中 |
| Gitleaks 8.29.1完整历史 | PASS：98提交——manifest场景键19条generic-api-key误报经人工核实（合成场景键非凭据），按ADR-0009"规则×路径"精确allowlist登记+哨兵回归3场景全过后复扫no leaks |
| 提交 | `f69dc39`（含.gitleaks.toml精确allowlist与.gitignore排除E2E状态文件） |

### 3.4 边界与移交

- 持久`policyops`全程未连接未写入（守卫在任何连接前拒绝）；0019仅交付SQL，对持久库的执行与V1→V2改写为PRD §18授权点，须另行fresh授权包（含备份/回退点）。
- 隔离环境：容器`shv2-task2-pg`（端口54955）；`shv2_e2e`（V2终态，供用户在浏览器直接核验合成案例展示）；`shv2_drill`/`shv2_drill3`（集成门禁）；演练库已清理。

## 4. 2026-09-12独立审查结论

功能分支`codex/shanghai-case-v2`已推送到`f583adc`，目标集成分支`refactor/policy-ops-agent-platform`仍为`0885613`且未合并。独立审查不撤销既有Agent执行证据，但发现以下未关闭问题，因此Feature及三个Work Item均不得标记最终Accepted：

| 项目 | 独立复核结果 | 后续闭环条件 |
| --- | --- | --- |
| 任务2/3核心目标测试 | `generator-v2`、案例文档、rewrite、展示、上海政策及citation verifier共101/101通过 | 修复后保持通过 |
| TypeScript | `npx tsc --noEmit`退出0 | 修复后保持通过 |
| 完整Node套件 | 81文件中80通过；842/843测试通过；`migration-lf.contract.test.ts`当前工作树用例超过默认5秒而超时 | 标准完整`npm test`稳定零失败；单文件7/7通过不能替代完整套件 |
| MinIO原件 | 23份上海原件已提交到Git证据目录，但采集脚本未接入MinIO；未见bucket、object key、对象SHA与RAG数据库四方对账 | `policy-originals/originals/<sha256>`对象存在，字节/SHA与Git原件、evidence和`rag.*.object_key`一致；完成恢复演练 |
| V2业务hash | 审计`new_content_hash`按规范化行计算，但原位改写排除了业务表`content_hash`列，现有测试未验证业务列同步 | `cases.content_hash`、`showcase_cases.content_hash`逐行等于V2目标hash，并与rewrite entries一致 |
| 持久边界 | 未执行持久政策物化、审批、快照/release、0019或V2改写 | 继续保持待fresh授权，不在修复任务中执行 |

当前状态为“代码已交付、独立审查问题待闭环、用户测试前待修复”，不是最终验收完成。修复Agent必须先TDD复现上述三项问题，再修改代码并重跑完整门禁；不得把本报告或历史执行结果当作持久写入授权。

## 5. 2026-09-12修复交付（三问题闭环，全量门禁本地新鲜执行；历史审查记录——起点d47dedf、交付提交b5a8d13）

起点`d47dedf`（独立审查缺口记录），分支`codex/shanghai-case-v2`，目标集成分支`refactor/policy-ops-agent-platform@0885613`未修改未合并。严格TDD：每项先记录RED再实现转GREEN；未删除断言、未降低引用规则、未跳过测试。

### 5.1 问题一：MinIO政策原件链路（SHV2-NFR-002/007）

- RED：`services/agent/tests/test_rag_evidence_sync.py`收集期`ModuleNotFoundError: agent.rag.evidence_sync`（15例）。
- 实现：`services/agent/agent/rag/evidence_sync.py`（audit/plan/apply/verify；bucket固定`policy-originals`、对象键`originals/<sha256>`；错bucket/远程endpoint/policyops库名连接前拒绝；冲突对象拒绝覆盖；清单与错误路径凭据redact）；CLI `python -m agent.rag.evidence_sync`；`scripts/rag-evidence-drill.mjs`；`config/runtime.env.example`默认bucket改`policy-originals`。
- GREEN：18/18（守卫7例+隔离DB集成10例+真实MinIO备份恢复1例）。
- 真实23件原件演练12项全ok（证据`rag-evidence-drill-2026-09-12T04-14-59-793Z.json`；本项为历史审查记录，控制契约复审后以§6的17项演练为准）：audit预态23缺失→plan 23 uploads零写入→apply 23上传+rag.sources(3域名)/fetches/document_versions登记→verify→幂等uploaded=0/noop=23→守卫反例exit2×3→OBJECT_CONFLICT拒绝且对象字节不变→pg_dump+23对象逐字节备份→全新PG库pg_restore+全新MinIO回填→恢复副本四方对账verify ok→证据零密钥。22/23份有DSL evidence引用且SHA全部一致；`DOC-SH-EMPLOYER-SUBSIDY-BASIS-2024`为政策依据辅助页无DSL引用（清单dslRefs:0如实报告）。

### 5.2 问题二：V2业务content_hash（SHV2-FR-019/020）

- RED：单元2例失败（`after.content_hash`≠`newContentHash`；verifyPlanBody不校验业务hash）；防循环例通过（目标hash与列旧值无关，证明hash计算已排除该列）。
- 实现：`rewrite-v2.ts`先按排除`content_hash`的投影计算目标hash再写入after投影（防循环）；apply同事务UPDATE业务`content_hash`（tests表无该列不写）并单独核对列值；verify显式读取业务`content_hash`逐条核对；verifyPlanBody校验before/after携带业务hash。
- GREEN：单元17/17；CLI集成10/10（新增业务hash逐行对账36+36、tests无content_hash列schema契约、篡改case/showcase业务hash→verify退出5、注入回滚后业务hash逐行不变）；隔离演练10步全ok（业务hash漂移0/0、36/36全写入；post dump恢复副本verify ok）。

### 5.3 问题三：完整Node套件超时（SHV2-NFR-008）

- RED：完整`npm test` 842/843；`migration-lf.contract.test.ts`"当前工作树"用例5243ms超默认5秒（81文件复现）。
- 根因：该用例（及同文件另外两用例）对20个SQL文件逐个spawn `git cat-file`，文件内合计60次git子进程，完整套件并行负载下超5秒。
- 修复：单次`git cat-file --batch`批量读取全部blob并缓存（1次子进程）+两个扫描用例显式30秒超时（同文件既有策略）；断言零改动。
- GREEN：单文件7/7（469ms）；标准完整`npm test`连续两次零失败零skip（§5.4）。

### 5.4 门禁汇总（2026-09-12，隔离环境）

| 门禁 | 结果 |
| --- | --- |
| 新增目标单元测试 | rewrite 17/17；evidence_sync守卫/枚举7/7 |
| MinIO同步集成测试 | `test_rag_evidence_sync.py` 18/18（含真实隔离MinIO备份恢复） |
| V2 rewrite数据库集成 | `rcl-rewrite-cli.integration.test.ts` 10/10；`rcl-0019-migration.integration.test.ts` 4/4 |
| 完整`npm test`×2 | 连续两次零失败零skip（81文件，第二次运行数见§5.5） |
| `npm run test:db`（全新库shv2_fix_testdb，PG17+pgvector:54956） | 全部通过零skip（文件/用例数见§5.5） |
| tsc --noEmit / eslint src scripts / build | 全部退出0（eslint 0 error） |
| pytest integration / not integration | 31/31与101/101，均零skip（`services/agent`目录下运行，`AGENT_DATABASE_URL`+`AGENT_DB_PASSWORD`提供角色用例） |
| ruff / mypy | 0问题（evidence_sync.py与测试文件） |
| Chromium E2E | 23/23（shv2_e2e重建为满足新content_hash契约的V2终态；AC-010首轮失败为状态文件未更新到V2，更新后全过） |
| citation verifier组 | citation-contract+citation-verifier+shanghai-policy-v2 32/32 |
| 案例库`--check` | ok=true、36条、manifestHash一致 |
| scan-secrets --all | 921文件零命中 |
| allowlist哨兵 | 3场景全过 |
| PostgreSQL+MinIO完整备份恢复对账 | 演练step9-10：pg_dump+逐对象备份→全新库pg_restore+全新MinIO回填→恢复副本verify ok |
| Gitleaks完整历史 | 8.29.1扫描100提交零发现（`.gitleaksignore`7条基线+ADR-0009新增"规则×路径"allowlist：`test_rag_evidence_sync.py`脱敏哨兵口令，2026-09-12人工核实；哨兵回归3场景全过） |
| 隔离演练 | rewrite 10步+evidence 12项全ok（两份证据JSON；evidence步骤数以证据JSON为准） |

### 5.5 最终数字（2026-09-12新鲜执行）

- 完整`npm test`×2：81文件/846用例，两次均零失败零skip（846=843+新增3例单元契约）。
- `npm run test:db`（全新库`shv2_fix_testdb`，PG17+pgvector容器:54956）：29文件/158用例全过零skip（158=156+新增2例CLI集成；`--dangerouslyIgnoreUnhandledErrors`为项目标准参数，Windows worker teardown RPC竞态不掩盖任何测试失败）。
- Gitleaks完整历史：8.29.1对含本修复的100提交扫描零发现；本轮唯一新增命中为`test_rag_evidence_sync.py`中的合成脱敏哨兵口令（`generic-api-key`误报），经人工核实按ADR-0009登记"规则×路径"allowlist（`targetRules`×精确路径，哨兵回归3场景全过后复扫no leaks）。

### 5.6 边界

- 持久`policyops`全程未连接未写入（rewrite与evidence_sync守卫均在连接前拒绝）；生产MinIO（socila-minio:9000）未连接；0019与V2改写仅存在于隔离库。
- 隔离环境：PG容器`shv2-fix-pg`:54956（含agent schema+roles的`shv2_fix_rag`、双schema`shv2_fix_rw`、全新test:db库`shv2_fix_testdb`）、`shv2-task2-pg`:54955（`shv2_e2e`重建为V2终态供用户核验）、MinIO容器`shv2-fix-minio-a/b`:54960/54961（演练用，bucket在演练内创建与清空）。
- 持久执行（生产MinIO同步、持久RAG登记、持久0019/改写、政策物化、快照/release）须另行fresh授权。

## 6. 2026-09-12控制契约复审修复（本修复提交HEAD，起点b5a8d13）

起点`b5a8d13`（§5的MinIO接入、业务content_hash与Node超时修复保留不推翻；f583adc为历史任务2/3交付SHA）。严格TDD：RED=新增契约测试集合期ImportError（21测试）→GREEN=35/35。

### 6.1 问题一：apply绑定fresh授权计划

- `evidence_sync.py`新增`build_plan`（确定性计划：`schema="rag-evidence-sync-plan/1.0"`、`algorithmVersion`、`codeSha`、`jurisdiction`、固定bucket、`evidenceManifestHash`（文档集合规范化SHA）、`targetFingerprint`（MinIO+RAG当前状态指纹）、`finalFingerprint`（期望终态指纹）、完整对象清单、`plannedUploads/plannedFetches/plannedVersions/noopObjects/conflicts`、规范化`planHash`；同状态两次生成逐字节一致）。
- `apply(plan, plan_hash, target_fingerprint, i_am_authorized)`：任何写入前校验——授权声明、计划结构、planHash重算一致、HEAD==计划codeSha、工作树干净（`RAG_EVIDENCE_ALLOW_DIRTY`仅限隔离演练）、evidence未漂移（manifestHash）、MinIO+RAG状态指纹==targetFingerprint；状态达终态→幂等noop；介于前置与终态之间→`TARGET_STATE_DRIFT`零写入拒绝。`RAG_EVIDENCE_ALLOW_REMOTE`/`RAG_EVIDENCE_ALLOW_PERSISTENT`仅为endpoint/库名附加保护，不能替代fresh授权参数。
- 冲突对象拒绝覆盖、凭据脱敏、恢复能力保留；并发apply经任务专属advisory锁串行化并在锁内重分类（上传+登记同一持锁事务），锁内复查不产生重复rag记录。

### 6.2 问题二：verify范围契约

- 完整audit/plan/apply/verify必须提供数据库连接（CLI缺库以USAGE拒绝，exit 2）；缺库完整verify返回ok:false并逐件报告"无法核对rag.fetches/rag.document_versions"。
- 显式`--object-only`降级模式仅核对本地文件与MinIO对象层，结果带`verificationScope="object-only"`、`degraded=true`、`dbChecked=false`，不作为四方验收通过。
- 完整verify逐件核对：Git原件字节SHA与meta.json.sha256/byteSize/DSL evidence.content_sha256（collect固化）、MinIO bucket/object_key/下载后SHA、rag.fetches与rag.document_versions的object_key/content_hash及两处object_key一致。

### 6.3 问题三：文档事实同步

- f583adc标注为历史任务2/3交付SHA；b5a8d13标注为本次控制修复起点；最终SHA以"本修复提交HEAD"表述并回填于交付报告；历史Reopened章节标记"历史审查记录"；MinIO演练步骤数按证据JSON如实更正（b5a8d13证据为12项，本轮为17项；rewrite演练10步不变）；状态保持Ready for independent review。

### 6.4 Chromium E2E阻塞项根因修复（门禁路径上的既有产品bug）

首轮Chromium E2E在`shv2_e2e`（V2终态库）上稳定复现AUTH-US-002失败（对话发送后`page.reload()`断言回复消失，4次复现）。根因调查（独立playwright脚本全链路网络取证）：发送后URL为`/chat?conversationId=C1`；reload时URL会话恢复成功（`GET /api/chat/C1 200`），但ChatPanel挂载期的"预创建会话"（JRP-FR-021）晚完成，`onConversationCreated`无条件把面板与URL改写为新空会话——正在展示的回复被切走。这是`9196939`（任务3）以来即存在的竞态，与本轮三项修复无关，但阻塞E2E门禁。最小修复：`ChatPageClient`将URL会话ID直接作为ChatPanel的`externalConversationId`（`panelConversationId ?? conversationIdFromUrl ?? undefined`），URL存在会话ID时面板不再预创建新会话（恢复失败的既有重置路径不受影响）。修复后独立脚本复现通过（reload后回复可见、URL保持C1），完整Chromium E2E 23/23通过（58.6s）。

### 6.5 门禁与证据（本修复提交HEAD，数字回填于交付报告）

- `test_rag_evidence_sync.py` 35/35零skip（12零DB单元+23集成）；ruff/mypy 0问题。
- 演练`scripts/rag-evidence-drill.mjs` 17项全ok（证据`rag-evidence-drill-2026-09-12T08-43-47-471Z.json`）：全新演练库→audit预态→plan（确定性两次一致）→守卫反例A缺授权exit2/B错planHash exit4/C错指纹exit4/D plan后对象漂移exit4/E audit缺库exit2（全部零写入）→apply→四方verify→复跑同一计划noop→object-only降级标记→冲突拒绝+re-plan恢复→pg_dump+逐对象备份→全新库pg_restore+全新MinIO回填→恢复副本四方对账verify ok+同计划apply noop→输出零密钥。
- 其余门禁（全部在本修复提交HEAD代码状态新鲜执行）：rewrite-v2单元（npm test内）+CLI集成10/10+隔离演练10步全ok（证据`rewrite-drill-evidence-2026-09-12T08-57-53-721Z.json`）；标准完整`npm test`连续两次81文件/846用例零失败零skip；`test:db`全新库29文件/158用例零skip；tsc 0/eslint 0 error/build 0；pytest integration 43/43+非集成106/106零skip；Chromium E2E 23/23（含6.4修复）；citation组32/32；案例库`--check` ok；scan-secrets 926文件零命中；allowlist哨兵3场景全过；Gitleaks 8.29.1完整历史101提交零发现；`git diff --check`干净。
