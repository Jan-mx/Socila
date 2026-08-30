# PolicyOps运行基线

## 文档用途

定义当前个人Demo、开发环境和未来生产环境的资源、可靠性和升级边界。Stage 04、05、07以及DevOps/RAG Agent在配置服务前必须读取本文。

## 部署Profile

| Profile | 用途 | 资源 | SLA/RPO/RTO | 当前状态 |
| --- | --- | --- | --- | --- |
| Local Dev | 开发、migration、测试、复杂文档离线处理 | 开发机，建议≥4核8GB | 无 | 启用 |
| Personal Demo | 个人展示/试用，总用户≤100、并发≤5 | 4核4GB、单机Docker Compose | 无正式承诺 | 当前目标 |
| Future Production | 商业化或真实业务长期运行 | 建议≥8核16GB、多机或备用恢复资源 | 需单独批准 | 暂不实施 |

## Personal Demo服务预算

| 服务 | 内存预算 | 运行约束 |
| --- | ---: | --- |
| Reverse Proxy | 64MB | 只做TLS、路由和请求上限 |
| Next.js | 512MB | 浏览器唯一入口与业务Core |
| FastAPI | 384MB | 只提供内部控制面，不执行耗时解析 |
| Parser/Celery Worker | 768MB | concurrency=1、prefetch=1 |
| PostgreSQL | 768MB | Core/Agent/Checkpoint同实例不同Schema/角色 |
| Redis | 128MB | 仅队列与短期重放键 |
| MinIO | 256MB | 原始政策与派生资源 |
| 操作系统与余量 | 约1GB | 防止全机OOM |

总预算是初始上限，不代表所有容器应持续占满。OCR、索引构建和migration不得同时运行。

## Worker统一配置

```text
concurrency=1
worker_prefetch_multiplier=1
memory_limit=768MB
soft_memory_warning=640MB
max_tasks_per_child=20
default_task_timeout=120s
temporary_disk_budget=1GB
```

- 达到软告警时不领取新任务。
- 达到硬内存上限时任务失败并进入人工处理，不自动提高限制。
- Worker重启后从页面或文档Checkpoint继续。

## 原生解析预算

| 格式 | 解析器 | 单任务内存预算 | 上限 |
| --- | --- | ---: | ---: |
| HTML | `httpx + lxml` | 128～256MB | 5MB响应 |
| DOCX | `python-docx` | 256～512MB | 25MB |
| XLSX | `openpyxl read_only` | 256～512MB | 20MB或10万行 |
| JSON | `json / ijson` | 64～256MB | 20MB；大于5MB流式 |
| Markdown/TXT | 行式解析/`markdown-it-py` | 64～128MB | 10MB |
| 文本PDF | PyMuPDF逐页 | 256～512MB | 50MB或200页 |

限制：

- HTML禁用外部实体、`huge_tree`和服务器常驻Playwright。
- `.doc`、`.xls`先在开发机转换。
- DOCX图片只保留引用，不在解析阶段全部解码。
- XLSX必须使用`read_only=True`；公式与缓存值分别保存。
- JSON保留原始类型并继续执行JSON Schema校验。
- 超限文件进入开发机离线处理。

## Demo可观测与安全阈值

Personal Demo不设置P95上线门禁，但必须采集延迟、错误和资源数据。

- 内存持续5分钟超过90%：暂停后台任务。
- 磁盘超过80%：停止采集和新索引并告警。
- PostgreSQL连接使用超过池上限80%：暂停后台数据库任务。
- Celery待处理任务超过50：暂停新来源调度。
- 连续出现OOM：将对应格式移到开发机离线处理。

## 备份与恢复

- 每日`pg_dump`。
- 每日MinIO增量同步。
- 备份必须离开Demo服务器，可保存到开发机、NAS或个人云存储。
- 保留14天。
- 对外演示前至少执行一次PostgreSQL与MinIO恢复验证。
- 不承诺正式RPO/RTO；恢复耗时记录为Future Production容量输入。

## Future Production升级触发

出现任一条件时创建新ADR并评估升级：

- 并发持续超过5或总用户显著超过100。
- 需要本地OCR/VLM或多Worker并行。
- 个人资料成为正式业务档案。
- 需要SLA、RPO、RTO、异地容灾或多管理员审批。
- Demo服务器资源安全阈值频繁触发。
