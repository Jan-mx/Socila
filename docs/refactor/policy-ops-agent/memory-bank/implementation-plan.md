# PolicyOps Agent 实施计划

> 用途：这是唯一有顺序的执行清单。Agent从 `progress.md` 指向的步骤开始，一次只执行一步；新鲜验证通过后可自动继续。本文只描述实施动作与验证，不包含实现代码。

## 使用规则

- 步骤输入未满足时不得开始。
- 每步交付物必须可在Git差异或验证报告中观察。
- 验证失败时修复当前步骤，不跳过、不降低门禁。
- 每步完成后更新progress；架构事实变化时更新architecture。
- 每阶段完成Definition of Done、验收报告、提交和推送后才解锁依赖阶段。

## 阶段01：基础工程

| 步骤 | 需求 | 输入 | 交付物 | 验证 | 完成条件 |
| --- | --- | --- | --- | --- | --- |
| 01.1 固化版本与命令 | FND-FR-001 | 当前仓库 | 版本/命令基线报告 | 运行版本、测试、Lint、类型、构建命令 | 结果与退出码已记录 |
| 01.2 固化规则黄金结果 | FND-FR-003 | DSL与现有测试 | 稳定样本和已知偏差 | 重复执行并比较plan/calc/trace | 无未解释漂移 |
| 01.3 建立migration基线 | FND-FR-002 | 当前Drizzle Schema | 第一份版本化migration | 空PostgreSQL从零迁移并对账 | Schema一致且可重复 |
| 01.4 定义API基础契约 | FND-FR-004～007 | 现有Route和错误 | ApiError、RequestContext、幂等和OpenAPI约定 | 契约样本与运行时校验测试 | 成功/错误语义明确 |
| 01.5 建立Secret门禁 | FND-FR-008、010 | ignore与配置模板 | 扫描规则、local配置和验证报告流程 | Git候选与敏感模式检查 | 无秘密进入候选 |
| 01.6 固化CI门禁 | FND-FR-009 | 基线命令 | CI步骤和排除规则 | 全套门禁在干净环境执行 | 所有命令通过 |
| 01.7 阶段验收 | FND-AC-001～005 | 01.1～01.6 | 阶段01验收报告 | 重跑全部验收 | PASS后提交并推送 |

## 阶段02：Next Core

| 步骤 | 需求 | 输入 | 交付物 | 验证 | 完成条件 |
| --- | --- | --- | --- | --- | --- |
| 02.1 建立领域骨架 | CORE-FR-001～003 | 阶段01契约 | 模块目录、依赖规则、README | 依赖扫描 | domain无Next/React依赖 |
| 02.2 迁移只读Repository | CORE-FR-004 | 旧queries | 领域只读端口与Drizzle实现 | 新旧结果对比 | 覆盖全部只读调用 |
| 02.3 迁移写Repository与事务 | CORE-FR-004～005 | 写查询和migration | 写端口、事务与幂等 | CRUD、回滚、并发测试 | 无跨域万能写入口 |
| 02.4 切换本地PostgreSQL驱动 | CORE-FR-008 | migration与Pool配置 | `pg` Pool和Drizzle适配 | 连接、事务、关闭、构建测试 | 无Neon运行时依赖 |
| 02.5 建立资源所有权 | CORE-FR-009 | identity与业务表 | owner关联和权限用例 | user/admin权限矩阵 | 越权全部拒绝 |
| 02.6 收敛application用例 | CORE-FR-005、010 | Repository端口 | 规划、会话、发布和Agent端口 | 无框架单元测试 | 事务/权限在用例层 |
| 02.7 瘦身Route Handler | CORE-FR-006 | application用例 | 协议适配层 | 直连DB扫描、API契约 | Route无领域逻辑 |
| 02.8 修正规则可变状态 | CORE-FR-007 | 引擎基线 | 输入隔离和重复执行保障 | 复用输入属性测试 | 结果确定且输入不变 |
| 02.9 清理旧入口 | CORE-FR-004 | 完成迁移的调用 | 删除被替代查询/导入 | 引用扫描与全套测试 | 无遗留调用 |
| 02.10 阶段验收 | CORE-AC-001～006 | 02.1～02.9 | 阶段02验收报告 | 单元/DB/权限/契约/构建 | PASS后提交并推送 |

