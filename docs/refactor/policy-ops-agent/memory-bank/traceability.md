# 需求追踪矩阵

## 用途

确保每个阶段需求都能映射到实施步骤和验收证据。实现中应把“实现位置”和“验收报告”列补充为真实链接；任何没有映射的需求都不能关闭阶段。

| 阶段 | 需求范围 | 实施步骤 | 验收范围 | 实现位置 | 验收报告 |
| --- | --- | --- | --- | --- | --- |
| 01 Foundation | FND-FR-001～010 | 01.1～01.7 | FND-AC-001～005 | `src/lib/api/contracts.ts`、`drizzle/0000_thick_dorian_gray.sql`、`scripts/run-migrations.mjs`、`scripts/scan-secrets.mjs`、`scripts/validate-siliconflow.mjs`、`scripts/schema-inventory.sql`、`.github/workflows/ci.yml`、`src/lib/engine/__tests__/golden-fixtures.ts`、`golden-snapshot.test.ts` | `docs/refactor/policy-ops-agent/reports/stage-01/acceptance-report.md` |
| 02 Next Core | CORE-FR-001～010 | 02.1～02.10 | CORE-AC-001～006 | `src/server/modules/*`、`src/lib/db/index.ts`（pg.Pool）、`src/lib/api/route-errors.ts`、`src/lib/engine/test-runner.ts` | `docs/refactor/policy-ops-agent/reports/stage-02/acceptance-report.md` |
| 03 Policy Model | POL-FR-001～012 | 03.1～03.9 | POL-AC-001～006 | `src/server/modules/{jurisdiction,policy}/*`、`drizzle/0003~0005`、`src/lib/db/seed/seed-regional.ts`、`legacy-bridge.ts` | `docs/refactor/policy-ops-agent/reports/stage-03/acceptance-report.md` |
| 04 Agent Runtime | AGT-FR-001～014 | 04.1～04.10 | AGT-AC-001～008 | 待实现 | 待生成 |
| 05 Ingestion/RAG | RAG-FR-001～016 | 05.1～05.11 | RAG-AC-001～009 | 待实现 | 待生成 |
| 06 Drafting | DRF-FR-001～014 | 06.1～06.9 | DRF-AC-001～007 | 待实现 | 待生成 |
| 07 Migration/Release | REL-FR-001～014 | 07.1～07.12 | REL-AC-001～008 | 待实现 | 待生成 |

## 总体需求映射

| 总体需求 | 主要阶段 | 验收方式 |
| --- | --- | --- |
| PRD-FR-001～006 来源与文档 | 05 | 格式、OCR、来源安全与回溯测试 |
| PRD-FR-010～014 全国政策 | 03 | 地区继承、冲突、快照和历史复算 |
| PRD-FR-020～024 RAG | 05 | 过滤、混合召回、Rerank、引用和版本 |
| PRD-FR-030～036 Agent与草案 | 04、06 | Checkpoint、审核、草案和幂等物化 |
| PRD-FR-040～043 发布与审计 | 01、02、03、06 | Core二次校验、门禁、不可变和审计 |
| PRD-NFR-001 安全 | 01～07 | 每阶段安全矩阵和最终独立审查 |
| PRD-NFR-002 隐私 | 02、04、05、06、07 | 数据流与外部请求检查 |
| PRD-NFR-003 可恢复 | 04、07 | Checkpoint和空服务器恢复 |
| PRD-NFR-004 幂等 | 01、02、04、05、06 | 重复请求/任务/审核/物化测试 |
| PRD-NFR-005 可观测 | 01、02、04、05、06、07 | 关联ID、指标、审计和告警 |
| PRD-NFR-006 可测试 | 01、04、05、06 | Fake模型、黄金集和独立验收 |
| PRD-NFR-007 兼容 | 01、02、03、07 | 112测试、黄金规划和迁移对账 |

## 更新规则

- 步骤完成后填入实现文件、测试和提交链接。
- 阶段验收后链接对应acceptance report。
- 需求增加、删除或拆分时，同步更新总体PRD、阶段PRD、implementation-plan和本矩阵。
- 不允许用一个泛化测试链接替代未实际覆盖的需求。
