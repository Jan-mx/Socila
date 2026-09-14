# 领域模块总览

阶段02（CORE-FR-001～003）建立的 Next Core 领域骨架。业务逻辑按模块重组为与框架无关的领域单元；`app/` Route Handler 退化为薄协议层。

## 依赖方向

```text
app/routes -> contracts -> application -> domain
                                  |
                                  v
                           repository ports
                                  |
                                  v
                         infrastructure/drizzle
```

- Route Handler 只完成认证、解析、用例调用和响应映射（CORE-FR-006）。
- 领域模块不得导入 `next/server`、React 或 AI SDK（CORE-FR-003）；`domain/` 额外禁止数据库依赖。
- `identity` 可被其他模块读取，但业务模块不能修改认证内部表。
- `rules` 拥有 DSL 转换、执行和测试；`planning` 调用规则应用服务。
- `publishing` 拥有状态转换和门禁，不允许页面或 Agent 直接更新 status。
- `conversation` 调用规划和模型端口，不直接调用 Drizzle。
- `agent-integration` 通过明确端口访问 policy、rules 和 publishing。
- 跨模块读取优先使用 application 查询用例，禁止循环依赖。

## 模块清单

| 模块 | 职责 |
| --- | --- |
| `identity` | 用户、Session、角色与资源所有权 |
| `jurisdiction` | 国家/省/市/区县层级与继承链（阶段03扩展） |
| `policy` | 政策包、版本、来源引用与发布快照 |
| `rules` | JSON DSL、参数、规则集、测试与纯规则引擎 |
| `planning` | 规划计算、场景和方案持久化 |
| `conversation` | 聊天、用户画像和 AI 流编排 |
| `publishing` | draft/staging/production 门禁与回滚 |
| `audit` | 用户与政策操作审计 |
| `agent-integration` | Agent 只读上下文与 draft 导入端口 |

## 依赖扫描

`__tests__/module-boundaries.test.ts` 扫描本目录全部源文件：

1. 所有层禁止导入 `next/*`、`react`、`react-dom`、`@ai-sdk/*`、`ai`（CORE-FR-003）。
2. `domain/` 层额外禁止 `drizzle-orm`、`pg` 与 `src/lib/db`（领域纯净性）。

扫描失败即测试失败——新增依赖前先更新本规则并记录 ADR。
