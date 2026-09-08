# WI-20260907-03：地区化政策案例生成与可靠归档重建

> Author: Jan
> Status: Accepted（2026-09-08；分支`codex/task34-regional-case-rebuild`提交`feat: 重建地区化政策案例库`）
> Updated: 2026-09-08

## Work Item

- ID：WI-20260907-03
- 关联PRD：`docs/prd/09-05-feature-case-library-governance.md`
- 关联需求：RCL-FR-001～022、RCL-NFR-001～008、RCL-AC-001～015
- 决策：ADR-0011
- 前置：WI-20260907-02 Accepted；修复后的上海/广东日期快照可在隔离库重放

## 背景与证据

原任务4的case-library归档SHA不是文件内容SHA，选择报告缺失、恢复报告仍pending、manifest未绑定内容，81条展示归档hash为`pending`，452/36质量分为空。旧Accepted结论无效。

## 范围

- 修复真文件SHA、归档文件完整性、恢复provenance和精确manifest。
- 从治理前dump在隔离库重建完整旧851/117/500档案。
- 新增上海/广东确定性场景模板、生成器、显式断言、覆盖manifest和质量分解。
- 策展36条公开案例，上海18、广东18。
- 新增0018修复Schema、批次状态和并发约束。
- 补完整单元、DB集成和专用Chromium E2E。

## 非目标

- 不使用LLM，不采集真实用户案例，不修改政策实体。
- 不执行持久库0018、删除、插入或归档状态写入。
- 不生成CN用户案例或四川用户案例。

## 实现要求

1. 归档文件全部存在后按真实字节计算SHA；sha清单不自包含。
2. restore report绑定来源dump、版本、扩展、表和sequence结果。
3. manifest绑定旧/新精确行、hash、snapshot、评分和测试来源。
4. 无可比较断言不得获得快照重放分。
5. case/showcase保存质量总分与逐项分解，多标签进入真实读取路径。
6. 0018固定为journal idx17/`1788796860000`；apply使用`FOR UPDATE`、`applying`状态和目标唯一约束。
7. 每个新case一条地区回归test；42条DSL示例完整保留。
8. 管理查询必须是`active AND filters`。

## 测试矩阵

| 场景 | 通过条件 |
| --- | --- |
| 文件篡改/缺失 | verify失败，批次不进入restore_verified |
| manifest漂移 | 任一行/hash/snapshot/来源变化均拒绝 |
| 真实恢复 | 完整旧851/117/500从本归档恢复一致 |
| 重复生成 | N、36、产物和manifestHash逐字节一致 |
| 地区/配额 | cases仅沪粤；showcase沪粤18/18且各项配额满足 |
| 质量/重放 | active/selected分数非空；无可比断言失败 |
| 并发apply | 一组成功，另一组确定性no-op |
| API/E2E | 公开36；管理active过滤；归档元数据权限正确 |

## 验收与回退

- 最终隔离库计数为`N/36/N+42`，N来自覆盖manifest。
- 0018执行两次幂等且0016 SQL hash不变。
- 完整门禁零skip；归档正文和凭据不进入Git或日志。
- 本Work Item只交付代码、生成资产和隔离证据；持久替换失败时无需数据库回退。

## 文档同步

- 任务4 PRD、README、PROGRESS、ARCHITECTURE、TESTING、OPERATIONS、traceability和任务4复审报告。
