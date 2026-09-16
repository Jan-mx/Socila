-- APR（后台政策资产中文可读化，APR-FR-003/010/017、APR-AC-003/008）：
-- 规则集与参数新增正式中文显示元数据。只新增显示元数据列与回退/补全，
-- 不修改业务编号、政策值、规则顺序、版本、状态或内容哈希；幂等可重复执行。
ALTER TABLE "rule_sets" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE "params" ADD COLUMN IF NOT EXISTS "name" text;
ALTER TABLE "params" ADD COLUMN IF NOT EXISTS "description" text;

-- 兼容回退（APR-FR-017）：无法确定名称的旧行暂时以实体编号作为名称。
UPDATE "rule_sets" SET "name" = "rule_set_id" WHERE "name" IS NULL;
UPDATE "params" SET "name" = "param_id" WHERE "name" IS NULL;

-- 当前版本化DSL资产的人工名称补全（APR-FR-003/011）：仅覆盖回退状态，不改写已有正式名称。
UPDATE "rule_sets" AS r SET "name" = v.name FROM (VALUES
  ('310000', 'RS-SHANGHAI-PLAN-V1', '上海规划主规则集'),
  ('440000', 'RS-GD-PLAN-V1', '广东规划主规则集'),
  ('510000', 'RS-SC-PLAN-V1', '四川规划主规则集'),
  ('CN', 'RS-CN-PLAN-V1', '国家规划主规则集')
) AS v(jur, rule_set_id, name)
WHERE r."jurisdiction_code" = v.jur AND r."rule_set_id" = v.rule_set_id
  AND (r."name" = r."rule_set_id" OR r."name" IS NULL);

