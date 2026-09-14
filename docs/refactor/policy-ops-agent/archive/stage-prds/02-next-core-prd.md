# 阶段 02：Next.js Core 模块化 PRD

## 文档元数据

| 字段 | 值 |
| --- | --- |
| 阶段 | 02 / Next Core |
| 状态 | Ready after Stage 01 |
| 前置依赖 | Foundation基线、migration和契约完成 |
| 可并行阶段 | 04 Agent Runtime |
| 后续消费者 | 03 Policy Model、06 Drafting、07 Migration |
| 退出门禁 | 本地PostgreSQL运行、领域边界生效、行为基线不变 |
| 对应总体需求 | PRD-FR-040～043、PRD-NFR-004～007 |

## 1. 背景与现状

当前29个Route Handler大多直接依赖集中式 `src/lib/db/queries.ts`、引擎或发布服务。`queries.ts`覆盖多个业务域，大型聊天路由同时承担输入、会话、限流、模型和持久化。数据库运行时绑定Neon HTTP Driver。继续在这一结构中添加全国政策、Agent和账号资源权限会扩大耦合。

本阶段保留Next.js全栈部署，但将业务逻辑重组为与框架无关的领域模块，并切换到标准PostgreSQL连接池。

## 2. 目标

- 建立清晰的领域依赖和数据所有权。
- 让Route Handler退化为薄协议层。
- 让规则引擎在无Next、无数据库环境独立运行。
- 将Neon专用驱动替换为本地PostgreSQL标准驱动。
- 建立用户与资源所有权，为后续个人账号和Agent集成提供边界。

## 3. 非目标

- 不引入NestJS或拆独立Node后端。
- 不迁移规则引擎到Python。
- 不实现全国地区overlay和Agent。
- 不改变现有规划计算结果和对话展示。

## 4. 用户故事

- **CORE-US-001** 作为开发者，我能从领域目录找到规则、规划、发布和会话逻辑，而不搜索集中式查询文件。
- **CORE-US-002** 作为测试作者，我能用内存Repository或测试数据库测试用例，而不启动Next服务器。
- **CORE-US-003** 作为用户，我只能读取和修改属于自己的会话与方案。
- **CORE-US-004** 作为Agent集成开发者，我能通过受限application用例读取上下文，而不是直连数据库。

## 5. 功能与工程需求

- **CORE-FR-001** 建立identity、jurisdiction、policy、rules、planning、conversation、publishing、audit、agent-integration模块。
- **CORE-FR-002** 每个模块具有domain、application、infrastructure、contracts边界。
- **CORE-FR-003** 领域模块不得导入 `next/server`、React或AI SDK。
- **CORE-FR-004** 按领域拆分查询和写Repository，禁止新增跨域万能Repository。
- **CORE-FR-005** application用例定义事务边界、权限和错误映射。
- **CORE-FR-006** Route Handler只完成认证、解析、用例调用和响应映射。
- **CORE-FR-007** 规则引擎输入不可被跨调用复用的可变状态污染。
- **CORE-FR-008** 使用 `pg` + `drizzle-orm/node-postgres` 和受控Pool连接本地PostgreSQL。
- **CORE-FR-009** 会话、方案和用户画像绑定ownerUserId并执行资源校验。
- **CORE-FR-010** Agent集成模块只暴露未来内部接口所需的只读用例和draft导入端口。

## 6. 模块与依赖设计

```text
app/routes -> contracts -> application -> domain
                                  |
                                  v
                           repository ports
                                  |
                                  v
                         infrastructure/drizzle
```

- `identity`可以被其他模块读取，但业务模块不能修改认证内部表。
- `rules`拥有DSL转换、执行和测试；`planning`调用规则应用服务。
- `publishing`拥有状态转换和门禁，不允许页面或Agent直接更新status。
- `conversation`调用规划和模型端口，不直接调用Drizzle。
- `agent-integration`通过明确端口访问policy、rules和publishing。
- 跨模块读取优先使用application查询用例，禁止循环依赖。

## 7. 数据库与事务

