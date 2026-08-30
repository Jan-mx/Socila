# SiliconFlow API 验证记录

## 当前状态

- 状态：未执行
- 原因：轮换后的新密钥尚未写入被 Git 忽略的 `siliconflow.local.env`。
- 安全说明：此前在对话中暴露的密钥不得使用或写入本仓库。

## 官方候选配置

| 能力 | 路径 | 候选模型 | 验证状态 |
| --- | --- | --- | --- |
| 模型列表 | `GET /models` | 不适用 | 未验证 |
| Embedding | `POST /embeddings` | `BAAI/bge-m3` | 未验证 |
| Rerank | `POST /rerank` | `BAAI/bge-reranker-v2-m3` | 未验证 |

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
| 总体结论 | 待填写 |

验证报告禁止记录 API Key、Authorization Header、完整向量或任何用户个人资料。
