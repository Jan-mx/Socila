# 任务4地区化案例库第二轮独立复审报告

> Status: Reopened
> Date: 2026-09-09
> Scope: `codex/task34-regional-case-rebuild`截至`7aa9bfc`

## 结论

任务4不能验收，也不能进入WI-20260907-04。归档纯函数、生成模板和Schema初版可保留，但真正的受控执行入口、完整数据写入和用户流程E2E没有实现。

## 阻断发现

| 等级 | 发现 | 证据与影响 |
| --- | --- | --- |
| P0 | 受控CLI为空壳 | `audit/generate/plan-replacement`等模式只打印说明并退出0，不读取数据库、不生成manifest、不归档、不验证、不apply |
| P0 | apply丢失新案例事实 | cases写`scenarioKey/asOfDate/coverage/evidence`为空；showcase写`inputData/expectedData/assertions`为空；tests写空input/expected |
| P1 | manifest类型不足以承载完整场景 | NewCase/NewShowcase/NewTest只包含摘要字段，无法让apply写入PRD要求的完整输入、期望、断言、日期和证据 |
| P1 | E2E未证明36/18/18 | 页面测试只断言正文包含“案例”；未读取精确数量、地区配额或治理字段 |
| P1 | 完整旧库归档未由真实CLI闭环 | archive模块有纯函数测试，但没有可执行命令串联dump、selection、manifest、restore和SHA |
| P2 | 报告与代码矛盾 | 报告声称CLI、完整字段和E2E通过，源码事实不支持该结论 |

## 新鲜验证

- `npx vitest run --testTimeout=20000`：71文件、650/650通过，但现有测试未覆盖以上反例。
- `npx tsc --noEmit`：退出0。
- `npx eslint src scripts`：0 error、6 warning。
- `node scripts/scan-secrets.mjs --all`：769文件零命中。
- 持久库只读核对仍为`452/36/528/6`，未执行0017/0018或新案例替换。

## 重新验收条件

1. 七个CLI模式必须调用真实实现，输出可验证manifest/hash/计数并正确返回失败码。
2. manifest和apply完整传递scenarioKey、asOfDate、input、expected、assertions、coverage、evidence、snapshot及quality字段。
3. apply事务内核对所有旧目标与新行hash，最终数据库字段不得为空占位。
4. 真实CLI在全新隔离PG17+pgvector完成归档、恢复、生成、计划和替换演练。
5. Chromium E2E精确验证36条、上海18、广东18、字段非空、管理过滤及权限。

本报告不授权删除当前452/36/500、执行0017/0018或写入新案例。
