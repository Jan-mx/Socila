# 阶段 01：基础工程 PRD

## 文档元数据

| 字段 | 值 |
| --- | --- |
| 阶段 | 01 / Foundation |
| 状态 | Ready for implementation |
| 前置依赖 | 文档设计获得确认；工作分支存在 |
| 后续消费者 | 02 Next Core、03 Policy Model、04 Agent Runtime、07 Migration |
| 退出门禁 | 基线、migration、契约、Secret和CI均有可重复验证证据 |
| 对应总体需求 | PRD-NFR-001～007、PRD-FR-040～043 |

## 1. 背景与现状

当前项目已有112个测试、Next.js生产构建和JSON DSL黄金测试，但数据库通过 `drizzle-kit push` 同步，没有版本化migration；API错误格式、请求关联ID和跨服务契约尚未形成统一规范；全仓库Lint会受到本地评估脚本干扰；SiliconFlow只存在候选配置，没有经过轮换后密钥的真实验证。

本阶段必须先建立不会漂移的基线，后续模块拆分、数据库迁移和Agent引入才能证明“结构变化但行为未退化”。

## 2. 目标

- 固化代码、API、数据库和规则结果基线。
- 建立版本化migration流程和空库重建能力。
- 定义Next与未来FastAPI的跨服务契约规范。
- 建立Secret、local配置和验证报告规范。
- 将质量门禁变成CI可执行命令。

## 3. 非目标

- 不拆分业务模块。
- 不改变规则计算、发布阈值、页面和API业务语义。
- 不迁移Neon数据，不切换运行时驱动。
- 不创建FastAPI、Celery或LangGraph实现。

## 4. 用户故事

- **FND-US-001** 作为开发者，我能在空数据库从零执行migration并得到与当前Schema等价的结构。
- **FND-US-002** 作为审查者，我能用固定命令证明重构前后的规则结果一致。
- **FND-US-003** 作为服务开发者，我能从统一OpenAPI约定理解认证、错误、请求ID和幂等行为。
- **FND-US-004** 作为系统管理员，我能确认本地密钥不会被Git跟踪或日志输出。

## 5. 功能与工程需求

- **FND-FR-001** 记录Node、npm、Next、PostgreSQL、Drizzle和测试工具版本。
- **FND-FR-002** 生成当前数据库Schema基线，后续变更只允许通过migration。
- **FND-FR-003** 建立测试夹具，覆盖规划输入、输出、trace和已知偏差。
- **FND-FR-004** 建立API契约快照，覆盖公开与管理接口的输入、成功和错误响应。
- **FND-FR-005** 定义统一 `ApiError`：稳定业务码、人类消息、requestId和可选details。
- **FND-FR-006** 定义 `RequestContext`：requestId、actor、role、session、source service。
- **FND-FR-007** 定义写接口幂等键和重复请求语义。
- **FND-FR-008** 建立SiliconFlow配置模板、本地忽略配置和无密钥验证报告。
- **FND-FR-009** CI执行依赖安装、源码Lint、类型检查、测试和构建。
- **FND-FR-010** CI或提交前检查禁止密钥、私钥、本地env和生产数据。

## 6. 实现设计

### 6.1 测试基线

- 保存测试文件与用例数量、黄金DSL来源和已知偏差清单。
- 为规则引擎生成代表性输入的稳定结果摘要；动态时间必须显式传入。
- 网络、数据库和模型依赖通过测试桩隔离。
- 基线失败必须记录为现有问题，禁止静默修改期望使其变绿。

### 6.2 Migration基线

- `src/lib/db/schema.ts`继续是声明式Schema源。
- 新建可跟踪的migration目录和迁移日志。
- 第一份migration描述当前结构，不携带业务数据。
- 建立“空库迁移”和“已有库对账”两种验证路径。
- migration执行前必须验证目标环境和备份状态，生产执行留到阶段07。

### 6.3 契约规范

