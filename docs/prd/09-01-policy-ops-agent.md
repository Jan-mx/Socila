# PolicyOps Agent 产品需求文档

> Author: Jan
> Status: Active
> Updated: 2026-09-01

## 产品概述

PolicyOps Agent将社保规划助手的政策维护过程建设为可审计、可恢复、可人工控制的工作流。系统负责发现公开政策变化、保存原件、解析条款、检索受影响规则、生成带引用的规则与测试草案，并由管理员审核后导入现有发布体系。

所有金额、资格、年限和日期结论继续由确定性JSONLogic规则引擎计算，LLM不得自行推导政策数字。

## 目标用户

| 角色 | 目标 |
| --- | --- |
| 规划用户 | 基于指定地区、日期和政策快照获得可复算规划 |
| 政策管理员 | 发现政策变化、核对原文、审查影响和草案 |
| 系统管理员 | 管理来源、任务、模型、队列、存储、备份和权限 |
| Agent服务身份 | 在最小权限下处理公开政策并生成draft |

## 产品原则

1. 规则引擎是政策数值结论的唯一计算来源。
2. 每个政策事实和草案字段必须有可定位原文引用。
3. Agent只能生成draft，管理员负责审核和发布。
4. published规则、参数和政策快照不可原地修改。
5. 国家基线与地方overlay必须可解释、可追溯。
6. 原始文件是审计源，DocumentTree JSON是权威解析结构，Markdown仅用于派生预览。
7. 用户资料和政策运营数据采用不同权限边界。

## 核心流程

```mermaid
flowchart LR
    Source[官方白名单来源] --> Fetch[抓取与内容哈希]
    Fetch --> Store[MinIO保存原件]
    Store --> Parse[原生解析 / PyMuPDF / OCR]
    Parse --> Tree[DocumentTree JSON]
    Tree --> Diff[版本与条款Diff]
    Diff --> Impact[规则/参数/测试影响检索]
    Impact --> Draft[DraftBundle生成与校验]
    Draft --> Review[管理员审核]
    Review -->|批准| Materialize[Next Core创建draft]
    Review -->|驳回| Audit[保存决定与证据]
    Materialize --> Gates[Schema/依赖/回归门禁]
    Gates --> Publish[管理员发布]
```

## 功能需求

### 来源与文档

- **PRD-FR-001** 管理员可以登记官方域名、入口、地区、机关、内容类型和监测频率。
- **PRD-FR-002** 系统通过规范化内容哈希识别新增、修改和未变化内容。
- **PRD-FR-003** 系统保存原始响应、附件、抓取时间、HTTP元数据和最终URL。
- **PRD-FR-004** 支持HTML、PDF、扫描PDF、DOCX、XLSX、Markdown、TXT、图片和JSON。
- **PRD-FR-005** 解析产物包含DocumentTree、派生Markdown、页面资源和质量信息。
- **PRD-FR-006** OCR关键字段不确定或冲突时进入人工校对，校对前不得形成可发布引用。

### 全国政策模型

- **PRD-FR-010** 维护国家、省、市、区县父子层级。
- **PRD-FR-011** 国家政策形成基线，地方政策通过新增、替换、限制或豁免overlay表达。
- **PRD-FR-012** 规则、参数、测试和政策版本包含地区范围与有效期。
- **PRD-FR-013** 同级冲突或有效期重叠生成管理员任务，不自动裁决。
- **PRD-FR-014** 每次规划保存地区继承链和发布快照ID。

### 检索与引用

- **PRD-FR-020** 文档按章、节、条、款、项、附件和表格生成父子Chunk。
- **PRD-FR-021** 检索前应用地区继承链、生效日期和发布状态过滤。
- **PRD-FR-022** 合并精确、全文和pgvector召回，并使用SiliconFlow Rerank重排。
- **PRD-FR-023** 返回上下文包含父条款、页码和稳定引用位置。
- **PRD-FR-024** Embedding模型、1024维向量、分片版本和索引版本可追踪。

### Agent与草案

