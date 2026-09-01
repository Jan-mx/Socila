# Socila 文档中心

> Author: Jan
> Status: Active
> Updated: 2026-09-01

## 用途

本目录保存Socila项目的产品需求、架构、重构记录、开发任务、测试证据和文档规范。

文档应按职责归类，不在多个文件中重复维护同一事实。README负责导航，不复制被链接文档的正文。

## 目录说明

| 路径 | 用途 | 是否默认读取 |
| --- | --- | --- |
| `architecture.md` | 当前仓库级架构、组件和调用关系 | 架构任务读取 |
| `prd/` | 产品PRD、Feature PRD和Stage PRD | 产品或大型功能任务读取 |
| `work-items/` | 中型开发任务的轻量规格 | 执行对应任务时读取 |
| `refactor/` | 已完成或进行中的重构计划、进度、路线图和证据 | 对应重构任务读取 |
| `standards/` | 文档分类、作者、状态和模板规范 | 新建或整理文档时读取 |
| `interview/` | 本地面试材料，不是项目事实源 | 不读取，Git忽略 |

## 按任务选择文档

| 任务 | 应读取 |
| --- | --- |
| 产品行为或大型功能 | 对应PRD、项目README |
| 中型开发任务 | 对应Work Item、项目README |
| 架构、接口、Schema | `architecture.md`和项目架构文档 |
| 测试与质量 | 项目`TESTING.md`和相关PRD/Work Item |
| 部署与恢复 | 项目`OPERATIONS.md` |
| 查询当前状态 | 项目`PROGRESS.md` |
| 查询历史证据 | 项目`reports/`或`archive/` |

## 文档分类

- 小型Bug和无行为变化的重构不新建PRD；关联已有需求并补充测试。
- 中型任务创建Work Item。
- 大型功能创建Feature PRD。
- 跨多个阶段的能力创建Stage PRD。
- 重要技术决策创建ADR。
- 实际测试结果写入reports。
- 当前状态写入PROGRESS，不在PRD中追加执行日志。

## 文件命名

- PRD：`MM-DD-name.md`。
- Work Item：`WI-YYYYMMDD-NN-name.md`。
- ADR：`ADR-NNNN-name.md`。
- 验收报告：`acceptance-report.md`或`<task-name>-acceptance-report.md`。
- 文件名使用小写英文和连字符；日期使用文档首次创建日期。

## 作者与状态

所有新建或实质重写的活跃文档作者为Jan，并包含Author、Status和Updated元数据。

README在修改期间使用`Updating`，任务验收完成后必须同步为`Active`。被替代或归档时分别使用`Superseded`或`Archived`。

历史报告和原样归档文档不批量修改作者。

## 基本规则

- 一个事实只保留一个当前权威文件。
- 使用链接引用证据，不复制整段报告。
- README只提供目录说明和阅读路线。
- reports和archive不作为Agent默认阅读材料。
- 密钥、本地配置、备份和用户数据不得进入Git。
