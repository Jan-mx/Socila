# Work Item目录

> Author: Jan
> Status: Active
> Updated: 2026-09-06

## 用途

本目录保存中型开发任务的轻量规格。Work Item位于聊天指令和完整PRD之间，用于固定任务范围、测试、验收和回退要求。

## 使用条件

以下情况创建Work Item：

- 在现有架构内增加可观察行为；
- 修改一个或少量模块；
- 需要独立测试和验收；
- 不足以建立新的Feature PRD。

明确Bug、纯文档修正和无行为变化的内部重构可以不创建，但仍需关联需求和验证。

## 命名

```text
WI-YYYYMMDD-NN-english-slug.md
```

## 必需内容

- Author、Status、Updated；
- Work Item ID；
- 关联PRD和需求ID；
- 背景与证据；
- 范围与非目标；
- 实现要求；
- 测试矩阵；
- 验收场景；
- 风险与回退；
- 文档同步清单；
- 验证命令和完成条件。

## 状态

```text
Draft → Ready → In Progress → Blocked / Accepted → Archived
```

实现前编写或更新测试；实现后把实际测试路径写入traceability，把执行结果写入PROGRESS或验收报告。

## 当前Work Item

| Work Item | 状态 | 用途 |
| --- | --- | --- |
| `WI-20260906-02-stage-e-persistent-repair.md` | Ready | 在独立授权门禁下执行本机0014迁移、四包draft快照repair及前后完整恢复对账 |
| `WI-20260906-01-stage-e-pack-repair-hardening.md` | Accepted | 已加固政策包快照repair的事务、指纹、审计与集成测试；未执行持久库repair |
| `WI-20260901-01-docs-reorganization.md` | Accepted | Docs目录重组与当前文档治理 |
