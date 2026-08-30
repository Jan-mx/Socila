# 补充决策与OCR文档验收报告

## 元数据

- 日期：2026-08-30
- 分支：`refactor/policy-ops-agent-platform`
- 范围：Personal Demo、认证、服务JWT、原生解析、远程OCR、来源、质量和运维文档
- 结论：PASS
- 排除范围：当前未跟踪 `services/` Stage 04实现，未修改、未暂存、未验收

## 交付物

| 交付物 | 结果 |
| --- | --- |
| operational-baseline.md | PASS |
| quality-gates.md | PASS |
| official-source-registry.md | PASS |
| ADR-0002～0006 | PASS |
| 技术栈/设计/架构同步 | PASS |
| Stage 04/05/07需求与验收同步 | PASS |
| implementation-plan/traceability同步 | PASS |
| Agent提示词和配置模板同步 | PASS |

## 决策摘要

- 当前Profile：4核4GB Personal Demo，总用户≤100、并发≤5，无正式SLA/RPO/RTO。
- 认证：NextAuth v5 JWT + authVersion；敏感写操作数据库复核。
- 服务鉴权：Docker内网 + 5分钟HS256 JWT + jti重放保护 + 双Secret轮换。
- OCR：SiliconFlow `PaddlePaddle/PaddleOCR-VL-1.5`；模型可见性已验证，推理待Stage 05。
- 原生解析：HTML/lxml、DOCX/python-docx、XLSX/openpyxl read_only、JSON/ijson、Markdown行式解析、PDF/PyMuPDF。
- Docling：仅开发机离线辅助，不在Demo服务器常驻。
- 备份：每日pg_dump和MinIO离机同步，保留14天，公开Demo前恢复验证。

## 文档验收

| 检查 | 结果 |
| --- | --- |
| Markdown文件 | 57份 |
| 相对链接 | 0断链 |
| 代码块围栏 | 0未闭合 |
| 新增需求/验收追踪 | 17项检查全部通过 |
| 候选文档Secret模式 | 0命中 |
| SiliconFlow local env | 被Git忽略，密钥已设置且未读取/输出 |

## 项目基线

| 命令 | 退出码 | 结果 |
| --- | ---: | --- |
| `npm test` | 0 | 25文件通过、4文件跳过；158测试通过、13跳过 |
| `npx eslint src` | 0 | 0错误、2个Stage 03未使用变量警告 |
| `npx tsc --noEmit` | 0 | 无类型错误 |
| `npm run build` | 0 | Next.js生产构建成功 |

Lint警告位于Stage 03现有代码，未在本次文档提交中修改：

- `src/server/modules/policy/__tests__/shanghai-migration.test.ts`
- `src/server/modules/policy/application/legacy-bridge.ts`

## SiliconFlow状态

- `GET /models`：HTTP 200。
- 当前账号可见 `PaddlePaddle/PaddleOCR-VL-1.5`。
- Embedding、Rerank和OCR推理请求仍在Stage 05.7执行。
- 本报告不宣称OCR推理已经通过。

## Git交付要求

- 仅暂存 `docs/refactor/policy-ops-agent/**`。
- 禁止暂存未跟踪 `services/`。
- 提交：`docs: 补充个人Demo运行与OCR质量基线`
- 推送当前重构分支；不创建PR、不合并main。
