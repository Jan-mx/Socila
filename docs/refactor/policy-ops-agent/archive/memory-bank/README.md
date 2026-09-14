# Memory Bank 使用手册

## 1. 目的

memory-bank是PolicyOps Agent重构的长期事实源，用于让不同Agent、不同会话和不同阶段在不依赖聊天历史的情况下恢复目标、架构、技术决策、执行顺序和真实进度。

它不是文档归档目录：每个文件只有一个职责，过期事实必须更新，不能继续堆叠互相矛盾的说明。

## 2. 文件职责

| 文件 | 回答的问题 | 不应包含 |
| --- | --- | --- |
| `design-document.md` | 产品应该如何工作？角色、流程、状态和边界是什么？ | 逐文件实现步骤、临时进度 |
| `tech-stack.md` | 已批准使用哪些技术、版本和配置？为什么？ | 未验证的技术作为既定事实 |
| `architecture.md` | 系统当前目标结构、职责、数据所有权和调用方向是什么？ | 任务日志和讨论草稿 |
| `implementation-plan.md` | 下一步按什么顺序实施和验证？ | 具体实现代码 |
| `progress.md` | 当前真实状态、证据、阻塞和下一步是什么？ | 重复设计文档全文 |
| `parallel-development-plan.md` | 如何用多个工作树和Agent缩短关键路径？ | 未冻结的接口猜测 |
| `agent-prompts.md` | 如何把上述规则交给其他Agent执行？ | 真实密钥和生产数据 |
| `traceability.md` | 每个需求由哪个步骤、实现和验收证据覆盖？ | 没有实际覆盖的泛化链接 |
| `documentation-acceptance-report.md` | 本轮文档深化是否通过及证据是什么？ | 尚未执行的验证结果 |
| `operational-baseline.md` | 当前Demo资源、任务并发、备份和升级条件是什么？ | 企业生产承诺 |
| `quality-gates.md` | RAG、OCR和引用的最低门禁是什么？ | 未经批准降低的临时阈值 |
| `../sources/official-source-registry.md` | 哪些官方域名允许自动抓取？ | 未审核网络来源 |

## 3. 事实源优先级

出现冲突时按以下顺序处理：

1. 当前用户最新明确指令。
2. 当前阶段PRD及其验收标准。
3. `design-document.md` 的业务行为。
4. `tech-stack.md` 的已批准技术决策。
5. `architecture.md` 的模块与数据边界。
6. `implementation-plan.md` 的执行顺序。
7. `progress.md` 的当前状态记录。

如果高优先级内容要求改变低优先级文档，Agent必须在同一阶段更新相关文件。无法判断是否属于产品决策时暂停，不可静默选择。

## 4. Agent开始工作SOP

1. 读取仓库根 `AGENTS.md`。
2. 读取本文件和 `progress.md`。
3. 确认当前分支、工作树、上游和未提交变更。
4. 读取当前阶段PRD全文。
5. 读取design、tech-stack、architecture和implementation-plan相关章节。
6. 对照progress确定当前未完成步骤，禁止重复已验证工作。
7. 检查是否已有未完成Goal；没有时再为本次全流程或阶段创建Goal。
8. 除非用户明确要求，不为Goal设置token budget。
9. 运行当前步骤的前置基线命令后开始实现。

## 5. 全自动执行循环

用户已授权其他Agent在Goal模式下自动完成全部阶段并自行验收：

1. 只将implementation-plan中的一个步骤标记为执行中。
2. 完成该步骤所需的最小实现，不扩大范围。
3. 运行步骤规定的完整验证并阅读输出。
4. 失败时修复当前步骤，不跳过、不降低门禁、不修改期望掩盖问题。
5. 验证通过后更新progress；架构事实变化时更新architecture。
6. 自动进入下一步骤，直到阶段Definition of Done全部满足。
7. 生成阶段验收报告，执行敏感信息和Git差异检查。
8. 创建一个阶段提交并推送阶段分支。
9. 集成Agent验收合并后继续下一个依赖已满足的阶段。

## 6. 强制暂停条件

以下情况即使在全自动Goal中也必须暂停并请求用户决定：

- 缺少真实密钥、生产凭据或外部账号授权。
- 需要执行生产迁移、写冻结、DNS/入口切换或删除数据。
- 需要删除Neon项目、生产备份或不可恢复资产。
- 政策口径无法从权威资料和现有需求确定。
- 发现真实个人数据可能发送到外部模型。
- 发现其他用户未说明的重叠修改，无法安全保留。
- 连续验证失败表明当前架构或PRD假设错误。

## 7. 文档更新矩阵

| 变化 | 必须更新 |
| --- | --- |
| 用户流程、状态、权限变化 | design + 当前阶段PRD |
| 框架、依赖、模型、版本变化 | tech-stack + ADR |
| 模块、接口、数据所有权、部署变化 | architecture + ADR |
| 步骤拆分、顺序、验证变化 | implementation-plan |
| 步骤完成、失败、提交、阻塞 | progress |
| 阶段结束 | acceptance report + progress + architecture |

## 8. 阶段关闭与Git

阶段提交前必须：

- 所有阶段需求映射到实现和测试。
- 阶段验收场景全部有证据。
- 运行项目测试、源码Lint、类型检查和生产构建。
- 检查Markdown链接、Mermaid和需求追踪。
- 扫描候选文件中的密钥、Authorization、生产数据和local配置。
- 审阅完整staged diff。

提交消息遵循仓库规范：`英文行为: 中文简短总结`。每阶段一个提交，提交成功后推送对应阶段分支；不自动创建PR或合并main。

## 9. 跨Agent交接

交接必须使用 `templates/handoff-template.md`，至少记录：

- 当前Goal、阶段和步骤。
- 已修改文件及原因。
- 验证命令、退出码和结果。
- 当前提交、分支和远端状态。
- 未完成工作、阻塞和精确下一步。
- 任何偏离PRD的决策及ADR位置。

新Agent不得只依据交接摘要实施，仍需按开始SOP读取事实源。

## 10. 完成定义

Goal只有在全部七个阶段的Definition of Done、最终独立审查、文档同步、提交和远端状态均完成后才能标记complete。接近预算、代码已写或部分测试通过都不构成完成。
