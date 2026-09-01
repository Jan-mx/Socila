# SiliconFlow API 验证记录

> Author: Jan
> Status: Active
> Updated: 2026-09-01

## 当前状态

- 状态：**真实验证已完成**；模型列表、Embedding、Rerank和OCR推理均于步骤05.7返回HTTP 200。
- 配置门禁检查（2026-08-30，步骤 01.5，`node scripts/validate-siliconflow.mjs`，退出码 0）：
  - `siliconflow.local.env` 存在、被 `.gitignore` 忽略（`git check-ignore` 通过）。
  - 轮换后密钥已由用户写入并已设置（脚本仅输出布尔状态，密钥内容不读取、不回显）。
  - Base URL：`https://api.siliconflow.cn/v1`；Embedding：`BAAI/bge-m3`（1024 维）；Rerank：`BAAI/bge-reranker-v2-m3`。
  - `GET /models` 实测HTTP 200；当前账号可见 `PaddlePaddle/PaddleOCR-VL-1.5`；后续05.7已完成OCR真实推理。
- 安全说明：此前在对话中暴露的旧密钥不得使用或写入本仓库；验证报告禁止记录 API Key、Authorization Header、完整向量或任何用户个人资料。

## 05.7 真实验证结果（2026-08-30，scripts/validate_siliconflow.py）

| 端点 | 状态 | 结果（只记允许字段） |
| --- | --- | --- |
| GET /models | 200 | 95 个模型可见；bge-m3 / bge-reranker-v2-m3 / PaddleOCR-VL-1.5 全部可见 |
| POST /embeddings | 200 | 模型 BAAI/bge-m3；**向量维度实测 1024**（与候选一致）；usage: prompt_tokens=28；indexVersion=BAAI/bge-m3:1024 |
| POST /rerank | 200 | 模型 BAAI/bge-reranker-v2-m3；排序 [0,0.9723]/[1,0.0398]/[2,0.0003]——相关文档显著居首 |
| POST /chat/completions (OCR-VL-1.5) | 200 | 公开测试句子图片推理成功；关键字段（文号2025/金额36549/日期2025-07-01/比例16%）全部命中；trace_id=chatcmpl-28b077b8…；模型未输出 confidence 字段（适配器默认0.0→按门禁进入人工确认路径） |

- pgvector Schema 锁定：**维度 1024**，indexVersion=BAAI/bge-m3:1024。
- 全程未输出 API Key、Authorization、完整向量或图片 Base64。

## 已验证配置

| 能力 | 路径 | 候选模型 | 验证状态 |
| --- | --- | --- | --- |
| 模型列表 | `GET /models` | 不适用 | 已验证，HTTP 200 |
| Embedding | `POST /embeddings` | `BAAI/bge-m3` | 已验证，HTTP 200，1024维 |
| Rerank | `POST /rerank` | `BAAI/bge-reranker-v2-m3` | 已验证，HTTP 200 |
| OCR | `POST /chat/completions` | `PaddlePaddle/PaddleOCR-VL-1.5` | 已验证，HTTP 200，关键字段命中 |

## 后续复验记录模板

以下空白表仅用于未来重新验证，不代表当前验证状态。

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
