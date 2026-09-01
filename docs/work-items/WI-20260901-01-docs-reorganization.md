# WI-20260901-01：Docs目录重组

> Author: Jan
> Status: Accepted
> Updated: 2026-09-01

## 关联

- 类型：中型文档治理任务
- 产品：PolicyOps Agent
- 分支：`refactor/policy-ops-agent-platform`
- 用户指令：精简PolicyOps目录、建立统一PRD与README规范、保留测试报告并推送远端

## 背景

PolicyOps目录同时保存当前事实、阶段PRD、memory-bank、模板和大量报告。Agent启动时被要求读取多份长文档，当前状态与历史状态容易混淆，通用模板也被放在项目专属目录中。

## 目标

- 建立`docs/prd`、`docs/work-items`和`docs/standards`。
- 将历史PRD、memory-bank和ADR原样归档。
- 保留PolicyOps测试、验收、迁移和发布报告。
- 为PolicyOps建立精简的当前计划、路线图、进度、架构、测试和运维文档。
- 统一README作者和状态同步规范。
- 更新`.gitignore`、Agent读取路径和受影响引用。

## 非目标

- 不修改业务逻辑、数据库Schema或运行时接口。
- 不删除历史验收证据。
- 不改写历史报告作者和当时结论。
- 不创建PR或合并main。

## 迁移规则

| 原内容 | 目标 |
| --- | --- |
| 总体PRD | 原文归档；当前事实提炼到`docs/prd/09-01-policy-ops-agent.md` |
| 七份阶段PRD | `archive/stage-prds/` |
| memory-bank | `archive/memory-bank/`，当前事实合并到六份核心文档 |
| ADR | `archive/decisions/`，有效结论合并到当前架构 |
| 通用模板 | `docs/standards/templates/` |
| traceability和文档验收报告 | `reports/` |
| 阶段报告 | 保持在PolicyOps `reports/` |

## 测试矩阵

| 类型 | 验证 |
| --- | --- |
| 结构 | 目标文件和目录全部存在，历史文件通过Git rename或内容保全副本留存 |
| 状态 | 活跃README全部为Active，Work Item最终为Accepted |
| 命名 | PRD符合`MM-DD-name.md` |
| 链接 | Markdown相对链接和代码围栏有效 |
| 引用 | 活跃文件不存在失效的旧路径 |
| 安全 | local env和interview保持忽略，Secret扫描无真实命中 |
| 回归 | Node/Python测试、Lint、类型检查和生产构建通过 |

## 验收场景

- Given一个新Agent，When开始PolicyOps任务，Then只需通过项目README按任务读取当前事实。
- Given需要历史阶段证据，When进入reports或archive，Then可以找到原始PRD、ADR和验收报告。
- Given新增PRD，When按规范命名，Then文件名以首次创建月日开头。
- GivenREADME所属任务验收完成，When提交前检查，Then不存在Draft或Updating状态。

## 回退

提交前可通过Git恢复路径迁移；提交后可整体revert本次文档提交。归档原文不做内容修改，回退不依赖外部数据。

## 完成条件

- 所有迁移、当前文档、README和引用更新完成。
- 验收命令有新鲜成功证据。
- Work Item状态更新为Accepted。
- 创建单一文档提交并推送当前上游分支。

## 验证结果

| 验证 | 结果 |
| --- | --- |
| Markdown相对链接与围栏 | PASS；排除Git忽略的interview后0断链、0围栏错误 |
| README元数据和状态 | PASS；活跃README均为Author Jan、Status Active |
| PRD命名 | PASS；`09-01-policy-ops-agent.md`符合规范 |
| Gitignore与私有文件 | PASS；interview和`*.local.env`保持忽略且未跟踪 |
| Node测试 | PASS；160通过、18按环境跳过 |
| Python测试 | PASS；37通过、6跳过，2项非阻断依赖/marker警告 |
| ESLint / TypeScript | PASS；退出码0 |
| 生产构建 | PASS；Next.js 16.3.3构建成功 |
| Secret扫描 | PASS；475个候选文件无密钥模式命中 |
