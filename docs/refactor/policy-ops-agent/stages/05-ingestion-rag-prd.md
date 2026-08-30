# 阶段 05：政策采集与 RAG PRD

## 文档元数据

| 字段 | 值 |
| --- | --- |
| 阶段 | 05 / Ingestion and RAG |
| 状态 | Ready after Stage 04; metadata contract requires Stage 03 |
| 前置依赖 | Agent Runtime、地区/有效期元数据契约、MinIO/PostgreSQL/Redis |
| 可并行阶段 | 03 Policy Model的实现后段 |
| 后续消费者 | 06 Policy Drafting、07 Migration |
| 退出门禁 | 四类试点来源、多格式解析、混合检索和引用评测通过 |
| 对应总体需求 | PRD-FR-001～006、020～024、PRD-NFR-001～006 |

## 1. 背景与现状

当前仓库只有手工维护的JSON DSL、XLSX案例和少量说明文档，没有官方政策来源注册、原件归档、版本检测、OCR、结构化条款树、向量索引和检索评测。政策文件可能是动态网页、附件、文本PDF、扫描PDF、Office文档、表格或图片，不能假设输入均为Markdown。

## 2. 目标

- 安全、可重复地监测和归档官方政策来源。
- 将多格式原件转换为DocumentTree JSON并保留派生Markdown。
- 对扫描件和表格提供中文OCR、坐标和人工校对。
- 建立政策结构父子分片、全文与向量混合召回及Rerank。
- 保证每个检索结果可回到原文件、页面、条款和版本。
- 建立可量化RAG黄金集和质量门禁。

## 3. 非目标

- 不抓取开放互联网和非白名单来源。
- 不把Markdown作为唯一权威存档。
- 不用RAG替代完整政策版本Diff。
- 不在本阶段生成或导入规则草案。
- 不把用户个人数据发送给SiliconFlow。

## 4. 用户故事

- **RAG-US-001** 作为管理员，我能登记并监测国家、上海、广东、四川官方来源。
- **RAG-US-002** 作为校对者，我能在原图上查看低置信度OCR位置并修正文本。
- **RAG-US-003** 作为Agent，我能按地区和生效日期取得带引用的相关条款。
- **RAG-US-004** 作为审查者，我能复现一次检索使用的文档、Chunk、模型和排序。

## 5. 输入与格式需求

- **RAG-FR-001** 支持HTML、PDF、扫描PDF、DOC/DOCX、XLS/XLSX、Markdown、TXT、JPG/PNG/TIFF和JSON。
- **RAG-FR-002** 每个输入适配器验证MIME、大小、哈希、来源和允许的重定向。
- **RAG-FR-003** 原始字节保存到MinIO，数据库保存对象键、哈希、HTTP元数据和抓取证据。
- **RAG-FR-004** HTML使用httpx+lxml、DOCX使用python-docx、XLSX使用openpyxl只读模式、JSON使用json/ijson、Markdown/TXT使用行式解析，统一映射到DocumentTree。
- **RAG-FR-005** PDF使用PyMuPDF逐页检测文本层、提取原生文本并渲染扫描页面。
- **RAG-FR-006** 扫描或复杂视觉页面使用SiliconFlow `PaddlePaddle/PaddleOCR-VL-1.5`；Demo服务器不加载本地OCR/VLM。
- **RAG-FR-007** 解析器、OCR、分片器和模型版本必须随DocumentVersion记录。
- **RAG-FR-008** 解析Worker concurrency=1、prefetch=1、内存上限768MB，并执行各格式文件和行数限制。
- **RAG-FR-009** 文本PDF关键字段优先原生文本；原生文本与OCR结果冲突时创建OcrDiscrepancy并进入人工校对。

## 6. 来源监测

- `SourceRegistry`保存地区、机关、入口URL、域名、适配器、频率、启用状态和负责人。
- 每周任务先执行HEAD/条件请求和规范化内容哈希；无变化不启动解析与模型调用。
- 重定向后域名必须仍在白名单，DNS解析到内网、环回或链路本地地址时拒绝。
- 下载限制文件大小、页数、解压量、响应时间和重定向次数。
- 相同内容的多个URL共享DocumentVersion，但保留所有来源关系。
- 首期自动来源以 `sources/official-source-registry.md` 为唯一白名单，覆盖国家和三地的政府、人社、医保域名。

## 7. 文档三层模型

### 7.1 原始层

