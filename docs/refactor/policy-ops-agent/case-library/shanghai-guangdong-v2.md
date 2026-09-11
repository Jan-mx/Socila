# 上海与广东合成政策案例库 V2（RCL-GEN-2.0）

> Author: Jan
> Status: Generated
> 文档版本：CASE-LIBRARY-DOC-1.0；manifestHash：`c974157db95bfdae7ea8949c0a2b7f12107a94e7bde0d3e3ab8ec1d9cea7ab38`；coverageManifestHash：`d9cd4d17dc694589ba4c745282162addcbd3a3e76ce19bee6f83be8442cc2e44`

本文档由 `scripts/rcl-case-library-v2-doc.ts` 从 `shanghai-guangdong-v2.manifest.json` 确定性渲染；手工修改本文档或manifest任一字节都会使 `--check` 失败。全部案例为合成政策案例：人物为合成画像、不含任何真实个人数据；数值、资格与日期全部来自规则引擎在对应快照上的计算结果；本案例为合成演示，不构成个案办理决定。

## 概览

| 项目 | 值 |
| --- | --- |
| 案例总数 | 36 |
| 上海（310000） | 18 |
| 广东（440000） | 18 |
| 生成器版本 | RCL-GEN-2.0 |

## 快照绑定

| 地区 | as-of | snapshot ID | snapshot hash |
| --- | --- | --- | --- |
| 上海（310000） | 2026-09-01 | `26e917f9-37fe-4dc3-8466-38c1f83dc5a3` | `2022ae3268e8356b3b975113a6cb4a1158b0df8914e195a9553f84046c633538` |
| 广东（440000） | 2026-09-01 | `e9b7227f-69a1-413b-b607-ebaba2db38ea` | `3e20302d6df76232f6ceba8c5b197244bac289a6b02a4a0bfc1e7b03959f4e5e` |
| 广东（440000） | 2030-01-01 | `9ce254ca-7443-4cf5-a764-acd715152a36` | `d3952809bfd9189f95220ebde1622a59a0d7e5ced4d3e55203f192a99c9771ee` |

## 案例索引

| # | UID | 地区 | 能力 | as-of | 结论级别 |
| --- | --- | --- | --- | --- | --- |
| 1 | `RPC-310000-SH-male-before_1970-employed-RETIREMENT-V2` | 上海 | 退休（retirement） | 2026-09-01 | 确定 |
| 2 | `RPC-310000-SH-female-1970_1979-flexible-RETIREMENT-V2` | 上海 | 退休（retirement） | 2026-09-01 | 确定 |
| 3 | `RPC-310000-SH-male-from_1980-unemployed-RETIREMENT-V2` | 上海 | 退休（retirement） | 2026-09-01 | 确定 |
| 4 | `RPC-310000-SH-female-1970_1979-employed-PENSION-V2` | 上海 | 养老（pension） | 2026-09-01 | 确定 |
| 5 | `RPC-310000-SH-male-from_1980-flexible-PENSION-V2` | 上海 | 养老（pension） | 2026-09-01 | 确定 |
| 6 | `RPC-310000-SH-female-before_1970-unemployed-PENSION-V2` | 上海 | 养老（pension） | 2026-09-01 | 确定 |
| 7 | `RPC-310000-SH-male-from_1980-employed-MEDICAL-V2` | 上海 | 医保（medical） | 2026-09-01 | 确定 |
| 8 | `RPC-310000-SH-female-before_1970-flexible-MEDICAL-V2` | 上海 | 医保（medical） | 2026-09-01 | 确定 |
| 9 | `RPC-310000-SH-male-1970_1979-unemployed-MEDICAL-V2` | 上海 | 医保（medical） | 2026-09-01 | 确定 |
| 10 | `RPC-310000-SH-female-before_1970-employed-UNEMPLOYMENT-V2` | 上海 | 失业（unemployment） | 2026-09-01 | 确定 |
| 11 | `RPC-310000-SH-male-1970_1979-flexible-UNEMPLOYMENT-V2` | 上海 | 失业（unemployment） | 2026-09-01 | 确定 |
| 12 | `RPC-310000-SH-female-from_1980-unemployed-UNEMPLOYMENT-V2` | 上海 | 失业（unemployment） | 2026-09-01 | 确定 |
| 13 | `RPC-310000-SH-male-1970_1979-employed-FLEXIBLE-V2` | 上海 | 灵活就业（flexible） | 2026-09-01 | 确定 |
| 14 | `RPC-310000-SH-female-from_1980-flexible-FLEXIBLE-V2` | 上海 | 灵活就业（flexible） | 2026-09-01 | 确定 |
| 15 | `RPC-310000-SH-male-before_1970-unemployed-FLEXIBLE-V2` | 上海 | 灵活就业（flexible） | 2026-09-01 | 确定 |
| 16 | `RPC-310000-SH-female-from_1980-employed-SUBSIDY-V2` | 上海 | 补贴（subsidy） | 2026-09-01 | 确定 |
| 17 | `RPC-310000-SH-male-before_1970-flexible-SUBSIDY-V2` | 上海 | 补贴（subsidy） | 2026-09-01 | 确定 |
| 18 | `RPC-310000-SH-female-1970_1979-unemployed-SUBSIDY-V2` | 上海 | 补贴（subsidy） | 2026-09-01 | 确定 |
| 19 | `RPC-440000-GD-male-before_1970-unemployed-UI-AMOUNT-V2` | 广东 | 失业（ui-amount） | 2026-09-01 | needs_agent |
| 20 | `RPC-440000-GD-female-1970_1979-unemployed-CLAIM-CITY-MISSING-V2` | 广东 | 失业（claim-city-missing） | 2026-09-01 | needs_agent |
| 21 | `RPC-440000-GD-male-from_1980-employed-MI-2030-V2` | 广东 | 医保（mi-2030） | 2030-01-01 | 确定 |
| 22 | `RPC-440000-GD-female-before_1970-flexible-MI-2026-MISSING-V2` | 广东 | 医保（mi-2026-missing） | 2026-09-01 | needs_agent |
| 23 | `RPC-440000-GD-male-before_1970-employed-MI-2030-V2` | 广东 | 医保（mi-2030） | 2030-01-01 | 确定 |
| 24 | `RPC-440000-GD-male-before_1970-flexible-BASE-BOUNDARY-V2` | 广东 | 缴费基数（base-boundary） | 2026-09-01 | needs_agent |
| 25 | `RPC-440000-GD-male-1970_1979-employed-MI-2026-MISSING-V2` | 广东 | 医保（mi-2026-missing） | 2026-09-01 | needs_agent |
| 26 | `RPC-440000-GD-male-1970_1979-flexible-MI-2030-V2` | 广东 | 医保（mi-2030） | 2030-01-01 | 确定 |
| 27 | `RPC-440000-GD-male-1970_1979-unemployed-BASE-BOUNDARY-V2` | 广东 | 缴费基数（base-boundary） | 2026-09-01 | needs_agent |
| 28 | `RPC-440000-GD-male-from_1980-flexible-MI-2026-MISSING-V2` | 广东 | 医保（mi-2026-missing） | 2026-09-01 | needs_agent |
| 29 | `RPC-440000-GD-male-from_1980-unemployed-MI-2030-V2` | 广东 | 医保（mi-2030） | 2030-01-01 | needs_agent |
| 30 | `RPC-440000-GD-female-before_1970-employed-BASE-BOUNDARY-V2` | 广东 | 缴费基数（base-boundary） | 2026-09-01 | needs_agent |
| 31 | `RPC-440000-GD-female-before_1970-unemployed-MI-2026-MISSING-V2` | 广东 | 医保（mi-2026-missing） | 2026-09-01 | needs_agent |
| 32 | `RPC-440000-GD-female-1970_1979-employed-MI-2030-V2` | 广东 | 医保（mi-2030） | 2030-01-01 | 确定 |
| 33 | `RPC-440000-GD-female-1970_1979-flexible-BASE-BOUNDARY-V2` | 广东 | 缴费基数（base-boundary） | 2026-09-01 | needs_agent |
| 34 | `RPC-440000-GD-female-from_1980-employed-MI-2026-MISSING-V2` | 广东 | 医保（mi-2026-missing） | 2026-09-01 | needs_agent |
| 35 | `RPC-440000-GD-female-from_1980-flexible-MI-2030-V2` | 广东 | 医保（mi-2030） | 2030-01-01 | 确定 |
| 36 | `RPC-440000-GD-female-from_1980-unemployed-BASE-BOUNDARY-V2` | 广东 | 缴费基数（base-boundary） | 2026-09-01 | needs_agent |

## 案例明细

### 1. 上海退休案例：1967年生男性·在职（单位参保）

- UID：`RPC-310000-SH-male-before_1970-employed-RETIREMENT-V2`（回归测试UID：`RPCT-310000-SH-male-before_1970-employed-RETIREMENT-V2`）
- 地区：上海（310000）
- 能力：退休（`retirement`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`26e917f9-37fe-4dc3-8466-38c1f83dc5a3`
- snapshot hash：`2022ae3268e8356b3b975113a6cb4a1158b0df8914e195a9553f84046c633538`
- 案例content hash：`14d796fadd7123f258d8d79dec5488daa91ed7a893324040b74487a4534ecc13`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：确定性结论
- category：退休；topics：社保规划、上海、退休、合成政策案例
- tags：`上海` `310000` `male` `before_1970` `employed` `capability:retirement` `险种:养老` `险种:医保`

**合成人物画像**

- 地区：上海
- 性别与出生：男性，1967年5月12日出生
- 就业状态：在职（单位参保）
- 社保累计缴费：养老保险300个月，职工医保280个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

**咨询问题**

> 我是1967年5月出生的男性，目前在上海在单位在职参保，按现行延迟退休政策，我的法定退休年龄和法定退休日期分别是什么？

**规则引擎结论（公开回答）**

```text
【结论摘要】
按现行渐进式延迟法定退休年龄政策测算，法定退休年龄为60岁8个月，对应法定退休日期2028-01-12。

【关键测算结果】
- 法定退休年龄：60岁8个月
- 法定退休日期：2028-01-12
- 改革前对应法定退休年龄：60岁
- 弹性退休：未申请弹性提前或延迟，按标准年龄执行

【使用的个人条件】
- 地区：上海
- 性别与出生：男性，1967年5月12日出生
- 就业状态：在职（单位参保）
- 社保累计缴费：养老保险300个月，职工医保280个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

【政策依据】
- 《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》（全国人民代表大会常务委员会）— 定位：annex/附件1-3 延迟法定退休年龄对照表；article/国务院办法第三条；article/国务院办法第一条

【缺失或需确认事项】
- 无。本案例输入完整，结论为确定性计算结果。

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1967-05-12",
    "birth_day": 12,
    "birth_month": 5,
    "birth_year": 1967,
    "gender": "male"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "medical_contrib_months": 280,
    "months_paid_at_old_base": 0,
    "pension_contrib_months": 300
  },
  "status": {
    "employment_status": "employed"
  },
  "subsidy": {
    "has_employment_difficulty_cert": false
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "direct",
  "contribution": {
    "pay_gap_needed": false
  },
  "flex": {
    "applicable": false
  },
  "mi": {
    "gap_months": 1,
    "lifetime_gap_months": 0,
    "lifetime_required_months": 180,
    "paid_by_unemployment_fund": false,
    "waiting_period_months": 0,
    "waiting_required": false
  },
  "needs_agent": false,
  "pension": {
    "gap_months": 0,
    "gap_years_ceil": 0,
    "min_years_required": 15
  },
  "retirement": {
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 8,
    "legal_retire_age_years": 60,
    "legal_retire_date": "2028-01-12",
    "legal_retire_month": 1,
    "legal_retire_year": 2028,
    "months_to_legal_retire": 16,
    "original_retire_age_years": 60
  },
  "subsidy": {
    "4050_amount_est": 0,
    "4050_eligible": false,
    "job_amount_est": 0,
    "job_eligible": false,
    "older_ui_pension_fund_eligible": false,
    "selected_option": "none"
  },
  "unemployment": {
    "benefit_stage": null,
    "duration_months": 0,
    "eligible": false,
    "monthly_amount_est": 0
  },
  "warning_details": [],
  "warnings": []
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.retirement.legal_retire_age_years` | eq | `60` |
| `calc.retirement.legal_retire_age_months` | eq | `8` |
| `calc.retirement.legal_retire_date` | eq | `"2028-01-12"` |

**政策依据**

1. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：annex / 附件1-3 延迟法定退休年龄对照表
   - 原文摘录：附件：1.男职工延迟法定退休年龄对照表 2.原法定退休年龄五十五周岁的女职工延迟法定退休年龄对照表 3.原法定退休年龄五十周岁的女职工延迟法定退休年龄对照表
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
2. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第三条
   - 原文摘录：职工达到最低缴费年限，可以自愿选择弹性提前退休，提前时间最长不超过三年，且退休年龄不得低于女职工五十周岁、五十五周岁及男职工六十周岁的原法定退休年龄。职工达到法定退休年龄，所在单位与职工协商一致的，可以弹性延迟退休，延迟时间最长不超过三年。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
3. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第一条
   - 原文摘录：从2025年1月1日起，男职工和原法定退休年龄为五十五周岁的女职工，法定退休年龄每四个月延迟一个月，分别逐步延迟至六十三周岁和五十八周岁；原法定退休年龄为五十周岁的女职工，法定退休年龄每二个月延迟一个月，逐步延迟至五十五周岁。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`

### 2. 上海退休案例：1974年生女性·灵活就业

- UID：`RPC-310000-SH-female-1970_1979-flexible-RETIREMENT-V2`（回归测试UID：`RPCT-310000-SH-female-1970_1979-flexible-RETIREMENT-V2`）
- 地区：上海（310000）
- 能力：退休（`retirement`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`26e917f9-37fe-4dc3-8466-38c1f83dc5a3`
- snapshot hash：`2022ae3268e8356b3b975113a6cb4a1158b0df8914e195a9553f84046c633538`
- 案例content hash：`b473813556924e4429e75fd1dfa3a33d1048e139b6b80136e9698196d79209d1`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：确定性结论
- category：退休；topics：社保规划、上海、退休、合成政策案例
- tags：`上海` `310000` `female` `1970_1979` `flexible` `灵活就业` `capability:retirement` `险种:养老` `险种:医保`

**合成人物画像**

- 地区：上海
- 性别与出生：女性（女干部口径），1974年10月8日出生
- 就业状态：灵活就业
- 社保累计缴费：养老保险200个月，职工医保180个月
- 灵活就业月缴费基数（本人选择）：10000元
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

**咨询问题**

> 我是1974年10月出生的女性（女干部口径），目前在上海以灵活就业身份参保，按现行延迟退休政策，我的法定退休年龄和法定退休日期分别是什么？

**规则引擎结论（公开回答）**

```text
【结论摘要】
按现行渐进式延迟法定退休年龄政策测算，法定退休年龄为56岁3个月，对应法定退休日期2031-01-08。

【关键测算结果】
- 法定退休年龄：56岁3个月
- 法定退休日期：2031-01-08
- 改革前对应法定退休年龄：55岁
- 弹性退休：未申请弹性提前或延迟，按标准年龄执行

【使用的个人条件】
- 地区：上海
- 性别与出生：女性（女干部口径），1974年10月8日出生
- 就业状态：灵活就业
- 社保累计缴费：养老保险200个月，职工医保180个月
- 灵活就业月缴费基数（本人选择）：10000元
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

【政策依据】
- 《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》（全国人民代表大会常务委员会）— 定位：annex/附件1-3 延迟法定退休年龄对照表；article/国务院办法第三条；article/国务院办法第一条

