# PolicyOps历史归档

> Author: Jan
> Status: Active
> Updated: 2026-09-01

## 用途

本目录保存已经被当前文档替代但仍需审计和追溯的历史资料。

归档文件不是当前事实源，Agent不得默认读取。

## 目录

| 路径 | 原内容 |
| --- | --- |
| `product-prd-2026-08.md` | 重构实施前的总体PRD |
| `legacy-repository-architecture-2026-08.md` | 重构前的仓库架构说明 |
| `stage-prds/` | 七份历史阶段PRD |
| `memory-bank/` | 旧设计、技术栈、实施计划、进度和Agent提示词 |
| `decisions/` | ADR-0001至ADR-0006 |

## 规则

- 阶段PRD、ADR和memory-bank优先通过Git rename保留历史；原路径继续承载新当前文档时，使用内容保全副本归档旧正文。
- 不在归档文件中追加当前进度。
- 不批量修改历史作者、日期和验收结论。
- 当前事实应写入PRD、ARCHITECTURE、PROGRESS、TESTING或OPERATIONS。
- 只有调查历史决策、复核验收或追踪迁移时读取归档。
