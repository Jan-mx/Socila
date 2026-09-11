# WI-20260911-02：RCL-GEN-2.0案例、Markdown案例库、API与UI

> Author: Jan
> Status: Draft（等待WI-20260911-01 Accepted）
> Updated: 2026-09-11

## Work Item

- ID：WI-20260911-02
- 关联PRD：`docs/prd/09-11-feature-shanghai-case-library-v2.md`
- 关联需求：SHV2-FR-008～016、SHV2-NFR-001～003/005/006/008
- 关联验收：SHV2-AC-006～013
- 前置：WI-20260911-01 Accepted
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
