# PolicyOps配置文档

> Author: Jan
> Status: Active
> Updated: 2026-09-01

## 用途

本目录保存PolicyOps运行配置模板和外部服务验证记录。

## 文件

| 文件 | 用途 | Git状态 |
| --- | --- | --- |
| `runtime.env.example` | 认证、Worker、格式和资源配置模板 | 跟踪 |
| `siliconflow.env.example` | SiliconFlow无密钥配置模板 | 跟踪 |
| `siliconflow.local.env` | 本机真实密钥和地址 | 忽略 |
| `siliconflow-validation.md` | 不含密钥的真实API验证结果 | 跟踪 |

## 安全规则

- 真实密钥只能写入被Git忽略的local配置。
- 不得在日志、报告、命令输出或Markdown中记录API Key和Authorization Header。
- 不得记录完整Embedding或图片Base64。
- 只允许向SiliconFlow发送公开政策文本和去标识化规则元数据。
- 提交前必须执行Secret扫描和`git check-ignore`验证。