- 建立单例 `pg.Pool`，明确最大连接数、空闲时间和进程关闭行为。
- Drizzle实例从Pool构造，不在模块导入时连接数据库。
- 写操作由application层开启事务并把事务Repository传给用例。
- 资源所有权查询与业务读取在同一事务或同一授权查询中完成，避免先查后用竞争。
- 时间、UUID和地区等边界值由契约层标准化。

## 8. 公共接口与类型

- `AuthenticatedActor { userId, role, sessionId? }`
- `RepositoryContext { actor, requestId, transaction? }`
- `PlanRepository`、`ConversationRepository`、`RuleRepository`、`PublishRepository`等领域端口。
- `ComputePlanUseCase`保持当前输入输出语义，并移除对具体查询文件的依赖。
- `PolicyContextPort`和 `DraftMaterializationPort`只定义端口，实际全国模型和Agent在后续阶段实现。

## 9. API兼容

- 现有公开URL在本阶段保持可用。
- 内部实现迁移不改变成功响应字段和已登记错误状态。
- 若引入 `/api/v1`，旧路由通过薄适配调用同一用例，并在迁移文档中声明移除时点。
- 聊天SSE协议、conversation header和工具结果结构保持兼容。

## 10. 交付物

- 领域目录、依赖规则和模块README。
- 拆分后的Repository与application用例。
- 标准PostgreSQL连接池和配置。
- 资源所有权与权限用例。
- Route Handler适配层。
- 模块依赖、数据库和API验收报告。

## 11. 可观测、安全与失败处理

- application错误映射为稳定业务码，日志保留requestId和领域操作名。
- 数据库断连返回可重试的服务错误，不把连接字符串写入日志。
- Pool耗尽、事务超时和死锁记录指标并有限重试只读操作。
- 写操作依赖幂等键，不自动重放不可幂等事务。
- 管理员权限在服务端用例检查，前端隐藏按钮不是授权控制。

## 12. 测试矩阵

| 类型 | 场景 | 通过条件 |
| --- | --- | --- |
| 单元 | domain和application | 不启动Next/数据库即可运行 |
| Repository | 本地PostgreSQL CRUD与事务 | JSONB、日期、UUID、回滚正确 |
| 权限 | user/admin和资源所有权 | 越权全部拒绝 |
| 契约 | 旧路由与新用例 | 响应兼容 |
| 引擎 | 重复计算与输入复用 | 结果确定且无污染 |
| 容量 | 连接池和并发请求 | 无连接泄漏和Pool耗尽 |

验证包括 `npm test`、源码Lint、类型检查、生产构建、Repository集成测试和API契约测试。

## 13. 验收场景

- **CORE-AC-001** Given任意Route Handler，When检查依赖，Then它不直接导入数据库Schema或实例。
- **CORE-AC-002** Given用户A和用户B，When A请求B的会话或方案，Then返回403或等价不可枚举响应。
- **CORE-AC-003** Given本地PostgreSQL，When执行现有规划和后台接口，Then行为与基线一致。
- **CORE-AC-004** Given重复执行规则引擎，When复用原始输入对象，Then每次结果一致且输入未被污染。
- **CORE-AC-005** Given数据库不可用，When请求业务接口，Then返回稳定503并记录不含密钥的日志。
- **CORE-AC-006** Given生产构建，When没有数据库网络，Then模块导入不建立连接且构建成功。

## 14. 迁移与回退

- 按只读Repository、写Repository、用例、Route Handler顺序逐域迁移。
- 每迁移一个域保留短期旧适配，契约通过后删除。
- 驱动切换通过配置开关在演练环境比较，不在同一请求混用两个写连接。
- 任一域行为不一致时回退该域适配，不回退已验证的其他域。

## 15. Definition of Done

- CORE-FR-001～010全部实现并有证据。
- CORE-AC-001～006全部通过。
- 集中式查询入口不再承担跨域新增职责，已替代导入被清理。
- 现有112个测试和黄金结果保持通过。
- architecture、API契约、implementation-plan和progress已更新。
- 创建 `refactor: 完成Next Core领域模块化` 提交并推送阶段分支。

## 16. 下一阶段输入

- 稳定领域端口和事务边界。
- 本地PostgreSQL驱动与migration流程。
- 可供Policy Model扩展的规则、参数和快照Repository。
- 可供Agent Runtime对接的受限集成端口。
