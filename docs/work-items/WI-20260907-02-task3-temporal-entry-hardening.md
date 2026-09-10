# WI-20260907-02：任务3快照时态与真实入口加固

> Author: Jan
> Status: Accepted（2026-09-09第二轮修复验收）
> Updated: 2026-09-09

## Work Item

- ID：WI-20260907-02
- 关联PRD：`docs/prd/09-05-feature-jurisdiction-aware-planning.md`
- 关联需求：JRP-FR-001～029、JRP-NFR-001～010、JRP-AC-001～012
- 决策：ADR-0011
- 前置：任务2首期Accepted；任务3分支提交`24b0119`、`33af7ad`可复用

## 背景与证据

独立复审已确认新会话地区确认404、`claim_city_code`缺失、2026快照回答2030、伪完整门禁、无历史重放、无停用和无直接规划页面。持久库已执行0015并存在上海、广东active记录；本Work Item只修代码和隔离测试，不重复激活。

## 范围

- 将任务3/4分支按93b2b63共同基线串行引入专用集成分支。
- 修复会话预创建、地区确认、领取地市代码和双入口。
- 新增日期快照区间、完整发布门禁、执行期hash重验、停用和历史重放。
- 保留0015/0016历史SQL；组合journal并新增0017。
- 补目标单元、DB集成和专用Chromium E2E。

## 非目标

- 不生成案例、不修改政策含义、不处理四川权威缺口。
- 不修改本机持久迁移账本，不创建/激活持久快照，不开放新流量。
- 不创建PR或合并main。

## 实现要求

1. 新会话由认证API持久创建后才允许地区确认。
2. `profile.claim_city_code`必须经地区树确认属于广东地级市；内部名称由服务端生成。
3. 规划按日期匹配唯一active区间；数据库拒绝同地区区间重叠。
4. 激活必须真实执行引用、Schema、依赖、冲突、黄金、双重重放和内容hash门禁。
5. 计算期重算snapshot成员hash并核对完整gateResults。
6. 历史重放使用plan保存的snapshot ID/hash/asOfDate。
7. 停用不删除snapshot或历史plan。
8. 0017源journal为idx16/1788796800000；持久账本repair只提供audit/guard实现。

## 测试矩阵

| 场景 | 通过条件 |
| --- | --- |
| 新会话先选地区 | 服务端会话已存在，确认200且owner正确 |
| 广东领取地市 | 有效代码产生金额；缺失/未知/跨省不估算 |
| 2026/2030 | 命中不同snapshot，分别得到能力级缺口和30/25 |
| 区间异常 | 缺失/重叠均409且零plan |
| 门禁/hash | 缺项、伪pass、成员篡改均拒绝 |
| 历史重放 | 切换当前snapshot后旧plan逐字节一致 |
| 停用/隔离 | 停用GD不影响SH；四川始终unsupported |
| 双入口 | 聊天与直接页面同一契约 |

## 验收与回退

- 所有JRP验收项有真实路径和新鲜Red/Green。
- 组合migration从零执行两次；0015/0016 SQL hash不变。
- 完整门禁零skip；既有warning如实记录。
- 代码失败回退本Work Item提交即可；未授权任何持久写入。

## 文档同步

- 任务3 PRD、README、PROGRESS、ARCHITECTURE、TESTING、OPERATIONS、traceability和任务3复审报告。

## 验收记录（2026-09-08）

2026-09-08报告声称上述行为已完成；2026-09-09复审保留该报告作为历史记录，但发现空黄金测试集仍可通过、停用接口未校验路径地区、历史重放未比较快照行`contentHash`。这些反例修复前本Work Item不得Accepted。

## 验收记录（2026-09-09第二轮修复）

2026-09-09复审三项P1全部修复并取得专用反例证据，本Work Item**Accepted**：

1. **空黄金测试集拒绝**：`release-gates.ts`对`loadTests`空数组记`golden_tests={fail:"快照没有任何适用黄金测试"}`并`ok=false`（Red：旧实现空集合错误记pass；Green后拒绝）。
2. **停用路径地区一致性**：`deactivateJurisdictionRelease`新增`jurisdictionCode`输入，读取release记录后先校验`记录地区===URL地区`，不一致抛`ReleaseJurisdictionMismatchError`且不调用`deactivateById`（零写入）；路由把路径`code`传入并映射409（含url/record代码）。广东URL+上海releaseId被拒绝且上海保持active。
3. **三方hash不一致**：`replayPlan`同时比较plan保存hash、快照行`contentHash`、成员重算规范化hash，任一不一致（或保存hash缺失）抛`ReplaySnapshotDriftError` fail-closed（不产生规划结果）；`computeJurisdictionPlan`保存plan时写入`snapshotContentHash`（JRP-FR-009）。
4. **真实历史重放逐字节比较**：集成测试切换活动快照后重放旧plan按原snapshot逐字节一致、`drift.drifted=false`；E2E经`POST /api/plan/:id/replay`返回200与snapshotId且三方一致。
5. **隔离DB零skip**：全新PG17+pgvector库`task34r2_drill`，命令显式`SOCILA_TEST_DATABASE_URL`；migration×2/bootstrap×2/seed×2幂等，`npm run test:db` 25文件/116通过零skip，`pytest -m integration` 20通过零skip。
6. **Chromium E2E**：`e2e/task3-regional.spec.ts` 6例全过（新会话预创建/聊天与`/plan/new`同契约/claim_city_code/四川不可选/历史replay/跨地区停用拒绝/停用后unsupported），配套`scripts/e2e-task3-setup.ts`预创建沪粤快照并真实七道门禁激活；全套19/19。
7. **P2超时稳定化**：`identity-container.test.ts`模块重载用例显式30秒超时并记录正式策略。

门禁汇总：`npm test` 71文件/655、`test:db` 116/116、E2E 19/19、tsc/eslint退出0（0 error、6条既有warning）、`npm run build`退出0（1条既有warning：`citation-verifier.ts`动态fs访问，基线stash复现确认非本次引入）、ruff/mypy/pytest 94+20零skip、pip-audit无已知漏洞、scan-secrets 772文件零命中、Gitleaks 8.29.1完整历史79 commits no leaks、allowlist哨兵3场景全过。0017只在隔离库执行；持久账本repair、日期快照调度、激活/停用未授权执行。