保存原始文件、响应头、最终URL、抓取时间、内容哈希和页面资源，用于审计和重新解析。

### 7.2 DocumentTree层

JSON树保存标题、章、节、条、款、项、列表、脚注、附件、表格、页码、边界框、阅读顺序、置信度和父子关系。该层是权威解析结果。

### 7.3 派生层

- Markdown用于后台预览和模型可读上下文。
- Chunk文本用于全文、Embedding和Rerank。
- 表格同时保存结构化JSON、可读文本和原始坐标。
- 派生产物都包含sourceHash和pipelineVersion，可安全重建。

## 8. 分片需求

- **RAG-FR-010** 按章、节、条、款、项、附件和表格建立父子Chunk。
- **RAG-FR-011** 子Chunk目标300～600 tokens；超长条款按句子拆为600～900 tokens。
- **RAG-FR-012** 父Chunk目标800～1500 tokens，用于最终上下文回填。
- **RAG-FR-013** 结构完整时不跨条重叠；无结构长文本使用约10%重叠。
- **RAG-FR-014** 短条款携带父标题和必要定义，但正文引用仍定位原条款。
- **RAG-FR-015** 表格按行组切分，每组复制表头、单位、注释和合并单元格语义。
- **RAG-FR-016** Chunk ID由documentVersion、结构路径和内容哈希稳定生成。

## 9. SiliconFlow配置与验证

- Base URL候选：`https://api.siliconflow.cn/v1`。
- 路径候选：`GET /models`、`POST /embeddings`、`POST /rerank`、`POST /chat/completions`。
- 模型候选：`BAAI/bge-m3`、`BAAI/bge-reranker-v2-m3`、`PaddlePaddle/PaddleOCR-VL-1.5`。
- 新密钥必须由用户轮换后写入被Git忽略的local env。
- 首次验证只使用公开测试句子，不输出密钥或完整向量。
- 实测模型可见性和向量维度决定最终pgvector Schema。
- 更换Embedding模型或维度时创建新索引版本，不混写旧向量。
- `/models`已确认OCR-VL-1.5对当前账号可见；OCR推理仍需公开政策页面样本验证。

## 9.1 OCR流程

- 文本PDF：PyMuPDF原生文本 + OCR-VL版面结果合并。
- 扫描PDF：逐页发送OCR-VL识别，关键数字默认人工确认。
- 混合PDF：逐页路由，不整份文档一次性加载或发送。
- 文号、日期、金额、比例原生文本优先；标题、顺序、表格和图片文字OCR优先。
- 每页独立Checkpoint和页面哈希缓存；模型下线时暂停，不自动切换未知模型。

## 9.2 资源和格式限制

- HTML≤5MB，DOCX≤25MB，XLSX≤20MB/10万行，JSON≤20MB，Markdown/TXT≤10MB，PDF≤50MB/200页。
- `.doc`、`.xls`和超限文件在开发机转换或离线处理。
- Demo服务器不常驻Playwright和完整Docling流水线；Docling仅开发机辅助。
- 具体内存与告警遵循 `memory-bank/operational-baseline.md`。

## 10. 检索设计

```text
query normalization
 -> jurisdiction/asOfDate/status filters
 -> exact document number/year/amount matches
 -> PostgreSQL FTS Top 20
 -> pgvector dense Top 20
 -> Reciprocal Rank Fusion
 -> SiliconFlow Rerank Top 5-8
 -> parent context expansion
 -> citation completeness validation
```

- 中文文本在写入 `tsvector` 前由Python分词，使用可复现词典版本。
- 初期数据规模使用精确向量检索；达到评测确认的阈值后创建HNSW。
- 检索响应包含Chunk、父Chunk、分数、过滤条件、文档版本和引用。
- 任何未通过地区、日期和状态过滤的候选不得在后续Rerank恢复。

## 11. API与数据

- `POST /internal/v1/documents/ingest`：创建幂等采集任务。
- `GET /internal/v1/documents/{id}`：返回版本、解析质量和资源摘要。
- `POST /internal/v1/documents/{id}/corrections`：提交OCR校对并触发派生重建。
- `POST /internal/v1/retrieval/search`：接收query、jurisdiction、asOfDate、filters、topK。
- `RetrievalResult`包含文本、父文本、metadata、citation、scores和indexVersion。
- 数据表至少覆盖source、fetch、document、version、tree、chunk、embedding、correction和retrieval audit。

## 12. 安全、隐私与失败模式

