# WI-20260907-02：任务3快照时态与真实入口加固

> Author: Jan
> Status: Accepted（2026-09-08；分支`codex/task34-regional-case-rebuild`提交`fix: 补齐地区规划时态与真实入口`）
> Updated: 2026-09-08

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

全部测试矩阵场景取得专用Red/Green与Chromium E2E证据（验收报告：`reports/feature-09-05-jurisdiction-planning/acceptance-report.md`）：新会话预创建确认200、广东领取地市有效代码产生金额而缺失/未知/跨省不估算、2026/2030命中不同snapshot区间、缺失/重叠均409零plan、门禁缺项/伪pass/成员篡改均拒绝、历史plan切换当前快照后逐字节重放、停用广东不影响上海、四川始终unsupported、聊天与`/plan/new`同一契约。0017仅在隔离库执行；持久库未修改。
