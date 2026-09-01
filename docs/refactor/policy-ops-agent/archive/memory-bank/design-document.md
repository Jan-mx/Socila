# PolicyOps Agent 设计文档

> 用途：定义跨阶段的产品行为、角色、状态和边界。实现业务逻辑前必须阅读；产品行为变化时更新。执行顺序和临时进度不写入本文。

## 设计目标

建设一个可审计、可恢复、可人工控制的全国政策运营 Agent。Agent 加速政策变化发现、影响分析和草案生成，但不能替代确定性规则引擎、Schema门禁、回归测试和管理员发布决策。

## 范围与非目标

### 范围

- Next.js业务Core模块化。
- 本地PostgreSQL及Neon数据迁移。
- 国家基线和地区overlay。
- 国家、上海、广东、四川官方来源。
- FastAPI、Celery、LangGraph和人工审核。
- 多格式解析、OCR、RAG、影响分析和draft生成。

### 非目标

- 首期全国全量来源。
- 自动生产发布。
- 用户规划Agent重写。
- 自由多Agent协作。
- 使用Markdown替代原始文件和结构化文档树。

## 角色与权限

### 普通用户

- 管理自己的用户画像、会话和规划。
- 无权访问政策运营后台和其他用户数据。

### 管理员

- 管理官方来源和采集任务。
- 校对低置信度OCR页面。
- 查看政策差异、影响报告、引用和草案。
- 批准、编辑后批准或驳回提案。
- 通过现有门禁发布已审核draft。

### Agent服务身份

- 读取受限的已发布政策上下文。
- 保存Agent Run、文档、Chunk、提案和Checkpoint。
- 仅在管理员批准后调用Core draft导入接口。
- 无权直连Core生产规则表。

## 身份与会话设计

- NextAuth v5负责登录、退出、安全Cookie和服务端`auth()`。
- Session策略为JWT，最长有效期1小时。
- 用户、role、active状态和authVersion保存于PostgreSQL。
- JWT只携带userId、role、authVersion；禁止携带画像、方案和个人资料。
- 密码重置、角色变化或账号禁用时递增authVersion。
- 管理员审核、规则发布和资源写操作查询数据库校验active状态与authVersion。
- Next到FastAPI使用5分钟HS256服务JWT；浏览器不得持有该Token。

## 主要用户旅程

### 来源登记与监测

管理员登记官方域名、入口URL、地区、机关和抓取频率。系统每周抓取并比较内容哈希；只有新版本进入解析和Agent分析。

### OCR校对

文本PDF由PyMuPDF提取原生文本并与OCR-VL版面结果合并；扫描件逐页发送SiliconFlow PaddleOCR-VL-1.5。文号、日期、金额、比例冲突或仅来自扫描识别时暂停流程，管理员对照原图校对后恢复。

### 提案审核

管理员查看原文、条款Diff、受影响规则、JSON DSL差异、参数和测试。批准只能导入draft；驳回保存原因但不改变Core数据。

### 发布

导入的draft继续执行Schema、示例、依赖和回归门禁。Agent不参与production状态切换。

## 状态模型

### DocumentVersion

- `discovered`：发现新内容。
- `downloaded`：原件已保存。
- `parsed`：DocumentTree已生成。
- `needs_correction`：等待OCR校对。
- `indexed`：Chunk和向量已生成。
- `failed`：处理失败，可重试或人工终止。

### AgentRun

- `queued`、`running`、`waiting_review`、`approved`、`rejected`、`failed`、`completed`。
- 每次Run绑定输入文档版本、基准政策快照、地区和流程版本。

### Proposal

- `generated`、`needs_review`、`approved`、`rejected`、`materialized_as_draft`。
- published状态不属于Proposal。

## 数据模型原则

- 关系列保存身份、地区、状态、版本和有效期。
- JSONB保存规则DSL、DocumentTree、节点状态、差异和提案正文。
- 原始文件、页面图像和解析资源保存到MinIO。
- Chunk保存稳定ID、父子关系、引用位置和内容哈希。
- Embedding保存模型ID、维度、索引版本和向量。
- published规则和政策快照不可原地修改。

## 异常与边界情况

- 来源重定向到非白名单域名：拒绝并告警。
- 下载内容与声明MIME不一致：隔离，不解析。
- 同一内容多URL：按内容哈希去重并保留来源关系。
- OCR低置信度：暂停，不生成正式引用。
- 文号或生效日期缺失：提案标记不确定，不进入draft导入。
- 同级政策冲突：创建冲突任务，不自动覆盖。
- 模型返回畸形JSON：有限重试，仍失败则人工处理。
- SiliconFlow 401/403：不重试；429/503和超时按退避策略重试。
- Embedding模型维度变化：创建新索引版本，不写入旧向量列。
- 管理员重复提交审核：使用审核幂等键，只创建一个draft bundle。

## 安全模型

- 用户内容与政策运营数据物理/逻辑隔离。
- 文档内容不进入系统指令层，不能请求工具或权限。
- 外部模型仅接收公开政策文本和去标识化规则元数据。
- OCR、Embedding和Rerank禁止接收用户身份、画像、会话和方案。
- 真实密钥只存在被忽略的本地配置或生产Secret中。
- 所有服务和数据库角色最小权限。
- 审核、导入和发布形成不可删除审计记录。

## 当前运行Profile

- 当前为Personal Demo：4核4GB、总用户≤100、并发≤5。
- 不承诺正式SLA、RPO或RTO，但必须每日离机备份并在公开Demo前完成恢复验证。
- 后台解析和OCR任务并发固定为1；资源告警触发时暂停后台任务，优先保证用户规划。
- Future Production的资源和可靠性升级条件见 `operational-baseline.md`。

## 验收标准

- 每个提案字段有可定位原文引用。
- Agent进程重启和人工等待后可以恢复。
- Core拒绝Agent提交非draft状态。
- 地区与生效日期过滤有自动化测试。
- 历史政策黄金集中影响规则召回率不低于90%。
- 迁移前后规划黄金结果一致。
