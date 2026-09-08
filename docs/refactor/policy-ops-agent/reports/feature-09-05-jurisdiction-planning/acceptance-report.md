# 任务3用户规划按地区快照触发验收报告

> Status: Reopened（2026-09-09复审）
> Branch: `codex/task34-regional-case-rebuild`
> Baseline: `93b2b63`（WI-20260907-02按共同基线集成）
> Scope: WI-20260907-02（任务3快照时态与真实入口加固）

## 当前结论

2026-09-07独立复审指出的P1缺陷曾被报告为已修复；2026-09-09复审发现空黄金测试集仍可通过、停用接口未绑定路径地区、历史重放未比较快照行`contentHash`。任务3 Feature保持**Reopened**；历史代码与持久执行记录保留为审计事实。

历史背景：`24b0119`/`33af7ad`实现地区画像、0015、发布记录与快照编排；复审发现新会话404、`claim_city_code`缺失、2026快照回答2030、伪完整门禁、无历史重放、无停用和无直接规划页面，原Accepted结论撤销（[复审报告](./review-report-2026-09-07.md)）。

## 2026-09-08历史报告：修复内容（当前验收已撤回）

| 复审发现 | 修复 |
| --- | --- |
| P1 新会话地区确认404 | `POST /api/conversations`认证预创建（`create-conversation.use-case.ts`）；ChatPanel与`/plan/new`先创建会话再显示选择器 |
| P1 无`profile.claim_city_code` | 公开Schema（`plan-input.ts`）与AI工具（`tools.ts` computePlan）接收六位行政代码；服务端`claim-city.ts`规范化21个广东地级市→规则内部`claim_city`；缺失/未知/跨省不估算 |
| P1 2026快照回答2030 | 0017快照区间`effective_from/effective_to`（EXCLUDE同地区active不重叠）；按`jurisdiction_code+as_of_date`唯一选择；`snapshot-slices.ts`确定性时间片派生（广东2026窗口与2030窗口，2030男30/女25） |
| P1 激活伪门禁 | `release-gates.ts`七道真实门禁（引用/Schema/参数依赖/冲突/黄金测试/双重重放/成员规范化hash）；gateResults逐项真实记录，伪造`snapshot_replay=pass`不能绕过 |
| P1 compute不验hash/门禁 | 每次计算重算成员hash与快照contentHash核对，并确认七键gateResults全部pass（fail-closed） |
| P1 无历史重放 | `POST /api/plan/:id/replay`按保存snapshotId+hash+asOfDate真实重放并返回漂移结论（`replay-plan.use-case.ts`） |
| P1 无停用/直接页面 | `DELETE /api/admin/jurisdictions/:code/releases/:releaseId`停用单一区间（不删快照/plan）；`/plan/new`直接规划页与聊天同一确认契约（复用JurisdictionSelector与确认API） |
| P2 验收报告表述 | 本报告只记录代码与隔离库证据；持久库0017与快照调度未执行、待WI-20260907-04授权 |

## 2026-09-08历史报告：迁移与隔离

- `drizzle/0015_jurisdiction_planning_releases.sql`（SHA-256 `4ac11ead…bd801`）与`drizzle/0016_clg_case_governance.sql`（SHA-256 `3a9adc91…30dfd5`）内容未改写（`jrp-0017-migration.integration.test.ts`哈希不变量断言）。
- 新增`drizzle/0017_jurisdiction_snapshot_schedules.sql`（journal idx16/`1788796800000`）：`effective_from/effective_to`列、active闭合定义CHECK、同地区active不重叠EXCLUDE（btree_gist）、`(jurisdiction_code, effective_from)`唯一索引、`plans.snapshot_content_hash`。
- 组合journal从零执行两次幂等（本机隔离库`task34_drill*`，非持久库）；持久库0017未执行。
- 快照内容hash语义统一（snapshot-service与release-gates共用canonical：Date→ISO、键排序、成员按entityType+businessKey确定性排序），执行期重算可复现。

