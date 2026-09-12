# WI-20260911-02：RCL-GEN-2.0案例、Markdown案例库、API与UI

> Author: Jan
> Status: Reopened（代码、测试与隔离资产已交付；业务content_hash一致性待独立复审）
> Updated: 2026-09-12

## Work Item

- ID：WI-20260911-02
- 关联PRD：`docs/prd/09-11-feature-shanghai-case-library-v2.md`
- 关联需求：SHV2-FR-008～016、SHV2-NFR-001～003/005/006/008
- 关联验收：SHV2-AC-006～013
- 前置：WI-20260911-01代码提交`caa6344`保留；独立审查后WI-01因MinIO链路重新打开
- 后置：WI-20260911-03

## 背景与证据

当前`src/lib/case-governance/generator.ts`为`RCL-GEN-1.0`：上海18条无论能力标签均只断言`calc.retirement.legal_retire_date/legal_retire_age_years`；`row-projections.ts`把showcase写为统一占位（`确定性模板生成的政策案例（无真实用户数据）`/`由修复后的快照规划器计算期望`），`case_text`为NULL；公开页`src/app/(client)/cases/page.tsx`使用“真实咨询记录/真实社保规划案例/真实咨询样本”。

## 范围

1. 生成器升级`RCL-GEN-2.0`：UID `RPC-…-V2`/`RPCT-…-V2`；上海按PRD §8.2固定能力×状态轮转矩阵（年龄段=(能力+状态) mod 3，性别=(能力+状态) mod 2）；每能力3条且employed/flexible/unemployed各1。
2. 能力专属输入与断言：非退休能力至少断言一个自身能力输出；精确退休日期提供完整生日；女性明确`female_retire_type`；失业/灵活/补贴提供计算所需字段。
3. 广东18条保持既有能力范围与as-of日期（2030医保场景2030-01-01，其余2026-09-01），evidence替换为已验证广东正式证据。
4. 每条生成：非空`case_text`、独立标题、独立自然语言问题、仅由`expected/assertions`渲染的回答、topics/tags/category、完整`policySources`、snapshot绑定、quality、content hash、合成声明；`transcript_text`保持NULL。
5. `docs/refactor/policy-ops-agent/case-library/shanghai-guangdong-v2.md`由确定性脚本生成并支持`--check`。
6. API新增`caseNature`/`policySources`（向后兼容）；公开页改称“合成政策案例”并删除真实表述；管理后台“合成案例文档”，V1空正文显示“待生成V2案例文档”。

## 非目标

- 不使用LLM生成数值或结论；不伪造转写；不覆盖非RCL/人工案例。
- 不写持久库；不执行原位改写（WI-20260911-03）。

## 测试矩阵（TDD Red先于实现）

| 场景 | 通过条件 |
| --- | --- |
| 配额 | 36、沪粤18/18、男女9/9、年龄段6/6/6、就业6/6/6 |
| 上海六类能力 | 每类3条、三个状态各1，且断言含自身能力路径 |
| 完整生日 | 精确退休日期案例含birth_year/month/day/birth_date |
| 文案 | 36条标题/问题/回答/case_text非空、非占位、互不相同、含合成声明 |
| 数值单源 | 回答中的金额/月份/年龄只来自expected/assertions |
| 来源 | 每条policySources非空且hash为64位hex |
| 确定性 | 重复生成两次逐字节一致 |
| Markdown | `--check`在manifest漂移时失败 |
| API/UI | caseNature/policySources返回；公开页无“真实咨询”；后台显示结构化字段 |

## 验收与回退

- SHV2-AC-006～013新鲜证据；`npm test`、tsc、eslint、build、Chromium E2E通过。
- 只交付代码与生成资产；无数据库写入。

## 文档同步

- traceability、ARCHITECTURE（生成器与API契约）、TESTING、PROGRESS、案例库Markdown。

## 验收记录（2026-09-11，隔离库本地新鲜执行）

- 实现：`src/lib/case-governance/generator-v2.ts`（RCL-GEN-2.0、§8.2矩阵、断言fail-closed）、`case-content-v2.ts`（数值单源文案）、`dsl-evidence-index.ts`（依赖来源解析）、`case-library-doc.ts`（manifest确定性+render+check）、`src/lib/showcase/{labels,case-nature}.ts`（披露与API装饰）、`scripts/rcl-case-library.ts generate-v2`、`scripts/rcl-case-library-v2-doc.ts`、公开页/管理页/两个API路由改造、`e2e/shv2-case-copy.spec.ts`、`.gitattributes`案例库eol=lf。
- 生成资产：`docs/refactor/policy-ops-agent/case-library/shanghai-guangdong-v2.md`（346KB）+`.manifest.json`（36/18/18、3个真实快照绑定、无时间戳）。
- TDD：RED=3个新测试文件模块缺失失败；GREEN=58/58（generator-v2 40、case-library-doc 10、synthetic-copy 8）。
- 门禁：`npm test` 80文件/829零skip；tsc 0；eslint 0 error；build 0；隔离PG17+pgvector `test:db` 27文件/144零skip（项目标准参数，见traceability）；agent.migrate×2幂等；pytest integration 20/20零skip+非集成94；Chromium E2E 23/23（含SHV2新增4例：公开页合成文案/首页导航/公开API字段/后台文档与字段）；scan-secrets --all 899文件零命中；Gitleaks完整历史96提交零发现；allowlist哨兵全过；案例库`--check`通过且篡改副本退出2。
- 环境与边界：任务专属容器`shv2-task2-pg`（随机端口54955）+`shv2_e2e`/`shv2_drill`两库；持久policyops未连接未写入；未创建持久快照/release；非RCL人工案例未被改写；`transcript_text`未生成。

## 独立审查补充（2026-09-12）

- V2生成器和case/showcase审计hash已存在，但必须额外验证原位改写后业务列`cases.content_hash`和`showcase_cases.content_hash`与V2目标内容hash一致；当前实现/测试没有形成该数据库字段契约。
- 在该契约闭环前，不能将“new_content_hash审计字段正确”作为“业务表content_hash正确”的替代证据。
