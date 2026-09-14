# 阶段 01 验收报告

## 元数据

- 阶段：01 / Foundation
- 分支 / 提交：`refactor/policy-ops-agent-platform`（基点 `cba8cdc` + 本阶段工作）
- 验收时间：2026-08-30
- 验收Agent：全流程自主 Goal Agent（ZCode）
- 结论：**PASS**（含 1 项已登记阻塞记录 BLOCKER-001，不影响阶段退出门禁）

## 需求追踪

| 需求ID | 实现位置 | 测试/证据 | 结果 |
| --- | --- | --- | --- |
| FND-FR-001 版本记录 | `reports/stage-01/01.1-版本与命令基线报告.md` | Node 22.23.1 / npm 11.7.0 / Next 16.2.9 / React 19.2.3 / Drizzle 0.45.2 / Vitest 3.2.4 / 演练库 PG 17.11 实测 | ✓ |
| FND-FR-002 migration基线 | `drizzle/0000_thick_dorian_gray.sql`、`scripts/run-migrations.mjs`、`npm run db:generate/db:migrate`、`scripts/schema-inventory.sql`、`infra/dev/docker-compose.dev.yml` | 空库两轮迁移清单 SHA-256 一致（`91882fc5…bb798`）；同库重复执行 no-op | ✓ |
| FND-FR-003 黄金夹具 | `src/lib/engine/__tests__/golden-fixtures.ts`、`golden-snapshot.test.ts`、`fixtures/golden-snapshot.json`（28条） | 重复执行零漂移 + 快照一致断言；已知偏差4条登记于 `golden.test.ts` | ✓ |
| FND-FR-004 契约快照 | `src/lib/api/contracts.ts` + architecture.md 契约约定章节 | `src/lib/api/__tests__/contracts.test.ts` 9 项断言 | ✓ |
| FND-FR-005 ApiError | `src/lib/api/contracts.ts`（10 业务码↔10 HTTP状态） | 映射完整性测试；schema 校验测试 | ✓ |
| FND-FR-006 RequestContext | `src/lib/api/contracts.ts`（X-Request-Id 缺省生成UUID） | 构建/校验/拒绝未知role测试 | ✓ |
| FND-FR-007 幂等键 | `src/lib/api/contracts.ts`（Idempotency-Key + `first-result-or-409`） | 提取/元数据/409语义测试 | ✓ |
| FND-FR-008 SiliconFlow配置 | `config/siliconflow.env.example`、`scripts/validate-siliconflow.mjs`、`config/siliconflow-validation.md` | 配置门禁检查退出码0（被忽略+密钥已设置布尔态+模型维度登记）；真实调用留05.7 | ✓ |
| FND-FR-009 CI门禁 | `.github/workflows/ci.yml`（六步） | 干净clone占位配置全套命令退出码0（01.6） | ✓ |
| FND-FR-010 禁密钥检查 | `scripts/scan-secrets.mjs`、`.gitignore` secret gate 块 | 全库220文件/候选零命中；输出不回显匹配内容 | ✓ |

## 验收场景

| 验收ID | 执行方式 | 结果 | 证据 |
| --- | --- | --- | --- |
| FND-AC-001 空库migration一致性 | 删库重建→`npm run db:migrate`→schema清单哈希比对 | PASS | 11表/127列/11约束/11索引，哈希与01.3基线完全一致（2026-08-30新鲜执行） |
| FND-AC-002 基线测试全通过 | `npm test` | PASS | 17文件/123测试全通过——原112项全部保持通过（黄金+单元），新增11项（快照2+契约9） |
| FND-AC-003 local配置不入Git | `git check-ignore` + `git status --porcelain` 检查 | PASS | check-ignore 命中 `.gitignore:55`；候选列表 0 命中 |
| FND-AC-004 无密钥可构建 | 干净clone（确认无.env）+ 占位配置 `npm run build` | PASS | 构建退出码0，未连接外部服务（01.6，2026-08-30） |
| FND-AC-005 幂等语义明确 | architecture.md 契约章节 + 契约测试 | PASS | `first-result-or-409` 语义文档化；CONFLICT→409 测试断言 |

## 验证命令

| 命令 | 退出码 | 摘要 |
| --- | --- | --- |
| `npm test` | 0 | 17 文件、123 测试通过 |
| `npx eslint src` | 0 | 无告警 |
| `npx tsc --noEmit` | 0 | 类型检查通过 |
| `npm run build` | 0 | Next 生产构建成功（含干净环境占位配置路径） |
| `npm run db:migrate`（空库） | 0 | 可重复，清单哈希一致 |
| `node scripts/scan-secrets.mjs --all` | 0 | 220 文件零命中 |
| `node scripts/validate-siliconflow.mjs` | 0 | 配置就绪（状态布尔态，不回显密钥） |

## 安全与敏感信息

- Secret扫描：全库+候选双模式零命中；扫描器与验证器本身不输出密钥内容。
- local配置ignore：`siliconflow.local.env`、`infra/dev/.env`、`.env*` 均 gitignored（check-ignore 实测）；对账时使用的 Neon 凭据经临时 env 文件传递并即席删除，未回显。
- 个人数据检查：本阶段无用户数据接触；只读内省仅访问 information_schema/pg_catalog；演练库为空库/结构对象。
- 权限与越权测试：非本阶段范围（阶段02.5）。

## 遗留问题

| 问题 | 严重度 | 处理决定 | 负责人 |
| --- | --- | --- | --- |
| BLOCKER-001：Neon 线上库与声明式 Schema 在 `showcase_cases` 存在 5 项漂移（多列 transcript_text、nullable/UNIQUE/default 差异）；Neon server 为 PG 18.6 与目标 17 不同 | 中 | 已记录 `01.3-对账阻塞记录.md`；不自动修复，由后续显式 migration 处理（建议 Stage 02 migration 步骤或 Stage 07 迁移演练前） | 下阶段数据库工作（Goal Agent） |
| SiliconFlow 真实 API 验证未执行 | 低 | 按计划属步骤 05.7；配置已就绪 | Goal Agent（05.7） |
| golden.test.ts 已知偏差第3条（R-300 断缴语义）需规则变更+口径确认 | 低 | 维持登记，属政策口径决策，触及暂停条件时请求用户 | 用户+Goal Agent |

## Git交付

- 提交：`docs: 完善基础工程基线与交付门禁`（本报告随该提交交付）
- 推送结果：`origin/refactor/policy-ops-agent-platform`
- PR：不自动创建；不合并 main

## 下一阶段输入

- 稳定测试与契约基线：123 测试全绿；`src/lib/api/contracts.ts` 为统一错误/上下文/幂等契约源。
- 可重复 migration 流程：`db:generate`/`db:migrate` + 演练库 Compose + 只读对账脚本（`scripts/schema-inventory.sql`）。
- 统一错误、请求上下文和幂等规则：见 architecture.md「跨服务API契约约定」。
- 已验证的 Secret 安全边界：扫描/验证脚本 + ignore 规则 + CI 接线。
- 已接受风险：BLOCKER-001（线上 Schema 漂移待显式 migration）；Neon PG 18.6 与目标 17 的版本差异待 Stage 07 复核。
