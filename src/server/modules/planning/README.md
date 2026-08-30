# planning 模块

职责：规划计算、场景与方案持久化；调用 rules 应用服务

## 层边界

- `domain/`：纯领域模型与规则。禁止导入 `next/*`、`react`、`@ai-sdk/*`、`ai`、`drizzle-orm`、`pg` 与 `src/lib/db`（CORE-FR-003）。
- `application/`：用例编排、事务边界、权限检查与错误映射（CORE-FR-005）。框架无关。
- `infrastructure/`：Drizzle Repository 实现与外部服务适配。允许 `drizzle-orm`/`pg`。
- `contracts/`：Zod 输入/输出/错误契约，供 Route Handler 与跨服务消费。框架无关。

## 依赖规则

- 全模块所有层禁止导入 `next/*`、`react`、`react-dom`、`@ai-sdk/*`、`ai`（扫描：`__tests__/module-boundaries.test.ts`）。
- 跨模块读取优先经目标模块的 application 查询用例；禁止循环依赖与深路径导入。
- 依赖方向：contracts → application → domain；infrastructure 实现 application 定义的端口。
