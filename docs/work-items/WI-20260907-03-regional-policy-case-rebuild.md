# WI-20260907-03：地区化政策案例生成与可靠归档重建

> Author: Jan
> Status: Reopened（2026-09-09第三轮复审）
> Updated: 2026-09-09

## Work Item

- ID：WI-20260907-03
- 关联PRD：`docs/prd/09-05-feature-case-library-governance.md`
- 关联需求：RCL-FR-001～022、RCL-NFR-001～008、RCL-AC-001～015
- 决策：ADR-0011
- 前置：WI-20260907-02 Accepted；修复后的上海/广东日期快照可在隔离库重放

## 背景与证据

原任务4的case-library归档SHA不是文件内容SHA，选择报告缺失、恢复报告仍pending、manifest未绑定内容，81条展示归档hash为`pending`，452/36质量分为空。第二轮修复虽实现CLI和场景字段，但第三轮复审确认旧regression hash、恢复证明、SHA精确覆盖、42 example原子同步和manifest自校验仍未实现，因此本Work Item重新Reopened。

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

- 最终隔离库计数为`N/36/N+42`，N来自覆盖manifest；必须由真正CLI执行并核对完整场景字段。
- 0018执行两次幂等且0016 SQL hash不变；CLI每个模式必须有真实执行输出和失败反例。
- 完整门禁零skip；归档正文和凭据不进入Git或日志。
- 本Work Item只交付代码、生成资产和隔离证据；持久替换失败时无需数据库回退。

## 文档同步

- 任务4 PRD、README、PROGRESS、ARCHITECTURE、TESTING、OPERATIONS、traceability和任务4复审报告。

## 历史验收记录（2026-09-09第二轮结论已撤回）

1. **受控CLI七模式真实执行**：`scripts/rcl-case-library.ts`调用`executor.ts`七动作，输出可验证JSON并按失败原因返回非零退出码；默认只读audit；apply必须`--i-am-authorized`。
2. **完整场景字段**：manifest类型承载scenarioKey/asOfDate/input/expected/assertions/coverage/evidence；0018追加cases.input/expected/assertions列；apply逐字节落库且事务内fail-closed校验（空占位拒绝零写入）。
3. **真实CLI闭环**：隔离库audit→generate→plan→prepare-archive（真实pg_dump）→真实恢复演练（第二实例pg_restore+reconcile全表对账+verified restore-report+重算sha256sums）→verify-archive→apply（删851/500插36/36/36）→verify（36/36/78、沪粤18/18、配额、字段非空）。
4. **行内容hash绑定**：plan与apply统一行内容重算hash比较，任一漂移拒绝零写入（RCL-AC-003）。
5. **golden语义**：激活门禁只加载source=example黄金测试（RCL-FR-007）。
6. **E2E**：`e2e/task4-case-library.spec.ts`精确36/18/18、治理字段、管理active过滤、归档权限；全套19/19。

门禁历史记录：`npm test` 72文件/663、`test:db` 26文件/129零skip、E2E 19/19、tsc/eslint 0 error、build退出0（1条既有warning）、Python 94+20零skip、Gitleaks/scan-secrets/哨兵全过。第三轮复审发现测试允许空旧test hash和伪verified恢复报告通过，故该记录不再构成当前验收。

## 第三轮复审（2026-09-09）

- 旧500 regression在manifest及归档条目中的`contentHash`全部为空，apply只校验`sourceCaseUid`。
- `verify-archive`未验证restore正文、SHA清单精确覆盖、selection配额和manifest重算hash。
- `assertRclCounts`接受任意example数量；当前持久执行在manifest生成后、apply事务外删除7条example。
- 修复上述反例并取得随机端口隔离DB零skip证据前不得Accepted。