## 2026-09-08历史报告：当时记录的测试证据

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| Node单元 | `npm test` | 592 passed / 63 files，0 skip |
| TypeScript | `npx tsc --noEmit` | 退出0 |
| ESLint | `npx eslint src` | 0 error（4条既有warning：admin rules页hook依赖、两个集成测试未用导入——非本次引入） |
| 生产构建 | `npm run build` | Compiled successfully（standalone） |
| DB集成 | `npm run test:db`（全新PG17+pgvector+btree_gist，migration×2+seed） | 102 passed / 22 files，0 skip |
| Auth E2E | `npm run test:e2e:auth`（standalone+全新库） | 10 passed |
| 任务3 Chromium E2E | `e2e/task3-regional.spec.ts`（JRP-AC-001/006/010/017） | 3 passed（合计13 passed） |
| Python单元 | `uv run ruff check .`、`uv run mypy agent`、`uv run pytest -m "not integration"` | 全部通过（94 passed） |
| pip-audit | `uv run pip-audit` | 本机代理无法连接PyPI（环境阻塞，与既有09-03记录一致；依赖集零diff） |
| scan-secrets | `node scripts/scan-secrets.mjs --all` | clean（721文件零命中） |
| Gitleaks | 8.29.1完整历史（bundle克隆74 commits） | no leaks found |
| allowlist哨兵 | `node scripts/verify-gitleaks-allowlist.mjs` | 全部通过 |

任务3专用测试（均为Red→Green驱动）：

- `src/server/modules/conversation/application/__tests__/create-conversation.use-case.test.ts`（4）：认证预创建、匿名拒绝、仓储失败、归属防御。
- `src/server/modules/planning/application/__tests__/claim-city.test.ts`（8）：21地级市映射、缺失/未知/跨省/非广东不估算。
- `src/server/modules/planning/application/__tests__/jurisdiction-compute.use-case.test.ts`（21）：区间选择、日期fail-closed、执行期hash/gateResults重验、claim_city注入。
- `src/server/modules/planning/application/__tests__/jurisdiction-compute.integration.test.ts`（7）：上海快照→激活→规划留痕、四川unsupported、聊天一致性、广东2030年前needs_agent、快照切换、停用不影响上海、历史重放。
- `src/server/modules/planning/application/__tests__/replay-plan.use-case.test.ts`（7）：owner重放、漂移结论、归属/缺失/快照删除fail-closed、确定性。
- `src/server/modules/publishing/application/__tests__/release-gates.test.ts`（9）：七道门禁真实执行、伪造pass不能绕过、hash漂移拒绝。
- `src/server/modules/publishing/application/__tests__/jurisdiction-release.use-case.test.ts`（14）：激活带区间、门禁失败、停用、区间校验。
- `src/server/modules/publishing/application/__tests__/snapshot-slices.test.ts`（4）：2026/2030时间片派生、确定性、边界。
- `src/server/modules/policy/__tests__/jrp-0017-migration.integration.test.ts`（5）：区间列、闭合CHECK、EXCLUDE不重叠、多区间共存、0015/0016哈希不变量。
- `src/lib/ai/__tests__/tools-jurisdiction.test.ts`（12，含新增3）：claim_city_code契约、自由文本拒绝、strict未知字段。
- `e2e/task3-regional.spec.ts`（3）：新会话确认不404、`/plan/new`同契约、四川不可选+广东代码输入。

## 未授权动作（保持未执行）

- 持久库0017迁移、日期快照调度、快照激活/停用、账本repair：全部待WI-20260907-04在fresh audit后经用户明确授权执行。
- 本机持久库（`socila-postgres/policyops`）未被修改；所有集成测试仅使用隔离库。

## 2026-09-09复审结论

详细代码证据与重新验收条件见[第二轮独立复审报告](./review-report-2026-09-09.md)。

- 本次默认`npm test`曾因5秒测试超时失败；提高超时后650/650通过，只能说明环境抖动已被复现和绕过。
- 本次环境缺少`SOCILA_TEST_DATABASE_URL`，`npm run test:db`无法独立复现报告中的114/25零skip证据。
- 任务3必须先补空黄金测试集、停用路径地区绑定和三方snapshot hash校验，再重新取得隔离DB/E2E证据。

## 当前Definition of Done对照（2026-09-09）

- 未通过：JRP-FR-007/JRP-AC-007的空黄金测试集fail-closed反例。
- 未通过：JRP-FR-027/JRP-AC-009的停用路径地区与release记录地区一致性。
- 未通过：JRP-FR-028/JRP-AC-008的保存hash、快照行hash和成员重算hash三方一致性。
- 未复核：显式全新隔离数据库下的完整DB门禁零skip，以及覆盖上述反例的Chromium E2E。
- 仍满足权限边界：0017只允许在隔离库验证；持久账本repair、快照调度和激活/停用未获本轮授权。
- README、PROGRESS、ARCHITECTURE、TESTING、OPERATIONS、traceability与复审报告同步。
