# 任务2首期：CN、上海、广东 管理员审核包

> 日期：2026-09-07
> 分支：`refactor/policy-ops-agent-platform`（HEAD `3a92bb2`）
> 状态：**等待管理员逐地区决定**——Agent不自动批准、不直接SQL改状态；三地区全部批准后，候选快照创建将另行请求写入授权
> 依据：ADR-0010、任务2验收报告§16/§17、WI-20260907-01（四川延期，不在本包范围）

## 1. 审核范围与当前就绪状态

| 地区 | 最新批次 | readiness | blocking reasons | 规则（最新版本口径） | 参数 | 快照 |
| --- | --- | --- | --- | --- | --- | --- |
| CN | id 9 (applied) | awaiting_approval | 无 | 16（v1，国家baseline） | 6 | 无（待批准后创建） |
| 310000 上海 | id 12 (applied) | awaiting_approval | 无 | 8条git派生（v2，叠加既有24条published基线） | 27条git派生（v2，叠加既有29条published基线） | 无（待批准后创建） |
| 440000 广东 | id 10 (applied) | awaiting_approval | 无（原3条中2条已闭环，2030前市级医保口径由R-220能力级守卫处理） | 2（v1：R-GD-MI-RETIRE-RESTRICT restrict元数据 + R-GD-UI-AMOUNT 失业金额规则） | 10（旧5条v1 + 新增5条：3个v1 + 2个v2窗口） | 无（待批准后创建） |
| 510000 四川 | id 11 (applied) | blocked | 3条（医保退休年限未印发/失业保险金标准原文未取得/2026年度缴费基数未公布） | 0 | 3（draft，窗口已失效） | 明确不创建（WI-20260907-01） |

持久库业务计数：rules=50、params=75、rule_sets=6、policy_pack_versions=5、tests=528、cases=851、showcase_cases=117、policy_snapshots=0（GD增量物化已apply并验证：幂等no-op、规划回归逐字节一致、恢复零漂移）。

## 2. CN（国家baseline）

- **规则（16，全部v1 draft）**：R-010-PARSE-BIRTH-YEAR、R-011-BUILD-BIRTH-DATE、R-012-NORMALIZE-GENDER、R-020-FEMALE-RETIRE-TYPE、R-110-LOOKUP-LEGAL-RETIRE-AGE、R-115-FLEXIBLE-RETIREMENT、R-120-COMPUTE-RETIRE-DATE、R-200-MIN-PENSION-YEARS、R-210-PENSION-GAP、R-220-MEDICAL-LIFETIME-GAP、R-300-MI-GAP-MONTHS、R-400-UNEMPLOYMENT-ELIGIBILITY、R-410-UNEMPLOYMENT-DURATION、R-420-UI-MEDICAL-COVERAGE、R-700-PLAN-TEMPLATE、R-900-FINAL-GATE
- **参数（6，v1）**：P-CI-FLEX-CHOICE-LOWER-RATIO、P-CI-FLEX-CHOICE-UPPER-RATIO、P-UNEMPLOYMENT-MAX-MONTHS、T-MIN-PENSION-YEARS-BY-RETIRE-YEAR（时间线）、T-RETIREMENT-AGE-LOOKUP、T-UNEMPLOYMENT-DURATION-BY-YEARS
- **权威来源**：`evidence/CN/DOC-*`（渐进延迟退休决定、社会保险法、国办发〔2019〕13号、失业保险条例；mohrss.gov.cn/gov.cn白名单）
- **审核要点**：渐进延迟退休口径（1970男61岁4个月）、养老最低缴费15→20年时间线、失业金法定期限档、灵活就业60%~300%基数区间；R-220在缺少地方医保年限参数时输出needs_agent+W-MI-LOCAL-YEARS-MISSING（能力级守卫，非阻断）。

## 3. 上海（310000）

- **git派生规则（8，v2 draft）**：R-310-MI-WAITING-PERIOD、R-500-4050-ELIGIBILITY、R-510-4050-AMOUNT、R-520-JOB-SUBSIDY-ELIGIBILITY、R-521-JOB-SUBSIDY-AMOUNT、R-530-OLDER-UI-PENSION-FUND-COVERAGE、R-540-SUBSIDY-MUTUAL-EXCLUSION、R-600-PAY-GAP-REMINDER；叠加既有24条published基线（国家16条+上海历史8条）——沿用阶段E重分类零漂移结论（44例基准plan/calc/user逐字节一致）
- **git派生参数（27，v2 draft）**：叠加既有29条published基线；关键：P-SH-CONTRIB-BASE-LOWER/UPPER、P-SH-MIN-WAGE、P-SH-4050-SUBSIDY-RATE、P-SH-MEDICAL-LIFETIME-*、T-SH-PAY-GAP-MONTHS等
- **审核要点**：4050补贴（费率/年限档）、医保等待期与补差、失业金分档与延长、就业补贴与互斥规则；发布基线为上海历史运行口径，未变化实体零新增已由增量物化证明。

## 4. 广东（440000）

- **规则（2，v1 draft）**：R-GD-MI-RETIRE-RESTRICT（restrict元数据，显式指向国家R-220，追加退休地实际缴费满10年附加条件）、**R-GD-UI-AMOUNT（任务2新增：失业保险金月标准＝领取地市最低工资×90%，条例第十九条；领取地市或最低工资缺失→needs_agent不估算金额）**；规则集RS-GD-PLAN-V1 v2（17条=16国家+新规则）
- **参数（10）**：旧5条v1保留（P-GD-AVG-WAGE-2023、P-GD-CONTRIB-BASE-UPPER 2024窗口、P-MI-LIFETIME-MALE/FEMALE-YEARS 2030-01-01起、T-GD-CONTRIB-BASE-LOWER-BY-CITY 2024窗口）+ 新增5条（P-GD-CONTRIB-BASE-UPPER v2 2025-07-01起27549、T-GD-CONTRIB-BASE-LOWER-BY-CITY v2 2025-07-01起5510/4775、P-GD-PENSION-CALC-BASE-2025 v1 9493、P-GD-UNEMPLOYMENT-BENEFIT-RATE v1 0.9、T-GD-MIN-WAGE-BY-CITY v1 2026-09-01起分市最低工资）
- **权威来源**：`evidence/GD/DOC-*`（粤医保规〔2022〕6号、粤人社发〔2024〕33号、粤人社发〔2025〕32号、广东省失业保险条例2025-01-12修正版、粤府函〔2026〕188号最低工资、省人社厅发布页）
- **能力边界（ADR-0010决策3）**：2030年前缺少统筹地市医保退休累计缴费年限时，只由R-220输出needs_agent=true与W-MI-LOCAL-YEARS-MISSING，医保退休结论为空；养老、缴费基数、最低工资、失业资格/期限/金额继续计算；2030-01-01起省级统一男30年/女25年。此边界为显式支持状态，不是缺口。
- **审核要点**：失业金额公式依赖领取地市（由任务3确认后传递）；最低工资表2026-09-01起生效，此前窗口内无金额结论（needs_agent）。

## 5. 批准语义与下一步

- 管理员对三地区分别作出：批准 / 需修订（附说明）。批准决定由管理员在管理端或明确指示执行；**Agent不得自动批准或直接SQL修改状态**。
- 三地区全部批准后，Agent只读生成三地区候选快照计划，并**再次请求快照写入授权**；授权后创建并重复重放三个快照（四川仍无快照）。
- 不批准的地区不创建候选快照；修订事项进入对应Work Item。
