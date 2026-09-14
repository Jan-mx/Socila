# 任务3地区感知规划第二轮独立复审报告

> Status: Reopened
> Date: 2026-09-09
> Scope: `codex/task34-regional-case-rebuild`截至`7aa9bfc`

## 结论

任务3不能验收。新会话、领取地市、日期区间和直接规划页面的主体实现可保留，但发布门禁、停用边界、历史重放完整性和可复核DB证据仍有阻断缺口。

## 阻断发现

| 等级 | 发现 | 证据与影响 |
| --- | --- | --- |
| P1 | 空黄金测试集被记为PASS | `release-gates.ts`在`loadTests()`返回空数组时`goldenErrors=[]`，直接写`golden_tests=pass`；无测试地区可绕过黄金门禁 |
| P1 | 停用接口未绑定路径地区 | 路由读取`code`后直接丢弃，只按releaseId停用；管理员可用广东路径停用上海记录 |
| P1 | 历史重放hash校验不完整 | replay只用保存hash与重算hash计算drift，未要求快照行`contentHash`与重算hash一致 |
| P1 | DB门禁不可独立复现 | 本次环境缺少`SOCILA_TEST_DATABASE_URL`；`npm run test:db`出现skip和失败，不能确认报告的114/25零skip |
| P2 | 默认单测对负载敏感 | 默认5秒超时出现1失败；`--testTimeout=20000`后71文件650/650通过，需要稳定化或记录正式门禁超时策略 |

## 新鲜验证

- `npx vitest run --testTimeout=20000`：71文件、650/650通过。
- `npx tsc --noEmit`：退出0。
- `npx eslint src scripts`：0 error、6 warning。
- `node scripts/scan-secrets.mjs --all`：769文件零命中。
- 持久库只读核对：Drizzle 16条，cases/showcase/tests/snapshots=`452/36/528/6`；未执行0017/0018。

## 重新验收条件

1. 空黄金测试集必须fail-closed并有Red/Green。
2. 停用用例和路由同时校验releaseId、URL地区和记录地区。
3. replay比较保存hash、快照行hash和重算hash，任一不一致明确失败或返回完整漂移结论。
4. 在命令中显式创建并传入全新隔离PG17+pgvector URL，完整DB测试零skip。
5. 专用Chromium E2E覆盖真实replay、跨地区停用拒绝和支持/不支持地区。

本报告不授权持久库migration、快照调度、激活、停用或账本repair。
