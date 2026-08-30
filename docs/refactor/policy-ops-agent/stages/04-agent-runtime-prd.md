# 阶段 04：Agent Runtime PRD

## 文档元数据

| 字段 | 值 |
| --- | --- |
| 阶段 | 04 / Agent Runtime |
| 状态 | Ready after Stage 01 |
| 前置依赖 | 契约、幂等、Secret和CI规范 |
| 可并行阶段 | 02 Next Core |
| 后续消费者 | 05 Ingestion/RAG、06 Drafting、07 Migration |
| 退出门禁 | FastAPI、Celery、LangGraph和人工恢复在测试环境闭环 |
| 对应总体需求 | PRD-FR-030、035、036、PRD-NFR-001～006 |

## 1. 背景与现状

当前AI流程是Next请求内的 `streamText` 多步工具调用，不具备跨请求Checkpoint、长任务恢复、人工审批暂停、任务队列和Python文档处理环境。政策运营任务可能持续数分钟并等待管理员数日，不能运行在Next请求生命周期内。

## 2. 目标

- 建立内部FastAPI Agent控制面。
- 使用Celery和Redis处理调度、队列、重试和死信。
- 使用LangGraph表达可持久化PolicyOpsGraph。
- 支持进程重启、节点重试、人工interrupt和跨会话恢复。
- 建立Agent与Core之间的服务身份、权限和幂等契约。

## 3. 非目标

- FastAPI不承载用户登录、规划、正式规则和发布API。
- LangGraph不替代Celery调度和下载任务。
- 不实现多Agent自由协作和自动生产发布。
- 本阶段不实现真实政策解析和草案Prompt。

## 4. 用户故事

- **AGT-US-001** 作为管理员，我能查看Run当前节点、历史、错误和等待原因。
- **AGT-US-002** 作为管理员，我能在数日后批准、编辑或驳回暂停的Run。
- **AGT-US-003** 作为运维人员，我能重试失败任务并查看死信，而不会重复副作用。
- **AGT-US-004** 作为安全审查者，我能证明Agent没有Core生产表权限。

## 5. 功能需求

- **AGT-FR-001** FastAPI提供健康、就绪、Run创建、Run查询、提案查询和审核决定接口。
- **AGT-FR-002** FastAPI只在内部网络监听，浏览器通过Next Core访问。
- **AGT-FR-003** Celery支持定时任务、队列路由、有限重试、指数退避和死信。
- **AGT-FR-004** AgentRun保存workflowVersion、inputHash、actor、jurisdiction、状态和关联ID。
- **AGT-FR-005** LangGraph节点输入输出使用Pydantic/Typed State并可序列化。
- **AGT-FR-006** PostgreSQL Checkpointer保存每步状态、错误和interrupt。
- **AGT-FR-007** 有副作用节点必须使用幂等键并能安全重放。
- **AGT-FR-008** 人工节点支持approve、edit-and-approve、reject。
- **AGT-FR-009** 审核决定包含管理员、理由、编辑差异、时间和幂等键。
- **AGT-FR-010** Agent使用独立数据库角色，不能读写Core Schema。
- **AGT-FR-011** 对Core的调用使用服务身份、超时、trace ID和稳定错误映射。
- **AGT-FR-012** 所有模型调用可替换为确定性Fake用于测试和重放。
- **AGT-FR-013** Next签发5分钟HS256服务JWT，FastAPI校验issuer、audience、subject、jti、iat、exp和30秒时钟偏差。
- **AGT-FR-014** 服务JWT支持current/previous双Secret轮换；审核与draft物化使用jti短期重放保护。

## 6. 组件设计

```text
FastAPI
  run API / review API / health
       |
       v
Agent application service
       |
       +--> Celery client --> Redis --> workers
       +--> LangGraph runner --> Postgres checkpointer
       +--> Agent repositories --> agent schema
       +--> Core client port --> Next internal API
```

- API进程不执行耗时解析和模型任务。
- Celery Worker调用LangGraph runner；Beat只负责产生调度任务。
- 每个Run使用稳定threadId，恢复必须提供同一Run和预期版本。
- Worker并发数、预取和软/硬超时由队列类型配置。

## 7. PolicyOpsGraph骨架

节点顺序：`extract -> diff -> retrieve_impact -> draft -> verify -> human_review -> materialize_draft`。

- 本阶段每个节点使用固定测试实现和正式接口，不实现最终业务Prompt。
- verify可在限定次数内路由回draft；超过次数进入human_review并标记不确定。
- human_review调用 `interrupt`；恢复时校验Run状态和审核权限。
- materialize_draft是唯一调用Core写接口的节点，且只接受已批准状态。

## 8. 数据模型

