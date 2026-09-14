# ADR-0008：Gitleaks测试合成值allowlist配置

- 状态：Superseded（被ADR-0009替代）
- 日期：2026-09-05
- 影响阶段：09-05-feature-socila-naming-regional-dsl
- 关联：PRD `docs/prd/09-05-feature-socila-naming-regional-dsl.md` SDL-NFR-007、`.gitleaks.toml`、`.gitleaksignore`

## 背景

09-05执行Gitleaks 8.29.1完整历史扫描（40 commits）时发现19条命中，全部来自提交`35d673c`（09-03服务JWT Feature）及其后续路径迁移：

1. `testdata/service-jwt-vectors.json`：`jwt`规则命中15条——SJWT跨语言契约的**固定合成向量**（文件自述"testSecrets为测试专用固定值，非生产Secret"，Secret为明文占位值）；
2. 三个集成测试文件：`generic-api-key`命中4条——`sjwt-*-secret-0123456789-abcdef-…`明显占位测试Secret（current/previous/forged三态）；
3. 上海dsl规则JSON（R-500/R-510/R-540）：`generic-api-key`命中——决策表业务字段名（形如`"key": "calc.subsidy.<字段>"`，不在此引用完整字面量），与`.gitleaksignore`既有5个fingerprint基线为同一批已核实误报；09-05目录迁移（`dsl/ssp_dsl_v1`→`dsl/regions/shanghai_dsl_v1`）后旧fingerprint不再匹配新路径。

上述命中在历史提交中已存在，但因完整历史扫描自09-03 P0验收后未随SJWT Feature重新执行而未暴露。

## 决策

1. 新增仓库根`.gitleaks.toml`：`[extend] useDefault = true`保留完整默认规则集，仅追加一个精确范围的`[allowlist]`——`rules = ['^jwt$', '^generic-api-key$']` × 7个精确文件路径（上述测试向量、测试占位Secret、三个dsl规则JSON）。
2. 不采用逐条fingerprint忽略 vectors 文件：fingerprint绑定提交SHA，契约向量随服务身份切换必然重签，逐提交维护fingerprint不可行且无法覆盖未来合法修改；路径+规则的精确allowlist对历史与未来提交稳定生效。
3. `.gitleaksignore`保留原有5个fingerprint基线不动；本清单不排除任何生产代码、配置或真实Secret路径；任何新增命中仍必须阻断并人工核实。

## 影响

- 检测能力不降低：默认规则集全部保留，allowlist仅限7个测试资产路径上的2类已核实误报规则。
- 本地与CI（gitleaks-action v3自动识别`.gitleaks.toml`）行为一致；2026-09-05复测40 commits零发现。

## 替代记录（2026-09-05）

复审实测（Gitleaks 8.29.1 `--log-level=trace`）推翻本决策的安全结论：旧式全局`[allowlist]`以`condition=OR`按路径**整文件跳过**（`skipping file: global allowlist`），allowlist文件中匹配其他规则的Secret将漏检，不满足"检测能力不降低"。纠正决策见`ADR-0009-Gitleaks目标规则allowlist与哨兵回归.md`（`[[allowlists]]`+`targetRules`+`condition="AND"`+自动化哨兵回归）。本决策的核实记录（19条命中均为测试合成值）仍然有效。