UPDATE "params" AS p SET "name" = v.name FROM (VALUES
  ('CN', 'P-UNEMPLOYMENT-MAX-MONTHS', '失业保险金法定最长领取月数'),
  ('CN', 'P-CI-FLEX-CHOICE-LOWER-RATIO', '灵活就业人员缴费基数区间下限比例'),
  ('CN', 'P-CI-FLEX-CHOICE-UPPER-RATIO', '灵活就业人员缴费基数区间上限比例'),
  ('CN', 'T-UNEMPLOYMENT-DURATION-BY-YEARS', '失业保险金期限国家法定分档表'),
  ('CN', 'T-MIN-PENSION-YEARS-BY-RETIRE-YEAR', '按月领取基本养老金最低缴费年限时间线'),
  ('CN', 'T-RETIREMENT-AGE-LOOKUP', '渐进式延迟法定退休年龄覆盖表'),
  ('310000', 'P-SH-CONTRIB-BASE-LOWER', '上海市社保缴费基数下限'),
  ('310000', 'P-SH-CONTRIB-BASE-UPPER', '上海市社保缴费基数上限'),
  ('310000', 'P-SH-PENSION-RATE-EMPLOYER', '上海市单位养老保险缴费比例'),
  ('310000', 'P-SH-MEDICAL-RATE-EMPLOYER', '上海市单位医疗保险缴费比例（含生育保险）'),
  ('310000', 'P-SH-UNEMPLOYMENT-RATE-EMPLOYER', '上海市单位失业保险缴费比例'),
  ('310000', 'P-SH-PENSION-RATE-FLEX', '上海市灵活就业人员养老保险缴费比例'),
  ('310000', 'P-SH-MEDICAL-RATE-FLEX', '上海市灵活就业人员医疗保险缴费比例'),
  ('310000', 'P-SH-MI-WAITING-PERIOD-MONTHS', '上海市灵活就业人员医保待遇等待期月数'),
  ('310000', 'P-SH-MI-GAP-WAIVER-MONTHS', '上海市医保断缴恢复参保等待期豁免月数'),
  ('310000', 'P-SH-4050-SUBSIDY-RATE', '上海市4050灵活就业社保补贴比例'),
  ('310000', 'P-SH-4050-MAX-YEARS-GENERAL', '上海市4050补贴累计最长年限（一般情形）'),
  ('310000', 'P-SH-4050-NEAR-RETIRE-THRESHOLD-YEARS', '上海市4050补贴延长至退休的临近退休门槛年数'),
  ('310000', 'P-SH-JOB-SUBSIDY-RATE-MINWAGE', '上海市单位吸纳就业困难人员岗位补贴比例（按最低工资）'),
  ('310000', 'P-SH-JOB-SUBSIDY-MAX-YEARS-GENERAL', '上海市单位吸纳补贴累计最长年限（一般情形）'),
  ('310000', 'P-SH-JOB-SUBSIDY-NEAR-RETIRE-THRESHOLD-YEARS', '上海市单位吸纳补贴延长至退休的临近退休门槛年数'),
  ('310000', 'P-SH-UNEMPLOYMENT-BENEFIT-TIER1', '上海市失业保险金标准（第1至12个月）'),
  ('310000', 'P-SH-UNEMPLOYMENT-BENEFIT-TIER2', '上海市失业保险金标准（第13至24个月）'),
  ('310000', 'P-SH-UNEMPLOYMENT-BENEFIT-EXTENDED', '上海市失业保险金延长领取期间标准'),
  ('310000', 'P-SH-MIN-WAGE', '上海市月最低工资标准'),
  ('310000', 'P-MI-LIFETIME-REQUIRED-YEARS', '上海市退休职工医保累计缴费年限要求'),
  ('310000', 'P-MI-LIFETIME-MALE-YEARS', '上海市医保退休最低缴费年限要求（男性）'),
  ('310000', 'P-MI-LIFETIME-FEMALE-YEARS', '上海市医保退休最低缴费年限要求（女性）'),
  ('310000', 'P-SH-UI-OLDER-PENSION-FUND-WINDOW-MONTHS', '上海市大龄领金人员养老保险费由失业基金承担窗口月数'),
  ('310000', 'T-UNEMPLOYMENT-DURATION-BY-YEARS', '上海市失业保险金领取期限分档表（上海执行标准）'),
  ('440000', 'P-MI-LIFETIME-MALE-YEARS', '广东省职工医保累计缴费年限统一口径（男职工）'),
  ('440000', 'P-MI-LIFETIME-FEMALE-YEARS', '广东省职工医保累计缴费年限统一口径（女职工）'),
  ('440000', 'P-GD-CONTRIB-BASE-UPPER', '广东省企业职工养老保险缴费基数上限'),
  ('440000', 'P-GD-AVG-WAGE-2023', '广东省2023年全口径城镇单位就业人员月平均工资'),
  ('440000', 'P-GD-PENSION-CALC-BASE-2025', '广东省2025年度基本养老金计发基数'),
  ('440000', 'P-GD-UNEMPLOYMENT-BENEFIT-RATE', '广东省失业保险金标准比例（按当地最低工资）'),
  ('440000', 'T-GD-CONTRIB-BASE-LOWER-BY-CITY', '广东省企业职工养老保险缴费基数下限分市表'),
  ('440000', 'T-GD-MIN-WAGE-BY-CITY', '广东省最低工资标准分档表'),
  ('510000', 'P-SC-CONTRIB-BASE-UPPER', '四川省2025年度职工社保缴费基数上限'),
  ('510000', 'P-SC-CONTRIB-BASE-LOWER', '四川省2025年度职工社保缴费基数下限'),
  ('510000', 'P-SC-AVG-WAGE-2024', '四川省2024年度全省城镇单位就业人员平均工资')
) AS v(jur, param_id, name)
WHERE p."jurisdiction_code" = v.jur AND p."param_id" = v.param_id
  AND (p."name" = p."param_id" OR p."name" IS NULL);