- **PRD-FR-030** LangGraph保存Checkpoint，支持进程重启和人工等待后恢复。
- **PRD-FR-031** 政策Diff基于完整DocumentTree，不依赖RAG猜测变化。
- **PRD-FR-032** Agent检索受影响规则、参数、测试和历史案例。
- **PRD-FR-033** Agent生成影响报告、JSON DSL、参数和测试草案。
- **PRD-FR-034** 草案字段绑定原文引用、地区、有效期和provenance。
- **PRD-FR-035** 管理员可以批准、编辑后批准或驳回。
- **PRD-FR-036** 只有已批准提案可以通过受限接口在Next Core创建draft。

### 发布与审计

- **PRD-FR-040** Core导入时重新执行Zod、AJV、权限、状态和幂等校验。
- **PRD-FR-041** staging和production继续通过确定性发布门禁。
- **PRD-FR-042** 来源、解析、模型、Prompt、检索、草案、审核和发布形成审计链。
- **PRD-FR-043** published实体通过新版本和快照切换回滚，不原地修改。

## 非功能需求

- **PRD-NFR-001 安全**：政策文本是不可信输入，不能改变系统指令、权限或工具范围。
- **PRD-NFR-002 隐私**：用户身份、对话、画像和规划结果不得发送到政策Embedding、Rerank或OCR请求。
- **PRD-NFR-003 可恢复**：PostgreSQL、MinIO和Checkpoint可以从离机备份恢复。
- **PRD-NFR-004 幂等**：重复任务、恢复和审核不得创建重复文档、向量或draft。
- **PRD-NFR-005 可观测**：请求、任务和Run使用关联ID，记录耗时、模型、Token、失败和管理员决定。
- **PRD-NFR-006 可测试**：外部模型调用具有确定性Fake，同时允许真实SiliconFlow验证。
- **PRD-NFR-007 兼容**：迁移和重构不得造成既有规划黄金结果的未解释漂移。
- **PRD-NFR-008 资源**：Personal Demo目标为4核4GB、总用户不超过100、并发不超过5。

## 系统边界

- Next.js是浏览器唯一入口和用户业务Core。
- FastAPI只提供内部Agent控制面。
- Celery和Redis负责周期任务、队列、重试和死信。
- LangGraph负责模型流程、Checkpoint和人工interrupt。
- PostgreSQL保存Core、Agent、Checkpoint、JSONB、全文索引和pgvector。
- MinIO保存原始政策和页面资源。
- SiliconFlow仅处理公开政策和去标识化规则元数据。

## 非目标

- 首期自动覆盖全国全部地区和全部政府站点。
- Agent自动发布或直接修改production规则。
- 用Markdown替代原件和DocumentTree。
- Kubernetes、独立向量数据库、多租户或企业SSO。
- 将面向用户的规划对话Agent重写为LangGraph。

## 当前状态与限制

- 七阶段重构已验收完成，历史计划和证据见PolicyOps重构目录。
- 首期地区模型覆盖国家、上海、广东和四川；国家独立基线仍需按权威政策逐步补充。
- RAG Schema和流程已具备，生产索引需要通过首批真实采集任务建立。
- 完整真实Agent闭环需要在服务器部署后持续观察。
- 当前为Personal Demo，不承诺正式SLA、RPO和RTO。

## 验收标准

- 规则、参数、地区、有效期和快照可以确定性重放。
- 每个政策事实和草案字段的引用覆盖率为100%。
- 错地区和错生效日期混入率为0。
- 受影响规则召回率不低于90%。
- Agent无创建staging或production数据的路径。
- OCR文号、日期、金额和比例未确认时不得进入发布链路。
- PostgreSQL、MinIO和Checkpoint具有恢复证据。
- 自动化测试、构建、安全和阶段验收报告可以追踪到需求。

## 相关文档

- [PolicyOps重构入口](../refactor/policy-ops-agent/README.md)
- [当前架构](../refactor/policy-ops-agent/ARCHITECTURE.md)
- [未来路线图](../refactor/policy-ops-agent/ROADMAP.md)
- [测试与质量](../refactor/policy-ops-agent/TESTING.md)
