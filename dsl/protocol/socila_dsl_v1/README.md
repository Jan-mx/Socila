# SOCILA-DSL v1.0（社保规划规则引擎 DSL / 决策表 JSON）

本目录是Socila规则引擎的**通用协议层**（09-05 SDL-FR-002）：JSON Schema与发布
工作流，与任何地区无关。规则格式的唯一规范值为 `SOCILA-DSL-1.0`（schema中
`dsl_version` 以 `const` 钉死）；`dsl_version` 只表示JSON格式版本，地区由地区
Manifest的 `jurisdiction_code` 表达，不编码进 `dsl_version`。

> 说明：具体地区的规则、参数、规则集、示例与Manifest位于 `dsl/regions/<slug>_dsl_v1/`；
> 本仓库内的参数表与退休年龄表为**示例**，真正上线必须由政策岗在管理后台按最新口径维护并版本化发布。

---

## 1. 协议资产
- `schema/socila_rule_dsl.schema.json`：规则JSON Schema（决策表结构、`dsl_version=SOCILA-DSL-1.0`）
- `schema/socila_policy_params.schema.json`：政策参数包Schema（标量参数与表格/时间线参数）
- `schema/user_profile.schema.json`：用户画像输入Schema
- `workflows/publish_workflow_default.json`：默认规则/参数发布工作流

---

## 2. 运行时数据模型（Runtime Context）
规则引擎执行时使用一个 `ctx`（上下文）：

```json
{
  "user": { /* 用户输入 */ },
  "params": { /* 由 policy service 按 as_of_date 加载的参数字典 */ },
  "calc": { /* 规则计算过程变量 */ },
  "plan": { /* 结构化规划输出 */ }
}
```

- `user`：来自前端表单（参保地、出生、缴费月数、状态等）
- `params`：来自政策参数服务（按 `as_of_date` 取“最新有效版本”）
- `calc`：规则引擎逐步计算出的中间结果（缺口、资格、等待期等）
- `plan`：最终方案骨架（模板ID、结论等级、主策略摘要等）

---

## 3. 表达式语言
### 3.1 条件 `when`
`when` 使用 **JSONLogic**（并允许扩展操作符）：
- 标准 JSONLogic：`and / or / == / != / > / >= / < / <= / + / - / * / / / min / max`
- 扩展操作符（建议在引擎中实现）：
  - `ceil(x)`：向上取整
  - `intersects(a,b)`：数组是否有交集

### 3.2 动作 `then.actions`
每一行命中后执行 `actions`（顺序执行）：

- `set`：写入字段
- `append`：追加数组
- `lookup`：查表/查时间线参数（支持区间匹配）
- `call`：调用内置函数（用于日期计算、字符串解析等）
  - `emit_question`：生成智能代理追问
- `emit_warning`：生成风险/提醒

---

## 4. 查表（lookup）约定
`lookup` 用于 table/timeline/list 类型参数：

- **table**：支持“精确匹配 + 区间匹配”（例如 `insured_years` 落在 `[min,max)`）
- **timeline**：按年份范围命中（例如 `retire_year`）
- **list**：引擎可加载为数组，配合 `intersects` 等操作符

---

## 5. 版本化与“最新优先”
- Rule / Param 都必须带 `effective_from`（可选 `effective_to`）
- 同一 `rule_id` 多版本：按 `effective_from <= as_of_date` 且 `effective_from` 最大者生效
- 冲突解决策略在地区资产的 `rule_sets/*.json` 中声明
- 地区资产包版本由地区Manifest的 `bundle_version` 表达，与规则/参数实体版本独立递增

---

## 6. 单元测试
地区资产的 `tests/rule_examples_as_tests.json` 为规则内 `examples` 的抽取：
- 管理后台发布前必须全量跑过
- 允许新增回归用例（来自案例库/线上真实问题）
