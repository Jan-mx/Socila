# SiliconFlow API 验证记录

## 当前状态

- 状态：配置已就绪；模型列表已只读验证，Embedding/Rerank/OCR推理留待步骤 05.7。
- 配置门禁检查（2026-08-30，步骤 01.5，`node scripts/validate-siliconflow.mjs`，退出码 0）：
  - `siliconflow.local.env` 存在、被 `.gitignore` 忽略（`git check-ignore` 通过）。
  - 轮换后密钥已由用户写入并已设置（脚本仅输出布尔状态，密钥内容不读取、不回显）。
  - Base URL：`https://api.siliconflow.cn/v1`；Embedding：`BAAI/bge-m3`（1024 维）；Rerank：`BAAI/bge-reranker-v2-m3`。
  - `GET /models` 实测HTTP 200；当前账号可见 `PaddlePaddle/PaddleOCR-VL-1.5`。该结果仅证明模型可见，不证明OCR推理已通过。
- 安全说明：此前在对话中暴露的旧密钥不得使用或写入本仓库；验证报告禁止记录 API Key、Authorization Header、完整向量或任何用户个人资料。

## 官方候选配置

| 能力 | 路径 | 候选模型 | 验证状态 |
| --- | --- | --- | --- |
| 模型列表 | `GET /models` | 不适用 | 未验证 |
| Embedding | `POST /embeddings` | `BAAI/bge-m3` | 未验证 |
| Rerank | `POST /rerank` | `BAAI/bge-reranker-v2-m3` | 未验证 |
| OCR | `POST /chat/completions` | `PaddlePaddle/PaddleOCR-VL-1.5` | 模型可见；推理未验证 |

## 执行后记录模板

| 字段 | 值 |
| --- | --- |
| 测试时间 | 待填写 |
| Base URL | `https://api.siliconflow.cn/v1` |
| 模型列表 HTTP 状态 | 待填写 |
| Embedding 模型 | 待填写 |
| Embedding HTTP 状态 | 待填写 |
| 向量维度 | 待填写 |
| Embedding Token 用量 | 待填写 |
| Embedding trace ID | 待填写 |
| Reranker 模型 | 待填写 |
| Rerank HTTP 状态 | 待填写 |
| 排序结果 | 待填写 |
| Rerank trace ID | 待填写 |
| OCR模型 | `PaddlePaddle/PaddleOCR-VL-1.5` |
| OCR HTTP状态 | 待填写 |
| OCR关键字段/表格结果 | 待填写 |
| OCR trace ID | 待填写 |
| 总体结论 | 待填写 |

验证报告禁止记录 API Key、Authorization Header、完整向量或任何用户个人资料。
