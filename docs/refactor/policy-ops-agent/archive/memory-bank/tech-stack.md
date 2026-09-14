# PolicyOps Agent 技术栈

> 用途：记录已经批准的技术、版本、理由和使用约束。选择依赖或部署环境前必须阅读；技术决策变化时通过ADR更新。未验证候选不得写成既定事实。

## 应用Core

| 层 | 选型 | 理由 |
| --- | --- | --- |
| Web与BFF | Next.js 16 / React 19 / TypeScript | 保留现有全栈实现和流式对话能力 |
| 领域契约 | Zod | 统一HTTP、工具和领域边界校验 |
| 规则DSL | JSONLogic + 自定义builtins | 保留确定性计算与现有黄金测试 |
| DSL校验 | AJV + JSON Schema | 生成、导入和发布前执行结构校验 |
| ORM | Drizzle ORM | 复用现有Schema并迁移到版本化migration |
| PostgreSQL驱动 | `pg` + `drizzle-orm/node-postgres` | 替换Neon HTTP专用驱动，支持本地连接池 |
| 认证 | NextAuth v5 + JWT + authVersion + user/admin RBAC | 复用现有Credentials；敏感写操作校验数据库状态与authVersion |

## Agent与任务

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 内部API | FastAPI + Pydantic | Python文档/Agent生态，自动OpenAPI |
| Agent编排 | LangGraph | Checkpoint、节点恢复、人工interrupt |
| 周期任务与队列 | Celery + Redis | 采集调度、重试、死信和工作进程隔离 |
| HTML解析 | httpx + lxml | 低资源、保留DOM结构；禁用外部实体和huge_tree |
| DOCX解析 | python-docx | 保留段落、标题、表格和图片引用 |
| XLSX解析 | openpyxl read_only | 流式读取，避免普通模式高内存占用 |
| JSON/Markdown | json/ijson + markdown-it-py | 保留结构化类型并支持大JSON流式解析 |
| PDF文本 | PyMuPDF逐页 | 低内存提取原生文本、坐标和页面 |
| 中文OCR | SiliconFlow `PaddlePaddle/PaddleOCR-VL-1.5` | 扫描PDF/图片远程识别，4核4GB不加载本地VLM |
| Docling | 仅开发机离线辅助 | 复杂布局对比，不在Demo服务器常驻 |

## 数据与部署

| 层 | 选型 | 理由 |
| --- | --- | --- |
| 主数据库 | PostgreSQL 17 | 本地自托管、JSONB、事务和成熟运维 |
| 向量 | pgvector，维度待SiliconFlow实测确认 | 与业务元数据同库，避免额外向量数据库 |
| 全文 | PostgreSQL `tsvector` + GIN | 小规模政策库足够，便于混合过滤 |
| 对象存储 | MinIO | 保存原始政策、页面图和解析资源 |
| 部署 | Personal Demo：4核4GB单机Docker Compose | 总用户≤100、并发≤5、无正式SLA |
| 备份 | 每日pg_dump + MinIO离机同步，保留14天 | 个人项目避免单机数据全损；公开Demo前恢复验证 |
| 服务鉴权 | Docker内网 + 5分钟HS256 JWT | issuer/audience/jti校验与双Secret轮换 |

## SiliconFlow RAG服务

| 能力 | Base URL / 路径 | 候选模型 | 状态 |
| --- | --- | --- | --- |
| 模型列表 | `https://api.siliconflow.cn/v1/models` | 不适用 | 待新密钥验证 |
| Embedding | `/embeddings` | `BAAI/bge-m3` | 待新密钥验证 |
| Rerank | `/rerank` | `BAAI/bge-reranker-v2-m3` | 待新密钥验证 |
| OCR | `/chat/completions` | `PaddlePaddle/PaddleOCR-VL-1.5` | 模型可见性已验证；推理待Stage 05 |

候选向量维度为1024。只有真实请求确认模型可见且返回维度后，才能锁定pgvector Schema。真实配置存放于被Git忽略的 `../config/siliconflow.local.env`。

## RAG实现

- 权威解析结果：DocumentTree JSON。
- 派生格式：Markdown预览、Chunk文本、表格结构。
- 分片：政策条款父子分片，不使用固定长度切分作为主策略。
- 召回：元数据过滤、精确查询、全文Top 20、向量Top 20、RRF。
- 重排：SiliconFlow Rerank Top 5–8。
- 评测：Ragas + 文号、地区、生效期、引用、影响规则等自定义指标。
- 质量门禁：见 [quality-gates.md](./quality-gates.md)。
- 运行约束：见 [operational-baseline.md](./operational-baseline.md)。

## 测试

| 范围 | 工具 |
| --- | --- |
| TypeScript单元与集成 | Vitest |
| Python单元与集成 | pytest |
| HTTP契约 | OpenAPI Schema diff + 双端生成客户端验证 |
| 规则回归 | 现有黄金测试与历史案例回放 |
| RAG | Ragas + 人工标注政策查询集 |
| 安全 | SSRF、恶意文件、提示词注入和权限矩阵测试 |

## 暂不引入

- NestJS、Kubernetes、独立向量数据库、Elasticsearch和多Agent框架。
- 在未出现多机需求前不引入共享Next缓存和高可用数据库集群。
- Demo服务器不部署本地Docling完整流水线、PaddleOCR-VL或其他VLM权重。