- 禁止抓取非白名单URL、内网地址和任意用户提供URL。
- 解析运行在限制资源的Worker，不执行文档宏、脚本或嵌入对象。
- 文档内容不进入system prompt，不可声明工具或权限。
- 401/403不重试；429/503/网络超时有限退避；解析错误按格式适配器分类。
- OCR低置信度、缺页、乱码或表格失败进入人工队列，不自动标记indexed。
- SiliconFlow不可用时保留已索引数据，新的Embedding任务排队，不降级到未知模型。

## 13. 可观测性

- 来源抓取成功率、变化率、响应时间和失败类别。
- 文档解析页数、节点数、表格数、OCR置信度和人工校对量。
- Chunk数量、Token分布、Embedding成本和索引版本。
- 检索阶段候选数、延迟、RRF排名、Rerank结果和引用覆盖。
- 日志仅记录对象ID和摘要，不记录API Key、Authorization和完整向量。

## 14. 交付物

- 四地区来源注册与适配器。
- 原生格式解析、PyMuPDF、SiliconFlow OCR-VL和人工校对流水线。
- MinIO、DocumentTree、Chunk、Embedding和审计Schema。
- SiliconFlow安全验证报告与确定的模型/维度。
- 混合检索API、索引和RAG评测集。
- OCR校对后台和阶段验收报告。

## 15. 测试矩阵

| 类型 | 场景 | 通过条件 |
| --- | --- | --- |
| 格式 | 每类输入至少一个真实样本 | 结构、资源和引用可回溯 |
| 安全 | SSRF、伪MIME、超大文件、压缩炸弹 | 全部隔离或拒绝 |
| OCR | 中文扫描和复杂表格 | 低置信度进入校对，修正后重建 |
| 分片 | 条款、长文、表格、附件 | 语义和引用不丢失 |
| 检索 | 地区、日期、文号、语义 | 无错误地区/失效文档混入 |
| API | SiliconFlow成功和错误 | 路径、模型、维度、重试符合规范 |
| 评测 | 黄金问题集 | 达到已批准阈值 |

质量阈值以 `memory-bank/quality-gates.md` 为准，包括Precision≥0.85、Recall≥0.90、Faithfulness≥0.95、引用覆盖100%、错地区/日期为0和OCR关键字段100%。

## 16. 验收场景

- **RAG-AC-001** Given支持列表中的每种格式，When采集解析，Then保存原件、DocumentTree和派生Markdown。
- **RAG-AC-002** Given扫描PDF低置信度页，When流程运行，Then暂停索引并创建校对任务。
- **RAG-AC-003** Given上海查询，When混合检索，Then广东和四川地方政策不会进入结果。
- **RAG-AC-004** Given历史日期，When检索，Then只返回当日有效且已发布版本。
- **RAG-AC-005** Given同一文档重复采集，When哈希相同，Then不创建重复版本和向量。
- **RAG-AC-006** Given轮换后密钥，When执行验证，Then `/models`、`/embeddings`、`/rerank` 成功且报告不含密钥。
- **RAG-AC-007** Given命中子Chunk，When组装上下文，Then返回父条款和准确页码/条款引用。
- **RAG-AC-008** Given文本、扫描和混合PDF，When执行OCR流程，Then逐页路由正确且关键字段冲突进入人工校对。
- **RAG-AC-009** Given各原生格式达到允许上限，When串行解析，ThenWorker不超过资源上限；超限文件被拒绝或转离线处理。

## 17. 回退与停止条件

- SiliconFlow模型不可用：保留候选状态，不创建向量Schema或伪造验证。
- 解析质量不达标：保留原件并停止该来源自动发布路径。
- 新索引质量低于旧索引：切回旧indexVersion，不删除新数据以便分析。
- 任何个人资料进入外部请求：立即停止、清理日志、轮换密钥并进行安全审查。

## 18. Definition of Done

- RAG-FR-001～016全部实现并有证据。
- RAG-AC-001～009全部通过。
- 四地区真实样本、RAG黄金集和安全测试通过。
- SiliconFlow模型和向量维度经安全真实请求确认。
- tech-stack、architecture、implementation-plan和progress同步。
- 创建 `feat: 建立政策采集与混合检索能力` 提交并推送阶段分支。

## 19. 下一阶段输入

- 可引用的DocumentTree、Chunk、检索API和版本Diff输入。
- 已验证Embedding/Rerank配置及评测基线。
- 可供草案节点使用的地区、日期和证据契约。