- Next公开接口使用Zod作为运行时校验源，并派生OpenAPI。
- 内部服务接口使用版本前缀和服务身份，不接受浏览器Cookie作为唯一认证。
- 错误状态至少覆盖400、401、403、404、409、413、422、429、500、503。
- 写接口声明幂等键、事务边界和重复提交结果。

### 6.4 Secret规范

- 可跟踪文件只包含变量名和空值。
- `*.local.env`、真实API Key、备份、用户导出和生产日志必须被忽略。
- 验证脚本从本地配置读取密钥，但只输出状态、模型、维度、用量和trace ID。
- 已出现在聊天或日志的密钥不得继续使用。

## 7. 公开接口与类型

- `ApiError { code, message, requestId, details? }`
- `RequestContext { requestId, actorId?, role?, sessionId?, source }`
- `IdempotencyMetadata { key, operation, createdAt }`
- OpenAPI版本命名和兼容规则写入设计文档；本阶段只固定约定，不迁移全部接口。

## 8. 数据与迁移

- 不改变业务表数据。
- migration基线必须能反映现有JSONB默认值、UUID、日期和时间戳。
- 对当前数据库执行只读Schema对账，不自动修复差异。
- 任何意外差异生成阻塞记录并由后续migration显式处理。

## 9. 可观测与安全

- 所有验证输出记录命令、时间、退出码和摘要。
- 测试日志不得包含环境变量值或完整用户输入。
- CI使用占位配置完成构建，真实密钥只存在部署环境。
- 本地评估目录不参与源码Lint和提交候选。

## 10. 交付物

- 版本和基线报告。
- 规则黄金结果与已知偏差说明。
- 版本化migration基线及空库验证说明。
- API和错误契约约定。
- Secret处理规范与SiliconFlow验证流程。
- CI门禁和阶段验收报告。

## 11. 测试矩阵

| 类型 | 场景 | 通过条件 |
| --- | --- | --- |
| 单元 | 规则、校验、工具纯函数 | 全部现有用例通过 |
| 黄金 | DSL真实示例 | 结果和已登记偏差一致 |
| Schema | 空库migration | 仅通过migration建立成功 |
| 契约 | 成功与错误响应 | OpenAPI与运行时校验一致 |
| 安全 | Secret扫描与ignore | 无真实密钥进入候选文件 |
| 构建 | Next生产构建 | 无真实数据库和模型密钥也能完成 |

验证命令基线：`npm test`、`npx eslint src`、`npx tsc --noEmit`、`npm run build`、migration空库验证、Markdown与敏感信息检查。

## 12. 验收场景

- **FND-AC-001** Given空PostgreSQL数据库，When执行全部migration，Then生成与声明Schema一致的表、索引和约束。
- **FND-AC-002** Given现有DSL和黄金案例，When运行基线测试，Then112个测试及黄金结果通过。
- **FND-AC-003** Given被忽略的local配置，When执行Git候选检查，Then该文件不出现在待提交列表。
- **FND-AC-004** Given无真实环境密钥，When执行构建，Then构建成功且不连接外部服务。
- **FND-AC-005** Given重复写请求契约，When使用相同幂等键，Then文档明确相同结果或409语义。

## 13. 失败、回退与停止条件

- 基线测试失败：停止，记录现有失败，不进入阶段02。
- migration与现有Schema不一致：删除演练库并修复migration，不修改生产库。
- 检测到候选文件含密钥：停止提交，轮换密钥并清理。
- 无法解释的规则结果变化：回退该变更并升级为政策/业务决策。

## 14. Definition of Done

- FND-FR-001～010全部有实现和验证证据。
- FND-AC-001～005全部通过。
- 验收报告记录命令、退出码和遗留问题。
- architecture、implementation-plan和progress与实际一致。
- 创建 `docs: 完善基础工程基线与交付门禁` 提交并推送阶段分支。

## 15. 下一阶段输入

- 稳定测试与契约基线。
- 可重复migration流程。
- 统一错误、请求上下文和幂等规则。
- 已验证的Secret安全边界。
