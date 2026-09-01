# PolicyOps Agent 重构文档

本目录定义社保规划助手从单城市规则管理工具升级为全国政策运营 Agent 平台的目标、架构和实施顺序。

## 阅读顺序

1. [总体 PRD](../product-prd-2026-08.md)
2. [Memory Bank 使用手册](./README.md)
3. [设计文档](./design-document.md)
4. [技术栈](./tech-stack.md)
5. [目标架构](./architecture.md)
6. [实施计划](./implementation-plan.md)
7. [最快并行开发计划](./parallel-development-plan.md)
8. [当前进度](./progress.md)
9. [Agent 提示词](./agent-prompts.md)
10. [需求追踪矩阵](../../reports/traceability.md)
11. [文档验收报告](../../reports/documentation/documentation-acceptance-report.md)
12. [运行基线](./operational-baseline.md)
13. [质量门禁](./quality-gates.md)
14. [官方来源注册表](../../sources/official-source-registry.md)
15. 对应阶段 PRD

## 阶段 PRD

| 阶段 | 文档 | 主要交付 |
| --- | --- | --- |
| 01 | [基础工程](../stage-prds/01-foundation-prd.md) | 测试基线、迁移体系、契约和安全基线 |
| 02 | [Next Core](../stage-prds/02-next-core-prd.md) | 领域模块化和本地 PostgreSQL 适配 |
| 03 | [全国政策模型](../stage-prds/03-policy-model-prd.md) | 地区层级、国家基线、地方覆盖和发布快照 |
| 04 | [Agent Runtime](../stage-prds/04-agent-runtime-prd.md) | FastAPI、Celery、LangGraph 和人工中断 |
| 05 | [采集与 RAG](../stage-prds/05-ingestion-rag-prd.md) | 官方源、解析、OCR、分片和混合检索 |
| 06 | [政策草案](../stage-prds/06-policy-drafting-prd.md) | 影响分析、规则/参数/测试草案和审核 |
| 07 | [迁移与发布](../stage-prds/07-migration-release-prd.md) | Neon 迁移、单机部署、恢复演练和切换 |

## 不变量

- 规则引擎是政策数值结论的唯一计算来源。
- Agent 只能生成和导入 `draft`，不能自动发布。
- 生产个人资料不得发送到政策 Embedding、Rerank 或 Agent 模型。
- 数据库发布快照是运行时真源；Git DSL 用于种子、Schema 和黄金测试。
- 目标生产环境是单台企业内网服务器；备份必须离机保存。

## 当前架构基线

现有系统说明保留在 [重构前架构](../legacy-repository-architecture-2026-08.md)。本目录描述重构目标，不把当前实现与目标实现混写。

## 模板

- [阶段PRD模板](../../../../standards/templates/feature-prd-template.md)
- [Agent交接模板](../../../../standards/templates/handoff-template.md)
- [ADR模板](../../../../standards/templates/adr-template.md)
- [阶段验收报告模板](../../../../standards/templates/acceptance-report-template.md)
