# ADR-0009：Gitleaks目标规则allowlist与哨兵回归

- 状态：Accepted
- 日期：2026-09-05
- 影响阶段：09-05-feature-socila-naming-regional-dsl（复审纠正）
- 替代：ADR-0008（标记Superseded；其"19条命中均为测试合成值"的核实记录仍然有效）

## 背景

ADR-0008采用旧式全局`[allowlist]`（`rules`×`paths`）。复审实测（Gitleaks 8.29.1，
`--log-level=trace`）推翻其安全结论：旧式全局allowlist按路径以`condition=OR`
**整文件跳过**（trace：`skipping file: global allowlist`）——被允许路径上匹配
**其他规则**的Secret将一并漏检，违反SDL-NFR-007"检测能力不降低"。

## 决策

1. `.gitleaks.toml`改用现代`[[allowlists]]`数组形式：每个allowlist显式声明
   `targetRules`（仅jwt或仅generic-api-key）+ 精确路径正则 + `condition = "AND"`。
   忽略范围收窄到"指定规则×指定文件"——同文件中其他规则的发现照常报告。
2. 新增自动化哨兵回归`scripts/verify-gitleaks-allowlist.mjs`（并接入CI
   security-gates），以Gitleaks 8.29.1在临时git仓库中断言三件事：
   已核实误报通过（exit 0）；同一允许路径上加入其他规则的合成哨兵必须被检测
   （exit非0且报告发现）；trace无`skipping file: global allowlist`。哨兵值为
   内容自述synthetic的假PEM（private-key-header规则命中，92字符base64体），
   非真实凭据；脚本自身经拆分拼装PEM头，避免scan-secrets自命中。
3. allowlist范围不扩大：不排除生产代码、配置或目录；历史命中一律走
   `.gitleaksignore`逐条fingerprint（本次新增1条：ADR-0008第14行引用的
   DSL业务字段名样例，与dsl规则JSON同一批已核实误报）。

## 影响

- 检测能力恢复"不降低"：allowlist只对7个测试资产路径上的2类已核实规则生效；
  哨兵回归证明同路径其他规则（private-key-header）正常报告。
- 命名契约扫描器（`src/lib/naming/socila-naming-contract.ts`）同步采用
  "精确片段剥离"语义：允许文件中的精确旧协议值不触发宽泛品牌规则，
  独立品牌标识仍被阻断。
