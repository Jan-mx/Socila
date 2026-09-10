# Work Item目录

> Author: Jan
> Status: Active
> Updated: 2026-09-11

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

## Agent提示词规则

Agent提示词只在对话中交付，禁止写入Work Item正文、验收报告或其他开发文档。Work Item只保存范围、权限边界、测试、验收和回退条件。

## 当前Work Item

| Work Item | 状态 | 用途 |
| --- | --- | --- |
| `WI-20260909-01-task34-final-integration.md` | Ready | WI-02/03/04均Accepted；以merge commit合入重构分支 |
| `WI-20260907-02-task3-temporal-entry-hardening.md` | Accepted | 空黄金测试、停用地区绑定和replay三方hash已完成第二轮修复验收 |
| `WI-20260907-03-regional-policy-case-rebuild.md` | Reopened | 旧test hash、restore/SHA/selection验证、42 example原子同步仍有缺口 |
| `WI-20260907-04-persistent-case-library-replacement.md` | Accepted | repair-forward执行、幂等、可信归档及40表/20 sequence恢复已独立复审通过 |
| `WI-20260907-01-sichuan-policy-followup.md` | Blocked | 四川三项正式权威来源到位后独立开发、物化、审核和候选快照验收 |
| `WI-20260906-02-stage-e-persistent-repair.md` | Accepted | 已完成本机0014迁移、四包draft快照repair及前后完整恢复对账 |
| `WI-20260906-01-stage-e-pack-repair-hardening.md` | Accepted | 已加固政策包快照repair的事务、指纹、审计与集成测试；持久库执行见WI-20260906-02 |
| `WI-20260901-01-docs-reorganization.md` | Accepted | Docs目录重组与当前文档治理 |