## 阶段03：全国政策模型

| 步骤 | 需求 | 输入 | 交付物 | 验证 | 完成条件 |
| --- | --- | --- | --- | --- | --- |
| 03.1 建立地区树 | POL-FR-001～002 | 地区代码源 | Jurisdiction Schema和种子 | 循环/孤儿/层级测试 | 四地区路径正确 |
| 03.2 版本化政策实体 | POL-FR-003～006 | 现有rules/params/tests | 地区、业务键、有效期migration | 唯一与重叠测试 | 不变量由DB/服务保护 |
| 03.3 实现overlay合并器 | POL-FR-003～007 | baseline/overlay | add/replace/restrict/exempt算法 | 单元和属性测试 | 稳定、无输入污染 |
| 03.4 实现冲突模型 | POL-FR-008 | 合并候选 | Conflict服务和后台查询 | 同级/缺依赖测试 | 冲突阻断快照 |
| 03.5 实现不可变快照 | POL-FR-009～010 | 有效上下文 | Snapshot事务、hash和provenance | 不可变/原子/历史测试 | 可完整复算 |
| 03.6 实现上级影响查询 | POL-FR-011 | 版本与overlay | impacted overlays接口 | 影响查询测试 | 结果可解释 |
| 03.7 迁移上海数据 | POL-FR-012 | 旧上海规则包 | 兼容映射和迁移报告 | 黄金plan/calc/trace比较 | 无未解释漂移 |
| 03.8 加入广东四川示例 | POL-FR-001～009 | 地区模型 | 三地overlay和示例快照 | 隔离与继承测试 | 地区不互相污染 |
| 03.9 阶段验收 | POL-AC-001～006 | 03.1～03.8 | 阶段03验收报告 | 地区/冲突/快照/历史/回归 | PASS后提交并推送 |

## 阶段04：Agent Runtime

| 步骤 | 需求 | 输入 | 交付物 | 验证 | 完成条件 |
| --- | --- | --- | --- | --- | --- |
| 04.1 建立FastAPI控制面 | AGT-FR-001～002 | 阶段01契约 | API、配置、health/ready | OpenAPI和网络测试 | 仅内部访问 |
| 04.2 建立Celery/Redis | AGT-FR-003 | Redis配置 | Worker、Beat、队列、死信 | 重试/超时/死信测试 | 无任务丢失/无限重试 |
| 04.3 建立Agent Schema与角色 | AGT-FR-004、010 | PostgreSQL | run/artifact/proposal/review/event表 | migration和GRANT测试 | Agent不能访问Core |
| 04.4 定义Graph State和节点契约 | AGT-FR-005 | PRD工作流 | Pydantic State和Fake节点 | 全路由单元测试 | 状态可序列化 |
| 04.5 接入Postgres Checkpoint | AGT-FR-006 | Graph骨架 | Checkpointer和thread约定 | Worker/API重启恢复 | 从最近节点继续 |
| 04.6 实现interrupt审核 | AGT-FR-008～009 | Review契约 | 暂停、恢复、编辑、驳回 | 跨会话审核测试 | 状态与审计正确 |
| 04.7 实现幂等副作用 | AGT-FR-007、011 | Core Fake客户端 | materialize端口和重复处理 | 重复恢复/确认丢失测试 | 只产生一次结果 |
| 04.8 建立服务JWT | AGT-FR-013～014 | Next/FastAPI内部契约 | 5分钟JWT、jti重放保护和双Secret轮换 | 过期/issuer/audience/jti/轮换测试 | 浏览器不可获取Token |
| 04.9 建立模型Fake与观测 | AGT-FR-012 | 节点接口 | 确定性模型桩和事件指标 | 重放与日志敏感检查 | 测试无需外部API |
| 04.10 阶段验收 | AGT-AC-001～008 | 04.1～04.9 | 阶段04验收报告 | API/队列/恢复/幂等/权限/JWT | PASS后提交并推送 |

