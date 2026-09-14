-- 09-05复审纠正：tests.jurisdiction_code 存量回填。
-- 背景：地区作用域的tests upsert（jurisdictionCode+name）落地后，生产Seed写入的
-- 示例测试与回归测试均携带jurisdiction_code；此前历史行该列为NULL。
-- 本迁移把NULL行回填为'310000'（上海）：全部存量tests行来源于上海DSL示例
-- （rule_examples_as_tests.json）与上海案例转录工作簿
-- （data/shanghai-test-cases-from-transcripts.xlsx等），地区归属可由权威数据文件推导。
-- 幂等：重复执行时无NULL行，为no-op。不改写任何测试内容、用户数据或快照。
UPDATE tests
SET jurisdiction_code = '310000', updated_at = now()
WHERE jurisdiction_code IS NULL;
