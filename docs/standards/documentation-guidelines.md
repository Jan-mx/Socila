# Socila文档归类与维护规范

> Author: Jan
> Status: Active
> Updated: 2026-09-01

## 目标

让产品需求、实现任务、当前事实、执行证据和历史资料各有唯一位置。Agent只读取当前任务所需文档，不依赖聊天历史，也不批量加载无关报告。

## 分类

| 内容 | 位置 |
| --- | --- |
| 产品、大型功能、阶段需求 | `docs/prd/` |
| 中型任务 | `docs/work-items/` |
| 当前仓库架构 | `docs/architecture.md` |
| 重构计划、路线图和进度 | `docs/refactor/<project>/` |
| 通用规范和模板 | `docs/standards/` |
| 测试和验收结果 | 对应项目`reports/` |
| 被替代文档 | 对应项目`archive/` |

## 任务规格

- 明确Bug、文档修正和无行为变化的内部重构不要求新PRD。
- 中型任务使用Work Item。
- 新用户流程、跨服务契约、Schema、权限或数据边界使用Feature PRD。
- 跨多个里程碑的改造使用Stage PRD。
- 重要技术取舍使用ADR。

## 测试与事实记录

- PRD和Work Item定义测试场景和验收标准。
- 实现前从需求ID推导或更新测试；功能和Bug修复遵循Red-Green-Refactor。
- `traceability.md`记录需求、实现位置、测试路径和验收报告。
- `PROGRESS.md`只记录执行事实、证据、阻塞和下一步。
- TDD Skill可以辅助执行，但不是项目事实源。

## README状态同步

所有新建或实质重写的活跃文档作者为Jan。README必须包含Author、Status和Updated。

```text
Draft → Updating → Active
                    ├─ Superseded
                    └─ Archived
```

- 新建README使用`Draft`。
- 开始修改受影响目录时改为`Updating`。
- 验收完成后同步为`Active`并更新日期。
- 任务阻塞时保持`Updating`，不得伪报完成。
- 被替代和仅供历史查阅时分别使用`Superseded`和`Archived`。

## 命名

- PRD：`MM-DD-name.md`，日期为首次创建日期，后续不重命名。
- Work Item：`WI-YYYYMMDD-NN-name.md`。
- ADR：`ADR-NNNN-name.md`。
- 文件名使用小写英文和连字符；完整年份保存在文档元数据和Git历史。

## 内容原则

- 一个事实只维护一个当前权威版本。
- README做导航，避免复制正文。
- 当前文档链接报告证据，不粘贴完整执行日志。
- archive和reports不作为默认阅读材料。
- 归档通过Git rename保留历史，不改写当时结论。
- 不提交密钥、local配置、生产备份和用户数据。
