# SiliconFlow 本地配置

## 文件说明

- `siliconflow.env.example`：可跟踪的无密钥配置模板。
- `siliconflow.local.env`：本机真实配置，被 Git 忽略。
- `siliconflow-validation.md`：可跟踪的验证结论，不包含密钥和完整向量。

## 安全规则

1. 任何粘贴到聊天、Issue、日志或终端输出中的密钥均视为泄露并立即轮换。
2. 真实密钥只允许写入 `siliconflow.local.env`。
3. 验证脚本不得输出 `Authorization` Header、密钥或完整 Embedding。
4. Git 提交前必须扫描敏感字段和值。
5. 只允许向 SiliconFlow 发送公开政策文本和去标识化规则元数据。

## 验证顺序

1. 请求 `GET /models`，确认账号可见的 Embedding 和 Reranker。
2. 请求 `POST /embeddings`，记录模型和向量维度。
3. 请求 `POST /rerank`，验证中文政策候选排序。
4. 将不含敏感信息的结果写入 `siliconflow-validation.md`。
5. 根据实测维度更新 `tech-stack.md` 和未来 pgvector migration。

在 `SILICONFLOW_API_KEY` 为空时不得发送真实请求，也不得把候选模型标记为已验证。