【缺失或需确认事项】
- 无。本案例输入完整，结论为确定性计算结果。

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1974-10-08",
    "birth_day": 8,
    "birth_month": 10,
    "birth_year": 1974,
    "female_retire_type": "cadre55",
    "gender": "female"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "flex_contrib_base": 10000,
    "medical_contrib_months": 180,
    "months_paid_at_old_base": 0,
    "pension_contrib_months": 200
  },
  "status": {
    "employment_status": "flexible"
  },
  "subsidy": {
    "has_employment_difficulty_cert": false
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "direct",
  "contribution": {
    "pay_gap_needed": false
  },
  "flex": {
    "applicable": true,
    "contrib_base": 10000,
    "medical_monthly": 1000,
    "pension_monthly": 2000,
    "total_monthly": 3000
  },
  "mi": {
    "gap_months": 1,
    "lifetime_gap_months": 0,
    "lifetime_required_months": 180,
    "paid_by_unemployment_fund": false,
    "waiting_period_months": 0,
    "waiting_required": false
  },
  "needs_agent": false,
  "pension": {
    "gap_months": 0,
    "gap_years_ceil": 0,
    "min_years_required": 16
  },
  "retirement": {
    "female_retire_type_status": "confirmed",
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 3,
    "legal_retire_age_years": 56,
    "legal_retire_date": "2031-01-08",
    "legal_retire_month": 1,
    "legal_retire_year": 2031,
    "months_to_legal_retire": 52,
    "original_retire_age_years": 55
  },
  "subsidy": {
    "4050_amount_est": 0,
    "4050_eligible": false,
    "job_amount_est": 0,
    "job_eligible": false,
    "older_ui_pension_fund_eligible": false,
    "selected_option": "none"
  },
  "unemployment": {
    "benefit_stage": null,
    "duration_months": 0,
    "eligible": false,
    "monthly_amount_est": 0
  },
  "warning_details": [],
  "warnings": []
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.retirement.legal_retire_age_years` | eq | `56` |
| `calc.retirement.legal_retire_age_months` | eq | `3` |
| `calc.retirement.legal_retire_date` | eq | `"2031-01-08"` |

**政策依据**

1. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：annex / 附件1-3 延迟法定退休年龄对照表
   - 原文摘录：附件：1.男职工延迟法定退休年龄对照表 2.原法定退休年龄五十五周岁的女职工延迟法定退休年龄对照表 3.原法定退休年龄五十周岁的女职工延迟法定退休年龄对照表
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
2. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第三条
   - 原文摘录：职工达到最低缴费年限，可以自愿选择弹性提前退休，提前时间最长不超过三年，且退休年龄不得低于女职工五十周岁、五十五周岁及男职工六十周岁的原法定退休年龄。职工达到法定退休年龄，所在单位与职工协商一致的，可以弹性延迟退休，延迟时间最长不超过三年。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
3. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第一条
   - 原文摘录：从2025年1月1日起，男职工和原法定退休年龄为五十五周岁的女职工，法定退休年龄每四个月延迟一个月，分别逐步延迟至六十三周岁和五十八周岁；原法定退休年龄为五十周岁的女职工，法定退休年龄每二个月延迟一个月，逐步延迟至五十五周岁。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`

### 3. 上海退休案例：1983年生男性·失业

- UID：`RPC-310000-SH-male-from_1980-unemployed-RETIREMENT-V2`（回归测试UID：`RPCT-310000-SH-male-from_1980-unemployed-RETIREMENT-V2`）
- 地区：上海（310000）
- 能力：退休（`retirement`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`26e917f9-37fe-4dc3-8466-38c1f83dc5a3`
- snapshot hash：`2022ae3268e8356b3b975113a6cb4a1158b0df8914e195a9553f84046c633538`
- 案例content hash：`29d91cf8bc42eacfb8352d454e35269e09c519c57aec3fcf4b50285602b0d315`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：确定性结论
- category：退休；topics：社保规划、上海、退休、合成政策案例
- tags：`上海` `310000` `male` `from_1980` `unemployed` `失业` `capability:retirement` `险种:养老` `险种:医保` `险种:失业`

**合成人物画像**

- 地区：上海
- 性别与出生：男性，1983年2月25日出生
- 就业状态：失业，正在领取失业保险金
- 社保累计缴费：养老保险120个月，职工医保100个月
- 失业保险累计缴费：6年；当前领取阶段：第1-12个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

**咨询问题**

> 我是1983年2月出生的男性，目前在上海处于失业状态，按现行延迟退休政策，我的法定退休年龄和法定退休日期分别是什么？

**规则引擎结论（公开回答）**

```text
【结论摘要】
按现行渐进式延迟法定退休年龄政策测算，法定退休年龄为63岁0个月，对应法定退休日期2046-02-25。

【关键测算结果】
- 法定退休年龄：63岁0个月
- 法定退休日期：2046-02-25
- 改革前对应法定退休年龄：60岁
- 弹性退休：未申请弹性提前或延迟，按标准年龄执行

【使用的个人条件】
- 地区：上海
- 性别与出生：男性，1983年2月25日出生
- 就业状态：失业，正在领取失业保险金
- 社保累计缴费：养老保险120个月，职工医保100个月
- 失业保险累计缴费：6年；当前领取阶段：第1-12个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

【政策依据】
- 《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》（全国人民代表大会常务委员会）— 定位：annex/附件1-3 延迟法定退休年龄对照表；article/国务院办法第三条；article/国务院办法第一条

【缺失或需确认事项】
- 规则提示（需确认）：失业金期间，医保通常由失业保险基金代缴（以经办口径为准）。规划现金流时请不要重复计算医保个人缴费。（W-UI-MI-PAID）

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1983-02-25",
    "birth_day": 25,
    "birth_month": 2,
    "birth_year": 1983,
    "gender": "male"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "medical_contrib_months": 100,
    "months_paid_at_old_base": 0,
    "pension_contrib_months": 120,
    "ui_benefit_stage": "1-12",
    "unemployment_insurance_years": 6
  },
  "status": {
    "employment_status": "unemployed",
    "on_unemployment_benefit": true
  },
  "subsidy": {
    "has_employment_difficulty_cert": false
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "direct",
  "contribution": {
    "pay_gap_needed": false
  },
  "flex": {
    "applicable": false
  },
  "mi": {
    "gap_months": 1,
    "lifetime_gap_months": 80,
    "lifetime_required_months": 180,
    "paid_by_unemployment_fund": true,
    "waiting_period_months": 0,
    "waiting_required": false
  },
  "needs_agent": false,
  "pension": {
    "gap_months": 120,
    "gap_years_ceil": 10,
    "min_years_required": 20
  },
  "retirement": {
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 0,
    "legal_retire_age_years": 63,
    "legal_retire_date": "2046-02-25",
    "legal_retire_month": 2,
    "legal_retire_year": 2046,
    "months_to_legal_retire": 233,
    "original_retire_age_years": 60
  },
  "subsidy": {
    "4050_amount_est": 0,
    "4050_eligible": false,
    "job_amount_est": 0,
    "job_eligible": false,
    "selected_option": "none"
  },
  "unemployment": {
    "benefit_stage": "1-12",
    "duration_months": 12,
    "duration_months_raw": 12,
    "eligible": true,
    "monthly_amount_est": 2340
  },
  "warning_details": [
    {
      "text": "失业金期间，医保通常由失业保险基金代缴（以经办口径为准）。规划现金流时请不要重复计算医保个人缴费。",
      "warning_id": "W-UI-MI-PAID"
    }
  ],
  "warnings": [
    "W-UI-MI-PAID"
  ]
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.retirement.legal_retire_age_years` | eq | `63` |
| `calc.retirement.legal_retire_age_months` | eq | `0` |
| `calc.retirement.legal_retire_date` | eq | `"2046-02-25"` |

**政策依据**

1. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：annex / 附件1-3 延迟法定退休年龄对照表
   - 原文摘录：附件：1.男职工延迟法定退休年龄对照表 2.原法定退休年龄五十五周岁的女职工延迟法定退休年龄对照表 3.原法定退休年龄五十周岁的女职工延迟法定退休年龄对照表
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
2. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第三条
   - 原文摘录：职工达到最低缴费年限，可以自愿选择弹性提前退休，提前时间最长不超过三年，且退休年龄不得低于女职工五十周岁、五十五周岁及男职工六十周岁的原法定退休年龄。职工达到法定退休年龄，所在单位与职工协商一致的，可以弹性延迟退休，延迟时间最长不超过三年。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
3. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第一条
   - 原文摘录：从2025年1月1日起，男职工和原法定退休年龄为五十五周岁的女职工，法定退休年龄每四个月延迟一个月，分别逐步延迟至六十三周岁和五十八周岁；原法定退休年龄为五十周岁的女职工，法定退休年龄每二个月延迟一个月，逐步延迟至五十五周岁。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`

### 4. 上海养老案例：1978年生女性·在职（单位参保）

- UID：`RPC-310000-SH-female-1970_1979-employed-PENSION-V2`（回归测试UID：`RPCT-310000-SH-female-1970_1979-employed-PENSION-V2`）
- 地区：上海（310000）
- 能力：养老（`pension`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`26e917f9-37fe-4dc3-8466-38c1f83dc5a3`
- snapshot hash：`2022ae3268e8356b3b975113a6cb4a1158b0df8914e195a9553f84046c633538`
- 案例content hash：`a9f7bdad953a3cd7134e7c35368667ff12429bce00603222dd42c004a02eba34`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：确定性结论
- category：养老；topics：社保规划、上海、养老、合成政策案例
- tags：`上海` `310000` `female` `1970_1979` `employed` `capability:pension` `险种:养老` `险种:医保`

**合成人物画像**

- 地区：上海
- 性别与出生：女性（女干部口径），1978年7月19日出生
- 就业状态：在职（单位参保）
- 社保累计缴费：养老保险160个月，职工医保150个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

**咨询问题**

> 我是1978年7月出生的女性（女干部口径），在上海在单位在职参保，养老保险累计缴了160个月。到退休时最低缴费年限是多少年、我还差多少个月？

**规则引擎结论（公开回答）**

```text
【结论摘要】
退休年度2035对应的最低缴费年限为18年；按当前累计缴费160个月测算，缴费缺口56个月，向上取整约5年。

【关键测算结果】
- 最低缴费年限（按退休年度）：18年
- 养老保险累计缴费（输入）：160个月
- 缴费缺口：56个月（向上取整5年）
- 法定退休年龄：57岁2个月
- 法定退休日期：2035-09-19

【使用的个人条件】
- 地区：上海
- 性别与出生：女性（女干部口径），1978年7月19日出生
- 就业状态：在职（单位参保）
- 社保累计缴费：养老保险160个月，职工医保150个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

【政策依据】
- 《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》（全国人民代表大会常务委员会）— 定位：article/国务院办法第二条
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第十六条

【缺失或需确认事项】
- 无。本案例输入完整，结论为确定性计算结果。

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1978-07-19",
    "birth_day": 19,
    "birth_month": 7,
    "birth_year": 1978,
    "female_retire_type": "cadre55",
    "gender": "female"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "medical_contrib_months": 150,
    "months_paid_at_old_base": 0,
    "pension_contrib_months": 160
  },
  "status": {
    "employment_status": "employed"
  },
  "subsidy": {
    "has_employment_difficulty_cert": false
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "direct",
  "contribution": {
    "pay_gap_needed": false
  },
  "flex": {
    "applicable": false
  },
  "mi": {
    "gap_months": 1,
    "lifetime_gap_months": 30,
    "lifetime_required_months": 180,
    "paid_by_unemployment_fund": false,
    "waiting_period_months": 0,
    "waiting_required": false
  },
  "needs_agent": false,
  "pension": {
    "gap_months": 56,
    "gap_years_ceil": 5,
    "min_years_required": 18
  },
  "retirement": {
    "female_retire_type_status": "confirmed",
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 2,
    "legal_retire_age_years": 57,
    "legal_retire_date": "2035-09-19",
    "legal_retire_month": 9,
    "legal_retire_year": 2035,
    "months_to_legal_retire": 108,
    "original_retire_age_years": 55
  },
  "subsidy": {
    "4050_amount_est": 0,
    "4050_eligible": false,
    "job_amount_est": 0,
    "job_eligible": false,
    "older_ui_pension_fund_eligible": false,
    "selected_option": "none"
  },
  "unemployment": {
    "benefit_stage": null,
    "duration_months": 0,
    "eligible": false,
    "monthly_amount_est": 0
  },
  "warning_details": [],
  "warnings": []
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.pension.min_years_required` | eq | `18` |
| `calc.pension.gap_months` | eq | `56` |
| `calc.pension.gap_years_ceil` | eq | `5` |
| `calc.retirement.legal_retire_date` | eq | `"2035-09-19"` |

**政策依据**

1. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第二条
   - 原文摘录：从2030年1月1日起，将职工按月领取基本养老金最低缴费年限由十五年逐步提高至二十年，每年提高六个月。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
2. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第二条
   - 原文摘录：从2030年1月1日起，将职工按月领取基本养老金最低缴费年限由十五年逐步提高至二十年，每年提高六个月。职工达到法定退休年龄但不满最低缴费年限的，可以按照规定通过延长缴费或者一次性缴费的办法达到最低缴费年限，按月领取基本养老金。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
3. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第十六条
   - 原文摘录：参加基本养老保险的个人，达到法定退休年龄时累计缴费满十五年的，按月领取基本养老金。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`

### 5. 上海养老案例：1986年生男性·灵活就业

- UID：`RPC-310000-SH-male-from_1980-flexible-PENSION-V2`（回归测试UID：`RPCT-310000-SH-male-from_1980-flexible-PENSION-V2`）
- 地区：上海（310000）
- 能力：养老（`pension`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`26e917f9-37fe-4dc3-8466-38c1f83dc5a3`
- snapshot hash：`2022ae3268e8356b3b975113a6cb4a1158b0df8914e195a9553f84046c633538`
- 案例content hash：`90b21a5fcc707b5588c7c10c9a51d3ddf8c0313379947c9c45e07327abc73b41`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：确定性结论
- category：养老；topics：社保规划、上海、养老、合成政策案例
- tags：`上海` `310000` `male` `from_1980` `flexible` `灵活就业` `capability:pension` `险种:养老` `险种:医保`

**合成人物画像**

- 地区：上海
- 性别与出生：男性，1986年11月3日出生
- 就业状态：灵活就业
- 社保累计缴费：养老保险96个月，职工医保96个月
- 灵活就业月缴费基数（本人选择）：9000元
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

**咨询问题**

> 我是1986年11月出生的男性，在上海以灵活就业身份参保，养老保险累计缴了96个月。到退休时最低缴费年限是多少年、我还差多少个月？

**规则引擎结论（公开回答）**

```text
【结论摘要】
退休年度2049对应的最低缴费年限为20年；按当前累计缴费96个月测算，缴费缺口144个月，向上取整约12年。

【关键测算结果】
- 最低缴费年限（按退休年度）：20年
- 养老保险累计缴费（输入）：96个月
- 缴费缺口：144个月（向上取整12年）
- 法定退休年龄：63岁0个月
- 法定退休日期：2049-11-03

【使用的个人条件】
- 地区：上海
- 性别与出生：男性，1986年11月3日出生
- 就业状态：灵活就业
- 社保累计缴费：养老保险96个月，职工医保96个月
- 灵活就业月缴费基数（本人选择）：9000元
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

【政策依据】
- 《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》（全国人民代表大会常务委员会）— 定位：article/国务院办法第二条
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第十六条

【缺失或需确认事项】
- 无。本案例输入完整，结论为确定性计算结果。

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1986-11-03",
    "birth_day": 3,
    "birth_month": 11,
    "birth_year": 1986,
    "gender": "male"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "flex_contrib_base": 9000,
    "medical_contrib_months": 96,
    "months_paid_at_old_base": 0,
    "pension_contrib_months": 96
  },
  "status": {
    "employment_status": "flexible"
  },
  "subsidy": {
    "has_employment_difficulty_cert": false
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "direct",
  "contribution": {
    "pay_gap_needed": false
  },
  "flex": {
    "applicable": true,
    "contrib_base": 9000,
    "medical_monthly": 900,
    "pension_monthly": 1800,
    "total_monthly": 2700
  },
  "mi": {
    "gap_months": 1,
    "lifetime_gap_months": 84,
    "lifetime_required_months": 180,
    "paid_by_unemployment_fund": false,
    "waiting_period_months": 0,
    "waiting_required": false
  },
  "needs_agent": false,
  "pension": {
    "gap_months": 144,
    "gap_years_ceil": 12,
    "min_years_required": 20
  },
  "retirement": {
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 0,
    "legal_retire_age_years": 63,
    "legal_retire_date": "2049-11-03",
    "legal_retire_month": 11,
    "legal_retire_year": 2049,
    "months_to_legal_retire": 278,
    "original_retire_age_years": 60
  },
  "subsidy": {
    "4050_amount_est": 0,
    "4050_eligible": false,
    "job_amount_est": 0,
    "job_eligible": false,
    "older_ui_pension_fund_eligible": false,
    "selected_option": "none"
  },
  "unemployment": {
    "benefit_stage": null,
    "duration_months": 0,
    "eligible": false,
    "monthly_amount_est": 0
  },
  "warning_details": [],
  "warnings": []
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.pension.min_years_required` | eq | `20` |
| `calc.pension.gap_months` | eq | `144` |
| `calc.pension.gap_years_ceil` | eq | `12` |
| `calc.retirement.legal_retire_date` | eq | `"2049-11-03"` |

**政策依据**

1. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第二条
   - 原文摘录：从2030年1月1日起，将职工按月领取基本养老金最低缴费年限由十五年逐步提高至二十年，每年提高六个月。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
2. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第二条
   - 原文摘录：从2030年1月1日起，将职工按月领取基本养老金最低缴费年限由十五年逐步提高至二十年，每年提高六个月。职工达到法定退休年龄但不满最低缴费年限的，可以按照规定通过延长缴费或者一次性缴费的办法达到最低缴费年限，按月领取基本养老金。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
3. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第十六条
   - 原文摘录：参加基本养老保险的个人，达到法定退休年龄时累计缴费满十五年的，按月领取基本养老金。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`

### 6. 上海养老案例：1968年生女性·失业

- UID：`RPC-310000-SH-female-before_1970-unemployed-PENSION-V2`（回归测试UID：`RPCT-310000-SH-female-before_1970-unemployed-PENSION-V2`）
- 地区：上海（310000）
- 能力：养老（`pension`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`26e917f9-37fe-4dc3-8466-38c1f83dc5a3`
- snapshot hash：`2022ae3268e8356b3b975113a6cb4a1158b0df8914e195a9553f84046c633538`
- 案例content hash：`d6479000f8fa5d00a003c2a05b0ec329e0483be67b2bb4089e518818de7bf773`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：确定性结论
- category：养老；topics：社保规划、上海、养老、合成政策案例
- tags：`上海` `310000` `female` `before_1970` `unemployed` `失业` `capability:pension` `险种:养老` `险种:医保` `险种:失业`

**合成人物画像**

- 地区：上海
- 性别与出生：女性（女工人口径），1968年4月30日出生
- 就业状态：失业，正在领取失业保险金
- 社保累计缴费：养老保险168个月，职工医保150个月
- 失业保险累计缴费：8年；本段已领取：3个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

**咨询问题**

> 我是1968年4月出生的女性（女工人口径），在上海处于失业状态，养老保险累计缴了168个月。到退休时最低缴费年限是多少年、我还差多少个月？

**规则引擎结论（公开回答）**

```text
【结论摘要】
退休年度2018对应的最低缴费年限为15年；按当前累计缴费168个月测算，缴费缺口12个月，向上取整约1年。

【关键测算结果】
- 最低缴费年限（按退休年度）：15年
- 养老保险累计缴费（输入）：168个月
- 缴费缺口：12个月（向上取整1年）
- 法定退休年龄：50岁0个月
- 法定退休日期：2018-04-30

【使用的个人条件】
- 地区：上海
- 性别与出生：女性（女工人口径），1968年4月30日出生
- 就业状态：失业，正在领取失业保险金
- 社保累计缴费：养老保险168个月，职工医保150个月
- 失业保险累计缴费：8年；本段已领取：3个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

【政策依据】
- 《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》（全国人民代表大会常务委员会）— 定位：article/国务院办法第二条
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第十六条

【缺失或需确认事项】
- 规则提示（需确认）：失业金期间，医保通常由失业保险基金代缴（以经办口径为准）。规划现金流时请不要重复计算医保个人缴费。（W-UI-MI-PAID）
- 规则提示（需确认）：符合大龄条件时，在本市以个人身份参加企业职工基本养老保险并缴费，其中按灵活就业人员最低缴费标准的部分由失业保险基金支付；须达到法定退休年龄次月起申请，按距退休不足1年内实际缴纳月数一次性支付。（W-OLDER-UI-PENSION）

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1968-04-30",
    "birth_day": 30,
    "birth_month": 4,
    "birth_year": 1968,
    "female_retire_type": "worker50",
    "gender": "female"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "medical_contrib_months": 150,
    "months_paid_at_old_base": 0,
    "pension_contrib_months": 168,
    "ui_claimed_months": 3,
    "unemployment_insurance_years": 8
  },
  "status": {
    "employment_status": "unemployed",
    "on_unemployment_benefit": true
  },
  "subsidy": {
    "has_employment_difficulty_cert": false
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "direct",
  "contribution": {
    "pay_gap_needed": false
  },
  "flex": {
    "applicable": false
  },
  "mi": {
    "gap_months": 1,
    "lifetime_gap_months": 30,
    "lifetime_required_months": 180,
    "paid_by_unemployment_fund": true,
    "waiting_period_months": 0,
    "waiting_required": false
  },
  "needs_agent": false,
  "pension": {
    "gap_months": 12,
    "gap_years_ceil": 1,
    "min_years_required": 15
  },
  "retirement": {
    "female_retire_type_status": "confirmed",
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 0,
    "legal_retire_age_years": 50,
    "legal_retire_date": "2018-04-30",
    "legal_retire_month": 4,
    "legal_retire_year": 2018,
    "months_to_legal_retire": -101,
    "original_retire_age_years": 50
  },
  "subsidy": {
    "4050_amount_est": 0,
    "4050_eligible": false,
    "job_amount_est": 0,
    "job_eligible": false,
    "older_ui_pension_fund_eligible": true,
    "selected_option": "older_ui_pension_fund"
  },
  "unemployment": {
    "benefit_stage": "1-12",
    "duration_months": 16,
    "duration_months_raw": 16,
    "eligible": true,
    "monthly_amount_est": 2340
  },
  "warning_details": [
    {
      "text": "失业金期间，医保通常由失业保险基金代缴（以经办口径为准）。规划现金流时请不要重复计算医保个人缴费。",
      "warning_id": "W-UI-MI-PAID"
    },
    {
      "text": "符合大龄条件时，在本市以个人身份参加企业职工基本养老保险并缴费，其中按灵活就业人员最低缴费标准的部分由失业保险基金支付；须达到法定退休年龄次月起申请，按距退休不足1年内实际缴纳月数一次性支付。",
      "warning_id": "W-OLDER-UI-PENSION"
    }
  ],
  "warnings": [
    "W-UI-MI-PAID",
    "W-OLDER-UI-PENSION"
  ]
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.pension.min_years_required` | eq | `15` |
| `calc.pension.gap_months` | eq | `12` |
| `calc.pension.gap_years_ceil` | eq | `1` |
| `calc.retirement.legal_retire_date` | eq | `"2018-04-30"` |

**政策依据**

1. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第二条
   - 原文摘录：从2030年1月1日起，将职工按月领取基本养老金最低缴费年限由十五年逐步提高至二十年，每年提高六个月。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
2. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第二条
   - 原文摘录：从2030年1月1日起，将职工按月领取基本养老金最低缴费年限由十五年逐步提高至二十年，每年提高六个月。职工达到法定退休年龄但不满最低缴费年限的，可以按照规定通过延长缴费或者一次性缴费的办法达到最低缴费年限，按月领取基本养老金。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
3. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第十六条
   - 原文摘录：参加基本养老保险的个人，达到法定退休年龄时累计缴费满十五年的，按月领取基本养老金。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`

### 7. 上海医保案例：1981年生男性·在职（单位参保）

- UID：`RPC-310000-SH-male-from_1980-employed-MEDICAL-V2`（回归测试UID：`RPCT-310000-SH-male-from_1980-employed-MEDICAL-V2`）
- 地区：上海（310000）
- 能力：医保（`medical`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`26e917f9-37fe-4dc3-8466-38c1f83dc5a3`
- snapshot hash：`2022ae3268e8356b3b975113a6cb4a1158b0df8914e195a9553f84046c633538`
- 案例content hash：`975b8a08ef9723e23b95c08758b97db3a8a0f08ed1c6512b9484666c4d115d4d`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：确定性结论
- category：医保；topics：社保规划、上海、医保、合成政策案例
- tags：`上海` `310000` `male` `from_1980` `employed` `capability:medical` `险种:养老` `险种:医保`

**合成人物画像**

- 地区：上海
- 性别与出生：男性，1981年8月14日出生
- 就业状态：在职（单位参保）
- 社保累计缴费：养老保险120个月，职工医保120个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

**咨询问题**

> 我是1981年8月出生的男性，在上海在单位参保，职工医保累计缴了120个月，退休时享受医保待遇需要累计缴满多少个月、还差多少？

**规则引擎结论（公开回答）**

```text
【结论摘要】
退休时享受职工医保待遇所需累计缴费180个月；当前累计120个月，缺口60个月。本次参保前中断1个月，在衔接豁免范围内，无需等待期（等待期0个月）。

【关键测算结果】
- 退休所需累计缴费：180个月
- 当前累计缴费（输入）：120个月
- 年限缺口：60个月
- 本次参保前中断：1个月
- 等待期：0个月（无需等待）

【使用的个人条件】
- 地区：上海
- 性别与出生：男性，1981年8月14日出生
- 就业状态：在职（单位参保）
- 社保累计缴费：养老保险120个月，职工医保120个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

【政策依据】
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第二十七条
- 《上海市职工基本医疗保险办法实施细则（沪医保规〔2025〕7号）》（上海市医疗保障局）— 定位：paragraph/三（四）；paragraph/三（四）末段
- 《职工享受医保待遇的条件是什么？（上海市医疗保障局，2026-06-29）》（上海市医疗保障局）— 定位：body/正文第三段

【缺失或需确认事项】
- 无。本案例输入完整，结论为确定性计算结果。

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1981-08-14",
    "birth_day": 14,
    "birth_month": 8,
    "birth_year": 1981,
    "gender": "male"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "medical_contrib_months": 120,
    "months_paid_at_old_base": 0,
    "pension_contrib_months": 120
  },
  "status": {
    "employment_status": "employed"
  },
  "subsidy": {
    "has_employment_difficulty_cert": false
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "direct",
  "contribution": {
    "pay_gap_needed": false
  },
  "flex": {
    "applicable": false
  },
  "mi": {
    "gap_months": 1,
    "lifetime_gap_months": 60,
    "lifetime_required_months": 180,
    "paid_by_unemployment_fund": false,
    "waiting_period_months": 0,
    "waiting_required": false
  },
  "needs_agent": false,
  "pension": {
    "gap_months": 120,
    "gap_years_ceil": 10,
    "min_years_required": 20
  },
  "retirement": {
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 0,
    "legal_retire_age_years": 63,
    "legal_retire_date": "2044-08-14",
    "legal_retire_month": 8,
    "legal_retire_year": 2044,
    "months_to_legal_retire": 215,
    "original_retire_age_years": 60
  },
  "subsidy": {
    "4050_amount_est": 0,
    "4050_eligible": false,
    "job_amount_est": 0,
    "job_eligible": false,
    "older_ui_pension_fund_eligible": false,
    "selected_option": "none"
  },
  "unemployment": {
    "benefit_stage": null,
    "duration_months": 0,
    "eligible": false,
    "monthly_amount_est": 0
  },
  "warning_details": [],
  "warnings": []
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.mi.lifetime_required_months` | eq | `180` |
| `calc.mi.lifetime_gap_months` | eq | `60` |
| `calc.mi.waiting_period_months` | eq | `0` |
| `calc.mi.waiting_required` | eq | `false` |

**政策依据**

1. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第二十七条
   - 原文摘录：参加职工基本医疗保险的个人，达到法定退休年龄时累计缴费达到国家规定年限的，退休后不再缴纳基本医疗保险费，按照国家规定享受基本医疗保险待遇；未达到国家规定年限的，可以缴费至国家规定年限。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
2. 政策标题：《上海市职工基本医疗保险办法实施细则（沪医保规〔2025〕7号）》
   - 文档ID：`DOC-SH-MI-FLEX-WAITING-2025`
   - 发布机关：上海市医疗保障局
   - 官方URL：<https://ybj.sh.gov.cn/gfxwj/20250905/6173c838284f43c3b4d8c8d4513364ed.html>
   - 条款定位：paragraph / 三（四）
   - 原文摘录：参加本市职工医保的灵活就业人员，享受医疗保险待遇的等待期为6个月。
   - 原件SHA-256：`549493856745e71c69843e87abceaa722583f9829c630ae616fda6d28260e587`
3. 政策标题：《上海市职工基本医疗保险办法实施细则（沪医保规〔2025〕7号）》
   - 文档ID：`DOC-SH-MI-FLEX-WAITING-2025`
   - 发布机关：上海市医疗保障局
   - 官方URL：<https://ybj.sh.gov.cn/gfxwj/20250905/6173c838284f43c3b4d8c8d4513364ed.html>
   - 条款定位：paragraph / 三（四）末段
   - 原文摘录：在中断享受职工医保待遇或城乡居民医保待遇后的3个月内以灵活就业人员身份参加职工医保并按规定缴费的，不受待遇等待期规定限制。
   - 原件SHA-256：`549493856745e71c69843e87abceaa722583f9829c630ae616fda6d28260e587`
4. 政策标题：《职工享受医保待遇的条件是什么？（上海市医疗保障局，2026-06-29）》
   - 文档ID：`DOC-SH-MI-RETIREE-CONDITIONS`
   - 发布机关：上海市医疗保障局
   - 官方URL：<https://ybj.sh.gov.cn/cb_jbdyl/20260629/3318d1479e9146c6bbafdac988f5737d.html>
   - 条款定位：body / 正文第三段
   - 原文摘录：用人单位及其职工缴纳医疗保险费的年限（含视作缴费年限）累计超过15年的，职工退休后可以享受基本医疗保险待遇。
   - 原件SHA-256：`bfbd79a9b338d8a781cea6290369be22e2b5fa0c1c8e279938da14497cd7a612`

### 8. 上海医保案例：1969年生女性·灵活就业（触发等待期）

- UID：`RPC-310000-SH-female-before_1970-flexible-MEDICAL-V2`（回归测试UID：`RPCT-310000-SH-female-before_1970-flexible-MEDICAL-V2`）
- 地区：上海（310000）
- 能力：医保（`medical`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`26e917f9-37fe-4dc3-8466-38c1f83dc5a3`
- snapshot hash：`2022ae3268e8356b3b975113a6cb4a1158b0df8914e195a9553f84046c633538`
- 案例content hash：`f6bd64d58f12dd1dd66a514e94abf3d4ac16bf4634b154f51e4e0b77f8c012aa`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：确定性结论
- category：医保；topics：社保规划、上海、医保、合成政策案例
- tags：`上海` `310000` `female` `before_1970` `flexible` `灵活就业` `capability:medical` `险种:养老` `险种:医保`

**合成人物画像**

- 地区：上海
- 性别与出生：女性（女工人口径），1969年1月22日出生
- 就业状态：灵活就业
- 社保累计缴费：养老保险200个月，职工医保150个月
- 灵活就业月缴费基数（本人选择）：7546元
- 职工医保衔接：上次缴费结束2026-01-31，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

**咨询问题**

> 我是1969年1月出生的女性（女工人口径），在上海以灵活就业身份参加职工医保，上次医保2026-01-31停缴、2026-07-01重新参保，这次是否有等待期？退休时享受医保待遇还差多少个月？

**规则引擎结论（公开回答）**

```text
【结论摘要】
退休时享受职工医保待遇所需累计缴费180个月；当前累计150个月，缺口30个月。本次参保前中断6个月，超过衔接豁免范围，需等待6个月后享受待遇。

【关键测算结果】
- 退休所需累计缴费：180个月
- 当前累计缴费（输入）：150个月
- 年限缺口：30个月
- 本次参保前中断：6个月
- 等待期：6个月（需要等待）

【使用的个人条件】
- 地区：上海
- 性别与出生：女性（女工人口径），1969年1月22日出生
- 就业状态：灵活就业
- 社保累计缴费：养老保险200个月，职工医保150个月
- 灵活就业月缴费基数（本人选择）：7546元
- 职工医保衔接：上次缴费结束2026-01-31，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

【政策依据】
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第二十七条
- 《上海市职工基本医疗保险办法实施细则（沪医保规〔2025〕7号）》（上海市医疗保障局）— 定位：paragraph/三（四）；paragraph/三（四）末段
- 《职工享受医保待遇的条件是什么？（上海市医疗保障局，2026-06-29）》（上海市医疗保障局）— 定位：body/正文第三段

【缺失或需确认事项】
- 规则提示（需确认）：医保断缴超过阈值，可能触发等待期；规划中需优先保证医保连续性。（W-MI-WAITING）

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1969-01-22",
    "birth_day": 22,
    "birth_month": 1,
    "birth_year": 1969,
    "female_retire_type": "worker50",
    "gender": "female"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-01-31"
  },
  "social": {
    "flex_contrib_base": 7546,
    "medical_contrib_months": 150,
    "months_paid_at_old_base": 0,
    "pension_contrib_months": 200
  },
  "status": {
    "employment_status": "flexible"
  },
  "subsidy": {
    "has_employment_difficulty_cert": false
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "direct",
  "contribution": {
    "pay_gap_needed": false
  },
  "flex": {
    "applicable": true,
    "contrib_base": 7546,
    "medical_monthly": 754.6,
    "pension_monthly": 1509.2,
    "total_monthly": 2263.8
  },
  "mi": {
    "gap_months": 6,
    "lifetime_gap_months": 30,
    "lifetime_required_months": 180,
    "paid_by_unemployment_fund": false,
    "waiting_period_months": 6,
    "waiting_required": true
  },
  "needs_agent": false,
  "pension": {
    "gap_months": 0,
    "gap_years_ceil": 0,
    "min_years_required": 15
  },
  "retirement": {
    "female_retire_type_status": "confirmed",
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 0,
    "legal_retire_age_years": 50,
    "legal_retire_date": "2019-01-22",
    "legal_retire_month": 1,
    "legal_retire_year": 2019,
    "months_to_legal_retire": -92,
    "original_retire_age_years": 50
  },
  "subsidy": {
    "4050_amount_est": 0,
    "4050_eligible": false,
    "job_amount_est": 0,
    "job_eligible": false,
    "older_ui_pension_fund_eligible": false,
    "selected_option": "none"
  },
  "unemployment": {
    "benefit_stage": null,
    "duration_months": 0,
    "eligible": false,
    "monthly_amount_est": 0
  },
  "warning_details": [
    {
      "text": "医保断缴超过阈值，可能触发等待期；规划中需优先保证医保连续性。",
      "warning_id": "W-MI-WAITING"
    }
  ],
  "warnings": [
    "W-MI-WAITING"
  ]
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.mi.lifetime_required_months` | eq | `180` |
| `calc.mi.lifetime_gap_months` | eq | `30` |
| `calc.mi.waiting_period_months` | eq | `6` |
| `calc.mi.waiting_required` | eq | `true` |

**政策依据**

1. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第二十七条
   - 原文摘录：参加职工基本医疗保险的个人，达到法定退休年龄时累计缴费达到国家规定年限的，退休后不再缴纳基本医疗保险费，按照国家规定享受基本医疗保险待遇；未达到国家规定年限的，可以缴费至国家规定年限。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
2. 政策标题：《上海市职工基本医疗保险办法实施细则（沪医保规〔2025〕7号）》
   - 文档ID：`DOC-SH-MI-FLEX-WAITING-2025`
   - 发布机关：上海市医疗保障局
   - 官方URL：<https://ybj.sh.gov.cn/gfxwj/20250905/6173c838284f43c3b4d8c8d4513364ed.html>
   - 条款定位：paragraph / 三（四）
   - 原文摘录：参加本市职工医保的灵活就业人员，享受医疗保险待遇的等待期为6个月。
   - 原件SHA-256：`549493856745e71c69843e87abceaa722583f9829c630ae616fda6d28260e587`
3. 政策标题：《上海市职工基本医疗保险办法实施细则（沪医保规〔2025〕7号）》
   - 文档ID：`DOC-SH-MI-FLEX-WAITING-2025`
   - 发布机关：上海市医疗保障局
   - 官方URL：<https://ybj.sh.gov.cn/gfxwj/20250905/6173c838284f43c3b4d8c8d4513364ed.html>
   - 条款定位：paragraph / 三（四）末段
   - 原文摘录：在中断享受职工医保待遇或城乡居民医保待遇后的3个月内以灵活就业人员身份参加职工医保并按规定缴费的，不受待遇等待期规定限制。
   - 原件SHA-256：`549493856745e71c69843e87abceaa722583f9829c630ae616fda6d28260e587`
4. 政策标题：《职工享受医保待遇的条件是什么？（上海市医疗保障局，2026-06-29）》
   - 文档ID：`DOC-SH-MI-RETIREE-CONDITIONS`
   - 发布机关：上海市医疗保障局
   - 官方URL：<https://ybj.sh.gov.cn/cb_jbdyl/20260629/3318d1479e9146c6bbafdac988f5737d.html>
   - 条款定位：body / 正文第三段
   - 原文摘录：用人单位及其职工缴纳医疗保险费的年限（含视作缴费年限）累计超过15年的，职工退休后可以享受基本医疗保险待遇。
   - 原件SHA-256：`bfbd79a9b338d8a781cea6290369be22e2b5fa0c1c8e279938da14497cd7a612`

### 9. 上海医保案例：1972年生男性·失业

- UID：`RPC-310000-SH-male-1970_1979-unemployed-MEDICAL-V2`（回归测试UID：`RPCT-310000-SH-male-1970_1979-unemployed-MEDICAL-V2`）
- 地区：上海（310000）
- 能力：医保（`medical`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`26e917f9-37fe-4dc3-8466-38c1f83dc5a3`
- snapshot hash：`2022ae3268e8356b3b975113a6cb4a1158b0df8914e195a9553f84046c633538`
- 案例content hash：`78a397148204e92d364296e33c08cb2b4e3c3c23307452c9b0d57d153298aec1`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：确定性结论
- category：医保；topics：社保规划、上海、医保、合成政策案例
- tags：`上海` `310000` `male` `1970_1979` `unemployed` `失业` `capability:medical` `险种:养老` `险种:医保` `险种:失业`

**合成人物画像**

- 地区：上海
- 性别与出生：男性，1972年12月5日出生
- 就业状态：失业，正在领取失业保险金
- 社保累计缴费：养老保险250个月，职工医保150个月
- 失业保险累计缴费：10年；当前领取阶段：第13-24个月
- 职工医保衔接：上次缴费结束2026-05-31，本次参保2026-08-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

**咨询问题**

> 我是1972年12月出生的男性，目前在上海失业并领取失业保险金，医保2026-05-31停缴后2026-08-01接续参保，会不会有等待期？退休医保年限还差多少？

**规则引擎结论（公开回答）**

```text
【结论摘要】
退休时享受职工医保待遇所需累计缴费180个月；当前累计150个月，缺口30个月。本次参保前中断3个月，在衔接豁免范围内，无需等待期（等待期0个月）。

【关键测算结果】
- 退休所需累计缴费：180个月
- 当前累计缴费（输入）：150个月
- 年限缺口：30个月
- 本次参保前中断：3个月
- 等待期：0个月（无需等待）

【使用的个人条件】
- 地区：上海
- 性别与出生：男性，1972年12月5日出生
- 就业状态：失业，正在领取失业保险金
- 社保累计缴费：养老保险250个月，职工医保150个月
- 失业保险累计缴费：10年；当前领取阶段：第13-24个月
- 职工医保衔接：上次缴费结束2026-05-31，本次参保2026-08-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

【政策依据】
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第二十七条
- 《上海市职工基本医疗保险办法实施细则（沪医保规〔2025〕7号）》（上海市医疗保障局）— 定位：paragraph/三（四）；paragraph/三（四）末段
- 《职工享受医保待遇的条件是什么？（上海市医疗保障局，2026-06-29）》（上海市医疗保障局）— 定位：body/正文第三段

【缺失或需确认事项】
- 规则提示（需确认）：失业金期间，医保通常由失业保险基金代缴（以经办口径为准）。规划现金流时请不要重复计算医保个人缴费。（W-UI-MI-PAID）

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1972-12-05",
    "birth_day": 5,
    "birth_month": 12,
    "birth_year": 1972,
    "gender": "male"
  },
  "mi": {
    "enroll_date": "2026-08-01",
    "prev_end_date": "2026-05-31"
  },
  "social": {
    "medical_contrib_months": 150,
    "months_paid_at_old_base": 0,
    "pension_contrib_months": 250,
    "ui_benefit_stage": "13-24",
    "unemployment_insurance_years": 10
  },
  "status": {
    "employment_status": "unemployed",
    "on_unemployment_benefit": true
  },
  "subsidy": {
    "has_employment_difficulty_cert": false
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "direct",
  "contribution": {
    "pay_gap_needed": false
  },
  "flex": {
    "applicable": false
  },
  "mi": {
    "gap_months": 3,
    "lifetime_gap_months": 30,
    "lifetime_required_months": 180,
    "paid_by_unemployment_fund": true,
    "waiting_period_months": 0,
    "waiting_required": false
  },
  "needs_agent": false,
  "pension": {
    "gap_months": 0,
    "gap_years_ceil": 0,
    "min_years_required": 17.5
  },
  "retirement": {
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 0,
    "legal_retire_age_years": 62,
    "legal_retire_date": "2034-12-05",
    "legal_retire_month": 12,
    "legal_retire_year": 2034,
    "months_to_legal_retire": 99,
    "original_retire_age_years": 60
  },
  "subsidy": {
    "4050_amount_est": 0,
    "4050_eligible": false,
    "job_amount_est": 0,
    "job_eligible": false,
    "selected_option": "none"
  },
  "unemployment": {
    "benefit_stage": "13-24",
    "duration_months": 20,
    "duration_months_raw": 20,
    "eligible": true,
    "monthly_amount_est": 1872
  },
  "warning_details": [
    {
      "text": "失业金期间，医保通常由失业保险基金代缴（以经办口径为准）。规划现金流时请不要重复计算医保个人缴费。",
      "warning_id": "W-UI-MI-PAID"
    }
  ],
  "warnings": [
    "W-UI-MI-PAID"
  ]
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.mi.lifetime_required_months` | eq | `180` |
| `calc.mi.lifetime_gap_months` | eq | `30` |
| `calc.mi.waiting_period_months` | eq | `0` |
| `calc.mi.waiting_required` | eq | `false` |

**政策依据**

1. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第二十七条
   - 原文摘录：参加职工基本医疗保险的个人，达到法定退休年龄时累计缴费达到国家规定年限的，退休后不再缴纳基本医疗保险费，按照国家规定享受基本医疗保险待遇；未达到国家规定年限的，可以缴费至国家规定年限。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
2. 政策标题：《上海市职工基本医疗保险办法实施细则（沪医保规〔2025〕7号）》
   - 文档ID：`DOC-SH-MI-FLEX-WAITING-2025`
   - 发布机关：上海市医疗保障局
   - 官方URL：<https://ybj.sh.gov.cn/gfxwj/20250905/6173c838284f43c3b4d8c8d4513364ed.html>
   - 条款定位：paragraph / 三（四）
   - 原文摘录：参加本市职工医保的灵活就业人员，享受医疗保险待遇的等待期为6个月。
   - 原件SHA-256：`549493856745e71c69843e87abceaa722583f9829c630ae616fda6d28260e587`
3. 政策标题：《上海市职工基本医疗保险办法实施细则（沪医保规〔2025〕7号）》
   - 文档ID：`DOC-SH-MI-FLEX-WAITING-2025`
   - 发布机关：上海市医疗保障局
   - 官方URL：<https://ybj.sh.gov.cn/gfxwj/20250905/6173c838284f43c3b4d8c8d4513364ed.html>
   - 条款定位：paragraph / 三（四）末段
   - 原文摘录：在中断享受职工医保待遇或城乡居民医保待遇后的3个月内以灵活就业人员身份参加职工医保并按规定缴费的，不受待遇等待期规定限制。
   - 原件SHA-256：`549493856745e71c69843e87abceaa722583f9829c630ae616fda6d28260e587`
4. 政策标题：《职工享受医保待遇的条件是什么？（上海市医疗保障局，2026-06-29）》
   - 文档ID：`DOC-SH-MI-RETIREE-CONDITIONS`
   - 发布机关：上海市医疗保障局
   - 官方URL：<https://ybj.sh.gov.cn/cb_jbdyl/20260629/3318d1479e9146c6bbafdac988f5737d.html>
   - 条款定位：body / 正文第三段
   - 原文摘录：用人单位及其职工缴纳医疗保险费的年限（含视作缴费年限）累计超过15年的，职工退休后可以享受基本医疗保险待遇。
   - 原件SHA-256：`bfbd79a9b338d8a781cea6290369be22e2b5fa0c1c8e279938da14497cd7a612`

### 10. 上海失业案例：1966年生女性·在职（单位参保）（规则不适用）

- UID：`RPC-310000-SH-female-before_1970-employed-UNEMPLOYMENT-V2`（回归测试UID：`RPCT-310000-SH-female-before_1970-employed-UNEMPLOYMENT-V2`）
- 地区：上海（310000）
- 能力：失业（`unemployment`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`26e917f9-37fe-4dc3-8466-38c1f83dc5a3`
- snapshot hash：`2022ae3268e8356b3b975113a6cb4a1158b0df8914e195a9553f84046c633538`
- 案例content hash：`bc2a20f7ee3932adc9e4f0e262f1abc637bb0164f38b8533a2a649410cd7860d`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：确定性结论
- category：失业；topics：社保规划、上海、失业、合成政策案例
- tags：`上海` `310000` `female` `before_1970` `employed` `capability:unemployment` `险种:养老` `险种:医保`

**合成人物画像**

- 地区：上海
- 性别与出生：女性（女干部口径），1966年9月9日出生
- 就业状态：在职（单位参保）
- 社保累计缴费：养老保险360个月，职工医保360个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

**咨询问题**

> 我是1966年9月出生的女性（女干部口径），目前在上海在单位在职参保，如果现在咨询失业保险金，我是否符合领取条件？

**规则引擎结论（公开回答）**

```text
【结论摘要】
当前就业状态为在职（单位参保），不属于失业保险金领取范围（领取资格：否），核定领取期限0个月，不产生失业保险金金额。

【关键测算结果】
- 领取资格：否（就业状态在职（单位参保））
- 领取期限：0个月
- 月领取标准：0元（不适用）

【使用的个人条件】
- 地区：上海
- 性别与出生：女性（女干部口径），1966年9月9日出生
- 就业状态：在职（单位参保）
- 社保累计缴费：养老保险360个月，职工医保360个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

【政策依据】
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第四十六条；article/第四十五条
- 《失业保险条例（国务院令第258号）》（国务院）— 定位：article/第十七条；article/第十四条
- 《上海市失业保险金申领发放实施办法（沪人社规〔2026〕18号）》（上海市人力资源和社会保障局）— 定位：paragraph/五

【缺失或需确认事项】
- 无。本案例输入完整，结论为确定性计算结果。

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1966-09-09",
    "birth_day": 9,
    "birth_month": 9,
    "birth_year": 1966,
    "female_retire_type": "cadre55",
    "gender": "female"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "medical_contrib_months": 360,
    "months_paid_at_old_base": 0,
    "pension_contrib_months": 360
  },
  "status": {
    "employment_status": "employed"
  },
  "subsidy": {
    "has_employment_difficulty_cert": false
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "direct",
  "contribution": {
    "pay_gap_needed": false
  },
  "flex": {
    "applicable": false
  },
  "mi": {
    "gap_months": 1,
    "lifetime_gap_months": 0,
    "lifetime_required_months": 180,
    "paid_by_unemployment_fund": false,
    "waiting_period_months": 0,
    "waiting_required": false
  },
  "needs_agent": false,
  "pension": {
    "gap_months": 0,
    "gap_years_ceil": 0,
    "min_years_required": 15
  },
  "retirement": {
    "female_retire_type_status": "confirmed",
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 0,
    "legal_retire_age_years": 55,
    "legal_retire_date": "2021-09-09",
    "legal_retire_month": 9,
    "legal_retire_year": 2021,
    "months_to_legal_retire": -60,
    "original_retire_age_years": 55
  },
  "subsidy": {
    "4050_amount_est": 0,
    "4050_eligible": false,
    "job_amount_est": 0,
    "job_eligible": false,
    "older_ui_pension_fund_eligible": false,
    "selected_option": "none"
  },
  "unemployment": {
    "benefit_stage": null,
    "duration_months": 0,
    "eligible": false,
    "monthly_amount_est": 0
  },
  "warning_details": [],
  "warnings": []
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.unemployment.eligible` | eq | `false` |
| `calc.unemployment.duration_months` | eq | `0` |

**政策依据**

1. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第四十六条
   - 原文摘录：失业人员失业前用人单位和本人累计缴费满一年不足五年的，领取失业保险金的期限最长为十二个月；累计缴费满五年不足十年的，领取失业保险金的期限最长为十八个月；累计缴费十年以上的，领取失业保险金的期限最长为二十四个月。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
2. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第四十六条
   - 原文摘录：重新就业后，再次失业的，缴费时间重新计算，领取失业保险金的期限与前次失业应当领取而尚未领取的失业保险金的期限合并计算，最长不超过二十四个月。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
3. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第四十五条
   - 原文摘录：失业人员符合下列条件的，从失业保险基金中领取失业保险金：（一）失业前用人单位和本人已经缴纳失业保险费满一年的；（二）非因本人意愿中断就业的；（三）已经进行失业登记，并有求职要求的。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
4. 政策标题：《失业保险条例（国务院令第258号）》
   - 文档ID：`DOC-CN-UNEMPLOYMENT-REGULATION`
   - 发布机关：国务院
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fg/202011/t20201103_394936.html>
   - 条款定位：article / 第十七条
   - 原文摘录：失业人员失业前所在单位和本人按照规定累计缴费时间满1年不足5年的，领取失业保险金的期限最长为12个月；累计缴费时间满5年不足10年的，领取失业保险金的期限最长为18个月；累计缴费时间10年以上的，领取失业保险金的期限最长为24个月。
   - 原件SHA-256：`b8187965656565984549569e9894a62cb3960f5a64aacac3749b80be2d7a3e04`
5. 政策标题：《失业保险条例（国务院令第258号）》
   - 文档ID：`DOC-CN-UNEMPLOYMENT-REGULATION`
   - 发布机关：国务院
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fg/202011/t20201103_394936.html>
   - 条款定位：article / 第十四条
   - 原文摘录：具备下列条件的失业人员，可以领取失业保险金：（一）按照规定参加失业保险，所在单位和本人已按照规定履行缴费义务满1年的；（二）非因本人意愿中断就业的；（三）已办理失业登记，并有求职要求的。
   - 原件SHA-256：`b8187965656565984549569e9894a62cb3960f5a64aacac3749b80be2d7a3e04`
6. 政策标题：《上海市失业保险金申领发放实施办法（沪人社规〔2026〕18号）》
   - 文档ID：`DOC-SH-UI-CLAIM-RULES-2026`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tshbx_17729/20260812/t0035_1443067.html>
   - 条款定位：paragraph / 五
   - 原文摘录：缴费年限累计满1年不满2年的，领取失业保险金期限为2个月；以后缴费年限每增加1年，期限增加2个月，依此类推，一次核定领取的期限最长不超过24个月。
   - 原件SHA-256：`c53260044ae652bb6024c6d20de2fa0354c0d21adb64676df1e35c957499ec9e`

### 11. 上海失业案例：1977年生男性·灵活就业（规则不适用）

- UID：`RPC-310000-SH-male-1970_1979-flexible-UNEMPLOYMENT-V2`（回归测试UID：`RPCT-310000-SH-male-1970_1979-flexible-UNEMPLOYMENT-V2`）
- 地区：上海（310000）
- 能力：失业（`unemployment`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`26e917f9-37fe-4dc3-8466-38c1f83dc5a3`
- snapshot hash：`2022ae3268e8356b3b975113a6cb4a1158b0df8914e195a9553f84046c633538`
- 案例content hash：`0b123e6ae6e7efba5b6fa485618464bb44dd50551c703cfd12a69c20b52ce04c`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：确定性结论
- category：失业；topics：社保规划、上海、失业、合成政策案例
- tags：`上海` `310000` `male` `1970_1979` `flexible` `灵活就业` `capability:unemployment` `险种:养老` `险种:医保`

**合成人物画像**

- 地区：上海
- 性别与出生：男性，1977年3月28日出生
- 就业状态：灵活就业
- 社保累计缴费：养老保险200个月，职工医保200个月
- 灵活就业月缴费基数（本人选择）：8000元
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

**咨询问题**

> 我是1977年3月出生的男性，在上海以灵活就业身份参保，现在能否申领失业保险金？

**规则引擎结论（公开回答）**

```text
【结论摘要】
当前就业状态为灵活就业，不属于失业保险金领取范围（领取资格：否），核定领取期限0个月，不产生失业保险金金额。

【关键测算结果】
- 领取资格：否（就业状态灵活就业）
- 领取期限：0个月
- 月领取标准：0元（不适用）

【使用的个人条件】
- 地区：上海
- 性别与出生：男性，1977年3月28日出生
- 就业状态：灵活就业
- 社保累计缴费：养老保险200个月，职工医保200个月
- 灵活就业月缴费基数（本人选择）：8000元
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

【政策依据】
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第四十六条；article/第四十五条
- 《失业保险条例（国务院令第258号）》（国务院）— 定位：article/第十七条；article/第十四条
- 《上海市失业保险金申领发放实施办法（沪人社规〔2026〕18号）》（上海市人力资源和社会保障局）— 定位：paragraph/五

【缺失或需确认事项】
- 无。本案例输入完整，结论为确定性计算结果。

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1977-03-28",
    "birth_day": 28,
    "birth_month": 3,
    "birth_year": 1977,
    "gender": "male"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "flex_contrib_base": 8000,
    "medical_contrib_months": 200,
    "months_paid_at_old_base": 0,
    "pension_contrib_months": 200
  },
  "status": {
    "employment_status": "flexible"
  },
  "subsidy": {
    "has_employment_difficulty_cert": false
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "direct",
  "contribution": {
    "pay_gap_needed": false
  },
  "flex": {
    "applicable": true,
    "contrib_base": 8000,
    "medical_monthly": 800,
    "pension_monthly": 1600,
    "total_monthly": 2400
  },
  "mi": {
    "gap_months": 1,
    "lifetime_gap_months": 0,
    "lifetime_required_months": 180,
    "paid_by_unemployment_fund": false,
    "waiting_period_months": 0,
    "waiting_required": false
  },
  "needs_agent": false,
  "pension": {
    "gap_months": 40,
    "gap_years_ceil": 4,
    "min_years_required": 20
  },
  "retirement": {
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 0,
    "legal_retire_age_years": 63,
    "legal_retire_date": "2040-03-28",
    "legal_retire_month": 3,
    "legal_retire_year": 2040,
    "months_to_legal_retire": 162,
    "original_retire_age_years": 60
  },
  "subsidy": {
    "4050_amount_est": 0,
    "4050_eligible": false,
    "job_amount_est": 0,
    "job_eligible": false,
    "older_ui_pension_fund_eligible": false,
    "selected_option": "none"
  },
  "unemployment": {
    "benefit_stage": null,
    "duration_months": 0,
    "eligible": false,
    "monthly_amount_est": 0
  },
  "warning_details": [],
  "warnings": []
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.unemployment.eligible` | eq | `false` |
| `calc.unemployment.duration_months` | eq | `0` |

**政策依据**

1. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第四十六条
   - 原文摘录：失业人员失业前用人单位和本人累计缴费满一年不足五年的，领取失业保险金的期限最长为十二个月；累计缴费满五年不足十年的，领取失业保险金的期限最长为十八个月；累计缴费十年以上的，领取失业保险金的期限最长为二十四个月。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
2. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第四十六条
   - 原文摘录：重新就业后，再次失业的，缴费时间重新计算，领取失业保险金的期限与前次失业应当领取而尚未领取的失业保险金的期限合并计算，最长不超过二十四个月。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
3. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第四十五条
   - 原文摘录：失业人员符合下列条件的，从失业保险基金中领取失业保险金：（一）失业前用人单位和本人已经缴纳失业保险费满一年的；（二）非因本人意愿中断就业的；（三）已经进行失业登记，并有求职要求的。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
4. 政策标题：《失业保险条例（国务院令第258号）》
   - 文档ID：`DOC-CN-UNEMPLOYMENT-REGULATION`
   - 发布机关：国务院
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fg/202011/t20201103_394936.html>
   - 条款定位：article / 第十七条
   - 原文摘录：失业人员失业前所在单位和本人按照规定累计缴费时间满1年不足5年的，领取失业保险金的期限最长为12个月；累计缴费时间满5年不足10年的，领取失业保险金的期限最长为18个月；累计缴费时间10年以上的，领取失业保险金的期限最长为24个月。
   - 原件SHA-256：`b8187965656565984549569e9894a62cb3960f5a64aacac3749b80be2d7a3e04`
5. 政策标题：《失业保险条例（国务院令第258号）》
   - 文档ID：`DOC-CN-UNEMPLOYMENT-REGULATION`
   - 发布机关：国务院
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fg/202011/t20201103_394936.html>
   - 条款定位：article / 第十四条
   - 原文摘录：具备下列条件的失业人员，可以领取失业保险金：（一）按照规定参加失业保险，所在单位和本人已按照规定履行缴费义务满1年的；（二）非因本人意愿中断就业的；（三）已办理失业登记，并有求职要求的。
   - 原件SHA-256：`b8187965656565984549569e9894a62cb3960f5a64aacac3749b80be2d7a3e04`
6. 政策标题：《上海市失业保险金申领发放实施办法（沪人社规〔2026〕18号）》
   - 文档ID：`DOC-SH-UI-CLAIM-RULES-2026`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tshbx_17729/20260812/t0035_1443067.html>
   - 条款定位：paragraph / 五
   - 原文摘录：缴费年限累计满1年不满2年的，领取失业保险金期限为2个月；以后缴费年限每增加1年，期限增加2个月，依此类推，一次核定领取的期限最长不超过24个月。
   - 原件SHA-256：`c53260044ae652bb6024c6d20de2fa0354c0d21adb64676df1e35c957499ec9e`

### 12. 上海失业案例：1988年生女性·失业

- UID：`RPC-310000-SH-female-from_1980-unemployed-UNEMPLOYMENT-V2`（回归测试UID：`RPCT-310000-SH-female-from_1980-unemployed-UNEMPLOYMENT-V2`）
- 地区：上海（310000）
- 能力：失业（`unemployment`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`26e917f9-37fe-4dc3-8466-38c1f83dc5a3`
- snapshot hash：`2022ae3268e8356b3b975113a6cb4a1158b0df8914e195a9553f84046c633538`
- 案例content hash：`ee23fceb5cc4de08c8199252fe5e979e27ab6e3f229d8cc6bfa2052b2c2d456c`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：确定性结论
- category：失业；topics：社保规划、上海、失业、合成政策案例
- tags：`上海` `310000` `female` `from_1980` `unemployed` `失业` `capability:unemployment` `险种:养老` `险种:医保` `险种:失业`

**合成人物画像**

- 地区：上海
- 性别与出生：女性（女工人口径），1988年6月17日出生
- 就业状态：失业，正在领取失业保险金
- 社保累计缴费：养老保险120个月，职工医保120个月
- 失业保险累计缴费：10年；本段已领取：14个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

**咨询问题**

> 我是1988年6月出生的女性（女工人口径），在上海失业前失业保险累计缴了10年，正在领取失业保险金、已领14个月，一共能领多长时间？现在这一阶段每月多少钱？

**规则引擎结论（公开回答）**

```text
【结论摘要】
符合失业保险金领取条件（失业保险累计缴费10年），核定领取期限20个月。当前处于第13-24个月领取阶段，对应标准1872元/月。

【关键测算结果】
- 领取资格：是
- 核定领取期限：20个月
- 当前领取阶段：第13-24个月
- 本阶段月领取标准：1872元

【使用的个人条件】
- 地区：上海
- 性别与出生：女性（女工人口径），1988年6月17日出生
- 就业状态：失业，正在领取失业保险金
- 社保累计缴费：养老保险120个月，职工医保120个月
- 失业保险累计缴费：10年；本段已领取：14个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

【政策依据】
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第四十六条；article/第四十五条
- 《失业保险条例（国务院令第258号）》（国务院）— 定位：article/第十七条；article/第十四条
- 《上海市人力资源和社会保障局关于调整本市失业保险金支付标准的通知（沪人社规〔2026〕7号）》（上海市人力资源和社会保障局）— 定位：paragraph/二；paragraph/一；paragraph/一（二）；paragraph/一（三）；paragraph/一（一）
- 《上海市失业保险金申领发放实施办法（沪人社规〔2026〕18号）》（上海市人力资源和社会保障局）— 定位：paragraph/六；paragraph/五
- 《延长领取失业保险金需要符合什么条件？需要个人申请吗？（上海市人力资源和社会保障局）》（上海市人力资源和社会保障局）— 定位：body/答
- 《延长领取失业保险金标准高于第13-24个月标准80%的原因说明（上海市人力资源和社会保障局，2026-07-06）》（上海市人力资源和社会保障局）— 定位：body/正文

【缺失或需确认事项】
- 规则提示（需确认）：失业金期间，医保通常由失业保险基金代缴（以经办口径为准）。规划现金流时请不要重复计算医保个人缴费。（W-UI-MI-PAID）

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1988-06-17",
    "birth_day": 17,
    "birth_month": 6,
    "birth_year": 1988,
    "female_retire_type": "worker50",
    "gender": "female"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "medical_contrib_months": 120,
    "months_paid_at_old_base": 0,
    "pension_contrib_months": 120,
    "ui_claimed_months": 14,
    "unemployment_insurance_years": 10
  },
  "status": {
    "employment_status": "unemployed",
    "on_unemployment_benefit": true
  },
  "subsidy": {
    "has_employment_difficulty_cert": false
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "direct",
  "contribution": {
    "pay_gap_needed": false
  },
  "flex": {
    "applicable": false
  },
  "mi": {
    "gap_months": 1,
    "lifetime_gap_months": 60,
    "lifetime_required_months": 180,
    "paid_by_unemployment_fund": true,
    "waiting_period_months": 0,
    "waiting_required": false
  },
  "needs_agent": false,
  "pension": {
    "gap_months": 120,
    "gap_years_ceil": 10,
    "min_years_required": 20
  },
  "retirement": {
    "female_retire_type_status": "confirmed",
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 0,
    "legal_retire_age_years": 55,
    "legal_retire_date": "2043-06-17",
    "legal_retire_month": 6,
    "legal_retire_year": 2043,
    "months_to_legal_retire": 201,
    "original_retire_age_years": 50
  },
  "subsidy": {
    "4050_amount_est": 0,
    "4050_eligible": false,
    "job_amount_est": 0,
    "job_eligible": false,
    "selected_option": "none"
  },
  "unemployment": {
    "benefit_stage": "13-24",
    "duration_months": 20,
    "duration_months_raw": 20,
    "eligible": true,
    "monthly_amount_est": 1872
  },
  "warning_details": [
    {
      "text": "失业金期间，医保通常由失业保险基金代缴（以经办口径为准）。规划现金流时请不要重复计算医保个人缴费。",
      "warning_id": "W-UI-MI-PAID"
    }
  ],
  "warnings": [
    "W-UI-MI-PAID"
  ]
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.unemployment.eligible` | eq | `true` |
| `calc.unemployment.duration_months` | eq | `20` |
| `calc.unemployment.benefit_stage` | eq | `"13-24"` |
| `calc.unemployment.monthly_amount_est` | eq | `1872` |

**政策依据**

1. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第四十六条
   - 原文摘录：失业人员失业前用人单位和本人累计缴费满一年不足五年的，领取失业保险金的期限最长为十二个月；累计缴费满五年不足十年的，领取失业保险金的期限最长为十八个月；累计缴费十年以上的，领取失业保险金的期限最长为二十四个月。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
2. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第四十六条
   - 原文摘录：重新就业后，再次失业的，缴费时间重新计算，领取失业保险金的期限与前次失业应当领取而尚未领取的失业保险金的期限合并计算，最长不超过二十四个月。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
3. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第四十五条
   - 原文摘录：失业人员符合下列条件的，从失业保险基金中领取失业保险金：（一）失业前用人单位和本人已经缴纳失业保险费满一年的；（二）非因本人意愿中断就业的；（三）已经进行失业登记，并有求职要求的。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
4. 政策标题：《失业保险条例（国务院令第258号）》
   - 文档ID：`DOC-CN-UNEMPLOYMENT-REGULATION`
   - 发布机关：国务院
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fg/202011/t20201103_394936.html>
   - 条款定位：article / 第十七条
   - 原文摘录：失业人员失业前所在单位和本人按照规定累计缴费时间满1年不足5年的，领取失业保险金的期限最长为12个月；累计缴费时间满5年不足10年的，领取失业保险金的期限最长为18个月；累计缴费时间10年以上的，领取失业保险金的期限最长为24个月。
   - 原件SHA-256：`b8187965656565984549569e9894a62cb3960f5a64aacac3749b80be2d7a3e04`
5. 政策标题：《失业保险条例（国务院令第258号）》
   - 文档ID：`DOC-CN-UNEMPLOYMENT-REGULATION`
   - 发布机关：国务院
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fg/202011/t20201103_394936.html>
   - 条款定位：article / 第十四条
   - 原文摘录：具备下列条件的失业人员，可以领取失业保险金：（一）按照规定参加失业保险，所在单位和本人已按照规定履行缴费义务满1年的；（二）非因本人意愿中断就业的；（三）已办理失业登记，并有求职要求的。
   - 原件SHA-256：`b8187965656565984549569e9894a62cb3960f5a64aacac3749b80be2d7a3e04`
6. 政策标题：《上海市人力资源和社会保障局关于调整本市失业保险金支付标准的通知（沪人社规〔2026〕7号）》
   - 文档ID：`DOC-SH-UI-BENEFIT-2026`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tshbx_17729/20260702/t0035_1442080.html>
   - 条款定位：paragraph / 二
   - 原文摘录：上述失业保险金支付标准自2026年7月1日起执行。本通知有效期至2028年6月30日。
   - 原件SHA-256：`47ea8304b41063734aaa1321a5d78b88f983ae488ceb1e83701e736c80a96d09`
7. 政策标题：《上海市人力资源和社会保障局关于调整本市失业保险金支付标准的通知（沪人社规〔2026〕7号）》
   - 文档ID：`DOC-SH-UI-BENEFIT-2026`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tshbx_17729/20260702/t0035_1442080.html>
   - 条款定位：paragraph / 一
   - 原文摘录：（一）第1-12个月领取失业保险金的失业人员，失业保险金发放标准为2340元/月；
   - 原件SHA-256：`47ea8304b41063734aaa1321a5d78b88f983ae488ceb1e83701e736c80a96d09`
8. 政策标题：《上海市人力资源和社会保障局关于调整本市失业保险金支付标准的通知（沪人社规〔2026〕7号）》
   - 文档ID：`DOC-SH-UI-BENEFIT-2026`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tshbx_17729/20260702/t0035_1442080.html>
   - 条款定位：paragraph / 一（二）
   - 原文摘录：第13-24个月领取失业保险金的失业人员，失业保险金发放标准为1872元/月；
   - 原件SHA-256：`47ea8304b41063734aaa1321a5d78b88f983ae488ceb1e83701e736c80a96d09`
9. 政策标题：《上海市人力资源和社会保障局关于调整本市失业保险金支付标准的通知（沪人社规〔2026〕7号）》
   - 文档ID：`DOC-SH-UI-BENEFIT-2026`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tshbx_17729/20260702/t0035_1442080.html>
   - 条款定位：paragraph / 一（三）
   - 原文摘录：延长领取失业保险金的失业人员，失业保险金发放标准为1690元/月。
   - 原件SHA-256：`47ea8304b41063734aaa1321a5d78b88f983ae488ceb1e83701e736c80a96d09`
10. 政策标题：《上海市人力资源和社会保障局关于调整本市失业保险金支付标准的通知（沪人社规〔2026〕7号）》
   - 文档ID：`DOC-SH-UI-BENEFIT-2026`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tshbx_17729/20260702/t0035_1442080.html>
   - 条款定位：paragraph / 一（一）
   - 原文摘录：第1-12个月领取失业保险金的失业人员，失业保险金发放标准为2340元/月；
   - 原件SHA-256：`47ea8304b41063734aaa1321a5d78b88f983ae488ceb1e83701e736c80a96d09`
11. 政策标题：《上海市失业保险金申领发放实施办法（沪人社规〔2026〕18号）》
   - 文档ID：`DOC-SH-UI-CLAIM-RULES-2026`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tshbx_17729/20260812/t0035_1443067.html>
   - 条款定位：paragraph / 六
   - 原文摘录：失业人员每月领取失业保险金的标准最高不得超过本市最低工资标准，最低不得低于本市最低生活保障标准。第1-12个月按实际支付标准，第13-24个月按第1-12个月实际支付标准的80%支付
   - 原件SHA-256：`c53260044ae652bb6024c6d20de2fa0354c0d21adb64676df1e35c957499ec9e`
12. 政策标题：《上海市失业保险金申领发放实施办法（沪人社规〔2026〕18号）》
   - 文档ID：`DOC-SH-UI-CLAIM-RULES-2026`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tshbx_17729/20260812/t0035_1443067.html>
   - 条款定位：paragraph / 五
   - 原文摘录：缴费年限累计满1年不满2年的，领取失业保险金期限为2个月；以后缴费年限每增加1年，期限增加2个月，依此类推，一次核定领取的期限最长不超过24个月。
   - 原件SHA-256：`c53260044ae652bb6024c6d20de2fa0354c0d21adb64676df1e35c957499ec9e`
13. 政策标题：《延长领取失业保险金需要符合什么条件？需要个人申请吗？（上海市人力资源和社会保障局）》
   - 文档ID：`DOC-SH-UI-EXTENDED-CONDITIONS-2026`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tlqtj_17563/20260817/t0035_1443151.html>
   - 条款定位：body / 答
   - 原文摘录：自2026年8月16日起，个人领取失业保险金期满时仍未就业且距离法定退休年龄不足1年的，可延长领取失业保险金直至法定退休年龄。
   - 原件SHA-256：`d36d41d6cc51454f0177baf28be52dc9e5039f1d97c3b857d4cbd5416f3318b1`
14. 政策标题：《延长领取失业保险金标准高于第13-24个月标准80%的原因说明（上海市人力资源和社会保障局，2026-07-06）》
   - 文档ID：`DOC-SH-UI-STANDARD-EXPLAIN-2026`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tlqbz_17564/20260706/t0035_1442140.html>
   - 条款定位：body / 正文
   - 原文摘录：因此根据本市失业保险相关规定，2026年本市延长领取失业保险金的标准为1690元。
   - 原件SHA-256：`3b31a97ef37ec0abf554f20107b180087adf05119c6d78dcc1a638ba23359cd1`

### 13. 上海灵活就业案例：1979年生男性·在职（单位参保）（规则不适用）

- UID：`RPC-310000-SH-male-1970_1979-employed-FLEXIBLE-V2`（回归测试UID：`RPCT-310000-SH-male-1970_1979-employed-FLEXIBLE-V2`）
- 地区：上海（310000）
- 能力：灵活就业（`flexible`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`26e917f9-37fe-4dc3-8466-38c1f83dc5a3`
- snapshot hash：`2022ae3268e8356b3b975113a6cb4a1158b0df8914e195a9553f84046c633538`
- 案例content hash：`f40bb32b2a18520803e6279e51b65262d6bc8e7ed6bb56a4d2fbdaa0a4880622`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：确定性结论
- category：灵活就业；topics：社保规划、上海、灵活就业、合成政策案例
- tags：`上海` `310000` `male` `1970_1979` `employed` `capability:flexible` `险种:养老` `险种:医保`

**合成人物画像**

- 地区：上海
- 性别与出生：男性，1979年9月30日出生
- 就业状态：在职（单位参保）
- 社保累计缴费：养老保险220个月，职工医保220个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

**咨询问题**

> 我是1979年9月出生的男性，目前在上海在单位在职参保，灵活就业人员的养老、医保缴费标准对我适用吗？

**规则引擎结论（公开回答）**

```text
【结论摘要】
当前就业状态为在职（单位参保），灵活就业人员缴费规则不适用（适用：否），不生成灵活就业月缴费金额。

【关键测算结果】
- 灵活就业缴费规则适用：否（就业状态在职（单位参保））

【使用的个人条件】
- 地区：上海
- 性别与出生：男性，1979年9月30日出生
- 就业状态：在职（单位参保）
- 社保累计缴费：养老保险220个月，职工医保220个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

【政策依据】
- 《单位职工缴纳城镇养老保险的基数是多少？（上海市人力资源和社会保障局）》（上海市人力资源和社会保障局）— 定位：body/答末段
- 《灵活就业人员按什么标准缴费？（上海市人力资源和社会保障局，2024-03-07）》（上海市人力资源和社会保障局）— 定位：body/答

【缺失或需确认事项】
- 无。本案例输入完整，结论为确定性计算结果。

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1979-09-30",
    "birth_day": 30,
    "birth_month": 9,
    "birth_year": 1979,
    "gender": "male"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "medical_contrib_months": 220,
    "months_paid_at_old_base": 0,
    "pension_contrib_months": 220
  },
  "status": {
    "employment_status": "employed"
  },
  "subsidy": {
    "has_employment_difficulty_cert": false
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "direct",
  "contribution": {
    "pay_gap_needed": false
  },
  "flex": {
    "applicable": false
  },
  "mi": {
    "gap_months": 1,
    "lifetime_gap_months": 0,
    "lifetime_required_months": 180,
    "paid_by_unemployment_fund": false,
    "waiting_period_months": 0,
    "waiting_required": false
  },
  "needs_agent": false,
  "pension": {
    "gap_months": 20,
    "gap_years_ceil": 2,
    "min_years_required": 20
  },
  "retirement": {
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 0,
    "legal_retire_age_years": 63,
    "legal_retire_date": "2042-09-30",
    "legal_retire_month": 9,
    "legal_retire_year": 2042,
    "months_to_legal_retire": 192,
    "original_retire_age_years": 60
  },
  "subsidy": {
    "4050_amount_est": 0,
    "4050_eligible": false,
    "job_amount_est": 0,
    "job_eligible": false,
    "older_ui_pension_fund_eligible": false,
    "selected_option": "none"
  },
  "unemployment": {
    "benefit_stage": null,
    "duration_months": 0,
    "eligible": false,
    "monthly_amount_est": 0
  },
  "warning_details": [],
  "warnings": []
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.flex.applicable` | eq | `false` |

**政策依据**

1. 政策标题：《单位职工缴纳城镇养老保险的基数是多少？（上海市人力资源和社会保障局）》
   - 文档ID：`DOC-SH-CONTRIB-BASE-2026`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tdjjf_17554/20260824/t0035_1443297.html>
   - 条款定位：body / 答末段
   - 原文摘录：2026年7月1日起，本市社保缴费基数的上限调整为37731元/月,下限调整为7546元/月。
   - 原件SHA-256：`dc4c73495e55611f69792b21385bc1098ec98a853857b99fe138f79e8119936d`
2. 政策标题：《灵活就业人员按什么标准缴费？（上海市人力资源和社会保障局，2024-03-07）》
   - 文档ID：`DOC-SH-FLEX-RATES`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tdjjf_17554/20200918/t0035_1393992.html>
   - 条款定位：body / 答
   - 原文摘录：灵活就业人员缴纳基本养老、医疗保险费的基数在本市上年度全口径城镇单位就业人员月平均工资的60%至300%之间，由本人自行选择。
   - 原件SHA-256：`297352d22d52e1a9babf4218abc751dd363177dfa7ad947124f6e7363bc39e8a`
3. 政策标题：《灵活就业人员按什么标准缴费？（上海市人力资源和社会保障局，2024-03-07）》
   - 文档ID：`DOC-SH-FLEX-RATES`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tdjjf_17554/20200918/t0035_1393992.html>
   - 条款定位：body / 答
   - 原文摘录：月缴费标准为本人缴费基数乘以相应的费率，2024年3月1日起，本市灵活就业人员缴纳职工基本养老保险费的比例为20%，职工基本医疗保险费的比例为10%。
   - 原件SHA-256：`297352d22d52e1a9babf4218abc751dd363177dfa7ad947124f6e7363bc39e8a`

### 14. 上海灵活就业案例：1990年生女性·灵活就业

- UID：`RPC-310000-SH-female-from_1980-flexible-FLEXIBLE-V2`（回归测试UID：`RPCT-310000-SH-female-from_1980-flexible-FLEXIBLE-V2`）
- 地区：上海（310000）
- 能力：灵活就业（`flexible`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`26e917f9-37fe-4dc3-8466-38c1f83dc5a3`
- snapshot hash：`2022ae3268e8356b3b975113a6cb4a1158b0df8914e195a9553f84046c633538`
- 案例content hash：`8bf12764a1ca7b120006f36f78e1abbca4b2ccf8af0f8896238506071492192f`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：确定性结论
- category：灵活就业；topics：社保规划、上海、灵活就业、合成政策案例
- tags：`上海` `310000` `female` `from_1980` `flexible` `灵活就业` `capability:flexible` `险种:养老` `险种:医保`

**合成人物画像**

- 地区：上海
- 性别与出生：女性（女工人口径），1990年4月11日出生
- 就业状态：灵活就业
- 社保累计缴费：养老保险100个月，职工医保100个月
- 灵活就业月缴费基数（本人选择）：7546元
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

**咨询问题**

> 我是1990年4月出生的女性（女工人口径），在上海灵活就业，选择按7546元/月的基数参保，每月养老和医保分别要交多少、合计多少？

**规则引擎结论（公开回答）**

```text
【结论摘要】
以本人选择的月缴费基数7546元测算：养老保险1509.2元/月、职工医保754.6元/月，合计2263.8元/月。

【关键测算结果】
- 采用缴费基数：7546元/月
- 养老保险月缴费：1509.2元
- 职工医保月缴费：754.6元
- 合计月缴费：2263.8元

【使用的个人条件】
- 地区：上海
- 性别与出生：女性（女工人口径），1990年4月11日出生
- 就业状态：灵活就业
- 社保累计缴费：养老保险100个月，职工医保100个月
- 灵活就业月缴费基数（本人选择）：7546元
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

【政策依据】
- 《单位职工缴纳城镇养老保险的基数是多少？（上海市人力资源和社会保障局）》（上海市人力资源和社会保障局）— 定位：body/答末段
- 《灵活就业人员按什么标准缴费？（上海市人力资源和社会保障局，2024-03-07）》（上海市人力资源和社会保障局）— 定位：body/答

【缺失或需确认事项】
- 无。本案例输入完整，结论为确定性计算结果。

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1990-04-11",
    "birth_day": 11,
    "birth_month": 4,
    "birth_year": 1990,
    "female_retire_type": "worker50",
    "gender": "female"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "flex_contrib_base": 7546,
    "medical_contrib_months": 100,
    "months_paid_at_old_base": 0,
    "pension_contrib_months": 100
  },
  "status": {
    "employment_status": "flexible"
  },
  "subsidy": {
    "has_employment_difficulty_cert": false
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "direct",
  "contribution": {
    "pay_gap_needed": false
  },
  "flex": {
    "applicable": true,
    "contrib_base": 7546,
    "medical_monthly": 754.6,
    "pension_monthly": 1509.2,
    "total_monthly": 2263.8
  },
  "mi": {
    "gap_months": 1,
    "lifetime_gap_months": 80,
    "lifetime_required_months": 180,
    "paid_by_unemployment_fund": false,
    "waiting_period_months": 0,
    "waiting_required": false
  },
  "needs_agent": false,
  "pension": {
    "gap_months": 140,
    "gap_years_ceil": 12,
    "min_years_required": 20
  },
  "retirement": {
    "female_retire_type_status": "confirmed",
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 0,
    "legal_retire_age_years": 55,
    "legal_retire_date": "2045-04-11",
    "legal_retire_month": 4,
    "legal_retire_year": 2045,
    "months_to_legal_retire": 223,
    "original_retire_age_years": 50
  },
  "subsidy": {
    "4050_amount_est": 0,
    "4050_eligible": false,
    "job_amount_est": 0,
    "job_eligible": false,
    "older_ui_pension_fund_eligible": false,
    "selected_option": "none"
  },
  "unemployment": {
    "benefit_stage": null,
    "duration_months": 0,
    "eligible": false,
    "monthly_amount_est": 0
  },
  "warning_details": [],
  "warnings": []
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.flex.applicable` | eq | `true` |
| `calc.flex.contrib_base` | eq | `7546` |
| `calc.flex.pension_monthly` | eq | `1509.2` |
| `calc.flex.medical_monthly` | eq | `754.6` |
| `calc.flex.total_monthly` | eq | `2263.8` |

**政策依据**

1. 政策标题：《单位职工缴纳城镇养老保险的基数是多少？（上海市人力资源和社会保障局）》
   - 文档ID：`DOC-SH-CONTRIB-BASE-2026`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tdjjf_17554/20260824/t0035_1443297.html>
   - 条款定位：body / 答末段
   - 原文摘录：2026年7月1日起，本市社保缴费基数的上限调整为37731元/月,下限调整为7546元/月。
   - 原件SHA-256：`dc4c73495e55611f69792b21385bc1098ec98a853857b99fe138f79e8119936d`
2. 政策标题：《灵活就业人员按什么标准缴费？（上海市人力资源和社会保障局，2024-03-07）》
   - 文档ID：`DOC-SH-FLEX-RATES`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tdjjf_17554/20200918/t0035_1393992.html>
   - 条款定位：body / 答
   - 原文摘录：灵活就业人员缴纳基本养老、医疗保险费的基数在本市上年度全口径城镇单位就业人员月平均工资的60%至300%之间，由本人自行选择。
   - 原件SHA-256：`297352d22d52e1a9babf4218abc751dd363177dfa7ad947124f6e7363bc39e8a`
3. 政策标题：《灵活就业人员按什么标准缴费？（上海市人力资源和社会保障局，2024-03-07）》
   - 文档ID：`DOC-SH-FLEX-RATES`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tdjjf_17554/20200918/t0035_1393992.html>
   - 条款定位：body / 答
   - 原文摘录：月缴费标准为本人缴费基数乘以相应的费率，2024年3月1日起，本市灵活就业人员缴纳职工基本养老保险费的比例为20%，职工基本医疗保险费的比例为10%。
   - 原件SHA-256：`297352d22d52e1a9babf4218abc751dd363177dfa7ad947124f6e7363bc39e8a`

### 15. 上海灵活就业案例：1968年生男性·失业（规则不适用）

- UID：`RPC-310000-SH-male-before_1970-unemployed-FLEXIBLE-V2`（回归测试UID：`RPCT-310000-SH-male-before_1970-unemployed-FLEXIBLE-V2`）
- 地区：上海（310000）
- 能力：灵活就业（`flexible`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`26e917f9-37fe-4dc3-8466-38c1f83dc5a3`
- snapshot hash：`2022ae3268e8356b3b975113a6cb4a1158b0df8914e195a9553f84046c633538`
- 案例content hash：`e838fa8c0ba66f536615a4ffa8a114dc807b39d4b63b3e792a99fd28ba28afbe`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：确定性结论
- category：灵活就业；topics：社保规划、上海、灵活就业、合成政策案例
- tags：`上海` `310000` `male` `before_1970` `unemployed` `失业` `capability:flexible` `险种:养老` `险种:医保` `险种:失业`

**合成人物画像**

- 地区：上海
- 性别与出生：男性，1968年8月8日出生
- 就业状态：失业，正在领取失业保险金
- 社保累计缴费：养老保险300个月，职工医保260个月
- 失业保险累计缴费：15年；当前领取阶段：第1-12个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

**咨询问题**

> 我是1968年8月出生的男性，目前在上海处于失业状态，灵活就业人员的养老、医保缴费标准对我适用吗？

**规则引擎结论（公开回答）**

```text
【结论摘要】
当前就业状态为失业，灵活就业人员缴费规则不适用（适用：否），不生成灵活就业月缴费金额。

【关键测算结果】
- 灵活就业缴费规则适用：否（就业状态失业）

【使用的个人条件】
- 地区：上海
- 性别与出生：男性，1968年8月8日出生
- 就业状态：失业，正在领取失业保险金
- 社保累计缴费：养老保险300个月，职工医保260个月
- 失业保险累计缴费：15年；当前领取阶段：第1-12个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 新缴费基数生效后仍按旧基数缴费的月数：0

【政策依据】
- 《单位职工缴纳城镇养老保险的基数是多少？（上海市人力资源和社会保障局）》（上海市人力资源和社会保障局）— 定位：body/答末段
- 《灵活就业人员按什么标准缴费？（上海市人力资源和社会保障局，2024-03-07）》（上海市人力资源和社会保障局）— 定位：body/答

【缺失或需确认事项】
- 规则提示（需确认）：失业金期间，医保通常由失业保险基金代缴（以经办口径为准）。规划现金流时请不要重复计算医保个人缴费。（W-UI-MI-PAID）

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1968-08-08",
    "birth_day": 8,
    "birth_month": 8,
    "birth_year": 1968,
    "gender": "male"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "medical_contrib_months": 260,
    "months_paid_at_old_base": 0,
    "pension_contrib_months": 300,
    "ui_benefit_stage": "1-12",
    "unemployment_insurance_years": 15
  },
  "status": {
    "employment_status": "unemployed",
    "on_unemployment_benefit": true
  },
  "subsidy": {
    "has_employment_difficulty_cert": false
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "direct",
  "contribution": {
    "pay_gap_needed": false
  },
  "flex": {
    "applicable": false
  },
  "mi": {
    "gap_months": 1,
    "lifetime_gap_months": 0,
    "lifetime_required_months": 180,
    "paid_by_unemployment_fund": true,
    "waiting_period_months": 0,
    "waiting_required": false
  },
  "needs_agent": false,
  "pension": {
    "gap_months": 0,
    "gap_years_ceil": 0,
    "min_years_required": 15
  },
  "retirement": {
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 11,
    "legal_retire_age_years": 60,
    "legal_retire_date": "2029-07-08",
    "legal_retire_month": 7,
    "legal_retire_year": 2029,
    "months_to_legal_retire": 34,
    "original_retire_age_years": 60
  },
  "subsidy": {
    "4050_amount_est": 0,
    "4050_eligible": false,
    "job_amount_est": 0,
    "job_eligible": false,
    "selected_option": "none"
  },
  "unemployment": {
    "benefit_stage": "1-12",
    "duration_months": 24,
    "duration_months_raw": 24,
    "eligible": true,
    "monthly_amount_est": 2340
  },
  "warning_details": [
    {
      "text": "失业金期间，医保通常由失业保险基金代缴（以经办口径为准）。规划现金流时请不要重复计算医保个人缴费。",
      "warning_id": "W-UI-MI-PAID"
    }
  ],
  "warnings": [
    "W-UI-MI-PAID"
  ]
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.flex.applicable` | eq | `false` |

**政策依据**

1. 政策标题：《单位职工缴纳城镇养老保险的基数是多少？（上海市人力资源和社会保障局）》
   - 文档ID：`DOC-SH-CONTRIB-BASE-2026`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tdjjf_17554/20260824/t0035_1443297.html>
   - 条款定位：body / 答末段
   - 原文摘录：2026年7月1日起，本市社保缴费基数的上限调整为37731元/月,下限调整为7546元/月。
   - 原件SHA-256：`dc4c73495e55611f69792b21385bc1098ec98a853857b99fe138f79e8119936d`
2. 政策标题：《灵活就业人员按什么标准缴费？（上海市人力资源和社会保障局，2024-03-07）》
   - 文档ID：`DOC-SH-FLEX-RATES`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tdjjf_17554/20200918/t0035_1393992.html>
   - 条款定位：body / 答
   - 原文摘录：灵活就业人员缴纳基本养老、医疗保险费的基数在本市上年度全口径城镇单位就业人员月平均工资的60%至300%之间，由本人自行选择。
   - 原件SHA-256：`297352d22d52e1a9babf4218abc751dd363177dfa7ad947124f6e7363bc39e8a`
3. 政策标题：《灵活就业人员按什么标准缴费？（上海市人力资源和社会保障局，2024-03-07）》
   - 文档ID：`DOC-SH-FLEX-RATES`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tdjjf_17554/20200918/t0035_1393992.html>
   - 条款定位：body / 答
   - 原文摘录：月缴费标准为本人缴费基数乘以相应的费率，2024年3月1日起，本市灵活就业人员缴纳职工基本养老保险费的比例为20%，职工基本医疗保险费的比例为10%。
   - 原件SHA-256：`297352d22d52e1a9babf4218abc751dd363177dfa7ad947124f6e7363bc39e8a`

### 16. 上海补贴案例：1984年生女性·在职（单位参保）

- UID：`RPC-310000-SH-female-from_1980-employed-SUBSIDY-V2`（回归测试UID：`RPCT-310000-SH-female-from_1980-employed-SUBSIDY-V2`）
- 地区：上海（310000）
- 能力：补贴（`subsidy`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`26e917f9-37fe-4dc3-8466-38c1f83dc5a3`
- snapshot hash：`2022ae3268e8356b3b975113a6cb4a1158b0df8914e195a9553f84046c633538`
- 案例content hash：`f23d22bb056da2099dfe721e8f2e71d6a6e5b0e6dd1ed7b52916a24bbfc17939`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：确定性结论
- category：补贴；topics：社保规划、上海、补贴、合成政策案例
- tags：`上海` `310000` `female` `from_1980` `employed` `capability:subsidy` `险种:养老` `险种:医保`

**合成人物画像**

- 地区：上海
- 性别与出生：女性（女干部口径），1984年1月16日出生
- 就业状态：在职（单位参保）
- 社保累计缴费：养老保险140个月，职工医保140个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：已认定
- 距法定退休：184个月
- 新缴费基数生效后仍按旧基数缴费的月数：0

**咨询问题**

> 我是1984年1月出生的女性（女干部口径），属于就业困难人员，现在被上海一家单位吸纳就业，距法定退休还有184个月，单位或我本人能享受什么补贴？

**规则引擎结论（公开回答）**

```text
【结论摘要】
已认定就业困难人员并被用人单位吸纳就业，符合用人单位岗位补贴条件，按月最低工资口径估算补贴1370元/月，规则引擎选择：用人单位岗位补贴。

【关键测算结果】
- 用人单位岗位补贴资格：是
- 估算岗位补贴：1370元/月
- 灵活就业社保补贴资格：未估算（需补充信息）
- 补贴选择：用人单位岗位补贴（job_subsidy）

【使用的个人条件】
- 地区：上海
- 性别与出生：女性（女干部口径），1984年1月16日出生
- 就业状态：在职（单位参保）
- 社保累计缴费：养老保险140个月，职工医保140个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：已认定
- 距法定退休：184个月
- 新缴费基数生效后仍按旧基数缴费的月数：0

【政策依据】
- 《用人单位享受岗位补贴和社会保险费补贴的期限是多久？（上海市人力资源和社会保障局）》（上海市人力资源和社会保障局）— 定位：body/答
- 《用人单位享受吸纳就业困难人员岗位补贴和社会保险费的补贴标准是什么？（上海市人力资源和社会保障局）》（上海市人力资源和社会保障局）— 定位：body/答
- 《关于进一步做好本市就业援助工作的若干意见（沪人社规〔2022〕8号）》（上海市人力资源和社会保障局 上海市财政局 上海市民政局 上海市残疾人联合会）— 定位：paragraph/二
- 《上海市人力资源和社会保障局关于调整本市最低工资标准的通知（沪人社规〔2025〕10号）》（上海市人力资源和社会保障局）— 定位：paragraph/一；body/正文首段
- 《大龄领取失业保险金人员参加企业职工基本养老保险期间可否享受本市“灵活就业人员”相关社会保险补贴及岗位补贴？（上海市人力资源和社会保障局）》（上海市人力资源和社会保障局）— 定位：body/答

【缺失或需确认事项】
- 无。本案例输入完整，结论为确定性计算结果。

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1984-01-16",
    "birth_day": 16,
    "birth_month": 1,
    "birth_year": 1984,
    "female_retire_type": "cadre55",
    "gender": "female"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "medical_contrib_months": 140,
    "months_paid_at_old_base": 0,
    "pension_contrib_months": 140
  },
  "status": {
    "employment_status": "employed"
  },
  "subsidy": {
    "has_employment_difficulty_cert": true,
    "months_to_legal_retire": 184
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "direct",
  "contribution": {
    "pay_gap_needed": false
  },
  "flex": {
    "applicable": false
  },
  "mi": {
    "gap_months": 1,
    "lifetime_gap_months": 40,
    "lifetime_required_months": 180,
    "paid_by_unemployment_fund": false,
    "waiting_period_months": 0,
    "waiting_required": false
  },
  "needs_agent": false,
  "pension": {
    "gap_months": 100,
    "gap_years_ceil": 9,
    "min_years_required": 20
  },
  "retirement": {
    "female_retire_type_status": "confirmed",
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 0,
    "legal_retire_age_years": 58,
    "legal_retire_date": "2042-01-16",
    "legal_retire_month": 1,
    "legal_retire_year": 2042,
    "months_to_legal_retire": 184,
    "original_retire_age_years": 55
  },
  "subsidy": {
    "4050_amount_est": 0,
    "job_amount_est": 1370,
    "job_eligible": true,
    "older_ui_pension_fund_eligible": false,
    "selected_option": "job_subsidy"
  },
  "unemployment": {
    "benefit_stage": null,
    "duration_months": 0,
    "eligible": false,
    "monthly_amount_est": 0
  },
  "warning_details": [],
  "warnings": []
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.subsidy.job_eligible` | eq | `true` |
| `calc.subsidy.job_amount_est` | eq | `1370` |
| `calc.subsidy.selected_option` | eq | `"job_subsidy"` |

**政策依据**

1. 政策标题：《用人单位享受岗位补贴和社会保险费补贴的期限是多久？（上海市人力资源和社会保障局）》
   - 文档ID：`DOC-SH-EMPLOYER-SUBSIDY-DURATION-2024`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tcjjyyhzc_17545/20240408/t0035_1423424.html>
   - 条款定位：body / 答
   - 原文摘录：对于同一名“就业困难人员”，在其劳动年龄段内，上述补贴与本意见出台前用人单位享受的一次性补贴的期限累计一般不超过3年，用人单位吸纳“就业困难人员”补贴期满，且该“就业困难人员”距法定退休年龄不足2年的，补贴期限最长可延长至该“就业困难人员”到达法定退休年龄。
   - 原件SHA-256：`0be56a245e0f361ba736efdb0fbdd4241242039fd7111446b2cc9332f31a3ae9`
2. 政策标题：《用人单位享受吸纳就业困难人员岗位补贴和社会保险费的补贴标准是什么？（上海市人力资源和社会保障局）》
   - 文档ID：`DOC-SH-EMPLOYER-SUBSIDY-STANDARD-2022`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tcjjyyhzc_17545/20220704/t0035_1408028.html>
   - 条款定位：body / 答
   - 原文摘录：岗位补贴的标准为本市月最低工资标准的50%，社会保险补贴标准为以缴费当月职工社会保险缴费基数的下限作为基数计算的养老、医疗和失业保险缴费额中用人单位承担部分的50%。
   - 原件SHA-256：`00dfad742c727e66c0f5dc7bc21f0143755310fe2c7b1d4a9764bf40e6ad320d`
3. 政策标题：《关于进一步做好本市就业援助工作的若干意见（沪人社规〔2022〕8号）》
   - 文档ID：`DOC-SH-EMPLOYMENT-ASSISTANCE-2022`
   - 发布机关：上海市人力资源和社会保障局 上海市财政局 上海市民政局 上海市残疾人联合会
   - 官方URL：<https://rsj.sh.gov.cn/tjypx_17728/20220311/t0035_1406349.html>
   - 条款定位：paragraph / 二
   - 原文摘录：本市企事业单位、社会团体、民办非企业、个体工商户等用人单位（劳务派遣公司除外）吸纳经认定的“就业困难人员”，签订1年以上劳动合同并按时足额缴纳社会保险费的，可按规定申请补贴。
   - 原件SHA-256：`c926b5086af8fa4217b388e613d3f569e49081457b01513e236fcd16278e55cd`
4. 政策标题：《关于进一步做好本市就业援助工作的若干意见（沪人社规〔2022〕8号）》
   - 文档ID：`DOC-SH-EMPLOYMENT-ASSISTANCE-2022`
   - 发布机关：上海市人力资源和社会保障局 上海市财政局 上海市民政局 上海市残疾人联合会
   - 官方URL：<https://rsj.sh.gov.cn/tjypx_17728/20220311/t0035_1406349.html>
   - 条款定位：paragraph / 二
   - 原文摘录：补贴所需资金从失业保险基金中列支。“就业困难人员”享受补贴期满的，取消“就业困难人员”身份。
   - 原件SHA-256：`c926b5086af8fa4217b388e613d3f569e49081457b01513e236fcd16278e55cd`
5. 政策标题：《关于进一步做好本市就业援助工作的若干意见（沪人社规〔2022〕8号）》
   - 文档ID：`DOC-SH-EMPLOYMENT-ASSISTANCE-2022`
   - 发布机关：上海市人力资源和社会保障局 上海市财政局 上海市民政局 上海市残疾人联合会
   - 官方URL：<https://rsj.sh.gov.cn/tjypx_17728/20220311/t0035_1406349.html>
   - 条款定位：paragraph / 二
   - 原文摘录：岗位补贴的标准为本市月最低工资标准的50%，社会保险补贴标准为以缴费当月职工社会保险缴费基数的下限作为基数计算的养老、医疗和失业保险缴费额中用人单位承担部分的50%。
   - 原件SHA-256：`c926b5086af8fa4217b388e613d3f569e49081457b01513e236fcd16278e55cd`
6. 政策标题：《上海市人力资源和社会保障局关于调整本市最低工资标准的通知（沪人社规〔2025〕10号）》
   - 文档ID：`DOC-SH-MIN-WAGE-2025`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tgzfl_17732/20250714/t0035_1434097.html>
   - 条款定位：paragraph / 一
   - 原文摘录：一、月最低工资标准从2690元调整到2740元。
   - 原件SHA-256：`e158ad6970069a6cff47f7f5384770fc966132e6b6c0d11c719abb19422e6fcd`
7. 政策标题：《上海市人力资源和社会保障局关于调整本市最低工资标准的通知（沪人社规〔2025〕10号）》
   - 文档ID：`DOC-SH-MIN-WAGE-2025`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tgzfl_17732/20250714/t0035_1434097.html>
   - 条款定位：body / 正文首段
   - 原文摘录：经市政府同意，从2025年7月1日起，本市调整最低工资标准。
   - 原件SHA-256：`e158ad6970069a6cff47f7f5384770fc966132e6b6c0d11c719abb19422e6fcd`
8. 政策标题：《大龄领取失业保险金人员参加企业职工基本养老保险期间可否享受本市“灵活就业人员”相关社会保险补贴及岗位补贴？（上海市人力资源和社会保障局）》
   - 文档ID：`DOC-SH-UI-OLDER-SUBSIDY-EXCLUSION-2025`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tlqtj_17563/20250120/t0035_1430069.html>
   - 条款定位：body / 答
   - 原文摘录：不可以，大龄领取失业保险金人员参加企业职工基本养老保险期间不可同时享受本市“灵活就业人员”相关社会保险补贴及岗位补贴。
   - 原件SHA-256：`1fd7e2f2cbfa1346a98ffd3a0467792949338473bd1cb3efa32387e2f1ef0883`

### 17. 上海补贴案例：1969年生男性·灵活就业

- UID：`RPC-310000-SH-male-before_1970-flexible-SUBSIDY-V2`（回归测试UID：`RPCT-310000-SH-male-before_1970-flexible-SUBSIDY-V2`）
- 地区：上海（310000）
- 能力：补贴（`subsidy`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`26e917f9-37fe-4dc3-8466-38c1f83dc5a3`
- snapshot hash：`2022ae3268e8356b3b975113a6cb4a1158b0df8914e195a9553f84046c633538`
- 案例content hash：`d319ad9b66a81c3f9ef1b021a33e4ed288aaf5cddc42d64ed540f149aa80fbc3`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：确定性结论
- category：补贴；topics：社保规划、上海、补贴、合成政策案例
- tags：`上海` `310000` `male` `before_1970` `flexible` `灵活就业` `capability:subsidy` `险种:养老` `险种:医保`

**合成人物画像**

- 地区：上海
- 性别与出生：男性，1969年7月7日出生
- 就业状态：灵活就业
- 社保累计缴费：养老保险320个月，职工医保300个月
- 灵活就业月缴费基数（本人选择）：7546元
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：已认定
- 距法定退休：48个月
- 新缴费基数生效后仍按旧基数缴费的月数：0

**咨询问题**

> 我是1969年7月出生的男性，已被认定为就业困难人员，现在在上海灵活就业并按7546元基数缴费，距法定退休还有48个月，我能享受哪种社保补贴、每月大约多少？

**规则引擎结论（公开回答）**

```text
【结论摘要】
已认定就业困难人员且以灵活就业身份缴费，符合灵活就业社会保险补贴（4050）条件；按缴费基数下限口径估算补贴1131.9元/月，规则引擎选择：4050。

【关键测算结果】
- 灵活就业社保补贴（4050）资格：是
- 估算补贴金额：1131.9元/月
- 用人单位岗位补贴资格：否
- 补贴选择：4050

【使用的个人条件】
- 地区：上海
- 性别与出生：男性，1969年7月7日出生
- 就业状态：灵活就业
- 社保累计缴费：养老保险320个月，职工医保300个月
- 灵活就业月缴费基数（本人选择）：7546元
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：已认定
- 距法定退休：48个月
- 新缴费基数生效后仍按旧基数缴费的月数：0

【政策依据】
- 《单位职工缴纳城镇养老保险的基数是多少？（上海市人力资源和社会保障局）》（上海市人力资源和社会保障局）— 定位：body/答末段
- 《关于进一步做好本市就业援助工作的若干意见（沪人社规〔2022〕8号）》（上海市人力资源和社会保障局 上海市财政局 上海市民政局 上海市残疾人联合会）— 定位：paragraph/二；paragraph/三
- 《灵活就业人员按什么标准缴费？（上海市人力资源和社会保障局，2024-03-07）》（上海市人力资源和社会保障局）— 定位：body/答
- 《领取“就业困难人员”灵活就业社会保险费补贴需要符合什么条件？（上海市人力资源和社会保障局）》（上海市人力资源和社会保障局）— 定位：body/答
- 《申请就业困难人员灵活就业社会保险费补贴的补贴标准是多少？（上海市人力资源和社会保障局）》（上海市人力资源和社会保障局）— 定位：body/答
- 《大龄领取失业保险金人员参加企业职工基本养老保险期间可否享受本市“灵活就业人员”相关社会保险补贴及岗位补贴？（上海市人力资源和社会保障局）》（上海市人力资源和社会保障局）— 定位：body/答

【缺失或需确认事项】
- 无。本案例输入完整，结论为确定性计算结果。

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1969-07-07",
    "birth_day": 7,
    "birth_month": 7,
    "birth_year": 1969,
    "gender": "male"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "flex_contrib_base": 7546,
    "medical_contrib_months": 300,
    "months_paid_at_old_base": 0,
    "pension_contrib_months": 320
  },
  "status": {
    "employment_status": "flexible"
  },
  "subsidy": {
    "has_employment_difficulty_cert": true,
    "months_to_legal_retire": 48
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "direct",
  "contribution": {
    "pay_gap_needed": false
  },
  "flex": {
    "applicable": true,
    "contrib_base": 7546,
    "medical_monthly": 754.6,
    "pension_monthly": 1509.2,
    "total_monthly": 2263.8
  },
  "mi": {
    "gap_months": 1,
    "lifetime_gap_months": 0,
    "lifetime_required_months": 180,
    "paid_by_unemployment_fund": false,
    "waiting_period_months": 0,
    "waiting_required": false
  },
  "needs_agent": false,
  "pension": {
    "gap_months": 0,
    "gap_years_ceil": 0,
    "min_years_required": 15.5
  },
  "retirement": {
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 2,
    "legal_retire_age_years": 61,
    "legal_retire_date": "2030-09-07",
    "legal_retire_month": 9,
    "legal_retire_year": 2030,
    "months_to_legal_retire": 48,
    "original_retire_age_years": 60
  },
  "subsidy": {
    "4050_amount_est": 1131.9,
    "4050_eligible": true,
    "flex_cost_est": 2263.8,
    "job_amount_est": 0,
    "job_eligible": false,
    "older_ui_pension_fund_eligible": false,
    "selected_option": "4050"
  },
  "unemployment": {
    "benefit_stage": null,
    "duration_months": 0,
    "eligible": false,
    "monthly_amount_est": 0
  },
  "warning_details": [],
  "warnings": []
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.subsidy.4050_eligible` | eq | `true` |
| `calc.subsidy.4050_amount_est` | eq | `1131.9` |
| `calc.subsidy.selected_option` | eq | `"4050"` |

**政策依据**

1. 政策标题：《单位职工缴纳城镇养老保险的基数是多少？（上海市人力资源和社会保障局）》
   - 文档ID：`DOC-SH-CONTRIB-BASE-2026`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tdjjf_17554/20260824/t0035_1443297.html>
   - 条款定位：body / 答末段
   - 原文摘录：2026年7月1日起，本市社保缴费基数的上限调整为37731元/月,下限调整为7546元/月。
   - 原件SHA-256：`dc4c73495e55611f69792b21385bc1098ec98a853857b99fe138f79e8119936d`
2. 政策标题：《关于进一步做好本市就业援助工作的若干意见（沪人社规〔2022〕8号）》
   - 文档ID：`DOC-SH-EMPLOYMENT-ASSISTANCE-2022`
   - 发布机关：上海市人力资源和社会保障局 上海市财政局 上海市民政局 上海市残疾人联合会
   - 官方URL：<https://rsj.sh.gov.cn/tjypx_17728/20220311/t0035_1406349.html>
   - 条款定位：paragraph / 二
   - 原文摘录：补贴所需资金从失业保险基金中列支。“就业困难人员”享受补贴期满的，取消“就业困难人员”身份。
   - 原件SHA-256：`c926b5086af8fa4217b388e613d3f569e49081457b01513e236fcd16278e55cd`
3. 政策标题：《关于进一步做好本市就业援助工作的若干意见（沪人社规〔2022〕8号）》
   - 文档ID：`DOC-SH-EMPLOYMENT-ASSISTANCE-2022`
   - 发布机关：上海市人力资源和社会保障局 上海市财政局 上海市民政局 上海市残疾人联合会
   - 官方URL：<https://rsj.sh.gov.cn/tjypx_17728/20220311/t0035_1406349.html>
   - 条款定位：paragraph / 三
   - 原文摘录：补贴标准为按照以缴费当月职工社会保险缴费基数的下限作为缴费基数计算的应缴社会保险费的50%，补贴期限除对距法定退休年龄不足5年的可延长至退休外，同一名“就业困难人员”累计最长不超过3年。
   - 原件SHA-256：`c926b5086af8fa4217b388e613d3f569e49081457b01513e236fcd16278e55cd`
4. 政策标题：《关于进一步做好本市就业援助工作的若干意见（沪人社规〔2022〕8号）》
   - 文档ID：`DOC-SH-EMPLOYMENT-ASSISTANCE-2022`
   - 发布机关：上海市人力资源和社会保障局 上海市财政局 上海市民政局 上海市残疾人联合会
   - 官方URL：<https://rsj.sh.gov.cn/tjypx_17728/20220311/t0035_1406349.html>
   - 条款定位：paragraph / 三
   - 原文摘录：经认定的“就业困难人员”实现灵活就业并按时足额缴纳社会保险费的，可按规定申请社会保险补贴。
   - 原件SHA-256：`c926b5086af8fa4217b388e613d3f569e49081457b01513e236fcd16278e55cd`
5. 政策标题：《灵活就业人员按什么标准缴费？（上海市人力资源和社会保障局，2024-03-07）》
   - 文档ID：`DOC-SH-FLEX-RATES`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tdjjf_17554/20200918/t0035_1393992.html>
   - 条款定位：body / 答
   - 原文摘录：月缴费标准为本人缴费基数乘以相应的费率，2024年3月1日起，本市灵活就业人员缴纳职工基本养老保险费的比例为20%，职工基本医疗保险费的比例为10%。
   - 原件SHA-256：`297352d22d52e1a9babf4218abc751dd363177dfa7ad947124f6e7363bc39e8a`
6. 政策标题：《领取“就业困难人员”灵活就业社会保险费补贴需要符合什么条件？（上海市人力资源和社会保障局）》
   - 文档ID：`DOC-SH-FLEX-SUBSIDY-CONDITIONS-2022`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tcjjyyhzc_17545/20220704/t0035_1408041.html>
   - 条款定位：body / 答
   - 原文摘录：经认定的“就业困难人员”实现灵活就业并按时足额缴纳社会保险费的，可按规定申请社会保险补贴。
   - 原件SHA-256：`d1c46fed55d50bee2c23f77d15d5a0e5588491aedf9e4a249b4ad0416c730bb2`
7. 政策标题：《申请就业困难人员灵活就业社会保险费补贴的补贴标准是多少？（上海市人力资源和社会保障局）》
   - 文档ID：`DOC-SH-FLEX-SUBSIDY-STANDARD-2022`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tcjjyyhzc_17545/20220705/t0035_1408073.html>
   - 条款定位：body / 答
   - 原文摘录：补贴标准为按照以缴费当月职工社会保险缴费基数的下限作为缴费基数计算的应缴社会保险费的50%。
   - 原件SHA-256：`2a9320b5a463ecac6891b0ba295b5e4ef10c160ac391483c8ac8f1aa26b88aba`
8. 政策标题：《大龄领取失业保险金人员参加企业职工基本养老保险期间可否享受本市“灵活就业人员”相关社会保险补贴及岗位补贴？（上海市人力资源和社会保障局）》
   - 文档ID：`DOC-SH-UI-OLDER-SUBSIDY-EXCLUSION-2025`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tlqtj_17563/20250120/t0035_1430069.html>
   - 条款定位：body / 答
   - 原文摘录：不可以，大龄领取失业保险金人员参加企业职工基本养老保险期间不可同时享受本市“灵活就业人员”相关社会保险补贴及岗位补贴。
   - 原件SHA-256：`1fd7e2f2cbfa1346a98ffd3a0467792949338473bd1cb3efa32387e2f1ef0883`

### 18. 上海补贴案例：1971年生女性·失业

- UID：`RPC-310000-SH-female-1970_1979-unemployed-SUBSIDY-V2`（回归测试UID：`RPCT-310000-SH-female-1970_1979-unemployed-SUBSIDY-V2`）
- 地区：上海（310000）
- 能力：补贴（`subsidy`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`26e917f9-37fe-4dc3-8466-38c1f83dc5a3`
- snapshot hash：`2022ae3268e8356b3b975113a6cb4a1158b0df8914e195a9553f84046c633538`
- 案例content hash：`17cbebf9e6ba3e26568d0f44536209da79d4d8e3f48350f483095f0358f92adc`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：确定性结论
- category：补贴；topics：社保规划、上海、补贴、合成政策案例
- tags：`上海` `310000` `female` `1970_1979` `unemployed` `失业` `capability:subsidy` `险种:养老` `险种:医保` `险种:失业`

**合成人物画像**

- 地区：上海
- 性别与出生：女性（女干部口径），1971年9月2日出生
- 就业状态：失业，正在领取失业保险金
- 社保累计缴费：养老保险300个月，职工医保280个月
- 失业保险累计缴费：12年；当前领取阶段：第13-24个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 距法定退休：6个月
- 新缴费基数生效后仍按旧基数缴费的月数：0

**咨询问题**

> 我是1971年9月出生的女性（女干部口径），正在上海领取失业保险金，距法定退休只有6个月，没有做就业困难人员认定，还能享受哪类补贴或由基金支付的待遇？

**规则引擎结论（公开回答）**

```text
【结论摘要】
正在领取失业保险金且距法定退休6个月，处于大龄领取失业保险金人员窗口，符合由失业保险基金支付其参加职工养老、医保费用的条件；未认定就业困难人员，灵活就业社保补贴与岗位补贴不适用。

【关键测算结果】
- 大龄领金人员基金支付资格：是
- 灵活就业社保补贴资格：否
- 用人单位岗位补贴资格：否
- 补贴选择：大龄领金人员基金支付（older_ui_pension_fund）

【使用的个人条件】
- 地区：上海
- 性别与出生：女性（女干部口径），1971年9月2日出生
- 就业状态：失业，正在领取失业保险金
- 社保累计缴费：养老保险300个月，职工医保280个月
- 失业保险累计缴费：12年；当前领取阶段：第13-24个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 就业困难人员认定：未认定
- 距法定退休：6个月
- 新缴费基数生效后仍按旧基数缴费的月数：0

【政策依据】
- 《关于进一步做好本市就业援助工作的若干意见（沪人社规〔2022〕8号）》（上海市人力资源和社会保障局 上海市财政局 上海市民政局 上海市残疾人联合会）— 定位：paragraph/二
- 《大龄领取失业保险金人员如何申领由失业保险基金承担的养老保险费用？（上海市人力资源和社会保障局）》（上海市人力资源和社会保障局）— 定位：body/答
- 《在本市领取失业保险金的大龄人员在外省市参加企业职工基本养老保险，可否申领由失业保险基金承担的费用？（上海市人力资源和社会保障局）》（上海市人力资源和社会保障局）— 定位：body/答
- 《大龄领取失业保险金人员参加企业职工基本养老保险的补贴标准是什么？（上海市人力资源和社会保障局）》（上海市人力资源和社会保障局）— 定位：body/答
- 《大龄领取失业保险金人员参加企业职工基本养老保险期间可否享受本市“灵活就业人员”相关社会保险补贴及岗位补贴？（上海市人力资源和社会保障局）》（上海市人力资源和社会保障局）— 定位：body/答

【缺失或需确认事项】
- 规则提示（需确认）：失业金期间，医保通常由失业保险基金代缴（以经办口径为准）。规划现金流时请不要重复计算医保个人缴费。（W-UI-MI-PAID）
- 规则提示（需确认）：符合大龄条件时，在本市以个人身份参加企业职工基本养老保险并缴费，其中按灵活就业人员最低缴费标准的部分由失业保险基金支付；须达到法定退休年龄次月起申请，按距退休不足1年内实际缴纳月数一次性支付。（W-OLDER-UI-PENSION）

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1971-09-02",
    "birth_day": 2,
    "birth_month": 9,
    "birth_year": 1971,
    "female_retire_type": "cadre55",
    "gender": "female"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "medical_contrib_months": 280,
    "months_paid_at_old_base": 0,
    "pension_contrib_months": 300,
    "ui_benefit_stage": "13-24",
    "unemployment_insurance_years": 12
  },
  "status": {
    "employment_status": "unemployed",
    "on_unemployment_benefit": true
  },
  "subsidy": {
    "has_employment_difficulty_cert": false,
    "months_to_legal_retire": 6
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "direct",
  "contribution": {
    "pay_gap_needed": false
  },
  "flex": {
    "applicable": false
  },
  "mi": {
    "gap_months": 1,
    "lifetime_gap_months": 0,
    "lifetime_required_months": 180,
    "paid_by_unemployment_fund": true,
    "waiting_period_months": 0,
    "waiting_required": false
  },
  "needs_agent": false,
  "pension": {
    "gap_months": 0,
    "gap_years_ceil": 0,
    "min_years_required": 15
  },
  "retirement": {
    "female_retire_type_status": "confirmed",
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 6,
    "legal_retire_age_years": 55,
    "legal_retire_date": "2027-03-02",
    "legal_retire_month": 3,
    "legal_retire_year": 2027,
    "months_to_legal_retire": 6,
    "original_retire_age_years": 55
  },
  "subsidy": {
    "4050_amount_est": 0,
    "4050_eligible": false,
    "job_amount_est": 0,
    "job_eligible": false,
    "older_ui_pension_fund_eligible": true,
    "selected_option": "older_ui_pension_fund"
  },
  "unemployment": {
    "benefit_stage": "13-24",
    "duration_months": 24,
    "duration_months_raw": 24,
    "eligible": true,
    "monthly_amount_est": 1872
  },
  "warning_details": [
    {
      "text": "失业金期间，医保通常由失业保险基金代缴（以经办口径为准）。规划现金流时请不要重复计算医保个人缴费。",
      "warning_id": "W-UI-MI-PAID"
    },
    {
      "text": "符合大龄条件时，在本市以个人身份参加企业职工基本养老保险并缴费，其中按灵活就业人员最低缴费标准的部分由失业保险基金支付；须达到法定退休年龄次月起申请，按距退休不足1年内实际缴纳月数一次性支付。",
      "warning_id": "W-OLDER-UI-PENSION"
    }
  ],
  "warnings": [
    "W-UI-MI-PAID",
    "W-OLDER-UI-PENSION"
  ]
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.subsidy.older_ui_pension_fund_eligible` | eq | `true` |
| `calc.subsidy.selected_option` | eq | `"older_ui_pension_fund"` |

**政策依据**

1. 政策标题：《关于进一步做好本市就业援助工作的若干意见（沪人社规〔2022〕8号）》
   - 文档ID：`DOC-SH-EMPLOYMENT-ASSISTANCE-2022`
   - 发布机关：上海市人力资源和社会保障局 上海市财政局 上海市民政局 上海市残疾人联合会
   - 官方URL：<https://rsj.sh.gov.cn/tjypx_17728/20220311/t0035_1406349.html>
   - 条款定位：paragraph / 二
   - 原文摘录：补贴所需资金从失业保险基金中列支。“就业困难人员”享受补贴期满的，取消“就业困难人员”身份。
   - 原件SHA-256：`c926b5086af8fa4217b388e613d3f569e49081457b01513e236fcd16278e55cd`
2. 政策标题：《大龄领取失业保险金人员如何申领由失业保险基金承担的养老保险费用？（上海市人力资源和社会保障局）》
   - 文档ID：`DOC-SH-UI-OLDER-PENSION-APPLY-2025`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tlqtj_17563/20250120/t0035_1430067.html>
   - 条款定位：body / 答
   - 原文摘录：经办机构审核后按照个人距离法定退休年龄不足1年内实际缴纳月数一次性支付。
   - 原件SHA-256：`4c95b372865d91ceb1bcf494a9cc67f8d4e48f953a254488f1b85ef9fbcd282a`
3. 政策标题：《在本市领取失业保险金的大龄人员在外省市参加企业职工基本养老保险，可否申领由失业保险基金承担的费用？（上海市人力资源和社会保障局）》
   - 文档ID：`DOC-SH-UI-OLDER-PENSION-FUND-2025`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tlqtj_17563/20250120/t0035_1430068.html>
   - 条款定位：body / 答
   - 原文摘录：在本市领取失业保险金的大龄人员应参加本市企业职工基本养老保险，才可以在本市申领由失业保险基金承担的费用。
   - 原件SHA-256：`8285e470654ea89f239099c38204a4bf2432bafaf2c69edb9350069ba1cc7ef9`
4. 政策标题：《大龄领取失业保险金人员参加企业职工基本养老保险的补贴标准是什么？（上海市人力资源和社会保障局）》
   - 文档ID：`DOC-SH-UI-OLDER-PENSION-STANDARD-2025`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tlqtj_17563/20250120/t0035_1430066.html>
   - 条款定位：body / 答
   - 原文摘录：大龄领取失业保险金人员在本市以个人身份参加企业职工基本养老保险并缴费，其中按本市灵活就业人员最低缴费标准的部分由失业保险基金支付。
   - 原件SHA-256：`14c31397b23efc63acec377d6503bd95ddaea226c6a6bfa620a0435f9c3bf1ba`
5. 政策标题：《大龄领取失业保险金人员参加企业职工基本养老保险期间可否享受本市“灵活就业人员”相关社会保险补贴及岗位补贴？（上海市人力资源和社会保障局）》
   - 文档ID：`DOC-SH-UI-OLDER-SUBSIDY-EXCLUSION-2025`
   - 发布机关：上海市人力资源和社会保障局
   - 官方URL：<https://rsj.sh.gov.cn/tlqtj_17563/20250120/t0035_1430069.html>
   - 条款定位：body / 答
   - 原文摘录：不可以，大龄领取失业保险金人员参加企业职工基本养老保险期间不可同时享受本市“灵活就业人员”相关社会保险补贴及岗位补贴。
   - 原件SHA-256：`1fd7e2f2cbfa1346a98ffd3a0467792949338473bd1cb3efa32387e2f1ef0883`

### 19. 广东失业案例：1969年生男性·失业（广州领取）

- UID：`RPC-440000-GD-male-before_1970-unemployed-UI-AMOUNT-V2`（回归测试UID：`RPCT-440000-GD-male-before_1970-unemployed-UI-AMOUNT-V2`）
- 地区：广东（440000）
- 能力：失业（`ui-amount`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`e9b7227f-69a1-413b-b607-ebaba2db38ea`
- snapshot hash：`3e20302d6df76232f6ceba8c5b197244bac289a6b02a4a0bfc1e7b03959f4e5e`
- 案例content hash：`dbd6b0716d26329d1df4bc580041dcf0f1b1eac9dad0edd9044ee63d4056cae7`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：需人工补充确认（needs_agent）
- category：失业；topics：社保规划、广东、失业、合成政策案例
- tags：`广东` `440000` `male` `before_1970` `unemployed` `失业` `capability:ui-amount` `险种:养老` `险种:医保` `险种:失业`

**合成人物画像**

- 地区：广东
- 性别与出生：男性，1969年9月20日出生
- 就业状态：失业，正在领取失业保险金
- 社保累计缴费：养老保险180个月，职工医保120个月
- 失业保险累计缴费：3年；本段已领取：2个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 失业保险金领取地市：广州（440100）

**咨询问题**

> 我在广东参保，失业保险累计缴了3年，失业后打算在广州（440100）申领，每月能领多少失业保险金、能领几个月？

**规则引擎结论（公开回答）**

```text
【结论摘要】
符合失业保险金领取条件（失业保险累计缴费3年），核定领取期限12个月；领取地市为广州（440100），按当地月最低工资的法定比例核定失业保险金2412元/月。

【关键测算结果】
- 领取资格：是
- 核定领取期限：12个月
- 领取地市：广州（440100）
- 月领取标准：2412元

【使用的个人条件】
- 地区：广东
- 性别与出生：男性，1969年9月20日出生
- 就业状态：失业，正在领取失业保险金
- 社保累计缴费：养老保险180个月，职工医保120个月
- 失业保险累计缴费：3年；本段已领取：2个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01
- 失业保险金领取地市：广州（440100）

【政策依据】
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第四十六条；article/第四十五条
- 《失业保险条例（国务院令第258号）》（国务院）— 定位：article/第十七条；article/第十四条
- 《广东省人民政府关于调整我省最低工资标准的通知（粤府函〔2026〕188号）》（广东省人民政府）— 定位：body/正文第一条及附件《广东省最低工资标准表》
- 《广东省9月1日起调整提高最低工资标准（省人社厅发布页，数值明细）》（广东省人力资源和社会保障厅）— 定位：body/正文第二段
- 《广东省失业保险条例（2002年通过、2013年修订、2022年第一次修正、2025年1月12日第二次修正）》（广东省人民代表大会常务委员会）— 定位：body/第十九条

【缺失或需确认事项】
- 规则引擎标记需人工确认，但未生成具体追问。
- 规则提示（需确认）：参保地医保退休最低缴费年限参数未配置（国家框架由社会保险法第27条授权统筹地区规定），需人工确认后补充地区参数。（W-MI-LOCAL-YEARS-MISSING）
- 规则提示（需确认）：失业金期间，医保通常由失业保险基金代缴（以经办口径为准）。规划现金流时请不要重复计算医保个人缴费。（W-UI-MI-PAID）

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1969-09-20",
    "birth_day": 20,
    "birth_month": 9,
    "birth_year": 1969,
    "gender": "male"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "profile": {
    "claim_city_code": "440100"
  },
  "social": {
    "medical_contrib_months": 120,
    "pension_contrib_months": 180,
    "ui_claimed_months": 2,
    "unemployment_insurance_years": 3
  },
  "status": {
    "employment_status": "unemployed",
    "on_unemployment_benefit": true
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "needs_agent",
  "mi": {
    "gap_months": 1,
    "paid_by_unemployment_fund": true
  },
  "needs_agent": true,
  "pension": {
    "gap_months": 6,
    "gap_years_ceil": 1,
    "min_years_required": 15.5
  },
  "retirement": {
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 3,
    "legal_retire_age_years": 61,
    "legal_retire_date": "2030-12-20",
    "legal_retire_month": 12,
    "legal_retire_year": 2030,
    "months_to_legal_retire": 51,
    "original_retire_age_years": 60
  },
  "unemployment": {
    "duration_months": 12,
    "duration_months_raw": 12,
    "eligible": true,
    "monthly_amount_est": 2412
  },
  "warning_details": [
    {
      "text": "参保地医保退休最低缴费年限参数未配置（国家框架由社会保险法第27条授权统筹地区规定），需人工确认后补充地区参数。",
      "warning_id": "W-MI-LOCAL-YEARS-MISSING"
    },
    {
      "text": "失业金期间，医保通常由失业保险基金代缴（以经办口径为准）。规划现金流时请不要重复计算医保个人缴费。",
      "warning_id": "W-UI-MI-PAID"
    },
    {
      "text": "关键信息不完整或存在互斥冲突，建议进入 Agent 追问/细化模式后再生成完整方案。",
      "warning_id": "W-NEEDS-AGENT"
    }
  ],
  "warnings": [
    "W-MI-LOCAL-YEARS-MISSING",
    "W-UI-MI-PAID",
    "W-NEEDS-AGENT"
  ]
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.unemployment.eligible` | eq | `true` |
| `calc.unemployment.duration_months` | eq | `12` |
| `calc.unemployment.monthly_amount_est` | eq | `2412` |

**政策依据**

1. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第四十六条
   - 原文摘录：失业人员失业前用人单位和本人累计缴费满一年不足五年的，领取失业保险金的期限最长为十二个月；累计缴费满五年不足十年的，领取失业保险金的期限最长为十八个月；累计缴费十年以上的，领取失业保险金的期限最长为二十四个月。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
2. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第四十六条
   - 原文摘录：重新就业后，再次失业的，缴费时间重新计算，领取失业保险金的期限与前次失业应当领取而尚未领取的失业保险金的期限合并计算，最长不超过二十四个月。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
3. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第四十五条
   - 原文摘录：失业人员符合下列条件的，从失业保险基金中领取失业保险金：（一）失业前用人单位和本人已经缴纳失业保险费满一年的；（二）非因本人意愿中断就业的；（三）已经进行失业登记，并有求职要求的。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
4. 政策标题：《失业保险条例（国务院令第258号）》
   - 文档ID：`DOC-CN-UNEMPLOYMENT-REGULATION`
   - 发布机关：国务院
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fg/202011/t20201103_394936.html>
   - 条款定位：article / 第十七条
   - 原文摘录：失业人员失业前所在单位和本人按照规定累计缴费时间满1年不足5年的，领取失业保险金的期限最长为12个月；累计缴费时间满5年不足10年的，领取失业保险金的期限最长为18个月；累计缴费时间10年以上的，领取失业保险金的期限最长为24个月。
   - 原件SHA-256：`b8187965656565984549569e9894a62cb3960f5a64aacac3749b80be2d7a3e04`
5. 政策标题：《失业保险条例（国务院令第258号）》
   - 文档ID：`DOC-CN-UNEMPLOYMENT-REGULATION`
   - 发布机关：国务院
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fg/202011/t20201103_394936.html>
   - 条款定位：article / 第十四条
   - 原文摘录：具备下列条件的失业人员，可以领取失业保险金：（一）按照规定参加失业保险，所在单位和本人已按照规定履行缴费义务满1年的；（二）非因本人意愿中断就业的；（三）已办理失业登记，并有求职要求的。
   - 原件SHA-256：`b8187965656565984549569e9894a62cb3960f5a64aacac3749b80be2d7a3e04`
6. 政策标题：《广东省人民政府关于调整我省最低工资标准的通知（粤府函〔2026〕188号）》
   - 文档ID：`DOC-GD-MINIMUM-WAGE-2026`
   - 发布机关：广东省人民政府
   - 官方URL：<https://www.gd.gov.cn/zwgk/wjk/qbwj/yfh/content/post_4942177.html>
   - 条款定位：body / 正文第一条及附件《广东省最低工资标准表》
   - 原文摘录：从2026年9月1日起，对我省全日制就业劳动者月最低工资标准和非全日制小时最低工资标准进行调整，具体标准附后。
   - 原件SHA-256：`de716e1c054d4fb232a9579985d0a83a40d240a3f35b859a933cf14cb2bc7513`
7. 政策标题：《广东省9月1日起调整提高最低工资标准（省人社厅发布页，数值明细）》
   - 文档ID：`DOC-GD-MINIMUM-WAGE-ADJUST`
   - 发布机关：广东省人力资源和社会保障厅
   - 官方URL：<https://hrss.gd.gov.cn/gkmlpt/content/4/4942/post_4942224.html>
   - 条款定位：body / 正文第二段
   - 原文摘录：此次调整后全省分为三类标准，其中广州、深圳执行一类标准，广州市调整为2680元/月，深圳市调整为2700元/月，对应的非全日制小时最低工资标准均为25.4元/小时；二类标准调整为2300元/月，执行地区为珠海、佛山、东莞、中山，对应的非全日制小时最低工资标准为21.9元/小时；三类标准调整为2040元/月，执行地区为汕头、韶关、河源、梅州、惠州、汕尾、江门、阳江、湛江、茂名、肇庆、清远、潮州、揭阳、云浮，对应的非全日制小时最低工资标准为20.2元/小时。
   - 原件SHA-256：`1dad0d0c9995a6b861f616357e85c86072d12d1e8e7f3e4e41b4654cf24b72cb`
8. 政策标题：《广东省失业保险条例（2002年通过、2013年修订、2022年第一次修正、2025年1月12日第二次修正）》
   - 文档ID：`DOC-GD-UNEMPLOYMENT-REGULATION`
   - 发布机关：广东省人民代表大会常务委员会
   - 官方URL：<https://hrss.gd.gov.cn/gkmlpt/content/4/4669/post_4669825.html>
   - 条款定位：body / 第十九条
   - 原文摘录：第十九条 失业保险金由社会保险经办机构按照失业保险金领取地地级以上市最低工资标准的百分之九十按月计发，省人民政府根据国家规定可以适当调整失业保险金标准。
   - 原件SHA-256：`15f3551f796ae24058b996c75d5220a79115dc9a82915cbff537b008d28e4456`

### 20. 广东失业案例：1979年生女性·失业（缺领取地市）

- UID：`RPC-440000-GD-female-1970_1979-unemployed-CLAIM-CITY-MISSING-V2`（回归测试UID：`RPCT-440000-GD-female-1970_1979-unemployed-CLAIM-CITY-MISSING-V2`）
- 地区：广东（440000）
- 能力：失业（`claim-city-missing`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`e9b7227f-69a1-413b-b607-ebaba2db38ea`
- snapshot hash：`3e20302d6df76232f6ceba8c5b197244bac289a6b02a4a0bfc1e7b03959f4e5e`
- 案例content hash：`50c71d0cf5f4205a62b257cf5f3e6d6ba5d69d4fc6d07c5ebab27f0ab33d7742`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：需人工补充确认（needs_agent）
- category：失业；topics：社保规划、广东、失业、合成政策案例
- tags：`广东` `440000` `female` `1970_1979` `unemployed` `失业` `capability:claim-city-missing` `险种:养老` `险种:医保` `险种:失业` `needs-agent`

**合成人物画像**

- 地区：广东
- 性别与出生：女性（女工人口径），1979年11月21日出生
- 就业状态：失业，正在领取失业保险金
- 社保累计缴费：养老保险180个月，职工医保120个月
- 失业保险累计缴费：3年；本段已领取：2个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01

**咨询问题**

> 我在广东失业，失业保险累计缴了3年，还没确定在哪个市申领失业保险金，现在能算出每月领多少吗？

**规则引擎结论（公开回答）**

```text
【结论摘要】
符合失业保险金领取条件（失业保险累计缴费3年），核定领取期限12个月；但未提供领取地市代码，无法确定当地月最低工资标准，规则引擎不估算金额，需补充领取地市后再测算。

【关键测算结果】
- 领取资格：是
- 核定领取期限：12个月
- 月领取标准：未估算（需补充信息）（缺领取地市）

【使用的个人条件】
- 地区：广东
- 性别与出生：女性（女工人口径），1979年11月21日出生
- 就业状态：失业，正在领取失业保险金
- 社保累计缴费：养老保险180个月，职工医保120个月
- 失业保险累计缴费：3年；本段已领取：2个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01

【政策依据】
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第四十六条；article/第四十五条
- 《失业保险条例（国务院令第258号）》（国务院）— 定位：article/第十七条；article/第十四条
- 《广东省人民政府关于调整我省最低工资标准的通知（粤府函〔2026〕188号）》（广东省人民政府）— 定位：body/正文第一条及附件《广东省最低工资标准表》
- 《广东省9月1日起调整提高最低工资标准（省人社厅发布页，数值明细）》（广东省人力资源和社会保障厅）— 定位：body/正文第二段
- 《广东省失业保险条例（2002年通过、2013年修订、2022年第一次修正、2025年1月12日第二次修正）》（广东省人民代表大会常务委员会）— 定位：body/第十九条

【缺失或需确认事项】
- 需补充字段 user.profile.claim_city：请确认失业保险金领取地市（用于按领取地市最低工资标准核算失业金金额）。
- 规则提示（需确认）：参保地医保退休最低缴费年限参数未配置（国家框架由社会保险法第27条授权统筹地区规定），需人工确认后补充地区参数。（W-MI-LOCAL-YEARS-MISSING）
- 规则提示（需确认）：失业金期间，医保通常由失业保险基金代缴（以经办口径为准）。规划现金流时请不要重复计算医保个人缴费。（W-UI-MI-PAID）

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1979-11-21",
    "birth_day": 21,
    "birth_month": 11,
    "birth_year": 1979,
    "female_retire_type": "worker50",
    "gender": "female"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "medical_contrib_months": 120,
    "pension_contrib_months": 180,
    "ui_claimed_months": 2,
    "unemployment_insurance_years": 3
  },
  "status": {
    "employment_status": "unemployed",
    "on_unemployment_benefit": true
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [
    {
      "field": "user.profile.claim_city",
      "question_id": "Q-UI-CLAIM-CITY",
      "text": "请确认失业保险金领取地市（用于按领取地市最低工资标准核算失业金金额）。"
    }
  ],
  "conclusion_level": "needs_agent",
  "mi": {
    "gap_months": 1,
    "paid_by_unemployment_fund": true
  },
  "needs_agent": true,
  "pension": {
    "gap_months": 18,
    "gap_years_ceil": 2,
    "min_years_required": 16.5
  },
  "retirement": {
    "female_retire_type_status": "confirmed",
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 6,
    "legal_retire_age_years": 52,
    "legal_retire_date": "2032-05-21",
    "legal_retire_month": 5,
    "legal_retire_year": 2032,
    "months_to_legal_retire": 68,
    "original_retire_age_years": 50
  },
  "unemployment": {
    "duration_months": 12,
    "duration_months_raw": 12,
    "eligible": true
  },
  "warning_details": [
    {
      "text": "参保地医保退休最低缴费年限参数未配置（国家框架由社会保险法第27条授权统筹地区规定），需人工确认后补充地区参数。",
      "warning_id": "W-MI-LOCAL-YEARS-MISSING"
    },
    {
      "text": "失业金期间，医保通常由失业保险基金代缴（以经办口径为准）。规划现金流时请不要重复计算医保个人缴费。",
      "warning_id": "W-UI-MI-PAID"
    },
    {
      "text": "关键信息不完整或存在互斥冲突，建议进入 Agent 追问/细化模式后再生成完整方案。",
      "warning_id": "W-NEEDS-AGENT"
    }
  ],
  "warnings": [
    "W-MI-LOCAL-YEARS-MISSING",
    "W-UI-MI-PAID",
    "W-NEEDS-AGENT"
  ]
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.unemployment.eligible` | eq | `true` |
| `calc.unemployment.duration_months` | eq | `12` |
| `calc.needs_agent` | eq | `true` |

**政策依据**

1. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第四十六条
   - 原文摘录：失业人员失业前用人单位和本人累计缴费满一年不足五年的，领取失业保险金的期限最长为十二个月；累计缴费满五年不足十年的，领取失业保险金的期限最长为十八个月；累计缴费十年以上的，领取失业保险金的期限最长为二十四个月。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
2. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第四十六条
   - 原文摘录：重新就业后，再次失业的，缴费时间重新计算，领取失业保险金的期限与前次失业应当领取而尚未领取的失业保险金的期限合并计算，最长不超过二十四个月。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
3. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第四十五条
   - 原文摘录：失业人员符合下列条件的，从失业保险基金中领取失业保险金：（一）失业前用人单位和本人已经缴纳失业保险费满一年的；（二）非因本人意愿中断就业的；（三）已经进行失业登记，并有求职要求的。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
4. 政策标题：《失业保险条例（国务院令第258号）》
   - 文档ID：`DOC-CN-UNEMPLOYMENT-REGULATION`
   - 发布机关：国务院
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fg/202011/t20201103_394936.html>
   - 条款定位：article / 第十七条
   - 原文摘录：失业人员失业前所在单位和本人按照规定累计缴费时间满1年不足5年的，领取失业保险金的期限最长为12个月；累计缴费时间满5年不足10年的，领取失业保险金的期限最长为18个月；累计缴费时间10年以上的，领取失业保险金的期限最长为24个月。
   - 原件SHA-256：`b8187965656565984549569e9894a62cb3960f5a64aacac3749b80be2d7a3e04`
5. 政策标题：《失业保险条例（国务院令第258号）》
   - 文档ID：`DOC-CN-UNEMPLOYMENT-REGULATION`
   - 发布机关：国务院
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fg/202011/t20201103_394936.html>
   - 条款定位：article / 第十四条
   - 原文摘录：具备下列条件的失业人员，可以领取失业保险金：（一）按照规定参加失业保险，所在单位和本人已按照规定履行缴费义务满1年的；（二）非因本人意愿中断就业的；（三）已办理失业登记，并有求职要求的。
   - 原件SHA-256：`b8187965656565984549569e9894a62cb3960f5a64aacac3749b80be2d7a3e04`
6. 政策标题：《广东省人民政府关于调整我省最低工资标准的通知（粤府函〔2026〕188号）》
   - 文档ID：`DOC-GD-MINIMUM-WAGE-2026`
   - 发布机关：广东省人民政府
   - 官方URL：<https://www.gd.gov.cn/zwgk/wjk/qbwj/yfh/content/post_4942177.html>
   - 条款定位：body / 正文第一条及附件《广东省最低工资标准表》
   - 原文摘录：从2026年9月1日起，对我省全日制就业劳动者月最低工资标准和非全日制小时最低工资标准进行调整，具体标准附后。
   - 原件SHA-256：`de716e1c054d4fb232a9579985d0a83a40d240a3f35b859a933cf14cb2bc7513`
7. 政策标题：《广东省9月1日起调整提高最低工资标准（省人社厅发布页，数值明细）》
   - 文档ID：`DOC-GD-MINIMUM-WAGE-ADJUST`
   - 发布机关：广东省人力资源和社会保障厅
   - 官方URL：<https://hrss.gd.gov.cn/gkmlpt/content/4/4942/post_4942224.html>
   - 条款定位：body / 正文第二段
   - 原文摘录：此次调整后全省分为三类标准，其中广州、深圳执行一类标准，广州市调整为2680元/月，深圳市调整为2700元/月，对应的非全日制小时最低工资标准均为25.4元/小时；二类标准调整为2300元/月，执行地区为珠海、佛山、东莞、中山，对应的非全日制小时最低工资标准为21.9元/小时；三类标准调整为2040元/月，执行地区为汕头、韶关、河源、梅州、惠州、汕尾、江门、阳江、湛江、茂名、肇庆、清远、潮州、揭阳、云浮，对应的非全日制小时最低工资标准为20.2元/小时。
   - 原件SHA-256：`1dad0d0c9995a6b861f616357e85c86072d12d1e8e7f3e4e41b4654cf24b72cb`
8. 政策标题：《广东省失业保险条例（2002年通过、2013年修订、2022年第一次修正、2025年1月12日第二次修正）》
   - 文档ID：`DOC-GD-UNEMPLOYMENT-REGULATION`
   - 发布机关：广东省人民代表大会常务委员会
   - 官方URL：<https://hrss.gd.gov.cn/gkmlpt/content/4/4669/post_4669825.html>
   - 条款定位：body / 第十九条
   - 原文摘录：第十九条 失业保险金由社会保险经办机构按照失业保险金领取地地级以上市最低工资标准的百分之九十按月计发，省人民政府根据国家规定可以适当调整失业保险金标准。
   - 原件SHA-256：`15f3551f796ae24058b996c75d5220a79115dc9a82915cbff537b008d28e4456`

### 21. 广东医保案例：1980年生男性·在职（单位参保）（省级统一口径）

- UID：`RPC-440000-GD-male-from_1980-employed-MI-2030-V2`（回归测试UID：`RPCT-440000-GD-male-from_1980-employed-MI-2030-V2`）
- 地区：广东（440000）
- 能力：医保（`mi-2030`）
- as-of日期：2030-01-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`9ce254ca-7443-4cf5-a764-acd715152a36`
- snapshot hash：`d3952809bfd9189f95220ebde1622a59a0d7e5ced4d3e55203f192a99c9771ee`
- 案例content hash：`9f9e65720e159ecf52496198328bb493dcee8758af3535c13e52ef31b081dd9e`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：确定性结论
- category：医保；topics：社保规划、广东、医保、合成政策案例
- tags：`广东` `440000` `male` `from_1980` `employed` `capability:mi-2030` `险种:养老` `险种:医保`

**合成人物画像**

- 地区：广东
- 性别与出生：男性，1980年1月10日出生
- 就业状态：在职（单位参保）
- 社保累计缴费：养老保险180个月，职工医保120个月
- 职工医保衔接：上次缴费结束2029-12-31，本次参保2030-01-01

**咨询问题**

> 我是1980年1月出生的男性，在广东参保，职工医保累计缴了120个月。按2030-01-01起执行的省级统一口径，退休时医保需要累计缴多少个月、我还差多少？

**规则引擎结论（公开回答）**

```text
【结论摘要】
按广东省自2030-01-01起执行的省级统一口径，男性退休时享受职工医保待遇所需累计缴费360个月；当前累计120个月，缺口240个月；法定退休年龄63岁。

【关键测算结果】
- 退休所需累计缴费（省级统一口径）：360个月
- 当前累计缴费（输入）：120个月
- 年限缺口：240个月
- 法定退休年龄：63岁

【使用的个人条件】
- 地区：广东
- 性别与出生：男性，1980年1月10日出生
- 就业状态：在职（单位参保）
- 社保累计缴费：养老保险180个月，职工医保120个月
- 职工医保衔接：上次缴费结束2029-12-31，本次参保2030-01-01

【政策依据】
- 《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》（全国人民代表大会常务委员会）— 定位：annex/附件1-3 延迟法定退休年龄对照表；article/国务院办法第三条；article/国务院办法第一条
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第二十七条
- 《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》（广东省医疗保障局等三部门）— 定位：article/第八条；article/第六条

【缺失或需确认事项】
- 无。本案例输入完整，结论为确定性计算结果。

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2030-01-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1980-01-10",
    "birth_day": 10,
    "birth_month": 1,
    "birth_year": 1980,
    "gender": "male"
  },
  "mi": {
    "enroll_date": "2030-01-01",
    "prev_end_date": "2029-12-31"
  },
  "social": {
    "medical_contrib_months": 120,
    "pension_contrib_months": 180
  },
  "status": {
    "employment_status": "employed"
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "direct",
  "mi": {
    "gap_months": 1,
    "lifetime_gap_months": 240,
    "lifetime_required_months": 360,
    "paid_by_unemployment_fund": false
  },
  "needs_agent": false,
  "pension": {
    "gap_months": 60,
    "gap_years_ceil": 5,
    "min_years_required": 20
  },
  "retirement": {
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 0,
    "legal_retire_age_years": 63,
    "legal_retire_date": "2043-01-10",
    "legal_retire_month": 1,
    "legal_retire_year": 2043,
    "months_to_legal_retire": 156,
    "original_retire_age_years": 60
  },
  "unemployment": {
    "duration_months": 0,
    "eligible": false,
    "monthly_amount_est": 0
  },
  "warning_details": [],
  "warnings": []
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.mi.lifetime_required_months` | eq | `360` |
| `calc.mi.lifetime_gap_months` | eq | `240` |
| `calc.retirement.legal_retire_age_years` | eq | `63` |

**政策依据**

1. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：annex / 附件1-3 延迟法定退休年龄对照表
   - 原文摘录：附件：1.男职工延迟法定退休年龄对照表 2.原法定退休年龄五十五周岁的女职工延迟法定退休年龄对照表 3.原法定退休年龄五十周岁的女职工延迟法定退休年龄对照表
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
2. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第三条
   - 原文摘录：职工达到最低缴费年限，可以自愿选择弹性提前退休，提前时间最长不超过三年，且退休年龄不得低于女职工五十周岁、五十五周岁及男职工六十周岁的原法定退休年龄。职工达到法定退休年龄，所在单位与职工协商一致的，可以弹性延迟退休，延迟时间最长不超过三年。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
3. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第一条
   - 原文摘录：从2025年1月1日起，男职工和原法定退休年龄为五十五周岁的女职工，法定退休年龄每四个月延迟一个月，分别逐步延迟至六十三周岁和五十八周岁；原法定退休年龄为五十周岁的女职工，法定退休年龄每二个月延迟一个月，逐步延迟至五十五周岁。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
4. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第二十七条
   - 原文摘录：参加职工基本医疗保险的个人，达到法定退休年龄时累计缴费达到国家规定年限的，退休后不再缴纳基本医疗保险费，按照国家规定享受基本医疗保险待遇；未达到国家规定年限的，可以缴费至国家规定年限。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
5. 政策标题：《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》
   - 文档ID：`DOC-GD-MEDICAL-TRANSFER-2022`
   - 发布机关：广东省医疗保障局等三部门
   - 官方URL：<https://hsa.gd.gov.cn/zwgk/zfxxgkml/bmwj/gfxwj/content/post_3953355.html>
   - 条款定位：article / 第八条
   - 原文摘录：职工医保参保人员达到法定退休年龄，缴费年限同时符合下列条件的，退休后不再缴纳职工医保费，按照规定享受职工医保待遇：（一）参加职工医保的累计缴费年限符合退休后待遇享受地规定的职工医保累计缴费年限要求。（二）在退休后待遇享受地参加职工医保实际缴费年限累计满10年。
   - 原件SHA-256：`18b4c198fbc46bec9034584c579137725a2021ae7797fe2d5b51f3014e1076a2`
6. 政策标题：《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》
   - 文档ID：`DOC-GD-MEDICAL-TRANSFER-2022`
   - 发布机关：广东省医疗保障局等三部门
   - 官方URL：<https://hsa.gd.gov.cn/zwgk/zfxxgkml/bmwj/gfxwj/content/post_3953355.html>
   - 条款定位：article / 第六条
   - 原文摘录：逐步统一全省职工医保缴费年限政策。累计缴费年限到2030年1月1日统一为男职工30年，女职工25年。未达前款规定的市，从2022年开始，在本市2021年缴费年限政策的基础上，逐年调整本市职工医保累计缴费年限。
   - 原件SHA-256：`18b4c198fbc46bec9034584c579137725a2021ae7797fe2d5b51f3014e1076a2`

### 22. 广东医保案例：1966年生女性·灵活就业（地市年限缺参）

- UID：`RPC-440000-GD-female-before_1970-flexible-MI-2026-MISSING-V2`（回归测试UID：`RPCT-440000-GD-female-before_1970-flexible-MI-2026-MISSING-V2`）
- 地区：广东（440000）
- 能力：医保（`mi-2026-missing`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`e9b7227f-69a1-413b-b607-ebaba2db38ea`
- snapshot hash：`3e20302d6df76232f6ceba8c5b197244bac289a6b02a4a0bfc1e7b03959f4e5e`
- 案例content hash：`96ba4a3d646986333e701e182f500e0d7aa74fe9985d0ed165f8f490c0ce72b8`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：需人工补充确认（needs_agent）
- category：医保；topics：社保规划、广东、医保、合成政策案例
- tags：`广东` `440000` `female` `before_1970` `flexible` `灵活就业` `capability:mi-2026-missing` `险种:养老` `险种:医保` `needs-agent`

**合成人物画像**

- 地区：广东
- 性别与出生：女性（女工人口径），1966年7月16日出生
- 就业状态：灵活就业
- 社保累计缴费：养老保险180个月，职工医保120个月
- 灵活就业月缴费基数（本人选择）：6000元
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01

**咨询问题**

> 我是1966年7月出生的女性（女工人口径），在广东参保，职工医保累计缴了120个月，现在能确定退休时需要缴满多少年吗？

**规则引擎结论（公开回答）**

```text
【结论摘要】
当前计算时点省级统一医保退休年限尚未生效，参保地市执行年限参数缺失，规则引擎不给出退休医保年限结论（需补充参保地市口径确认）；法定退休年龄50岁可确定。

【关键测算结果】
- 退休医保所需年限：未估算（需补充信息）（地市年限参数缺失）
- 当前累计缴费（输入）：120个月
- 法定退休年龄：50岁

【使用的个人条件】
- 地区：广东
- 性别与出生：女性（女工人口径），1966年7月16日出生
- 就业状态：灵活就业
- 社保累计缴费：养老保险180个月，职工医保120个月
- 灵活就业月缴费基数（本人选择）：6000元
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01

【政策依据】
- 《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》（全国人民代表大会常务委员会）— 定位：annex/附件1-3 延迟法定退休年龄对照表；article/国务院办法第三条；article/国务院办法第一条
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第二十七条
- 《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》（广东省医疗保障局等三部门）— 定位：article/第八条

【缺失或需确认事项】
- 规则引擎标记需人工确认，但未生成具体追问。
- 规则提示（需确认）：参保地医保退休最低缴费年限参数未配置（国家框架由社会保险法第27条授权统筹地区规定），需人工确认后补充地区参数。（W-MI-LOCAL-YEARS-MISSING）

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1966-07-16",
    "birth_day": 16,
    "birth_month": 7,
    "birth_year": 1966,
    "female_retire_type": "worker50",
    "gender": "female"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "flex_contrib_base": 6000,
    "medical_contrib_months": 120,
    "pension_contrib_months": 180
  },
  "status": {
    "employment_status": "flexible"
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "needs_agent",
  "mi": {
    "gap_months": 1,
    "paid_by_unemployment_fund": false
  },
  "needs_agent": true,
  "pension": {
    "gap_months": 0,
    "gap_years_ceil": 0,
    "min_years_required": 15
  },
  "retirement": {
    "female_retire_type_status": "confirmed",
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 0,
    "legal_retire_age_years": 50,
    "legal_retire_date": "2016-07-16",
    "legal_retire_month": 7,
    "legal_retire_year": 2016,
    "months_to_legal_retire": -122,
    "original_retire_age_years": 50
  },
  "unemployment": {
    "duration_months": 0,
    "eligible": false,
    "monthly_amount_est": 0
  },
  "warning_details": [
    {
      "text": "参保地医保退休最低缴费年限参数未配置（国家框架由社会保险法第27条授权统筹地区规定），需人工确认后补充地区参数。",
      "warning_id": "W-MI-LOCAL-YEARS-MISSING"
    },
    {
      "text": "关键信息不完整或存在互斥冲突，建议进入 Agent 追问/细化模式后再生成完整方案。",
      "warning_id": "W-NEEDS-AGENT"
    }
  ],
  "warnings": [
    "W-MI-LOCAL-YEARS-MISSING",
    "W-NEEDS-AGENT"
  ]
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.needs_agent` | eq | `true` |
| `calc.retirement.legal_retire_age_years` | eq | `50` |

**政策依据**

1. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：annex / 附件1-3 延迟法定退休年龄对照表
   - 原文摘录：附件：1.男职工延迟法定退休年龄对照表 2.原法定退休年龄五十五周岁的女职工延迟法定退休年龄对照表 3.原法定退休年龄五十周岁的女职工延迟法定退休年龄对照表
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
2. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第三条
   - 原文摘录：职工达到最低缴费年限，可以自愿选择弹性提前退休，提前时间最长不超过三年，且退休年龄不得低于女职工五十周岁、五十五周岁及男职工六十周岁的原法定退休年龄。职工达到法定退休年龄，所在单位与职工协商一致的，可以弹性延迟退休，延迟时间最长不超过三年。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
3. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第一条
   - 原文摘录：从2025年1月1日起，男职工和原法定退休年龄为五十五周岁的女职工，法定退休年龄每四个月延迟一个月，分别逐步延迟至六十三周岁和五十八周岁；原法定退休年龄为五十周岁的女职工，法定退休年龄每二个月延迟一个月，逐步延迟至五十五周岁。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
4. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第二十七条
   - 原文摘录：参加职工基本医疗保险的个人，达到法定退休年龄时累计缴费达到国家规定年限的，退休后不再缴纳基本医疗保险费，按照国家规定享受基本医疗保险待遇；未达到国家规定年限的，可以缴费至国家规定年限。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
5. 政策标题：《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》
   - 文档ID：`DOC-GD-MEDICAL-TRANSFER-2022`
   - 发布机关：广东省医疗保障局等三部门
   - 官方URL：<https://hsa.gd.gov.cn/zwgk/zfxxgkml/bmwj/gfxwj/content/post_3953355.html>
   - 条款定位：article / 第八条
   - 原文摘录：职工医保参保人员达到法定退休年龄，缴费年限同时符合下列条件的，退休后不再缴纳职工医保费，按照规定享受职工医保待遇：（一）参加职工医保的累计缴费年限符合退休后待遇享受地规定的职工医保累计缴费年限要求。（二）在退休后待遇享受地参加职工医保实际缴费年限累计满10年。
   - 原件SHA-256：`18b4c198fbc46bec9034584c579137725a2021ae7797fe2d5b51f3014e1076a2`

### 23. 广东医保案例：1963年生男性·在职（单位参保）（省级统一口径）

- UID：`RPC-440000-GD-male-before_1970-employed-MI-2030-V2`（回归测试UID：`RPCT-440000-GD-male-before_1970-employed-MI-2030-V2`）
- 地区：广东（440000）
- 能力：医保（`mi-2030`）
- as-of日期：2030-01-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`9ce254ca-7443-4cf5-a764-acd715152a36`
- snapshot hash：`d3952809bfd9189f95220ebde1622a59a0d7e5ced4d3e55203f192a99c9771ee`
- 案例content hash：`352fbb06cd6c78ca3e1a92a2747b580024b95f6e4bec5f33aee487ad8df32865`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：确定性结论
- category：医保；topics：社保规划、广东、医保、合成政策案例
- tags：`广东` `440000` `male` `before_1970` `employed` `capability:mi-2030` `险种:养老` `险种:医保`

**合成人物画像**

- 地区：广东
- 性别与出生：男性，1963年1月10日出生
- 就业状态：在职（单位参保）
- 社保累计缴费：养老保险180个月，职工医保120个月
- 职工医保衔接：上次缴费结束2029-12-31，本次参保2030-01-01

**咨询问题**

> 我是1963年1月出生的男性，在广东参保，职工医保累计缴了120个月。按2030-01-01起执行的省级统一口径，退休时医保需要累计缴多少个月、我还差多少？

**规则引擎结论（公开回答）**

```text
【结论摘要】
按广东省自2030-01-01起执行的省级统一口径，男性退休时享受职工医保待遇所需累计缴费360个月；当前累计120个月，缺口240个月；法定退休年龄60岁。

【关键测算结果】
- 退休所需累计缴费（省级统一口径）：360个月
- 当前累计缴费（输入）：120个月
- 年限缺口：240个月
- 法定退休年龄：60岁

【使用的个人条件】
- 地区：广东
- 性别与出生：男性，1963年1月10日出生
- 就业状态：在职（单位参保）
- 社保累计缴费：养老保险180个月，职工医保120个月
- 职工医保衔接：上次缴费结束2029-12-31，本次参保2030-01-01

【政策依据】
- 《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》（全国人民代表大会常务委员会）— 定位：annex/附件1-3 延迟法定退休年龄对照表；article/国务院办法第三条；article/国务院办法第一条
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第二十七条
- 《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》（广东省医疗保障局等三部门）— 定位：article/第八条；article/第六条

【缺失或需确认事项】
- 无。本案例输入完整，结论为确定性计算结果。

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2030-01-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1963-01-10",
    "birth_day": 10,
    "birth_month": 1,
    "birth_year": 1963,
    "gender": "male"
  },
  "mi": {
    "enroll_date": "2030-01-01",
    "prev_end_date": "2029-12-31"
  },
  "social": {
    "medical_contrib_months": 120,
    "pension_contrib_months": 180
  },
  "status": {
    "employment_status": "employed"
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "direct",
  "mi": {
    "gap_months": 1,
    "lifetime_gap_months": 240,
    "lifetime_required_months": 360,
    "paid_by_unemployment_fund": false
  },
  "needs_agent": false,
  "pension": {
    "gap_months": 0,
    "gap_years_ceil": 0,
    "min_years_required": 15
  },
  "retirement": {
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 0,
    "legal_retire_age_years": 60,
    "legal_retire_date": "2023-01-10",
    "legal_retire_month": 1,
    "legal_retire_year": 2023,
    "months_to_legal_retire": -84,
    "original_retire_age_years": 60
  },
  "unemployment": {
    "duration_months": 0,
    "eligible": false,
    "monthly_amount_est": 0
  },
  "warning_details": [],
  "warnings": []
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.mi.lifetime_required_months` | eq | `360` |
| `calc.mi.lifetime_gap_months` | eq | `240` |
| `calc.retirement.legal_retire_age_years` | eq | `60` |

**政策依据**

1. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：annex / 附件1-3 延迟法定退休年龄对照表
   - 原文摘录：附件：1.男职工延迟法定退休年龄对照表 2.原法定退休年龄五十五周岁的女职工延迟法定退休年龄对照表 3.原法定退休年龄五十周岁的女职工延迟法定退休年龄对照表
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
2. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第三条
   - 原文摘录：职工达到最低缴费年限，可以自愿选择弹性提前退休，提前时间最长不超过三年，且退休年龄不得低于女职工五十周岁、五十五周岁及男职工六十周岁的原法定退休年龄。职工达到法定退休年龄，所在单位与职工协商一致的，可以弹性延迟退休，延迟时间最长不超过三年。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
3. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第一条
   - 原文摘录：从2025年1月1日起，男职工和原法定退休年龄为五十五周岁的女职工，法定退休年龄每四个月延迟一个月，分别逐步延迟至六十三周岁和五十八周岁；原法定退休年龄为五十周岁的女职工，法定退休年龄每二个月延迟一个月，逐步延迟至五十五周岁。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
4. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第二十七条
   - 原文摘录：参加职工基本医疗保险的个人，达到法定退休年龄时累计缴费达到国家规定年限的，退休后不再缴纳基本医疗保险费，按照国家规定享受基本医疗保险待遇；未达到国家规定年限的，可以缴费至国家规定年限。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
5. 政策标题：《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》
   - 文档ID：`DOC-GD-MEDICAL-TRANSFER-2022`
   - 发布机关：广东省医疗保障局等三部门
   - 官方URL：<https://hsa.gd.gov.cn/zwgk/zfxxgkml/bmwj/gfxwj/content/post_3953355.html>
   - 条款定位：article / 第八条
   - 原文摘录：职工医保参保人员达到法定退休年龄，缴费年限同时符合下列条件的，退休后不再缴纳职工医保费，按照规定享受职工医保待遇：（一）参加职工医保的累计缴费年限符合退休后待遇享受地规定的职工医保累计缴费年限要求。（二）在退休后待遇享受地参加职工医保实际缴费年限累计满10年。
   - 原件SHA-256：`18b4c198fbc46bec9034584c579137725a2021ae7797fe2d5b51f3014e1076a2`
6. 政策标题：《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》
   - 文档ID：`DOC-GD-MEDICAL-TRANSFER-2022`
   - 发布机关：广东省医疗保障局等三部门
   - 官方URL：<https://hsa.gd.gov.cn/zwgk/zfxxgkml/bmwj/gfxwj/content/post_3953355.html>
   - 条款定位：article / 第六条
   - 原文摘录：逐步统一全省职工医保缴费年限政策。累计缴费年限到2030年1月1日统一为男职工30年，女职工25年。未达前款规定的市，从2022年开始，在本市2021年缴费年限政策的基础上，逐年调整本市职工医保累计缴费年限。
   - 原件SHA-256：`18b4c198fbc46bec9034584c579137725a2021ae7797fe2d5b51f3014e1076a2`

### 24. 广东缴费基数案例：1966年生男性·灵活就业（缴费基数边界）

- UID：`RPC-440000-GD-male-before_1970-flexible-BASE-BOUNDARY-V2`（回归测试UID：`RPCT-440000-GD-male-before_1970-flexible-BASE-BOUNDARY-V2`）
- 地区：广东（440000）
- 能力：缴费基数（`base-boundary`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`e9b7227f-69a1-413b-b607-ebaba2db38ea`
- snapshot hash：`3e20302d6df76232f6ceba8c5b197244bac289a6b02a4a0bfc1e7b03959f4e5e`
- 案例content hash：`efd1b239e8a43d06d48c474655cca1166edc276677b6e8e06adb5e33bb43b986`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：需人工补充确认（needs_agent）
- category：缴费基数；topics：社保规划、广东、缴费基数、合成政策案例
- tags：`广东` `440000` `male` `before_1970` `flexible` `灵活就业` `capability:base-boundary` `险种:养老` `险种:医保` `needs-agent`

**合成人物画像**

- 地区：广东
- 性别与出生：男性，1966年5月15日出生
- 就业状态：灵活就业
- 社保累计缴费：养老保险180个月，职工医保120个月
- 灵活就业月缴费基数（本人选择）：4000元
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01

**咨询问题**

> 我是1966年5月出生的男性，在广东灵活就业，想按4000元/月的基数参保，这个基数可以吗、每月要交多少？

**规则引擎结论（公开回答）**

```text
【结论摘要】
本人选择的灵活就业缴费基数为4000元/月；当前规则引擎未配置广东灵活就业月缴费金额规则，不计算具体缴费金额，缴费基数是否落在参保地市下限与省上限之间请以政策依据为准；同时参保地市医保退休年限参数缺失，需补充确认；法定退休年龄60岁可确定。

【关键测算结果】
- 本人选择的缴费基数（输入）：4000元/月
- 灵活就业月缴费金额：未估算（需补充信息）（广东无专属缴费规则）
- 法定退休年龄：60岁

【使用的个人条件】
- 地区：广东
- 性别与出生：男性，1966年5月15日出生
- 就业状态：灵活就业
- 社保累计缴费：养老保险180个月，职工医保120个月
- 灵活就业月缴费基数（本人选择）：4000元
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01

【政策依据】
- 《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》（全国人民代表大会常务委员会）— 定位：annex/附件1-3 延迟法定退休年龄对照表；article/国务院办法第三条；article/国务院办法第一条
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第二十七条
- 《关于公布2025年职工基本养老保险缴费基数上下限和基本养老金计发基数有关问题的通知（粤人社发〔2025〕32号）》（广东省人力资源和社会保障厅）— 定位：body/正文第一条

【缺失或需确认事项】
- 规则引擎标记需人工确认，但未生成具体追问。
- 规则提示（需确认）：参保地医保退休最低缴费年限参数未配置（国家框架由社会保险法第27条授权统筹地区规定），需人工确认后补充地区参数。（W-MI-LOCAL-YEARS-MISSING）

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1966-05-15",
    "birth_day": 15,
    "birth_month": 5,
    "birth_year": 1966,
    "gender": "male"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "flex_contrib_base": 4000,
    "medical_contrib_months": 120,
    "pension_contrib_months": 180
  },
  "status": {
    "employment_status": "flexible"
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "needs_agent",
  "mi": {
    "gap_months": 1,
    "paid_by_unemployment_fund": false
  },
  "needs_agent": true,
  "pension": {
    "gap_months": 0,
    "gap_years_ceil": 0,
    "min_years_required": 15
  },
  "retirement": {
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 5,
    "legal_retire_age_years": 60,
    "legal_retire_date": "2026-10-15",
    "legal_retire_month": 10,
    "legal_retire_year": 2026,
    "months_to_legal_retire": 1,
    "original_retire_age_years": 60
  },
  "unemployment": {
    "duration_months": 0,
    "eligible": false,
    "monthly_amount_est": 0
  },
  "warning_details": [
    {
      "text": "参保地医保退休最低缴费年限参数未配置（国家框架由社会保险法第27条授权统筹地区规定），需人工确认后补充地区参数。",
      "warning_id": "W-MI-LOCAL-YEARS-MISSING"
    },
    {
      "text": "关键信息不完整或存在互斥冲突，建议进入 Agent 追问/细化模式后再生成完整方案。",
      "warning_id": "W-NEEDS-AGENT"
    }
  ],
  "warnings": [
    "W-MI-LOCAL-YEARS-MISSING",
    "W-NEEDS-AGENT"
  ]
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.needs_agent` | eq | `true` |
| `calc.retirement.legal_retire_age_years` | eq | `60` |

**政策依据**

1. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：annex / 附件1-3 延迟法定退休年龄对照表
   - 原文摘录：附件：1.男职工延迟法定退休年龄对照表 2.原法定退休年龄五十五周岁的女职工延迟法定退休年龄对照表 3.原法定退休年龄五十周岁的女职工延迟法定退休年龄对照表
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
2. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第三条
   - 原文摘录：职工达到最低缴费年限，可以自愿选择弹性提前退休，提前时间最长不超过三年，且退休年龄不得低于女职工五十周岁、五十五周岁及男职工六十周岁的原法定退休年龄。职工达到法定退休年龄，所在单位与职工协商一致的，可以弹性延迟退休，延迟时间最长不超过三年。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
3. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第一条
   - 原文摘录：从2025年1月1日起，男职工和原法定退休年龄为五十五周岁的女职工，法定退休年龄每四个月延迟一个月，分别逐步延迟至六十三周岁和五十八周岁；原法定退休年龄为五十周岁的女职工，法定退休年龄每二个月延迟一个月，逐步延迟至五十五周岁。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
4. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第二十七条
   - 原文摘录：参加职工基本医疗保险的个人，达到法定退休年龄时累计缴费达到国家规定年限的，退休后不再缴纳基本医疗保险费，按照国家规定享受基本医疗保险待遇；未达到国家规定年限的，可以缴费至国家规定年限。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
5. 政策标题：《关于公布2025年职工基本养老保险缴费基数上下限和基本养老金计发基数有关问题的通知（粤人社发〔2025〕32号）》
   - 文档ID：`DOC-GD-CONTRIBUTION-BASE-2025`
   - 发布机关：广东省人力资源和社会保障厅
   - 官方URL：<https://hrss.gd.gov.cn/zwgk/gsgg/content/post_4789648.html>
   - 条款定位：body / 正文第一条
   - 原文摘录：自2025年7月1日起，全省企业职工基本养老保险缴费基数上限调整为27549元，广州市、省直缴费基数下限调整为5510元，其他地区缴费基数下限调整为4775元。
   - 原件SHA-256：`ca70f1155ba94cf09e6217fd85694a6adc8f03546ae8eb2038e6aa9c068b5aa5`

### 25. 广东医保案例：1971年生男性·在职（单位参保）（地市年限缺参）

- UID：`RPC-440000-GD-male-1970_1979-employed-MI-2026-MISSING-V2`（回归测试UID：`RPCT-440000-GD-male-1970_1979-employed-MI-2026-MISSING-V2`）
- 地区：广东（440000）
- 能力：医保（`mi-2026-missing`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`e9b7227f-69a1-413b-b607-ebaba2db38ea`
- snapshot hash：`3e20302d6df76232f6ceba8c5b197244bac289a6b02a4a0bfc1e7b03959f4e5e`
- 案例content hash：`2d35a7dfa34554f3d411ad9dd39d512c51172986b1e24d33ad7a4c55e5539446`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：需人工补充确认（needs_agent）
- category：医保；topics：社保规划、广东、医保、合成政策案例
- tags：`广东` `440000` `male` `1970_1979` `employed` `capability:mi-2026-missing` `险种:养老` `险种:医保` `needs-agent`

**合成人物画像**

- 地区：广东
- 性别与出生：男性，1971年1月10日出生
- 就业状态：在职（单位参保）
- 社保累计缴费：养老保险180个月，职工医保120个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01

**咨询问题**

> 我是1971年1月出生的男性，在广东参保，职工医保累计缴了120个月，现在能确定退休时需要缴满多少年吗？

**规则引擎结论（公开回答）**

```text
【结论摘要】
当前计算时点省级统一医保退休年限尚未生效，参保地市执行年限参数缺失，规则引擎不给出退休医保年限结论（需补充参保地市口径确认）；法定退休年龄61岁可确定。

【关键测算结果】
- 退休医保所需年限：未估算（需补充信息）（地市年限参数缺失）
- 当前累计缴费（输入）：120个月
- 法定退休年龄：61岁

【使用的个人条件】
- 地区：广东
- 性别与出生：男性，1971年1月10日出生
- 就业状态：在职（单位参保）
- 社保累计缴费：养老保险180个月，职工医保120个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01

【政策依据】
- 《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》（全国人民代表大会常务委员会）— 定位：annex/附件1-3 延迟法定退休年龄对照表；article/国务院办法第三条；article/国务院办法第一条
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第二十七条
- 《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》（广东省医疗保障局等三部门）— 定位：article/第八条

【缺失或需确认事项】
- 规则引擎标记需人工确认，但未生成具体追问。
- 规则提示（需确认）：参保地医保退休最低缴费年限参数未配置（国家框架由社会保险法第27条授权统筹地区规定），需人工确认后补充地区参数。（W-MI-LOCAL-YEARS-MISSING）

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1971-01-10",
    "birth_day": 10,
    "birth_month": 1,
    "birth_year": 1971,
    "gender": "male"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "medical_contrib_months": 120,
    "pension_contrib_months": 180
  },
  "status": {
    "employment_status": "employed"
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "needs_agent",
  "mi": {
    "gap_months": 1,
    "paid_by_unemployment_fund": false
  },
  "needs_agent": true,
  "pension": {
    "gap_months": 18,
    "gap_years_ceil": 2,
    "min_years_required": 16.5
  },
  "retirement": {
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 7,
    "legal_retire_age_years": 61,
    "legal_retire_date": "2032-08-10",
    "legal_retire_month": 8,
    "legal_retire_year": 2032,
    "months_to_legal_retire": 71,
    "original_retire_age_years": 60
  },
  "unemployment": {
    "duration_months": 0,
    "eligible": false,
    "monthly_amount_est": 0
  },
  "warning_details": [
    {
      "text": "参保地医保退休最低缴费年限参数未配置（国家框架由社会保险法第27条授权统筹地区规定），需人工确认后补充地区参数。",
      "warning_id": "W-MI-LOCAL-YEARS-MISSING"
    },
    {
      "text": "关键信息不完整或存在互斥冲突，建议进入 Agent 追问/细化模式后再生成完整方案。",
      "warning_id": "W-NEEDS-AGENT"
    }
  ],
  "warnings": [
    "W-MI-LOCAL-YEARS-MISSING",
    "W-NEEDS-AGENT"
  ]
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.needs_agent` | eq | `true` |
| `calc.retirement.legal_retire_age_years` | eq | `61` |

**政策依据**

1. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：annex / 附件1-3 延迟法定退休年龄对照表
   - 原文摘录：附件：1.男职工延迟法定退休年龄对照表 2.原法定退休年龄五十五周岁的女职工延迟法定退休年龄对照表 3.原法定退休年龄五十周岁的女职工延迟法定退休年龄对照表
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
2. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第三条
   - 原文摘录：职工达到最低缴费年限，可以自愿选择弹性提前退休，提前时间最长不超过三年，且退休年龄不得低于女职工五十周岁、五十五周岁及男职工六十周岁的原法定退休年龄。职工达到法定退休年龄，所在单位与职工协商一致的，可以弹性延迟退休，延迟时间最长不超过三年。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
3. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第一条
   - 原文摘录：从2025年1月1日起，男职工和原法定退休年龄为五十五周岁的女职工，法定退休年龄每四个月延迟一个月，分别逐步延迟至六十三周岁和五十八周岁；原法定退休年龄为五十周岁的女职工，法定退休年龄每二个月延迟一个月，逐步延迟至五十五周岁。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
4. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第二十七条
   - 原文摘录：参加职工基本医疗保险的个人，达到法定退休年龄时累计缴费达到国家规定年限的，退休后不再缴纳基本医疗保险费，按照国家规定享受基本医疗保险待遇；未达到国家规定年限的，可以缴费至国家规定年限。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
5. 政策标题：《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》
   - 文档ID：`DOC-GD-MEDICAL-TRANSFER-2022`
   - 发布机关：广东省医疗保障局等三部门
   - 官方URL：<https://hsa.gd.gov.cn/zwgk/zfxxgkml/bmwj/gfxwj/content/post_3953355.html>
   - 条款定位：article / 第八条
   - 原文摘录：职工医保参保人员达到法定退休年龄，缴费年限同时符合下列条件的，退休后不再缴纳职工医保费，按照规定享受职工医保待遇：（一）参加职工医保的累计缴费年限符合退休后待遇享受地规定的职工医保累计缴费年限要求。（二）在退休后待遇享受地参加职工医保实际缴费年限累计满10年。
   - 原件SHA-256：`18b4c198fbc46bec9034584c579137725a2021ae7797fe2d5b51f3014e1076a2`

### 26. 广东医保案例：1975年生男性·灵活就业（省级统一口径）

- UID：`RPC-440000-GD-male-1970_1979-flexible-MI-2030-V2`（回归测试UID：`RPCT-440000-GD-male-1970_1979-flexible-MI-2030-V2`）
- 地区：广东（440000）
- 能力：医保（`mi-2030`）
- as-of日期：2030-01-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`9ce254ca-7443-4cf5-a764-acd715152a36`
- snapshot hash：`d3952809bfd9189f95220ebde1622a59a0d7e5ced4d3e55203f192a99c9771ee`
- 案例content hash：`b8406562b035e4ba73a51fd0a73d8f026fb6e589fa8bc9a5d7105d424c8486bd`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：确定性结论
- category：医保；topics：社保规划、广东、医保、合成政策案例
- tags：`广东` `440000` `male` `1970_1979` `flexible` `灵活就业` `capability:mi-2030` `险种:养老` `险种:医保`

**合成人物画像**

- 地区：广东
- 性别与出生：男性，1975年5月15日出生
- 就业状态：灵活就业
- 社保累计缴费：养老保险180个月，职工医保120个月
- 灵活就业月缴费基数（本人选择）：6000元
- 职工医保衔接：上次缴费结束2029-12-31，本次参保2030-01-01

**咨询问题**

> 我是1975年5月出生的男性，在广东参保，职工医保累计缴了120个月。按2030-01-01起执行的省级统一口径，退休时医保需要累计缴多少个月、我还差多少？

**规则引擎结论（公开回答）**

```text
【结论摘要】
按广东省自2030-01-01起执行的省级统一口径，男性退休时享受职工医保待遇所需累计缴费360个月；当前累计120个月，缺口240个月；法定退休年龄62岁。

【关键测算结果】
- 退休所需累计缴费（省级统一口径）：360个月
- 当前累计缴费（输入）：120个月
- 年限缺口：240个月
- 法定退休年龄：62岁

【使用的个人条件】
- 地区：广东
- 性别与出生：男性，1975年5月15日出生
- 就业状态：灵活就业
- 社保累计缴费：养老保险180个月，职工医保120个月
- 灵活就业月缴费基数（本人选择）：6000元
- 职工医保衔接：上次缴费结束2029-12-31，本次参保2030-01-01

【政策依据】
- 《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》（全国人民代表大会常务委员会）— 定位：annex/附件1-3 延迟法定退休年龄对照表；article/国务院办法第三条；article/国务院办法第一条
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第二十七条
- 《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》（广东省医疗保障局等三部门）— 定位：article/第八条；article/第六条

【缺失或需确认事项】
- 无。本案例输入完整，结论为确定性计算结果。

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2030-01-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1975-05-15",
    "birth_day": 15,
    "birth_month": 5,
    "birth_year": 1975,
    "gender": "male"
  },
  "mi": {
    "enroll_date": "2030-01-01",
    "prev_end_date": "2029-12-31"
  },
  "social": {
    "flex_contrib_base": 6000,
    "medical_contrib_months": 120,
    "pension_contrib_months": 180
  },
  "status": {
    "employment_status": "flexible"
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "direct",
  "mi": {
    "gap_months": 1,
    "lifetime_gap_months": 240,
    "lifetime_required_months": 360,
    "paid_by_unemployment_fund": false
  },
  "needs_agent": false,
  "pension": {
    "gap_months": 54,
    "gap_years_ceil": 5,
    "min_years_required": 19.5
  },
  "retirement": {
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 8,
    "legal_retire_age_years": 62,
    "legal_retire_date": "2038-01-15",
    "legal_retire_month": 1,
    "legal_retire_year": 2038,
    "months_to_legal_retire": 96,
    "original_retire_age_years": 60
  },
  "unemployment": {
    "duration_months": 0,
    "eligible": false,
    "monthly_amount_est": 0
  },
  "warning_details": [],
  "warnings": []
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.mi.lifetime_required_months` | eq | `360` |
| `calc.mi.lifetime_gap_months` | eq | `240` |
| `calc.retirement.legal_retire_age_years` | eq | `62` |

**政策依据**

1. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：annex / 附件1-3 延迟法定退休年龄对照表
   - 原文摘录：附件：1.男职工延迟法定退休年龄对照表 2.原法定退休年龄五十五周岁的女职工延迟法定退休年龄对照表 3.原法定退休年龄五十周岁的女职工延迟法定退休年龄对照表
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
2. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第三条
   - 原文摘录：职工达到最低缴费年限，可以自愿选择弹性提前退休，提前时间最长不超过三年，且退休年龄不得低于女职工五十周岁、五十五周岁及男职工六十周岁的原法定退休年龄。职工达到法定退休年龄，所在单位与职工协商一致的，可以弹性延迟退休，延迟时间最长不超过三年。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
3. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第一条
   - 原文摘录：从2025年1月1日起，男职工和原法定退休年龄为五十五周岁的女职工，法定退休年龄每四个月延迟一个月，分别逐步延迟至六十三周岁和五十八周岁；原法定退休年龄为五十周岁的女职工，法定退休年龄每二个月延迟一个月，逐步延迟至五十五周岁。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
4. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第二十七条
   - 原文摘录：参加职工基本医疗保险的个人，达到法定退休年龄时累计缴费达到国家规定年限的，退休后不再缴纳基本医疗保险费，按照国家规定享受基本医疗保险待遇；未达到国家规定年限的，可以缴费至国家规定年限。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
5. 政策标题：《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》
   - 文档ID：`DOC-GD-MEDICAL-TRANSFER-2022`
   - 发布机关：广东省医疗保障局等三部门
   - 官方URL：<https://hsa.gd.gov.cn/zwgk/zfxxgkml/bmwj/gfxwj/content/post_3953355.html>
   - 条款定位：article / 第八条
   - 原文摘录：职工医保参保人员达到法定退休年龄，缴费年限同时符合下列条件的，退休后不再缴纳职工医保费，按照规定享受职工医保待遇：（一）参加职工医保的累计缴费年限符合退休后待遇享受地规定的职工医保累计缴费年限要求。（二）在退休后待遇享受地参加职工医保实际缴费年限累计满10年。
   - 原件SHA-256：`18b4c198fbc46bec9034584c579137725a2021ae7797fe2d5b51f3014e1076a2`
6. 政策标题：《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》
   - 文档ID：`DOC-GD-MEDICAL-TRANSFER-2022`
   - 发布机关：广东省医疗保障局等三部门
   - 官方URL：<https://hsa.gd.gov.cn/zwgk/zfxxgkml/bmwj/gfxwj/content/post_3953355.html>
   - 条款定位：article / 第六条
   - 原文摘录：逐步统一全省职工医保缴费年限政策。累计缴费年限到2030年1月1日统一为男职工30年，女职工25年。未达前款规定的市，从2022年开始，在本市2021年缴费年限政策的基础上，逐年调整本市职工医保累计缴费年限。
   - 原件SHA-256：`18b4c198fbc46bec9034584c579137725a2021ae7797fe2d5b51f3014e1076a2`

### 27. 广东缴费基数案例：1979年生男性·失业（缴费基数边界）

- UID：`RPC-440000-GD-male-1970_1979-unemployed-BASE-BOUNDARY-V2`（回归测试UID：`RPCT-440000-GD-male-1970_1979-unemployed-BASE-BOUNDARY-V2`）
- 地区：广东（440000）
- 能力：缴费基数（`base-boundary`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`e9b7227f-69a1-413b-b607-ebaba2db38ea`
- snapshot hash：`3e20302d6df76232f6ceba8c5b197244bac289a6b02a4a0bfc1e7b03959f4e5e`
- 案例content hash：`4fff2fd9ed326de672436bf662440569cf207c6a74155986096832efb6e7c56b`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：需人工补充确认（needs_agent）
- category：缴费基数；topics：社保规划、广东、缴费基数、合成政策案例
- tags：`广东` `440000` `male` `1970_1979` `unemployed` `失业` `capability:base-boundary` `险种:养老` `险种:医保` `险种:失业` `needs-agent`

**合成人物画像**

- 地区：广东
- 性别与出生：男性，1979年9月20日出生
- 就业状态：失业，正在领取失业保险金
- 社保累计缴费：养老保险180个月，职工医保120个月
- 失业保险累计缴费：3年；本段已领取：2个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01

**咨询问题**

> 我是1979年9月出生的男性，在广东灵活就业，想按未估算（需补充信息）元/月的基数参保，这个基数可以吗、每月要交多少？

**规则引擎结论（公开回答）**

```text
【结论摘要】
本人选择的灵活就业缴费基数为未估算（需补充信息）元/月；当前规则引擎未配置广东灵活就业月缴费金额规则，不计算具体缴费金额，缴费基数是否落在参保地市下限与省上限之间请以政策依据为准；同时参保地市医保退休年限参数缺失，需补充确认；法定退休年龄63岁可确定。

【关键测算结果】
- 本人选择的缴费基数（输入）：未估算（需补充信息）元/月
- 灵活就业月缴费金额：未估算（需补充信息）（广东无专属缴费规则）
- 法定退休年龄：63岁

【使用的个人条件】
- 地区：广东
- 性别与出生：男性，1979年9月20日出生
- 就业状态：失业，正在领取失业保险金
- 社保累计缴费：养老保险180个月，职工医保120个月
- 失业保险累计缴费：3年；本段已领取：2个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01

【政策依据】
- 《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》（全国人民代表大会常务委员会）— 定位：annex/附件1-3 延迟法定退休年龄对照表；article/国务院办法第三条；article/国务院办法第一条
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第二十七条
- 《关于公布2025年职工基本养老保险缴费基数上下限和基本养老金计发基数有关问题的通知（粤人社发〔2025〕32号）》（广东省人力资源和社会保障厅）— 定位：body/正文第一条

【缺失或需确认事项】
- 需补充字段 user.profile.claim_city：请确认失业保险金领取地市（用于按领取地市最低工资标准核算失业金金额）。
- 规则提示（需确认）：参保地医保退休最低缴费年限参数未配置（国家框架由社会保险法第27条授权统筹地区规定），需人工确认后补充地区参数。（W-MI-LOCAL-YEARS-MISSING）
- 规则提示（需确认）：失业金期间，医保通常由失业保险基金代缴（以经办口径为准）。规划现金流时请不要重复计算医保个人缴费。（W-UI-MI-PAID）

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1979-09-20",
    "birth_day": 20,
    "birth_month": 9,
    "birth_year": 1979,
    "gender": "male"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "medical_contrib_months": 120,
    "pension_contrib_months": 180,
    "ui_claimed_months": 2,
    "unemployment_insurance_years": 3
  },
  "status": {
    "employment_status": "unemployed",
    "on_unemployment_benefit": true
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [
    {
      "field": "user.profile.claim_city",
      "question_id": "Q-UI-CLAIM-CITY",
      "text": "请确认失业保险金领取地市（用于按领取地市最低工资标准核算失业金金额）。"
    }
  ],
  "conclusion_level": "needs_agent",
  "mi": {
    "gap_months": 1,
    "paid_by_unemployment_fund": true
  },
  "needs_agent": true,
  "pension": {
    "gap_months": 60,
    "gap_years_ceil": 5,
    "min_years_required": 20
  },
  "retirement": {
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 0,
    "legal_retire_age_years": 63,
    "legal_retire_date": "2042-09-20",
    "legal_retire_month": 9,
    "legal_retire_year": 2042,
    "months_to_legal_retire": 192,
    "original_retire_age_years": 60
  },
  "unemployment": {
    "duration_months": 12,
    "duration_months_raw": 12,
    "eligible": true
  },
  "warning_details": [
    {
      "text": "参保地医保退休最低缴费年限参数未配置（国家框架由社会保险法第27条授权统筹地区规定），需人工确认后补充地区参数。",
      "warning_id": "W-MI-LOCAL-YEARS-MISSING"
    },
    {
      "text": "失业金期间，医保通常由失业保险基金代缴（以经办口径为准）。规划现金流时请不要重复计算医保个人缴费。",
      "warning_id": "W-UI-MI-PAID"
    },
    {
      "text": "关键信息不完整或存在互斥冲突，建议进入 Agent 追问/细化模式后再生成完整方案。",
      "warning_id": "W-NEEDS-AGENT"
    }
  ],
  "warnings": [
    "W-MI-LOCAL-YEARS-MISSING",
    "W-UI-MI-PAID",
    "W-NEEDS-AGENT"
  ]
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.needs_agent` | eq | `true` |
| `calc.retirement.legal_retire_age_years` | eq | `63` |

**政策依据**

1. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：annex / 附件1-3 延迟法定退休年龄对照表
   - 原文摘录：附件：1.男职工延迟法定退休年龄对照表 2.原法定退休年龄五十五周岁的女职工延迟法定退休年龄对照表 3.原法定退休年龄五十周岁的女职工延迟法定退休年龄对照表
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
2. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第三条
   - 原文摘录：职工达到最低缴费年限，可以自愿选择弹性提前退休，提前时间最长不超过三年，且退休年龄不得低于女职工五十周岁、五十五周岁及男职工六十周岁的原法定退休年龄。职工达到法定退休年龄，所在单位与职工协商一致的，可以弹性延迟退休，延迟时间最长不超过三年。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
3. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第一条
   - 原文摘录：从2025年1月1日起，男职工和原法定退休年龄为五十五周岁的女职工，法定退休年龄每四个月延迟一个月，分别逐步延迟至六十三周岁和五十八周岁；原法定退休年龄为五十周岁的女职工，法定退休年龄每二个月延迟一个月，逐步延迟至五十五周岁。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
4. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第二十七条
   - 原文摘录：参加职工基本医疗保险的个人，达到法定退休年龄时累计缴费达到国家规定年限的，退休后不再缴纳基本医疗保险费，按照国家规定享受基本医疗保险待遇；未达到国家规定年限的，可以缴费至国家规定年限。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
5. 政策标题：《关于公布2025年职工基本养老保险缴费基数上下限和基本养老金计发基数有关问题的通知（粤人社发〔2025〕32号）》
   - 文档ID：`DOC-GD-CONTRIBUTION-BASE-2025`
   - 发布机关：广东省人力资源和社会保障厅
   - 官方URL：<https://hrss.gd.gov.cn/zwgk/gsgg/content/post_4789648.html>
   - 条款定位：body / 正文第一条
   - 原文摘录：自2025年7月1日起，全省企业职工基本养老保险缴费基数上限调整为27549元，广州市、省直缴费基数下限调整为5510元，其他地区缴费基数下限调整为4775元。
   - 原件SHA-256：`ca70f1155ba94cf09e6217fd85694a6adc8f03546ae8eb2038e6aa9c068b5aa5`

### 28. 广东医保案例：1984年生男性·灵活就业（地市年限缺参）

- UID：`RPC-440000-GD-male-from_1980-flexible-MI-2026-MISSING-V2`（回归测试UID：`RPCT-440000-GD-male-from_1980-flexible-MI-2026-MISSING-V2`）
- 地区：广东（440000）
- 能力：医保（`mi-2026-missing`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`e9b7227f-69a1-413b-b607-ebaba2db38ea`
- snapshot hash：`3e20302d6df76232f6ceba8c5b197244bac289a6b02a4a0bfc1e7b03959f4e5e`
- 案例content hash：`63d5d898c6009f3cc28a4bc2f59feadf5af993e7000cc15bfa5ed5b6a83a1f29`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：需人工补充确认（needs_agent）
- category：医保；topics：社保规划、广东、医保、合成政策案例
- tags：`广东` `440000` `male` `from_1980` `flexible` `灵活就业` `capability:mi-2026-missing` `险种:养老` `险种:医保` `needs-agent`

**合成人物画像**

- 地区：广东
- 性别与出生：男性，1984年5月15日出生
- 就业状态：灵活就业
- 社保累计缴费：养老保险180个月，职工医保120个月
- 灵活就业月缴费基数（本人选择）：6000元
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01

**咨询问题**

> 我是1984年5月出生的男性，在广东参保，职工医保累计缴了120个月，现在能确定退休时需要缴满多少年吗？

**规则引擎结论（公开回答）**

```text
【结论摘要】
当前计算时点省级统一医保退休年限尚未生效，参保地市执行年限参数缺失，规则引擎不给出退休医保年限结论（需补充参保地市口径确认）；法定退休年龄63岁可确定。

【关键测算结果】
- 退休医保所需年限：未估算（需补充信息）（地市年限参数缺失）
- 当前累计缴费（输入）：120个月
- 法定退休年龄：63岁

【使用的个人条件】
- 地区：广东
- 性别与出生：男性，1984年5月15日出生
- 就业状态：灵活就业
- 社保累计缴费：养老保险180个月，职工医保120个月
- 灵活就业月缴费基数（本人选择）：6000元
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01

【政策依据】
- 《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》（全国人民代表大会常务委员会）— 定位：annex/附件1-3 延迟法定退休年龄对照表；article/国务院办法第三条；article/国务院办法第一条
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第二十七条
- 《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》（广东省医疗保障局等三部门）— 定位：article/第八条

【缺失或需确认事项】
- 规则引擎标记需人工确认，但未生成具体追问。
- 规则提示（需确认）：参保地医保退休最低缴费年限参数未配置（国家框架由社会保险法第27条授权统筹地区规定），需人工确认后补充地区参数。（W-MI-LOCAL-YEARS-MISSING）

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1984-05-15",
    "birth_day": 15,
    "birth_month": 5,
    "birth_year": 1984,
    "gender": "male"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "flex_contrib_base": 6000,
    "medical_contrib_months": 120,
    "pension_contrib_months": 180
  },
  "status": {
    "employment_status": "flexible"
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "needs_agent",
  "mi": {
    "gap_months": 1,
    "paid_by_unemployment_fund": false
  },
  "needs_agent": true,
  "pension": {
    "gap_months": 60,
    "gap_years_ceil": 5,
    "min_years_required": 20
  },
  "retirement": {
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 0,
    "legal_retire_age_years": 63,
    "legal_retire_date": "2047-05-15",
    "legal_retire_month": 5,
    "legal_retire_year": 2047,
    "months_to_legal_retire": 248,
    "original_retire_age_years": 60
  },
  "unemployment": {
    "duration_months": 0,
    "eligible": false,
    "monthly_amount_est": 0
  },
  "warning_details": [
    {
      "text": "参保地医保退休最低缴费年限参数未配置（国家框架由社会保险法第27条授权统筹地区规定），需人工确认后补充地区参数。",
      "warning_id": "W-MI-LOCAL-YEARS-MISSING"
    },
    {
      "text": "关键信息不完整或存在互斥冲突，建议进入 Agent 追问/细化模式后再生成完整方案。",
      "warning_id": "W-NEEDS-AGENT"
    }
  ],
  "warnings": [
    "W-MI-LOCAL-YEARS-MISSING",
    "W-NEEDS-AGENT"
  ]
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.needs_agent` | eq | `true` |
| `calc.retirement.legal_retire_age_years` | eq | `63` |

**政策依据**

1. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：annex / 附件1-3 延迟法定退休年龄对照表
   - 原文摘录：附件：1.男职工延迟法定退休年龄对照表 2.原法定退休年龄五十五周岁的女职工延迟法定退休年龄对照表 3.原法定退休年龄五十周岁的女职工延迟法定退休年龄对照表
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
2. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第三条
   - 原文摘录：职工达到最低缴费年限，可以自愿选择弹性提前退休，提前时间最长不超过三年，且退休年龄不得低于女职工五十周岁、五十五周岁及男职工六十周岁的原法定退休年龄。职工达到法定退休年龄，所在单位与职工协商一致的，可以弹性延迟退休，延迟时间最长不超过三年。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
3. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第一条
   - 原文摘录：从2025年1月1日起，男职工和原法定退休年龄为五十五周岁的女职工，法定退休年龄每四个月延迟一个月，分别逐步延迟至六十三周岁和五十八周岁；原法定退休年龄为五十周岁的女职工，法定退休年龄每二个月延迟一个月，逐步延迟至五十五周岁。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
4. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第二十七条
   - 原文摘录：参加职工基本医疗保险的个人，达到法定退休年龄时累计缴费达到国家规定年限的，退休后不再缴纳基本医疗保险费，按照国家规定享受基本医疗保险待遇；未达到国家规定年限的，可以缴费至国家规定年限。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
5. 政策标题：《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》
   - 文档ID：`DOC-GD-MEDICAL-TRANSFER-2022`
   - 发布机关：广东省医疗保障局等三部门
   - 官方URL：<https://hsa.gd.gov.cn/zwgk/zfxxgkml/bmwj/gfxwj/content/post_3953355.html>
   - 条款定位：article / 第八条
   - 原文摘录：职工医保参保人员达到法定退休年龄，缴费年限同时符合下列条件的，退休后不再缴纳职工医保费，按照规定享受职工医保待遇：（一）参加职工医保的累计缴费年限符合退休后待遇享受地规定的职工医保累计缴费年限要求。（二）在退休后待遇享受地参加职工医保实际缴费年限累计满10年。
   - 原件SHA-256：`18b4c198fbc46bec9034584c579137725a2021ae7797fe2d5b51f3014e1076a2`

### 29. 广东医保案例：1988年生男性·失业（省级统一口径）

- UID：`RPC-440000-GD-male-from_1980-unemployed-MI-2030-V2`（回归测试UID：`RPCT-440000-GD-male-from_1980-unemployed-MI-2030-V2`）
- 地区：广东（440000）
- 能力：医保（`mi-2030`）
- as-of日期：2030-01-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`9ce254ca-7443-4cf5-a764-acd715152a36`
- snapshot hash：`d3952809bfd9189f95220ebde1622a59a0d7e5ced4d3e55203f192a99c9771ee`
- 案例content hash：`d2ba9303cbfc848759212c3a21c87dba2c84524306cef0df3358bfb3001359bd`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：需人工补充确认（needs_agent）
- category：医保；topics：社保规划、广东、医保、合成政策案例
- tags：`广东` `440000` `male` `from_1980` `unemployed` `失业` `capability:mi-2030` `险种:养老` `险种:医保` `险种:失业`

**合成人物画像**

- 地区：广东
- 性别与出生：男性，1988年9月20日出生
- 就业状态：失业，正在领取失业保险金
- 社保累计缴费：养老保险180个月，职工医保120个月
- 失业保险累计缴费：3年；本段已领取：2个月
- 职工医保衔接：上次缴费结束2029-12-31，本次参保2030-01-01

**咨询问题**

> 我是1988年9月出生的男性，在广东参保，职工医保累计缴了120个月。按2030-01-01起执行的省级统一口径，退休时医保需要累计缴多少个月、我还差多少？

**规则引擎结论（公开回答）**

```text
【结论摘要】
按广东省自2030-01-01起执行的省级统一口径，男性退休时享受职工医保待遇所需累计缴费360个月；当前累计120个月，缺口240个月；法定退休年龄63岁。

【关键测算结果】
- 退休所需累计缴费（省级统一口径）：360个月
- 当前累计缴费（输入）：120个月
- 年限缺口：240个月
- 法定退休年龄：63岁

【使用的个人条件】
- 地区：广东
- 性别与出生：男性，1988年9月20日出生
- 就业状态：失业，正在领取失业保险金
- 社保累计缴费：养老保险180个月，职工医保120个月
- 失业保险累计缴费：3年；本段已领取：2个月
- 职工医保衔接：上次缴费结束2029-12-31，本次参保2030-01-01

【政策依据】
- 《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》（全国人民代表大会常务委员会）— 定位：annex/附件1-3 延迟法定退休年龄对照表；article/国务院办法第三条；article/国务院办法第一条
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第二十七条
- 《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》（广东省医疗保障局等三部门）— 定位：article/第八条；article/第六条

【缺失或需确认事项】
- 需补充字段 user.profile.claim_city：请确认失业保险金领取地市（用于按领取地市最低工资标准核算失业金金额）。
- 规则提示（需确认）：失业金期间，医保通常由失业保险基金代缴（以经办口径为准）。规划现金流时请不要重复计算医保个人缴费。（W-UI-MI-PAID）

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2030-01-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1988-09-20",
    "birth_day": 20,
    "birth_month": 9,
    "birth_year": 1988,
    "gender": "male"
  },
  "mi": {
    "enroll_date": "2030-01-01",
    "prev_end_date": "2029-12-31"
  },
  "social": {
    "medical_contrib_months": 120,
    "pension_contrib_months": 180,
    "ui_claimed_months": 2,
    "unemployment_insurance_years": 3
  },
  "status": {
    "employment_status": "unemployed",
    "on_unemployment_benefit": true
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [
    {
      "field": "user.profile.claim_city",
      "question_id": "Q-UI-CLAIM-CITY",
      "text": "请确认失业保险金领取地市（用于按领取地市最低工资标准核算失业金金额）。"
    }
  ],
  "conclusion_level": "needs_agent",
  "mi": {
    "gap_months": 1,
    "lifetime_gap_months": 240,
    "lifetime_required_months": 360,
    "paid_by_unemployment_fund": true
  },
  "needs_agent": true,
  "pension": {
    "gap_months": 60,
    "gap_years_ceil": 5,
    "min_years_required": 20
  },
  "retirement": {
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 0,
    "legal_retire_age_years": 63,
    "legal_retire_date": "2051-09-20",
    "legal_retire_month": 9,
    "legal_retire_year": 2051,
    "months_to_legal_retire": 260,
    "original_retire_age_years": 60
  },
  "unemployment": {
    "duration_months": 12,
    "duration_months_raw": 12,
    "eligible": true
  },
  "warning_details": [
    {
      "text": "失业金期间，医保通常由失业保险基金代缴（以经办口径为准）。规划现金流时请不要重复计算医保个人缴费。",
      "warning_id": "W-UI-MI-PAID"
    },
    {
      "text": "关键信息不完整或存在互斥冲突，建议进入 Agent 追问/细化模式后再生成完整方案。",
      "warning_id": "W-NEEDS-AGENT"
    }
  ],
  "warnings": [
    "W-UI-MI-PAID",
    "W-NEEDS-AGENT"
  ]
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.mi.lifetime_required_months` | eq | `360` |
| `calc.mi.lifetime_gap_months` | eq | `240` |
| `calc.retirement.legal_retire_age_years` | eq | `63` |

**政策依据**

1. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：annex / 附件1-3 延迟法定退休年龄对照表
   - 原文摘录：附件：1.男职工延迟法定退休年龄对照表 2.原法定退休年龄五十五周岁的女职工延迟法定退休年龄对照表 3.原法定退休年龄五十周岁的女职工延迟法定退休年龄对照表
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
2. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第三条
   - 原文摘录：职工达到最低缴费年限，可以自愿选择弹性提前退休，提前时间最长不超过三年，且退休年龄不得低于女职工五十周岁、五十五周岁及男职工六十周岁的原法定退休年龄。职工达到法定退休年龄，所在单位与职工协商一致的，可以弹性延迟退休，延迟时间最长不超过三年。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
3. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第一条
   - 原文摘录：从2025年1月1日起，男职工和原法定退休年龄为五十五周岁的女职工，法定退休年龄每四个月延迟一个月，分别逐步延迟至六十三周岁和五十八周岁；原法定退休年龄为五十周岁的女职工，法定退休年龄每二个月延迟一个月，逐步延迟至五十五周岁。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
4. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第二十七条
   - 原文摘录：参加职工基本医疗保险的个人，达到法定退休年龄时累计缴费达到国家规定年限的，退休后不再缴纳基本医疗保险费，按照国家规定享受基本医疗保险待遇；未达到国家规定年限的，可以缴费至国家规定年限。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
5. 政策标题：《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》
   - 文档ID：`DOC-GD-MEDICAL-TRANSFER-2022`
   - 发布机关：广东省医疗保障局等三部门
   - 官方URL：<https://hsa.gd.gov.cn/zwgk/zfxxgkml/bmwj/gfxwj/content/post_3953355.html>
   - 条款定位：article / 第八条
   - 原文摘录：职工医保参保人员达到法定退休年龄，缴费年限同时符合下列条件的，退休后不再缴纳职工医保费，按照规定享受职工医保待遇：（一）参加职工医保的累计缴费年限符合退休后待遇享受地规定的职工医保累计缴费年限要求。（二）在退休后待遇享受地参加职工医保实际缴费年限累计满10年。
   - 原件SHA-256：`18b4c198fbc46bec9034584c579137725a2021ae7797fe2d5b51f3014e1076a2`
6. 政策标题：《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》
   - 文档ID：`DOC-GD-MEDICAL-TRANSFER-2022`
   - 发布机关：广东省医疗保障局等三部门
   - 官方URL：<https://hsa.gd.gov.cn/zwgk/zfxxgkml/bmwj/gfxwj/content/post_3953355.html>
   - 条款定位：article / 第六条
   - 原文摘录：逐步统一全省职工医保缴费年限政策。累计缴费年限到2030年1月1日统一为男职工30年，女职工25年。未达前款规定的市，从2022年开始，在本市2021年缴费年限政策的基础上，逐年调整本市职工医保累计缴费年限。
   - 原件SHA-256：`18b4c198fbc46bec9034584c579137725a2021ae7797fe2d5b51f3014e1076a2`

### 30. 广东缴费基数案例：1963年生女性·在职（单位参保）（缴费基数边界）

- UID：`RPC-440000-GD-female-before_1970-employed-BASE-BOUNDARY-V2`（回归测试UID：`RPCT-440000-GD-female-before_1970-employed-BASE-BOUNDARY-V2`）
- 地区：广东（440000）
- 能力：缴费基数（`base-boundary`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`e9b7227f-69a1-413b-b607-ebaba2db38ea`
- snapshot hash：`3e20302d6df76232f6ceba8c5b197244bac289a6b02a4a0bfc1e7b03959f4e5e`
- 案例content hash：`69f2e10e227a6f790e020ad8352bb619411fddb4933a4e2db09ca94e7311e793`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：需人工补充确认（needs_agent）
- category：缴费基数；topics：社保规划、广东、缴费基数、合成政策案例
- tags：`广东` `440000` `female` `before_1970` `employed` `capability:base-boundary` `险种:养老` `险种:医保` `needs-agent`

**合成人物画像**

- 地区：广东
- 性别与出生：女性（女干部口径），1963年3月11日出生
- 就业状态：在职（单位参保）
- 社保累计缴费：养老保险180个月，职工医保120个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01

**咨询问题**

> 我是1963年3月出生的女性（女干部口径），在广东灵活就业，想按未估算（需补充信息）元/月的基数参保，这个基数可以吗、每月要交多少？

**规则引擎结论（公开回答）**

```text
【结论摘要】
本人选择的灵活就业缴费基数为未估算（需补充信息）元/月；当前规则引擎未配置广东灵活就业月缴费金额规则，不计算具体缴费金额，缴费基数是否落在参保地市下限与省上限之间请以政策依据为准；同时参保地市医保退休年限参数缺失，需补充确认；法定退休年龄55岁可确定。

【关键测算结果】
- 本人选择的缴费基数（输入）：未估算（需补充信息）元/月
- 灵活就业月缴费金额：未估算（需补充信息）（广东无专属缴费规则）
- 法定退休年龄：55岁

【使用的个人条件】
- 地区：广东
- 性别与出生：女性（女干部口径），1963年3月11日出生
- 就业状态：在职（单位参保）
- 社保累计缴费：养老保险180个月，职工医保120个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01

【政策依据】
- 《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》（全国人民代表大会常务委员会）— 定位：annex/附件1-3 延迟法定退休年龄对照表；article/国务院办法第三条；article/国务院办法第一条
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第二十七条
- 《关于公布2025年职工基本养老保险缴费基数上下限和基本养老金计发基数有关问题的通知（粤人社发〔2025〕32号）》（广东省人力资源和社会保障厅）— 定位：body/正文第一条

【缺失或需确认事项】
- 规则引擎标记需人工确认，但未生成具体追问。
- 规则提示（需确认）：参保地医保退休最低缴费年限参数未配置（国家框架由社会保险法第27条授权统筹地区规定），需人工确认后补充地区参数。（W-MI-LOCAL-YEARS-MISSING）

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1963-03-11",
    "birth_day": 11,
    "birth_month": 3,
    "birth_year": 1963,
    "female_retire_type": "cadre55",
    "gender": "female"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "medical_contrib_months": 120,
    "pension_contrib_months": 180
  },
  "status": {
    "employment_status": "employed"
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "needs_agent",
  "mi": {
    "gap_months": 1,
    "paid_by_unemployment_fund": false
  },
  "needs_agent": true,
  "pension": {
    "gap_months": 0,
    "gap_years_ceil": 0,
    "min_years_required": 15
  },
  "retirement": {
    "female_retire_type_status": "confirmed",
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 0,
    "legal_retire_age_years": 55,
    "legal_retire_date": "2018-03-11",
    "legal_retire_month": 3,
    "legal_retire_year": 2018,
    "months_to_legal_retire": -102,
    "original_retire_age_years": 55
  },
  "unemployment": {
    "duration_months": 0,
    "eligible": false,
    "monthly_amount_est": 0
  },
  "warning_details": [
    {
      "text": "参保地医保退休最低缴费年限参数未配置（国家框架由社会保险法第27条授权统筹地区规定），需人工确认后补充地区参数。",
      "warning_id": "W-MI-LOCAL-YEARS-MISSING"
    },
    {
      "text": "关键信息不完整或存在互斥冲突，建议进入 Agent 追问/细化模式后再生成完整方案。",
      "warning_id": "W-NEEDS-AGENT"
    }
  ],
  "warnings": [
    "W-MI-LOCAL-YEARS-MISSING",
    "W-NEEDS-AGENT"
  ]
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.needs_agent` | eq | `true` |
| `calc.retirement.legal_retire_age_years` | eq | `55` |

**政策依据**

1. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：annex / 附件1-3 延迟法定退休年龄对照表
   - 原文摘录：附件：1.男职工延迟法定退休年龄对照表 2.原法定退休年龄五十五周岁的女职工延迟法定退休年龄对照表 3.原法定退休年龄五十周岁的女职工延迟法定退休年龄对照表
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
2. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第三条
   - 原文摘录：职工达到最低缴费年限，可以自愿选择弹性提前退休，提前时间最长不超过三年，且退休年龄不得低于女职工五十周岁、五十五周岁及男职工六十周岁的原法定退休年龄。职工达到法定退休年龄，所在单位与职工协商一致的，可以弹性延迟退休，延迟时间最长不超过三年。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
3. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第一条
   - 原文摘录：从2025年1月1日起，男职工和原法定退休年龄为五十五周岁的女职工，法定退休年龄每四个月延迟一个月，分别逐步延迟至六十三周岁和五十八周岁；原法定退休年龄为五十周岁的女职工，法定退休年龄每二个月延迟一个月，逐步延迟至五十五周岁。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
4. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第二十七条
   - 原文摘录：参加职工基本医疗保险的个人，达到法定退休年龄时累计缴费达到国家规定年限的，退休后不再缴纳基本医疗保险费，按照国家规定享受基本医疗保险待遇；未达到国家规定年限的，可以缴费至国家规定年限。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
5. 政策标题：《关于公布2025年职工基本养老保险缴费基数上下限和基本养老金计发基数有关问题的通知（粤人社发〔2025〕32号）》
   - 文档ID：`DOC-GD-CONTRIBUTION-BASE-2025`
   - 发布机关：广东省人力资源和社会保障厅
   - 官方URL：<https://hrss.gd.gov.cn/zwgk/gsgg/content/post_4789648.html>
   - 条款定位：body / 正文第一条
   - 原文摘录：自2025年7月1日起，全省企业职工基本养老保险缴费基数上限调整为27549元，广州市、省直缴费基数下限调整为5510元，其他地区缴费基数下限调整为4775元。
   - 原件SHA-256：`ca70f1155ba94cf09e6217fd85694a6adc8f03546ae8eb2038e6aa9c068b5aa5`

### 31. 广东医保案例：1969年生女性·失业（地市年限缺参）

- UID：`RPC-440000-GD-female-before_1970-unemployed-MI-2026-MISSING-V2`（回归测试UID：`RPCT-440000-GD-female-before_1970-unemployed-MI-2026-MISSING-V2`）
- 地区：广东（440000）
- 能力：医保（`mi-2026-missing`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`e9b7227f-69a1-413b-b607-ebaba2db38ea`
- snapshot hash：`3e20302d6df76232f6ceba8c5b197244bac289a6b02a4a0bfc1e7b03959f4e5e`
- 案例content hash：`f9ab7e568838defa3652570681b803d0de907750b0e14623d49756e52fbdef67`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：需人工补充确认（needs_agent）
- category：医保；topics：社保规划、广东、医保、合成政策案例
- tags：`广东` `440000` `female` `before_1970` `unemployed` `失业` `capability:mi-2026-missing` `险种:养老` `险种:医保` `险种:失业` `needs-agent`

**合成人物画像**

- 地区：广东
- 性别与出生：女性（女工人口径），1969年11月21日出生
- 就业状态：失业，正在领取失业保险金
- 社保累计缴费：养老保险180个月，职工医保120个月
- 失业保险累计缴费：3年；本段已领取：2个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01

**咨询问题**

> 我是1969年11月出生的女性（女工人口径），在广东参保，职工医保累计缴了120个月，现在能确定退休时需要缴满多少年吗？

**规则引擎结论（公开回答）**

```text
【结论摘要】
当前计算时点省级统一医保退休年限尚未生效，参保地市执行年限参数缺失，规则引擎不给出退休医保年限结论（需补充参保地市口径确认）；法定退休年龄50岁可确定。

【关键测算结果】
- 退休医保所需年限：未估算（需补充信息）（地市年限参数缺失）
- 当前累计缴费（输入）：120个月
- 法定退休年龄：50岁

【使用的个人条件】
- 地区：广东
- 性别与出生：女性（女工人口径），1969年11月21日出生
- 就业状态：失业，正在领取失业保险金
- 社保累计缴费：养老保险180个月，职工医保120个月
- 失业保险累计缴费：3年；本段已领取：2个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01

【政策依据】
- 《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》（全国人民代表大会常务委员会）— 定位：annex/附件1-3 延迟法定退休年龄对照表；article/国务院办法第三条；article/国务院办法第一条
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第二十七条
- 《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》（广东省医疗保障局等三部门）— 定位：article/第八条

【缺失或需确认事项】
- 需补充字段 user.profile.claim_city：请确认失业保险金领取地市（用于按领取地市最低工资标准核算失业金金额）。
- 规则提示（需确认）：参保地医保退休最低缴费年限参数未配置（国家框架由社会保险法第27条授权统筹地区规定），需人工确认后补充地区参数。（W-MI-LOCAL-YEARS-MISSING）
- 规则提示（需确认）：失业金期间，医保通常由失业保险基金代缴（以经办口径为准）。规划现金流时请不要重复计算医保个人缴费。（W-UI-MI-PAID）

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1969-11-21",
    "birth_day": 21,
    "birth_month": 11,
    "birth_year": 1969,
    "female_retire_type": "worker50",
    "gender": "female"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "medical_contrib_months": 120,
    "pension_contrib_months": 180,
    "ui_claimed_months": 2,
    "unemployment_insurance_years": 3
  },
  "status": {
    "employment_status": "unemployed",
    "on_unemployment_benefit": true
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [
    {
      "field": "user.profile.claim_city",
      "question_id": "Q-UI-CLAIM-CITY",
      "text": "请确认失业保险金领取地市（用于按领取地市最低工资标准核算失业金金额）。"
    }
  ],
  "conclusion_level": "needs_agent",
  "mi": {
    "gap_months": 1,
    "paid_by_unemployment_fund": true
  },
  "needs_agent": true,
  "pension": {
    "gap_months": 0,
    "gap_years_ceil": 0,
    "min_years_required": 15
  },
  "retirement": {
    "female_retire_type_status": "confirmed",
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 0,
    "legal_retire_age_years": 50,
    "legal_retire_date": "2019-11-21",
    "legal_retire_month": 11,
    "legal_retire_year": 2019,
    "months_to_legal_retire": -82,
    "original_retire_age_years": 50
  },
  "unemployment": {
    "duration_months": 12,
    "duration_months_raw": 12,
    "eligible": true
  },
  "warning_details": [
    {
      "text": "参保地医保退休最低缴费年限参数未配置（国家框架由社会保险法第27条授权统筹地区规定），需人工确认后补充地区参数。",
      "warning_id": "W-MI-LOCAL-YEARS-MISSING"
    },
    {
      "text": "失业金期间，医保通常由失业保险基金代缴（以经办口径为准）。规划现金流时请不要重复计算医保个人缴费。",
      "warning_id": "W-UI-MI-PAID"
    },
    {
      "text": "关键信息不完整或存在互斥冲突，建议进入 Agent 追问/细化模式后再生成完整方案。",
      "warning_id": "W-NEEDS-AGENT"
    }
  ],
  "warnings": [
    "W-MI-LOCAL-YEARS-MISSING",
    "W-UI-MI-PAID",
    "W-NEEDS-AGENT"
  ]
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.needs_agent` | eq | `true` |
| `calc.retirement.legal_retire_age_years` | eq | `50` |

**政策依据**

1. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：annex / 附件1-3 延迟法定退休年龄对照表
   - 原文摘录：附件：1.男职工延迟法定退休年龄对照表 2.原法定退休年龄五十五周岁的女职工延迟法定退休年龄对照表 3.原法定退休年龄五十周岁的女职工延迟法定退休年龄对照表
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
2. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第三条
   - 原文摘录：职工达到最低缴费年限，可以自愿选择弹性提前退休，提前时间最长不超过三年，且退休年龄不得低于女职工五十周岁、五十五周岁及男职工六十周岁的原法定退休年龄。职工达到法定退休年龄，所在单位与职工协商一致的，可以弹性延迟退休，延迟时间最长不超过三年。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
3. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第一条
   - 原文摘录：从2025年1月1日起，男职工和原法定退休年龄为五十五周岁的女职工，法定退休年龄每四个月延迟一个月，分别逐步延迟至六十三周岁和五十八周岁；原法定退休年龄为五十周岁的女职工，法定退休年龄每二个月延迟一个月，逐步延迟至五十五周岁。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
4. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第二十七条
   - 原文摘录：参加职工基本医疗保险的个人，达到法定退休年龄时累计缴费达到国家规定年限的，退休后不再缴纳基本医疗保险费，按照国家规定享受基本医疗保险待遇；未达到国家规定年限的，可以缴费至国家规定年限。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
5. 政策标题：《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》
   - 文档ID：`DOC-GD-MEDICAL-TRANSFER-2022`
   - 发布机关：广东省医疗保障局等三部门
   - 官方URL：<https://hsa.gd.gov.cn/zwgk/zfxxgkml/bmwj/gfxwj/content/post_3953355.html>
   - 条款定位：article / 第八条
   - 原文摘录：职工医保参保人员达到法定退休年龄，缴费年限同时符合下列条件的，退休后不再缴纳职工医保费，按照规定享受职工医保待遇：（一）参加职工医保的累计缴费年限符合退休后待遇享受地规定的职工医保累计缴费年限要求。（二）在退休后待遇享受地参加职工医保实际缴费年限累计满10年。
   - 原件SHA-256：`18b4c198fbc46bec9034584c579137725a2021ae7797fe2d5b51f3014e1076a2`

### 32. 广东医保案例：1971年生女性·在职（单位参保）（省级统一口径）

- UID：`RPC-440000-GD-female-1970_1979-employed-MI-2030-V2`（回归测试UID：`RPCT-440000-GD-female-1970_1979-employed-MI-2030-V2`）
- 地区：广东（440000）
- 能力：医保（`mi-2030`）
- as-of日期：2030-01-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`9ce254ca-7443-4cf5-a764-acd715152a36`
- snapshot hash：`d3952809bfd9189f95220ebde1622a59a0d7e5ced4d3e55203f192a99c9771ee`
- 案例content hash：`8d06e6316425f9a8fae8334c185472c77f28606b752a51b4da23708ee1e1d340`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：确定性结论
- category：医保；topics：社保规划、广东、医保、合成政策案例
- tags：`广东` `440000` `female` `1970_1979` `employed` `capability:mi-2030` `险种:养老` `险种:医保`

**合成人物画像**

- 地区：广东
- 性别与出生：女性（女干部口径），1971年3月11日出生
- 就业状态：在职（单位参保）
- 社保累计缴费：养老保险180个月，职工医保120个月
- 职工医保衔接：上次缴费结束2029-12-31，本次参保2030-01-01

**咨询问题**

> 我是1971年3月出生的女性（女干部口径），在广东参保，职工医保累计缴了120个月。按2030-01-01起执行的省级统一口径，退休时医保需要累计缴多少个月、我还差多少？

**规则引擎结论（公开回答）**

```text
【结论摘要】
按广东省自2030-01-01起执行的省级统一口径，女性退休时享受职工医保待遇所需累计缴费300个月；当前累计120个月，缺口180个月；法定退休年龄55岁。

【关键测算结果】
- 退休所需累计缴费（省级统一口径）：300个月
- 当前累计缴费（输入）：120个月
- 年限缺口：180个月
- 法定退休年龄：55岁

【使用的个人条件】
- 地区：广东
- 性别与出生：女性（女干部口径），1971年3月11日出生
- 就业状态：在职（单位参保）
- 社保累计缴费：养老保险180个月，职工医保120个月
- 职工医保衔接：上次缴费结束2029-12-31，本次参保2030-01-01

【政策依据】
- 《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》（全国人民代表大会常务委员会）— 定位：annex/附件1-3 延迟法定退休年龄对照表；article/国务院办法第三条；article/国务院办法第一条
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第二十七条
- 《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》（广东省医疗保障局等三部门）— 定位：article/第八条；article/第六条

【缺失或需确认事项】
- 无。本案例输入完整，结论为确定性计算结果。

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2030-01-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1971-03-11",
    "birth_day": 11,
    "birth_month": 3,
    "birth_year": 1971,
    "female_retire_type": "cadre55",
    "gender": "female"
  },
  "mi": {
    "enroll_date": "2030-01-01",
    "prev_end_date": "2029-12-31"
  },
  "social": {
    "medical_contrib_months": 120,
    "pension_contrib_months": 180
  },
  "status": {
    "employment_status": "employed"
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "direct",
  "mi": {
    "gap_months": 1,
    "lifetime_gap_months": 180,
    "lifetime_required_months": 300,
    "paid_by_unemployment_fund": false
  },
  "needs_agent": false,
  "pension": {
    "gap_months": 0,
    "gap_years_ceil": 0,
    "min_years_required": 15
  },
  "retirement": {
    "female_retire_type_status": "confirmed",
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 4,
    "legal_retire_age_years": 55,
    "legal_retire_date": "2026-07-11",
    "legal_retire_month": 7,
    "legal_retire_year": 2026,
    "months_to_legal_retire": -42,
    "original_retire_age_years": 55
  },
  "unemployment": {
    "duration_months": 0,
    "eligible": false,
    "monthly_amount_est": 0
  },
  "warning_details": [],
  "warnings": []
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.mi.lifetime_required_months` | eq | `300` |
| `calc.mi.lifetime_gap_months` | eq | `180` |
| `calc.retirement.legal_retire_age_years` | eq | `55` |

**政策依据**

1. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：annex / 附件1-3 延迟法定退休年龄对照表
   - 原文摘录：附件：1.男职工延迟法定退休年龄对照表 2.原法定退休年龄五十五周岁的女职工延迟法定退休年龄对照表 3.原法定退休年龄五十周岁的女职工延迟法定退休年龄对照表
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
2. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第三条
   - 原文摘录：职工达到最低缴费年限，可以自愿选择弹性提前退休，提前时间最长不超过三年，且退休年龄不得低于女职工五十周岁、五十五周岁及男职工六十周岁的原法定退休年龄。职工达到法定退休年龄，所在单位与职工协商一致的，可以弹性延迟退休，延迟时间最长不超过三年。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
3. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第一条
   - 原文摘录：从2025年1月1日起，男职工和原法定退休年龄为五十五周岁的女职工，法定退休年龄每四个月延迟一个月，分别逐步延迟至六十三周岁和五十八周岁；原法定退休年龄为五十周岁的女职工，法定退休年龄每二个月延迟一个月，逐步延迟至五十五周岁。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
4. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第二十七条
   - 原文摘录：参加职工基本医疗保险的个人，达到法定退休年龄时累计缴费达到国家规定年限的，退休后不再缴纳基本医疗保险费，按照国家规定享受基本医疗保险待遇；未达到国家规定年限的，可以缴费至国家规定年限。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
5. 政策标题：《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》
   - 文档ID：`DOC-GD-MEDICAL-TRANSFER-2022`
   - 发布机关：广东省医疗保障局等三部门
   - 官方URL：<https://hsa.gd.gov.cn/zwgk/zfxxgkml/bmwj/gfxwj/content/post_3953355.html>
   - 条款定位：article / 第八条
   - 原文摘录：职工医保参保人员达到法定退休年龄，缴费年限同时符合下列条件的，退休后不再缴纳职工医保费，按照规定享受职工医保待遇：（一）参加职工医保的累计缴费年限符合退休后待遇享受地规定的职工医保累计缴费年限要求。（二）在退休后待遇享受地参加职工医保实际缴费年限累计满10年。
   - 原件SHA-256：`18b4c198fbc46bec9034584c579137725a2021ae7797fe2d5b51f3014e1076a2`
6. 政策标题：《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》
   - 文档ID：`DOC-GD-MEDICAL-TRANSFER-2022`
   - 发布机关：广东省医疗保障局等三部门
   - 官方URL：<https://hsa.gd.gov.cn/zwgk/zfxxgkml/bmwj/gfxwj/content/post_3953355.html>
   - 条款定位：article / 第六条
   - 原文摘录：逐步统一全省职工医保缴费年限政策。累计缴费年限到2030年1月1日统一为男职工30年，女职工25年。未达前款规定的市，从2022年开始，在本市2021年缴费年限政策的基础上，逐年调整本市职工医保累计缴费年限。
   - 原件SHA-256：`18b4c198fbc46bec9034584c579137725a2021ae7797fe2d5b51f3014e1076a2`

### 33. 广东缴费基数案例：1975年生女性·灵活就业（缴费基数边界）

- UID：`RPC-440000-GD-female-1970_1979-flexible-BASE-BOUNDARY-V2`（回归测试UID：`RPCT-440000-GD-female-1970_1979-flexible-BASE-BOUNDARY-V2`）
- 地区：广东（440000）
- 能力：缴费基数（`base-boundary`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`e9b7227f-69a1-413b-b607-ebaba2db38ea`
- snapshot hash：`3e20302d6df76232f6ceba8c5b197244bac289a6b02a4a0bfc1e7b03959f4e5e`
- 案例content hash：`9a52294eaaab0cda1a60290d91f636cafa5b8767142c8bd530d1f6cc4df4ca84`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：需人工补充确认（needs_agent）
- category：缴费基数；topics：社保规划、广东、缴费基数、合成政策案例
- tags：`广东` `440000` `female` `1970_1979` `flexible` `灵活就业` `capability:base-boundary` `险种:养老` `险种:医保` `needs-agent`

**合成人物画像**

- 地区：广东
- 性别与出生：女性（女工人口径），1975年7月16日出生
- 就业状态：灵活就业
- 社保累计缴费：养老保险180个月，职工医保120个月
- 灵活就业月缴费基数（本人选择）：4000元
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01

**咨询问题**

> 我是1975年7月出生的女性（女工人口径），在广东灵活就业，想按4000元/月的基数参保，这个基数可以吗、每月要交多少？

**规则引擎结论（公开回答）**

```text
【结论摘要】
本人选择的灵活就业缴费基数为4000元/月；当前规则引擎未配置广东灵活就业月缴费金额规则，不计算具体缴费金额，缴费基数是否落在参保地市下限与省上限之间请以政策依据为准；同时参保地市医保退休年限参数缺失，需补充确认；法定退休年龄50岁可确定。

【关键测算结果】
- 本人选择的缴费基数（输入）：4000元/月
- 灵活就业月缴费金额：未估算（需补充信息）（广东无专属缴费规则）
- 法定退休年龄：50岁

【使用的个人条件】
- 地区：广东
- 性别与出生：女性（女工人口径），1975年7月16日出生
- 就业状态：灵活就业
- 社保累计缴费：养老保险180个月，职工医保120个月
- 灵活就业月缴费基数（本人选择）：4000元
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01

【政策依据】
- 《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》（全国人民代表大会常务委员会）— 定位：annex/附件1-3 延迟法定退休年龄对照表；article/国务院办法第三条；article/国务院办法第一条
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第二十七条
- 《关于公布2025年职工基本养老保险缴费基数上下限和基本养老金计发基数有关问题的通知（粤人社发〔2025〕32号）》（广东省人力资源和社会保障厅）— 定位：body/正文第一条

【缺失或需确认事项】
- 规则引擎标记需人工确认，但未生成具体追问。
- 规则提示（需确认）：参保地医保退休最低缴费年限参数未配置（国家框架由社会保险法第27条授权统筹地区规定），需人工确认后补充地区参数。（W-MI-LOCAL-YEARS-MISSING）

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1975-07-16",
    "birth_day": 16,
    "birth_month": 7,
    "birth_year": 1975,
    "female_retire_type": "worker50",
    "gender": "female"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "flex_contrib_base": 4000,
    "medical_contrib_months": 120,
    "pension_contrib_months": 180
  },
  "status": {
    "employment_status": "flexible"
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "needs_agent",
  "mi": {
    "gap_months": 1,
    "paid_by_unemployment_fund": false
  },
  "needs_agent": true,
  "pension": {
    "gap_months": 0,
    "gap_years_ceil": 0,
    "min_years_required": 15
  },
  "retirement": {
    "female_retire_type_status": "confirmed",
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 4,
    "legal_retire_age_years": 50,
    "legal_retire_date": "2025-11-16",
    "legal_retire_month": 11,
    "legal_retire_year": 2025,
    "months_to_legal_retire": -10,
    "original_retire_age_years": 50
  },
  "unemployment": {
    "duration_months": 0,
    "eligible": false,
    "monthly_amount_est": 0
  },
  "warning_details": [
    {
      "text": "参保地医保退休最低缴费年限参数未配置（国家框架由社会保险法第27条授权统筹地区规定），需人工确认后补充地区参数。",
      "warning_id": "W-MI-LOCAL-YEARS-MISSING"
    },
    {
      "text": "关键信息不完整或存在互斥冲突，建议进入 Agent 追问/细化模式后再生成完整方案。",
      "warning_id": "W-NEEDS-AGENT"
    }
  ],
  "warnings": [
    "W-MI-LOCAL-YEARS-MISSING",
    "W-NEEDS-AGENT"
  ]
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.needs_agent` | eq | `true` |
| `calc.retirement.legal_retire_age_years` | eq | `50` |

**政策依据**

1. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：annex / 附件1-3 延迟法定退休年龄对照表
   - 原文摘录：附件：1.男职工延迟法定退休年龄对照表 2.原法定退休年龄五十五周岁的女职工延迟法定退休年龄对照表 3.原法定退休年龄五十周岁的女职工延迟法定退休年龄对照表
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
2. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第三条
   - 原文摘录：职工达到最低缴费年限，可以自愿选择弹性提前退休，提前时间最长不超过三年，且退休年龄不得低于女职工五十周岁、五十五周岁及男职工六十周岁的原法定退休年龄。职工达到法定退休年龄，所在单位与职工协商一致的，可以弹性延迟退休，延迟时间最长不超过三年。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
3. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第一条
   - 原文摘录：从2025年1月1日起，男职工和原法定退休年龄为五十五周岁的女职工，法定退休年龄每四个月延迟一个月，分别逐步延迟至六十三周岁和五十八周岁；原法定退休年龄为五十周岁的女职工，法定退休年龄每二个月延迟一个月，逐步延迟至五十五周岁。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
4. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第二十七条
   - 原文摘录：参加职工基本医疗保险的个人，达到法定退休年龄时累计缴费达到国家规定年限的，退休后不再缴纳基本医疗保险费，按照国家规定享受基本医疗保险待遇；未达到国家规定年限的，可以缴费至国家规定年限。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
5. 政策标题：《关于公布2025年职工基本养老保险缴费基数上下限和基本养老金计发基数有关问题的通知（粤人社发〔2025〕32号）》
   - 文档ID：`DOC-GD-CONTRIBUTION-BASE-2025`
   - 发布机关：广东省人力资源和社会保障厅
   - 官方URL：<https://hrss.gd.gov.cn/zwgk/gsgg/content/post_4789648.html>
   - 条款定位：body / 正文第一条
   - 原文摘录：自2025年7月1日起，全省企业职工基本养老保险缴费基数上限调整为27549元，广州市、省直缴费基数下限调整为5510元，其他地区缴费基数下限调整为4775元。
   - 原件SHA-256：`ca70f1155ba94cf09e6217fd85694a6adc8f03546ae8eb2038e6aa9c068b5aa5`

### 34. 广东医保案例：1980年生女性·在职（单位参保）（地市年限缺参）

- UID：`RPC-440000-GD-female-from_1980-employed-MI-2026-MISSING-V2`（回归测试UID：`RPCT-440000-GD-female-from_1980-employed-MI-2026-MISSING-V2`）
- 地区：广东（440000）
- 能力：医保（`mi-2026-missing`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`e9b7227f-69a1-413b-b607-ebaba2db38ea`
- snapshot hash：`3e20302d6df76232f6ceba8c5b197244bac289a6b02a4a0bfc1e7b03959f4e5e`
- 案例content hash：`89ee7ce4df261b566279b195cf0abbf510a20fc199d475b57c9fde819f69f8e7`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：需人工补充确认（needs_agent）
- category：医保；topics：社保规划、广东、医保、合成政策案例
- tags：`广东` `440000` `female` `from_1980` `employed` `capability:mi-2026-missing` `险种:养老` `险种:医保` `needs-agent`

**合成人物画像**

- 地区：广东
- 性别与出生：女性（女干部口径），1980年3月11日出生
- 就业状态：在职（单位参保）
- 社保累计缴费：养老保险180个月，职工医保120个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01

**咨询问题**

> 我是1980年3月出生的女性（女干部口径），在广东参保，职工医保累计缴了120个月，现在能确定退休时需要缴满多少年吗？

**规则引擎结论（公开回答）**

```text
【结论摘要】
当前计算时点省级统一医保退休年限尚未生效，参保地市执行年限参数缺失，规则引擎不给出退休医保年限结论（需补充参保地市口径确认）；法定退休年龄57岁可确定。

【关键测算结果】
- 退休医保所需年限：未估算（需补充信息）（地市年限参数缺失）
- 当前累计缴费（输入）：120个月
- 法定退休年龄：57岁

【使用的个人条件】
- 地区：广东
- 性别与出生：女性（女干部口径），1980年3月11日出生
- 就业状态：在职（单位参保）
- 社保累计缴费：养老保险180个月，职工医保120个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01

【政策依据】
- 《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》（全国人民代表大会常务委员会）— 定位：annex/附件1-3 延迟法定退休年龄对照表；article/国务院办法第三条；article/国务院办法第一条
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第二十七条
- 《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》（广东省医疗保障局等三部门）— 定位：article/第八条

【缺失或需确认事项】
- 规则引擎标记需人工确认，但未生成具体追问。
- 规则提示（需确认）：参保地医保退休最低缴费年限参数未配置（国家框架由社会保险法第27条授权统筹地区规定），需人工确认后补充地区参数。（W-MI-LOCAL-YEARS-MISSING）

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1980-03-11",
    "birth_day": 11,
    "birth_month": 3,
    "birth_year": 1980,
    "female_retire_type": "cadre55",
    "gender": "female"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "medical_contrib_months": 120,
    "pension_contrib_months": 180
  },
  "status": {
    "employment_status": "employed"
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "needs_agent",
  "mi": {
    "gap_months": 1,
    "paid_by_unemployment_fund": false
  },
  "needs_agent": true,
  "pension": {
    "gap_months": 48,
    "gap_years_ceil": 4,
    "min_years_required": 19
  },
  "retirement": {
    "female_retire_type_status": "confirmed",
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 7,
    "legal_retire_age_years": 57,
    "legal_retire_date": "2037-10-11",
    "legal_retire_month": 10,
    "legal_retire_year": 2037,
    "months_to_legal_retire": 133,
    "original_retire_age_years": 55
  },
  "unemployment": {
    "duration_months": 0,
    "eligible": false,
    "monthly_amount_est": 0
  },
  "warning_details": [
    {
      "text": "参保地医保退休最低缴费年限参数未配置（国家框架由社会保险法第27条授权统筹地区规定），需人工确认后补充地区参数。",
      "warning_id": "W-MI-LOCAL-YEARS-MISSING"
    },
    {
      "text": "关键信息不完整或存在互斥冲突，建议进入 Agent 追问/细化模式后再生成完整方案。",
      "warning_id": "W-NEEDS-AGENT"
    }
  ],
  "warnings": [
    "W-MI-LOCAL-YEARS-MISSING",
    "W-NEEDS-AGENT"
  ]
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.needs_agent` | eq | `true` |
| `calc.retirement.legal_retire_age_years` | eq | `57` |

**政策依据**

1. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：annex / 附件1-3 延迟法定退休年龄对照表
   - 原文摘录：附件：1.男职工延迟法定退休年龄对照表 2.原法定退休年龄五十五周岁的女职工延迟法定退休年龄对照表 3.原法定退休年龄五十周岁的女职工延迟法定退休年龄对照表
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
2. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第三条
   - 原文摘录：职工达到最低缴费年限，可以自愿选择弹性提前退休，提前时间最长不超过三年，且退休年龄不得低于女职工五十周岁、五十五周岁及男职工六十周岁的原法定退休年龄。职工达到法定退休年龄，所在单位与职工协商一致的，可以弹性延迟退休，延迟时间最长不超过三年。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
3. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第一条
   - 原文摘录：从2025年1月1日起，男职工和原法定退休年龄为五十五周岁的女职工，法定退休年龄每四个月延迟一个月，分别逐步延迟至六十三周岁和五十八周岁；原法定退休年龄为五十周岁的女职工，法定退休年龄每二个月延迟一个月，逐步延迟至五十五周岁。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
4. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第二十七条
   - 原文摘录：参加职工基本医疗保险的个人，达到法定退休年龄时累计缴费达到国家规定年限的，退休后不再缴纳基本医疗保险费，按照国家规定享受基本医疗保险待遇；未达到国家规定年限的，可以缴费至国家规定年限。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
5. 政策标题：《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》
   - 文档ID：`DOC-GD-MEDICAL-TRANSFER-2022`
   - 发布机关：广东省医疗保障局等三部门
   - 官方URL：<https://hsa.gd.gov.cn/zwgk/zfxxgkml/bmwj/gfxwj/content/post_3953355.html>
   - 条款定位：article / 第八条
   - 原文摘录：职工医保参保人员达到法定退休年龄，缴费年限同时符合下列条件的，退休后不再缴纳职工医保费，按照规定享受职工医保待遇：（一）参加职工医保的累计缴费年限符合退休后待遇享受地规定的职工医保累计缴费年限要求。（二）在退休后待遇享受地参加职工医保实际缴费年限累计满10年。
   - 原件SHA-256：`18b4c198fbc46bec9034584c579137725a2021ae7797fe2d5b51f3014e1076a2`

### 35. 广东医保案例：1984年生女性·灵活就业（省级统一口径）

- UID：`RPC-440000-GD-female-from_1980-flexible-MI-2030-V2`（回归测试UID：`RPCT-440000-GD-female-from_1980-flexible-MI-2030-V2`）
- 地区：广东（440000）
- 能力：医保（`mi-2030`）
- as-of日期：2030-01-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`9ce254ca-7443-4cf5-a764-acd715152a36`
- snapshot hash：`d3952809bfd9189f95220ebde1622a59a0d7e5ced4d3e55203f192a99c9771ee`
- 案例content hash：`1ba8294d609c63382a9f474aadc74b2c8a29458448865c1de965dc6e61dfde75`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：确定性结论
- category：医保；topics：社保规划、广东、医保、合成政策案例
- tags：`广东` `440000` `female` `from_1980` `flexible` `灵活就业` `capability:mi-2030` `险种:养老` `险种:医保`

**合成人物画像**

- 地区：广东
- 性别与出生：女性（女工人口径），1984年7月16日出生
- 就业状态：灵活就业
- 社保累计缴费：养老保险180个月，职工医保120个月
- 灵活就业月缴费基数（本人选择）：6000元
- 职工医保衔接：上次缴费结束2029-12-31，本次参保2030-01-01

**咨询问题**

> 我是1984年7月出生的女性（女工人口径），在广东参保，职工医保累计缴了120个月。按2030-01-01起执行的省级统一口径，退休时医保需要累计缴多少个月、我还差多少？

**规则引擎结论（公开回答）**

```text
【结论摘要】
按广东省自2030-01-01起执行的省级统一口径，女性退休时享受职工医保待遇所需累计缴费300个月；当前累计120个月，缺口180个月；法定退休年龄54岁。

【关键测算结果】
- 退休所需累计缴费（省级统一口径）：300个月
- 当前累计缴费（输入）：120个月
- 年限缺口：180个月
- 法定退休年龄：54岁

【使用的个人条件】
- 地区：广东
- 性别与出生：女性（女工人口径），1984年7月16日出生
- 就业状态：灵活就业
- 社保累计缴费：养老保险180个月，职工医保120个月
- 灵活就业月缴费基数（本人选择）：6000元
- 职工医保衔接：上次缴费结束2029-12-31，本次参保2030-01-01

【政策依据】
- 《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》（全国人民代表大会常务委员会）— 定位：annex/附件1-3 延迟法定退休年龄对照表；article/国务院办法第三条；article/国务院办法第一条
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第二十七条
- 《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》（广东省医疗保障局等三部门）— 定位：article/第八条；article/第六条

【缺失或需确认事项】
- 无。本案例输入完整，结论为确定性计算结果。

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2030-01-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1984-07-16",
    "birth_day": 16,
    "birth_month": 7,
    "birth_year": 1984,
    "female_retire_type": "worker50",
    "gender": "female"
  },
  "mi": {
    "enroll_date": "2030-01-01",
    "prev_end_date": "2029-12-31"
  },
  "social": {
    "flex_contrib_base": 6000,
    "medical_contrib_months": 120,
    "pension_contrib_months": 180
  },
  "status": {
    "employment_status": "flexible"
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [],
  "conclusion_level": "direct",
  "mi": {
    "gap_months": 1,
    "lifetime_gap_months": 180,
    "lifetime_required_months": 300,
    "paid_by_unemployment_fund": false
  },
  "needs_agent": false,
  "pension": {
    "gap_months": 60,
    "gap_years_ceil": 5,
    "min_years_required": 20
  },
  "retirement": {
    "female_retire_type_status": "confirmed",
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 10,
    "legal_retire_age_years": 54,
    "legal_retire_date": "2039-05-16",
    "legal_retire_month": 5,
    "legal_retire_year": 2039,
    "months_to_legal_retire": 112,
    "original_retire_age_years": 50
  },
  "unemployment": {
    "duration_months": 0,
    "eligible": false,
    "monthly_amount_est": 0
  },
  "warning_details": [],
  "warnings": []
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.mi.lifetime_required_months` | eq | `300` |
| `calc.mi.lifetime_gap_months` | eq | `180` |
| `calc.retirement.legal_retire_age_years` | eq | `54` |

**政策依据**

1. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：annex / 附件1-3 延迟法定退休年龄对照表
   - 原文摘录：附件：1.男职工延迟法定退休年龄对照表 2.原法定退休年龄五十五周岁的女职工延迟法定退休年龄对照表 3.原法定退休年龄五十周岁的女职工延迟法定退休年龄对照表
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
2. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第三条
   - 原文摘录：职工达到最低缴费年限，可以自愿选择弹性提前退休，提前时间最长不超过三年，且退休年龄不得低于女职工五十周岁、五十五周岁及男职工六十周岁的原法定退休年龄。职工达到法定退休年龄，所在单位与职工协商一致的，可以弹性延迟退休，延迟时间最长不超过三年。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
3. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第一条
   - 原文摘录：从2025年1月1日起，男职工和原法定退休年龄为五十五周岁的女职工，法定退休年龄每四个月延迟一个月，分别逐步延迟至六十三周岁和五十八周岁；原法定退休年龄为五十周岁的女职工，法定退休年龄每二个月延迟一个月，逐步延迟至五十五周岁。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
4. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第二十七条
   - 原文摘录：参加职工基本医疗保险的个人，达到法定退休年龄时累计缴费达到国家规定年限的，退休后不再缴纳基本医疗保险费，按照国家规定享受基本医疗保险待遇；未达到国家规定年限的，可以缴费至国家规定年限。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
5. 政策标题：《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》
   - 文档ID：`DOC-GD-MEDICAL-TRANSFER-2022`
   - 发布机关：广东省医疗保障局等三部门
   - 官方URL：<https://hsa.gd.gov.cn/zwgk/zfxxgkml/bmwj/gfxwj/content/post_3953355.html>
   - 条款定位：article / 第八条
   - 原文摘录：职工医保参保人员达到法定退休年龄，缴费年限同时符合下列条件的，退休后不再缴纳职工医保费，按照规定享受职工医保待遇：（一）参加职工医保的累计缴费年限符合退休后待遇享受地规定的职工医保累计缴费年限要求。（二）在退休后待遇享受地参加职工医保实际缴费年限累计满10年。
   - 原件SHA-256：`18b4c198fbc46bec9034584c579137725a2021ae7797fe2d5b51f3014e1076a2`
6. 政策标题：《广东省医疗保障局 广东省财政厅 国家税务总局广东省税务局关于印发《广东省基本医疗保险关系省内转移接续暂行办法》的通知（粤医保规〔2022〕6号）》
   - 文档ID：`DOC-GD-MEDICAL-TRANSFER-2022`
   - 发布机关：广东省医疗保障局等三部门
   - 官方URL：<https://hsa.gd.gov.cn/zwgk/zfxxgkml/bmwj/gfxwj/content/post_3953355.html>
   - 条款定位：article / 第六条
   - 原文摘录：逐步统一全省职工医保缴费年限政策。累计缴费年限到2030年1月1日统一为男职工30年，女职工25年。未达前款规定的市，从2022年开始，在本市2021年缴费年限政策的基础上，逐年调整本市职工医保累计缴费年限。
   - 原件SHA-256：`18b4c198fbc46bec9034584c579137725a2021ae7797fe2d5b51f3014e1076a2`

### 36. 广东缴费基数案例：1988年生女性·失业（缴费基数边界）

- UID：`RPC-440000-GD-female-from_1980-unemployed-BASE-BOUNDARY-V2`（回归测试UID：`RPCT-440000-GD-female-from_1980-unemployed-BASE-BOUNDARY-V2`）
- 地区：广东（440000）
- 能力：缴费基数（`base-boundary`）
- as-of日期：2026-09-01
- 生成器版本：RCL-GEN-2.0
- snapshot ID：`e9b7227f-69a1-413b-b607-ebaba2db38ea`
- snapshot hash：`3e20302d6df76232f6ceba8c5b197244bac289a6b02a4a0bfc1e7b03959f4e5e`
- 案例content hash：`16b4771aeb61d342a043fa427d543fa5cf144f3b53af97933add467c91c590f6`
- quality：总分100（输入完整40/覆盖义务30/断言重放30）
- 结论级别：需人工补充确认（needs_agent）
- category：缴费基数；topics：社保规划、广东、缴费基数、合成政策案例
- tags：`广东` `440000` `female` `from_1980` `unemployed` `失业` `capability:base-boundary` `险种:养老` `险种:医保` `险种:失业` `needs-agent`

**合成人物画像**

- 地区：广东
- 性别与出生：女性（女工人口径），1988年11月21日出生
- 就业状态：失业，正在领取失业保险金
- 社保累计缴费：养老保险180个月，职工医保120个月
- 失业保险累计缴费：3年；本段已领取：2个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01

**咨询问题**

> 我是1988年11月出生的女性（女工人口径），在广东灵活就业，想按未估算（需补充信息）元/月的基数参保，这个基数可以吗、每月要交多少？

**规则引擎结论（公开回答）**

```text
【结论摘要】
本人选择的灵活就业缴费基数为未估算（需补充信息）元/月；当前规则引擎未配置广东灵活就业月缴费金额规则，不计算具体缴费金额，缴费基数是否落在参保地市下限与省上限之间请以政策依据为准；同时参保地市医保退休年限参数缺失，需补充确认；法定退休年龄55岁可确定。

【关键测算结果】
- 本人选择的缴费基数（输入）：未估算（需补充信息）元/月
- 灵活就业月缴费金额：未估算（需补充信息）（广东无专属缴费规则）
- 法定退休年龄：55岁

【使用的个人条件】
- 地区：广东
- 性别与出生：女性（女工人口径），1988年11月21日出生
- 就业状态：失业，正在领取失业保险金
- 社保累计缴费：养老保险180个月，职工医保120个月
- 失业保险累计缴费：3年；本段已领取：2个月
- 职工医保衔接：上次缴费结束2026-06-30，本次参保2026-07-01

【政策依据】
- 《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》（全国人民代表大会常务委员会）— 定位：annex/附件1-3 延迟法定退休年龄对照表；article/国务院办法第三条；article/国务院办法第一条
- 《中华人民共和国社会保险法（2018修正）》（全国人民代表大会常务委员会）— 定位：article/第二十七条
- 《关于公布2025年职工基本养老保险缴费基数上下限和基本养老金计发基数有关问题的通知（粤人社发〔2025〕32号）》（广东省人力资源和社会保障厅）— 定位：body/正文第一条

【缺失或需确认事项】
- 需补充字段 user.profile.claim_city：请确认失业保险金领取地市（用于按领取地市最低工资标准核算失业金金额）。
- 规则提示（需确认）：参保地医保退休最低缴费年限参数未配置（国家框架由社会保险法第27条授权统筹地区规定），需人工确认后补充地区参数。（W-MI-LOCAL-YEARS-MISSING）
- 规则提示（需确认）：失业金期间，医保通常由失业保险基金代缴（以经办口径为准）。规划现金流时请不要重复计算医保个人缴费。（W-UI-MI-PAID）

【声明】本案例为合成演示，不构成个案办理决定。本回答由规则引擎按2026-09-01有效政策参数确定性计算，人物为合成画像，不含任何真实个人数据。
```

**input摘要**

```json
{
  "basic": {
    "birth_date": "1988-11-21",
    "birth_day": 21,
    "birth_month": 11,
    "birth_year": 1988,
    "female_retire_type": "worker50",
    "gender": "female"
  },
  "mi": {
    "enroll_date": "2026-07-01",
    "prev_end_date": "2026-06-30"
  },
  "social": {
    "medical_contrib_months": 120,
    "pension_contrib_months": 180,
    "ui_claimed_months": 2,
    "unemployment_insurance_years": 3
  },
  "status": {
    "employment_status": "unemployed",
    "on_unemployment_benefit": true
  }
}
```

**expected摘要**

```json
{
  "agent_questions": [
    {
      "field": "user.profile.claim_city",
      "question_id": "Q-UI-CLAIM-CITY",
      "text": "请确认失业保险金领取地市（用于按领取地市最低工资标准核算失业金金额）。"
    }
  ],
  "conclusion_level": "needs_agent",
  "mi": {
    "gap_months": 1,
    "paid_by_unemployment_fund": true
  },
  "needs_agent": true,
  "pension": {
    "gap_months": 60,
    "gap_years_ceil": 5,
    "min_years_required": 20
  },
  "retirement": {
    "female_retire_type_status": "confirmed",
    "flex_adjusted": false,
    "flex_preference": "standard",
    "legal_retire_age_months": 0,
    "legal_retire_age_years": 55,
    "legal_retire_date": "2043-11-21",
    "legal_retire_month": 11,
    "legal_retire_year": 2043,
    "months_to_legal_retire": 206,
    "original_retire_age_years": 50
  },
  "unemployment": {
    "duration_months": 12,
    "duration_months_raw": 12,
    "eligible": true
  },
  "warning_details": [
    {
      "text": "参保地医保退休最低缴费年限参数未配置（国家框架由社会保险法第27条授权统筹地区规定），需人工确认后补充地区参数。",
      "warning_id": "W-MI-LOCAL-YEARS-MISSING"
    },
    {
      "text": "失业金期间，医保通常由失业保险基金代缴（以经办口径为准）。规划现金流时请不要重复计算医保个人缴费。",
      "warning_id": "W-UI-MI-PAID"
    },
    {
      "text": "关键信息不完整或存在互斥冲突，建议进入 Agent 追问/细化模式后再生成完整方案。",
      "warning_id": "W-NEEDS-AGENT"
    }
  ],
  "warnings": [
    "W-MI-LOCAL-YEARS-MISSING",
    "W-UI-MI-PAID",
    "W-NEEDS-AGENT"
  ]
}
```

**assertions**

| 路径 | 操作 | 期望值 |
| --- | --- | --- |
| `calc.needs_agent` | eq | `true` |
| `calc.retirement.legal_retire_age_years` | eq | `55` |

**政策依据**

1. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：annex / 附件1-3 延迟法定退休年龄对照表
   - 原文摘录：附件：1.男职工延迟法定退休年龄对照表 2.原法定退休年龄五十五周岁的女职工延迟法定退休年龄对照表 3.原法定退休年龄五十周岁的女职工延迟法定退休年龄对照表
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
2. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第三条
   - 原文摘录：职工达到最低缴费年限，可以自愿选择弹性提前退休，提前时间最长不超过三年，且退休年龄不得低于女职工五十周岁、五十五周岁及男职工六十周岁的原法定退休年龄。职工达到法定退休年龄，所在单位与职工协商一致的，可以弹性延迟退休，延迟时间最长不超过三年。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
3. 政策标题：《全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定》
   - 文档ID：`DOC-CN-NPC-DELAYED-RETIREMENT-2024`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/SYrlzyhshbzb/ztzl/zt202409/qwfb/202409/t20240913_525781.html>
   - 条款定位：article / 国务院办法第一条
   - 原文摘录：从2025年1月1日起，男职工和原法定退休年龄为五十五周岁的女职工，法定退休年龄每四个月延迟一个月，分别逐步延迟至六十三周岁和五十八周岁；原法定退休年龄为五十周岁的女职工，法定退休年龄每二个月延迟一个月，逐步延迟至五十五周岁。
   - 原件SHA-256：`69a02418f3ce5fbc6276135990e62731cfb6ae7c0b1524c3f2f855651ffa7d9b`
4. 政策标题：《中华人民共和国社会保险法（2018修正）》
   - 文档ID：`DOC-CN-SOCIAL-INSURANCE-LAW`
   - 发布机关：全国人民代表大会常务委员会
   - 官方URL：<https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/fl/202011/t20201102_394629.html>
   - 条款定位：article / 第二十七条
   - 原文摘录：参加职工基本医疗保险的个人，达到法定退休年龄时累计缴费达到国家规定年限的，退休后不再缴纳基本医疗保险费，按照国家规定享受基本医疗保险待遇；未达到国家规定年限的，可以缴费至国家规定年限。
   - 原件SHA-256：`b69d5d490f9b6b70394dfb670c2e1a0a959f306e70380bb678ee4866f947d464`
5. 政策标题：《关于公布2025年职工基本养老保险缴费基数上下限和基本养老金计发基数有关问题的通知（粤人社发〔2025〕32号）》
   - 文档ID：`DOC-GD-CONTRIBUTION-BASE-2025`
   - 发布机关：广东省人力资源和社会保障厅
   - 官方URL：<https://hrss.gd.gov.cn/zwgk/gsgg/content/post_4789648.html>
   - 条款定位：body / 正文第一条
   - 原文摘录：自2025年7月1日起，全省企业职工基本养老保险缴费基数上限调整为27549元，广州市、省直缴费基数下限调整为5510元，其他地区缴费基数下限调整为4775元。
   - 原件SHA-256：`ca70f1155ba94cf09e6217fd85694a6adc8f03546ae8eb2038e6aa9c068b5aa5`

