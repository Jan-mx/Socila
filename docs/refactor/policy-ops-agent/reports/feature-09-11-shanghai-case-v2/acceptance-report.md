# 09-11 Feature：上海政策纠偏与36条案例V2全量重建 — 验收报告

> Author: Jan
> Status: Active（WI-20260911-01已验收；WI-02/03待实施）
> Updated: 2026-09-11

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