## 阶段05：采集与RAG

| 步骤 | 需求 | 输入 | 交付物 | 验证 | 完成条件 |
| --- | --- | --- | --- | --- | --- |
| 05.1 建立来源注册和安全抓取 | RAG-FR-001～003 | 白名单和Celery | Source/Fetch模型与下载器 | 变化、重定向、SSRF测试 | 只访问授权来源 |
| 05.2 接入原生格式解析 | RAG-FR-004、007～008 | HTML/DOCX/XLSX/JSON/MD样本 | 格式适配器和DocumentTree映射 | 上限/内存/结构/恶意输入测试 | 服务器不依赖Docling常驻 |
| 05.3 接入PyMuPDF与PDF分类 | RAG-FR-005、009 | 文本/扫描/混合PDF | 文本层检测、逐页渲染和原生块 | 三类PDF路由与关键字段测试 | 逐页且不整份载入内存 |
| 05.4 接入远程OCR和人工校对 | RAG-FR-006、009 | 扫描PDF/图片 | OCR-VL、页面Checkpoint、差异和校对 | 低质量/冲突/重试/缓存测试 | 未校对关键字段不索引 |
| 05.5 建立三层文档存储 | RAG-FR-003～007 | 解析结果 | MinIO、DocumentTree、Markdown | hash/版本/重新派生测试 | 原件为审计源 |
| 05.6 实现父子与表格分片 | RAG-FR-010～016 | DocumentTree | Chunk、父子关系、Token统计 | 条款/长文/表格测试 | 语义引用不丢失 |
| 05.7 安全验证SiliconFlow | PRD-FR-024、RAG-FR-006 | 轮换后local key | Embedding/Rerank/OCR模型、路径和维度验证报告 | `/models`/embedding/rerank/OCR/异常 | 无秘密或完整图像输出 |
| 05.8 建立全文和pgvector索引 | PRD-FR-021～024 | 实测模型维度 | tsvector、vector、indexVersion | 查询计划与维度测试 | 模型版本可隔离 |
| 05.9 实现混合召回与重排 | PRD-FR-021～023 | 两类索引 | exact/FTS/vector/RRF/rerank | 地区日期和黄金查询 | 错误政策不混入 |
| 05.10 建立RAG评测 | PRD-NFR-006 | 四地区标注集 | Ragas与自定义指标报告 | precision/recall/faithfulness | 达到批准阈值 |
| 05.11 阶段验收 | RAG-AC-001～009 | 05.1～05.10 | 阶段05验收报告 | 格式/OCR/资源/安全/检索/API | PASS后提交并推送 |

## 阶段06：草案生成

| 步骤 | 需求 | 输入 | 交付物 | 验证 | 完成条件 |
| --- | --- | --- | --- | --- | --- |
| 06.1 实现条款树Diff | DRF-FR-001～002 | 新旧DocumentTree | 增删改移拆合Artifact | 人工标注Diff集 | 关键变化一致 |
| 06.2 实现影响检索 | DRF-FR-003～004 | Core上下文+RAG | ImpactItem与解释 | 历史影响集 | 召回率≥90% |
| 06.3 定义DraftBundle | DRF-FR-005～008 | DSL/参数/测试Schema | 版本化Pydantic/Zod契约 | 正常/畸形契约测试 | 两端一致 |
| 06.4 实现草案节点 | DRF-FR-005～008 | Diff和影响 | 规则/参数/测试草案 | Fake模型黄金输出 | 严格结构化 |
| 06.5 实现verify/revise | DRF-FR-009～011 | DraftBundle | 引用/AJV/依赖/回归与有限修正 | 缺引用/畸形/超限测试 | 不降低门禁 |
| 06.6 实现审核体验 | DRF-FR-012 | Proposal与引用 | 对照、编辑、批准、驳回UI | E2E和权限测试 | 决策可审计 |
| 06.7 实现Core物化 | DRF-FR-013～014 | 已批准Bundle | draft导入、二次校验、幂等 | 重复/篡改/过期快照测试 | 只创建draft |
| 06.8 完成真实政策闭环 | DRF-FR-001～014 | 试点历史政策 | 端到端运行和报告 | 采集至draft全链路 | 全部证据可追溯 |
| 06.9 阶段验收 | DRF-AC-001～007 | 06.1～06.8 | 阶段06验收报告 | Diff/影响/引用/审核/权限 | PASS后提交并推送 |

