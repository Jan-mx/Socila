# 阶段 05 验收报告

## 元数据

- 阶段：05 / Ingestion and RAG
- 分支 / 提交：`refactor/policy-ops-agent-platform`（基点 `95ea7ff` + 本阶段工作）
- 验收时间：2026-08-30
- 验收Agent：全流程自主 Goal Agent（ZCode）
- 结论：**PASS**（Personal Demo Profile，ADR-0002/0003/0006 边界内）

## 实现结构（`services/agent/agent/rag/`）

| 组件 | 位置 | 说明 |
| --- | --- | --- |
| 来源白名单与安全抓取 | `rag/fetcher.py` + `sources/official-source-registry.md` | 白名单域名、重定向链校验、DNS 私网拒绝、大小/时间/重定向限制 |
| DocumentTree 适配器 | `rag/document_tree.py` | MD/TXT 行式、HTML(lxml)、JSON(+ijson>5MB 流式)、DOCX(python-docx)、XLSX(openpyxl read_only，10万行上限) |
| 文本 PDF 逐页 | `rag/pdf.py` | PyMuPDF 原生文本 + 页面哈希 + 页数上限（200） |
| OCR 流程 | `rag/ocr.py` + `rag/siliconflow.py::ocr_page` | 逐页路由（原生优先/扫描送 OCR-VL-1.5）、字段冲突检测（OcrDiscrepancy）、页面哈希缓存、低置信度→needs_correction |
| 对象存储 | `rag/storage.py` | MinIO 实现 + InMemory Fake；原件按 content_hash 键归档 |
| 父子分片 | `rag/chunker.py` | 章/条/款/项父子 Chunk、表格行组复制表头、稳定 Chunk ID、300~600/600~900 token 目标 |
| 混合检索 | `rag/pipeline.py` | 地区/日期/状态过滤 → FTS(jieba+simple) Top20 + pgvector Top20 → RRF(k=60) → rerank(≥0.2 阈值) → 父条款回填 → 引用组装 + 检索审计 |
| SiliconFlow 客户端 | `rag/siliconflow.py` | /models、/embeddings、/rerank、OCR-VL chat；401/403 不重试；Fake 实现确定性 |
| 评测 harness | `rag/evaluation.py` | RAGAS 口径黄金集（沪/粤/川 5 题：养老/失业/医保/最低工资/基数） |

## RAG-FR 覆盖

| 需求 | 实现/证据 |
| --- | --- |
| RAG-FR-001～003 格式/MIME/原件 | 适配器路由测试 + fetch 限制测试 + 存储键哈希 |
| RAG-FR-004～007 解析/OCR/版本 | 各解析器 pipeline_version 记录；PDF 逐页 + OCR Fake/真实 |
| RAG-FR-008～009 限制/原生优先 | Worker 配置 + 原生文本优先路由测试 |
| RAG-FR-010～016 分片 | chunker 测试（父子、表格表头复制、稳定 ID、超长拆分） |

## 验收场景

| 验收ID | 执行方式 | 结果 |
| --- | --- | --- |
| RAG-AC-001 多格式→原件+Tree+Markdown | 集成测试（MD 样本）+ 适配器单测（MD/HTML/JSON/DOCX/XLSX） | PASS |
| RAG-AC-002 低置信度→暂停+校对任务 | `test_scanned_page_routes_to_ocr_and_low_confidence_needs_correction` | PASS |
| RAG-AC-003 地区不串入 | 评测黄金集错地区混入率=0 + regional-isolation | PASS |
| RAG-AC-004 历史日期过滤 | 检索 SQL effective_from/to 过滤 + 状态过滤 | PASS |
| RAG-AC-005 同哈希去重 | 集成测试 deduplicated=true，不建新版本/向量 | PASS |
| RAG-AC-006 SiliconFlow 真实验证 | 05.7 四端点全通过（见 config/siliconflow-validation.md） | PASS |
| RAG-AC-007 父条款回填 | 检索返回 parent_text + citation（documentVersionId/path/chunkId） | PASS |
| RAG-AC-008 逐页路由/字段冲突 | `detect_field_discrepancies` + 混合/扫描路由测试 | PASS |
| RAG-AC-009 资源上限 | MIME_LIMITS + PDF 200 页（page-limit 测试）+ XLSX 10 万行（row-limit 测试）+ JSON>5MB 流式 | PASS |

## SiliconFlow 真实验证（05.7 摘要）

- GET /models 200：95 模型，三个目标模型全部可见。
- POST /embeddings 200：BAAI/bge-m3，**维度实测 1024** → pgvector Schema 锁定 indexVersion=BAAI/bge-m3:1024。
- POST /rerank 200：相关文档 0.9723 显著居首。
- POST /chat/completions (OCR-VL-1.5) 200：公开测试句子关键字段（文号/金额/日期/比例）全部命中，trace_id 已记录；模型未输出 confidence → 按门禁默认人工确认路径。
- 全程未输出密钥/Authorization/完整向量/图片 Base64。

## 评测指标（真模型，演练库）

| 指标 | 门禁 | 实测 |
| --- | --- | --- |
| Context Precision | ≥0.85 | 1.0（RAGAS 排名加权） |
| Context Recall | ≥0.90 | 1.0 |
| 引用覆盖率 | 100% | 1.0 |
| 错地区混入率 | 0 | 0 |
| Faithfulness | ≥0.95 | 阶段06 verify 节点落地（记录于遗留） |

## 验证命令

| 命令 | 退出码 |
| --- | --- |
| `uv run pytest -q`（34 项：单测+集成+真模型评测） | 0 |
| `npm test`（158 通过）/ eslint / tsc / build | 0 / 0 / 0 / 0 |
| `scripts/validate_siliconflow.py` | 四端点 200 |

## 遗留问题

| 问题 | 处理决定 |
| --- | --- |
| Faithfulness 指标 | 阶段06 草案 verify 节点（LLM 校验链路）实现 |
| HNSW 索引 | 数据量达到阈值后创建（PRD §10），当前精确检索 |
| OCR 关键数字人工确认 UI | 校对队列（corrections 表）就绪，后台视图在 06/07 完善 |
| BLOCKER-001（Neon 漂移） | 维持挂起至阶段07授权路径 |

## Git交付

- 提交：`feat: 建立政策采集与混合检索能力`
- 推送：`origin/refactor/policy-ops-agent-platform`；不建 PR、不合并 main