- `AgentRun`：id、threadId、workflowVersion、inputHash、status、currentNode、timestamps、error。
- `AgentArtifact`：runId、type、version、content JSONB、contentHash、sourceNode。
- `AgentProposal`：runId、baseSnapshotId、jurisdictionId、status、draftBundle JSONB。
- `HumanReview`：proposalId、decision、patch、reason、actorId、idempotencyKey。
- `AgentEvent`：runId、node、eventType、duration、model、tokens、traceId、sanitized metadata。

## 9. API契约

- `POST /internal/v1/agent-runs`：创建幂等Run。
- `GET /internal/v1/agent-runs/{id}`：返回状态、当前节点和公开错误。
- `GET /internal/v1/proposals/{id}`：返回提案和引用摘要。
- `POST /internal/v1/proposals/{id}/review`：提交审核决定并恢复Run。
- `GET /internal/health`、`GET /internal/ready`。
- Next与FastAPI契约通过OpenAPI生成客户端，不共享运行时代码。

## 10. 安全与隐私

- 服务身份与用户身份分离；Next转发管理员身份和审计上下文。
- 文档正文和模型输出不允许构造工具名、URL或SQL。
- Agent工具白名单固定，参数通过Pydantic校验。
- 日志不包含API Key、Authorization、完整文档、向量或个人资料。
- 生产数据库凭据按服务分别配置，权限由数据库GRANT验证。
- 服务JWT只在Docker内部网络传输，浏览器不得获取；Secret只来自部署Secret或被忽略的local env。
- 单机Demo不启用mTLS；多机部署或更高安全等级通过新ADR复审。

## 11. 可观测、重试与失败模式

- 记录队列等待、节点耗时、重试、Token、模型和interrupt时长。
- 网络超时、429、503按节点策略重试；401、403、Schema错误不重试。
- Worker崩溃由Celery重新交付，LangGraph从Checkpoint恢复。
- 副作用执行成功但确认丢失时，通过幂等查询返回原结果。
- Checkpoint不可读或workflowVersion不兼容时暂停并要求人工迁移，不静默重跑。

## 12. 交付物

- FastAPI工程、配置和内部OpenAPI。
- Celery Worker/Beat、Redis队列和死信管理。
- LangGraph骨架、Pydantic State和PostgreSQL Checkpointer。
- Agent Schema、角色权限和Repository。
- Next测试客户端或契约桩。
- 运行、恢复、安全和阶段验收报告。

## 13. 测试矩阵

| 类型 | 场景 | 通过条件 |
| --- | --- | --- |
| 单元 | 节点路由、状态转换、重试分类 | 全部分支可确定复现 |
| API | 创建、查询、审核、错误 | OpenAPI与运行时一致 |
| 队列 | 重试、超时、死信 | 无无限重试和任务丢失 |
| 恢复 | Worker/API/Postgres重启 | 从最近Checkpoint继续 |
| 幂等 | 重复Run和重复审核 | 不产生重复Artifact或draft |
| 权限 | 数据库角色和服务身份 | Agent不能访问Core表 |
| 安全 | Prompt注入与恶意状态 | 无越权工具调用 |

## 14. 验收场景

- **AGT-AC-001** Given运行到human_review的Run，When重启所有应用容器并批准，Then从Checkpoint继续且不重复前序节点。
- **AGT-AC-002** Given同一创建幂等键，When重复调用，Then返回同一Run。
- **AGT-AC-003** Given重复审核请求，When执行，Then只产生一次恢复和一次draft调用。
- **AGT-AC-004** GivenAgent数据库凭据，When查询Core规则表，Then数据库拒绝。
- **AGT-AC-005** Given模型503，When未超过重试次数，Then退避重试；超过后Run进入failed并可见。
- **AGT-AC-006** Given401或Schema错误，When节点失败，Then不重试并记录安全错误。
- **AGT-AC-007** Given过期、错误issuer/audience或重复jti的服务JWT，When访问FastAPI敏感接口，Then请求被拒绝且不执行副作用。
- **AGT-AC-008** Given服务Secret轮换，When使用current或previous密钥签发的未过期Token，Then过渡期均可验证且旧密钥可按计划撤销。

## 15. 回退与停止条件

- Agent Runtime尚未被业务调用，可整体停止容器而不影响现有用户功能。
- Checkpoint Schema变化必须提供迁移或明确废弃测试Run。
- 任何直连Core数据库需求视为架构违规并停止实施。
- 无法证明幂等的写节点不得进入阶段05。

## 16. Definition of Done

- AGT-FR-001～014全部实现并有证据。
- AGT-AC-001～008全部通过。
- 固定Fake工作流完成创建、暂停、恢复、批准和驳回闭环。
- 服务、数据库和网络权限验证通过。
- architecture、OpenAPI、implementation-plan和progress同步。
- 创建 `feat: 建立可恢复的政策Agent运行时` 提交并推送阶段分支。

## 17. 下一阶段输入

- 可运行的FastAPI、Celery和LangGraph骨架。
- 稳定State、Artifact、Proposal和Review契约。
- 可供文档解析、RAG和草案节点实现的接口及测试桩。