## 阶段07：迁移与发布

| 步骤 | 需求 | 输入 | 交付物 | 验证 | 完成条件 |
| --- | --- | --- | --- | --- | --- |
| 07.1 固定Personal Demo Compose与网络 | REL-FR-001～004、013 | 4核4GB服务清单 | 镜像、网络、健康、资源和Secret | 空服务器启动/端口/资源预算 | 仅代理对外且后台并发1 |
| 07.2 建立监控与Runbook | REL-FR-008～009 | 服务指标 | 告警、操作和故障说明 | 故障注入演练 | 告警可行动 |
| 07.3 建立离机备份 | REL-FR-007～008 | PostgreSQL/MinIO | 基础备份、WAL、对象同步 | 校验、保留、加密检查 | 备份离开主机 |
| 07.4 第一次Neon迁移演练 | REL-FR-005～006 | Neon只读导出 | migration、导入、对账报告 | 数量/hash/测试/黄金 | 问题全部记录 |
| 07.5 第二次迁移演练 | REL-FR-005～006 | 修复后自动流程 | 可重复演练报告 | 不依赖临时手工修复 | 两次结果一致 |
| 07.6 Demo资源与安全验收 | REL-FR-001～009、013～014 | 4核4GB环境 | 资源、安全、认证、Secret报告 | 并发≤5/OCR串行/JWT/漏洞测试 | 无OOM和阻断项 |
| 07.7 Demo恢复验证 | REL-FR-007～009 | 离机备份与Runbook | PostgreSQL/MinIO/Checkpoint恢复证据 | 数据完整、用户/规划/Agent可用 | 记录实际恢复点与耗时 |
| 07.8 回退演练 | REL-FR-010～012 | 旧应用与Neon只读 | 回退步骤和证据 | 模拟切换失败 | 成功恢复并记录耗时 |
| 07.9 准备Demo切换 | REL-FR-010～014 | 全部验收 | 维护窗口、认证和检查单 | 用户授权门禁 | 未授权保持ready |
| 07.10 执行Demo切换 | REL-FR-010～014 | 用户明确授权 | 最终迁移和入口切换 | 数据对账/认证冒烟/监控 | 成功或按条件回退 |
| 07.11 最终独立审查 | 总体DoD | 所有阶段证据 | 最终验收报告 | 抽样重跑与Git审计 | 无缺失证据 |
| 07.12 阶段验收 | REL-AC-001～008 | 07.1～07.11 | 阶段07验收报告 | 部署/迁移/恢复/回退/认证 | PASS后提交并推送 |

## 需求追踪规则

- 每个阶段需求ID至少映射一个步骤和一个测试/验收ID。
- 每个步骤在progress中记录实际实现位置和验证证据。
- 阶段验收报告使用 `templates/acceptance-report-template.md`。
- 若需求拆分或编号变化，同步更新PRD、本计划和追踪矩阵。

## 项目完成门禁

- 七份阶段验收报告均为PASS。
- 最终独立审查重新验证关键证据。
- 所有阶段提交已推送，重构分支无未说明修改。
- memory-bank与实现事实一致。
- SiliconFlow真实状态未被候选文档替代。
- 未经用户授权不得以“ready-to-release”冒充生产切换完成。