-- 参数窗口级说明补全（APR-FR-010/011）：只写当前无说明的行。
UPDATE "params" AS p SET "description" = v.description FROM (VALUES
  ('CN', 'P-UNEMPLOYMENT-MAX-MONTHS', '2011-07-01'::date, '单次领取失业保险金的法定期限上限为24个月，重新就业后再次失业的期限与前次未领取期限合并计算（《社会保险法》第四十六条、《失业保险条例》第十七条）。'),
  ('CN', 'P-CI-FLEX-CHOICE-LOWER-RATIO', '2019-05-01'::date, '2019年5月起，灵活就业人员可在全省全口径城镇单位就业人员平均工资的60%至300%之间自愿选择养老保险缴费基数，本参数为区间下限比例60%。'),
  ('CN', 'P-CI-FLEX-CHOICE-UPPER-RATIO', '2019-05-01'::date, '灵活就业人员养老保险缴费基数可选择区间的上限比例300%。'),
  ('CN', 'T-UNEMPLOYMENT-DURATION-BY-YEARS', '2011-07-01'::date, '按累计缴费年限分档确定最高领取月数的国家法定上限表（《社会保险法》第四十六条、《失业保险条例》第十七条）；实际执行标准由参保地规定，地区可通过显式replace覆盖本表。'),
  ('CN', 'T-MIN-PENSION-YEARS-BY-RETIRE-YEAR', '2025-01-01'::date, '按月领取基本养老金的最低缴费年限自2030年1月1日起由15年逐年提高至20年、每年提高6个月（国务院实施办法第二条、附件4）。'),
  ('CN', 'T-RETIREMENT-AGE-LOOKUP', '2025-01-01'::date, '渐进式延迟法定退休年龄改革的出生年月对照表（决定附件1至附件3口径），覆盖边界出生年份的法定退休年龄；表外出生年月由引擎按延迟规则推算。'),
  ('310000', 'P-SH-CONTRIB-BASE-LOWER', '2026-07-01'::date, '自2026年7月1日起，本市社保缴费基数下限为7546元/月（上海市人力资源和社会保障局2026-08-24发布）。'),
  ('310000', 'P-SH-CONTRIB-BASE-UPPER', '2026-07-01'::date, '自2026年7月1日起，本市社保缴费基数上限为37731元/月。'),
  ('310000', 'P-SH-PENSION-RATE-EMPLOYER', '2025-01-20'::date, '用人单位缴纳职工基本养老保险费的比例为16%（以上海市人社局2025-01-20发布参数页为权威口径）。'),
  ('310000', 'P-SH-MEDICAL-RATE-EMPLOYER', '2025-01-20'::date, '用人单位缴纳职工基本医疗保险费的比例为9%，其中含生育保险缴费。'),
  ('310000', 'P-SH-UNEMPLOYMENT-RATE-EMPLOYER', '2025-01-20'::date, '用人单位缴纳职工失业保险费的比例为0.5%。'),
  ('310000', 'P-SH-PENSION-RATE-FLEX', '2024-03-01'::date, '自2024年3月1日起，灵活就业人员缴纳职工基本养老保险费的比例为20%。'),
  ('310000', 'P-SH-MEDICAL-RATE-FLEX', '2024-03-01'::date, '自2024年3月1日起，灵活就业人员缴纳职工基本医疗保险费的比例为10%。'),
  ('310000', 'P-SH-MI-WAITING-PERIOD-MONTHS', '2025-09-10'::date, '以灵活就业人员身份首次参加或中断后重新参加本市职工医保的，设置6个月待遇等待期（沪医保规〔2025〕7号，自2025-09-10施行）。'),
  ('310000', 'P-SH-MI-GAP-WAIVER-MONTHS', '2025-09-10'::date, '中断职工医保待遇后3个月内以灵活就业人员身份参保缴费的，不受待遇等待期限制（沪医保规〔2025〕7号）。'),
  ('310000', 'P-SH-4050-SUBSIDY-RATE', '2022-01-01'::date, '就业困难人员灵活就业社保补贴标准，为按下限基数计算的应缴社会保险费的50%（沪人社规〔2022〕8号，有效期至2026-12-31）。'),
  ('310000', 'P-SH-4050-MAX-YEARS-GENERAL', '2022-01-01'::date, '同一名就业困难人员享受灵活就业社保补贴的期限累计一般不超过3年。'),
  ('310000', 'P-SH-4050-NEAR-RETIRE-THRESHOLD-YEARS', '2022-01-01'::date, '距法定退休年龄不足5年的，补贴可延长至退休（替代此前无依据的固定最长8年推断口径）。'),
  ('310000', 'P-SH-JOB-SUBSIDY-RATE-MINWAGE', '2022-01-01'::date, '用人单位吸纳就业困难人员的岗位补贴，按本市月最低工资标准的50%计算。'),
  ('310000', 'P-SH-JOB-SUBSIDY-MAX-YEARS-GENERAL', '2022-01-01'::date, '用人单位吸纳就业困难人员的岗位补贴期限累计一般不超过3年。'),
  ('310000', 'P-SH-JOB-SUBSIDY-NEAR-RETIRE-THRESHOLD-YEARS', '2022-01-01'::date, '补贴期满时距法定退休年龄不足2年的，最长可延长至劳动者到达法定退休年龄。'),
  ('310000', 'P-SH-UNEMPLOYMENT-BENEFIT-TIER1', '2024-07-01'::date, '2024-07-01起执行的第1至12个月失业保险金标准2255元/月（沪人社规〔2024〕13号；2025-07-01起被沪人社规〔2025〕9号替代）。'),
  ('310000', 'P-SH-UNEMPLOYMENT-BENEFIT-TIER1', '2025-07-01'::date, '2025-07-01起执行的第1至12个月失业保险金标准2305元/月（沪人社规〔2025〕9号；2026-07-01起被沪人社规〔2026〕7号替代）。'),
  ('310000', 'P-SH-UNEMPLOYMENT-BENEFIT-TIER1', '2026-07-01'::date, '2026-07-01起执行的第1至12个月失业保险金标准2340元/月（沪人社规〔2026〕7号，有效期至2028-06-30）。'),
  ('310000', 'P-SH-UNEMPLOYMENT-BENEFIT-TIER2', '2024-07-01'::date, '2024-07-01起执行的第13至24个月失业保险金标准1804元/月（沪人社规〔2024〕13号）。'),
  ('310000', 'P-SH-UNEMPLOYMENT-BENEFIT-TIER2', '2025-07-01'::date, '2025-07-01起执行的第13至24个月失业保险金标准1844元/月（沪人社规〔2025〕9号）。'),
  ('310000', 'P-SH-UNEMPLOYMENT-BENEFIT-TIER2', '2026-07-01'::date, '2026-07-01起执行的第13至24个月失业保险金标准1872元/月（沪人社规〔2026〕7号）。'),
  ('310000', 'P-SH-UNEMPLOYMENT-BENEFIT-EXTENDED', '2024-07-01'::date, '2024-07-01起执行的延长领取期间失业保险金标准1595元/月（沪人社规〔2024〕13号）。'),
  ('310000', 'P-SH-UNEMPLOYMENT-BENEFIT-EXTENDED', '2025-07-01'::date, '2025-07-01起执行的延长领取期间失业保险金标准1650元/月（沪人社规〔2025〕9号）。'),
  ('310000', 'P-SH-UNEMPLOYMENT-BENEFIT-EXTENDED', '2026-07-01'::date, '2026-07-01起执行的延长领取期间失业保险金标准1690元/月；官方问答说明该标准不低于本市最低生活保障标准，故高于第13至24个月标准的80%（沪人社规〔2026〕7号）。'),
  ('310000', 'P-SH-MIN-WAGE', '2024-07-01'::date, '2024-07-01起执行的月最低工资标准2690元/月；沪人社规〔2025〕10号载明自2025-07-01起调整至2740元。'),
  ('310000', 'P-SH-MIN-WAGE', '2025-07-01'::date, '自2025年7月1日起，本市月最低工资标准为2740元（沪人社规〔2025〕10号）。'),
  ('310000', 'P-MI-LIFETIME-REQUIRED-YEARS', '2010-01-01'::date, '上海退休职工享受职工医保终身待遇的条件为缴费年限（含视同缴费年限）累计超过15年。'),
  ('310000', 'P-MI-LIFETIME-MALE-YEARS', '2010-01-01'::date, '上海官方来源不按性别区分医保退休缴费年限，男性口径与累计超过15年的统一要求一致；原25年口径无依据，已按正式来源纠正为15年。'),
  ('310000', 'P-MI-LIFETIME-FEMALE-YEARS', '2010-01-01'::date, '上海官方来源不按性别区分医保退休缴费年限，女性口径与累计超过15年的统一要求一致；原20年口径无依据，已按正式来源纠正为15年。'),
  ('310000', 'P-SH-UI-OLDER-PENSION-FUND-WINDOW-MONTHS', '2025-01-20'::date, '大龄领取失业保险金人员在距法定退休年龄不足1年期间缴纳的职工养老保险费，由失业保险基金支付，退休后一次性发放（窗口月数12个月）。'),
  ('310000', 'T-UNEMPLOYMENT-DURATION-BY-YEARS', '2026-08-16'::date, '上海执行标准：累计缴费满1年不满2年的领取2个月，以后每增加1年增加2个月，最长不超过24个月（沪人社规〔2026〕18号，自2026-08-16施行；对国家级期限分档表的显式replace）。'),
  ('440000', 'P-MI-LIFETIME-MALE-YEARS', '2030-01-01'::date, '自2030年1月1日起全省统一男职工职工医保累计缴费年限为30年；2022至2029年为各市逐年过渡期（以各市2021年政策为基准），省级无统一数值。'),
  ('440000', 'P-MI-LIFETIME-FEMALE-YEARS', '2030-01-01'::date, '自2030年1月1日起全省统一女职工职工医保累计缴费年限为25年。'),
  ('440000', 'P-GD-CONTRIB-BASE-UPPER', '2024-07-01'::date, '2024年7月1日至2025年6月30执行的全省企业职工基本养老保险缴费基数上限27501元/月（按2023年全省全口径平均工资9167元的300%核定）。'),
  ('440000', 'P-GD-AVG-WAGE-2023', '2024-07-01'::date, '2023年全省全口径城镇单位就业人员月平均工资9167元，为当期缴费基数上下限核定依据。'),
  ('440000', 'P-GD-CONTRIB-BASE-UPPER', '2025-07-01'::date, '自2025年7月1日起执行的全省企业职工基本养老保险缴费基数上限27549元/月；原文未声明终止日，以下一年度调整文件发布为准。'),
  ('440000', 'P-GD-PENSION-CALC-BASE-2025', '2025-01-01'::date, '2025年度全省企业职工基本养老保险和机关事业单位养老保险基本养老金计发基数9493元/月；深圳市计发基数另行公布。'),
  ('440000', 'P-GD-UNEMPLOYMENT-BENEFIT-RATE', '2025-01-12'::date, '失业保险金按领取地地级以上市最低工资标准的90%发放（《广东省失业保险条例》第十九条，2025-01-12第二次修正版通过日保守取为起始日）。'),
  ('440000', 'T-GD-CONTRIB-BASE-LOWER-BY-CITY', '2024-07-01'::date, '2024年7月1日至2025年6月30执行的全省企业职工养老保险缴费基数下限分市档位表。'),
  ('440000', 'T-GD-CONTRIB-BASE-LOWER-BY-CITY', '2025-07-01'::date, '自2025年7月1日起的缴费基数下限分档：广州市及省直5510元/月、其他地区4775元/月（2025年度起珠海、佛山、东莞、中山不再单列）。'),
  ('440000', 'T-GD-MIN-WAGE-BY-CITY', '2026-09-01'::date, '粤府函〔2026〕188号：自2026年9月1日起执行的广东省最低工资标准分档表，一类档广州市2680元、深圳市2700元/月等。'),
  ('510000', 'P-SC-CONTRIB-BASE-UPPER', '2025-01-01'::date, '2025年度全省职工基本养老保险（含企业职工和机关事业单位）、失业保险、工伤保险缴费基数上限22938元/月（文件按自然年度编码）。'),
  ('510000', 'P-SC-CONTRIB-BASE-LOWER', '2025-01-01'::date, '2025年度全省职工基本养老保险、失业保险、工伤保险缴费基数下限4588元/月。'),
  ('510000', 'P-SC-AVG-WAGE-2024', '2025-01-01'::date, '上年度（2024年度）全省城镇全部单位就业人员平均工资7646元/月，作为灵活就业人员、领金期间失业人员等参加职工医保、生育保险和长期护理保险的缴费基数依据。')
) AS v(jur, param_id, effective_from, description)
WHERE p."jurisdiction_code" = v.jur AND p."param_id" = v.param_id
  AND p."effective_from" = v.effective_from AND p."description" IS NULL;

-- 名称非空约束：新建与物化入口强制正式名称（APR-FR-017）。
ALTER TABLE "rule_sets" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "params" ALTER COLUMN "name" SET NOT NULL;
