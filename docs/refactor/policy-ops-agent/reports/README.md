# PolicyOps测试与验收报告

> Author: Jan
> Status: Active
> Updated: 2026-09-03

## 用途

本目录保存已经执行的测试、验收、迁移、恢复和发布证据。报告记录事实，不定义未来需求。

## 目录

| 路径 | 用途 |
| --- | --- |
| `stage-01/` | 基础工程、迁移、契约、Secret和CI基线 |
| `stage-02/` | Next Core、Repository、权限和接口验收 |
| `stage-03/` | 地区树、政策Overlay和快照验收 |
| `stage-04/` | FastAPI、Celery、LangGraph和服务JWT验收 |
| `stage-05/` | 解析、OCR、RAG和SiliconFlow验收 |
| `stage-06/` | Diff、草案、审核和物化验收 |
| `stage-07/` | 部署、迁移、恢复、回退和切换验收 |
| `feature-09-02-auth/` | 用户与管理员双角色鉴权Feature验收 |
| `stage-09-03-pre-merge-release/` | P0合并质量门禁与v0.2.0发布阶段验收（六job门禁、镜像加固、Secret/Trivy/Gitleaks、发布治理） |
| `documentation/` | 文档体系和补充决策验收 |
| `traceability.md` | 需求、实现、测试和报告追踪 |

## 使用规则

- Agent不得默认读取全部报告。
- 只有验证历史结论或调查失败时读取相关报告。
- 新报告记录命令、退出码、时间、环境和结论。
- 未来报告作者为Jan，执行者单独记录为Agent、CI或人工。
- 报告不得包含密钥、完整向量、生产备份或用户数据。
