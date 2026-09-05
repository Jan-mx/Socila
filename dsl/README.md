# Socila DSL 分层结构

本目录按“通用协议 / 地区资产”两层组织规则引擎的JSON资产（09-05 SDL-FR-002）：

```text
dsl/
├─ README.md                         ← 本文件
├─ protocol/socila_dsl_v1/           ← 通用协议：Schema与发布工作流（地区无关）
│  ├─ README.md                      ← 协议规范（SOCILA-DSL-1.0）
│  ├─ schema/
│  │  ├─ socila_rule_dsl.schema.json
│  │  ├─ socila_policy_params.schema.json
│  │  └─ user_profile.schema.json
│  └─ workflows/publish_workflow_default.json
└─ regions/shanghai_dsl_v1/          ← 地区资产：按地区打包
   ├─ rules/                         ← 24条上海规则（每条一份JSON）
   ├─ params/policy_params_shanghai_base.json
   ├─ rule_sets/rule_set_shanghai_plan_v1.json
   ├─ tests/rule_examples_as_tests.json
   └─ rules_manifest.json            ← 地区Manifest（地区发现入口）
```

## 规则格式标识

规则格式的唯一规范值是 `SOCILA-DSL-1.0`（`socila_rule_dsl.schema.json` 以 `const`
钉死）。`dsl_version` 只表示JSON格式版本，不编码地区或政策内容版本；地区由
Manifest的 `jurisdiction_code` 表达（上海固定 `310000`），资产版本由
`bundle_version` 与规则/参数实体版本独立递增。

## 地区发现

地区发现器读取 `dsl/regions/*_dsl_v1/rules_manifest.json`
（实现：`src/lib/dsl/region-manifest.ts`），校验Manifest与实际文件集合一致后，
把 `jurisdiction_code` 与资产路径交给Seed装载。新增地区只需新增
`dsl/regions/<slug>_dsl_v1/` 目录与Manifest，不复制或修改协议Schema，
也不修改装载代码（SDL-AC-002）。

## 生产Seed

`npm run seed` 通过地区Manifest发现并装载资产；生产Seed只包含已完成权威引用
审核的地区正式资产。广东、四川的示例包与参数（`GD-EXAMPLE-BASE`、
`SC-EXAMPLE-BASE` 及四个示例参数）自09-05起仅存在于测试夹具
（`src/server/modules/policy/__tests__/fixtures/regional-examples.ts`），
生产Seed不再写入。
