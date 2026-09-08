# 任务4案例库治理与地区化重建验收报告

> Status: Accepted（2026-09-08重开验收）
> Branch: `codex/task34-regional-case-rebuild`
> Scope: WI-20260907-03（地区化政策案例生成与可靠归档重建）

## 当前结论

2026-09-07独立复审指出的P0/P1/P2缺陷全部修复并重新验收通过。任务4 Feature恢复**Accepted**；历史代码与持久执行记录保留为审计事实，不代表本验收证据。

历史背景：`e26a543`实现0016、案例治理与452/36/528路径；复审发现归档SHA用文件名而非文件内容、selection报告缺失、restore报告pending、manifest未绑定内容、81条展示hash为pending、无可比断言仍判match、质量分空、多标签未接入、并发无行锁、地区默认硬编码（[复审报告](./review-report-2026-09-07.md)）。

## 修复内容（对照复审发现与RCL需求）

| 复审发现 | 修复（RCL编号） |
| --- | --- |
| P0 归档SHA=文件名hash | `archive.ts`对真实文件字节计算SHA-256（`fileContentSha256`）；修改任一文件SHA变化（RCL-FR-003/AC-001）；sha256sums.txt最后生成且不自包含（RCL-FR-003） |
| P0 selection缺失/restore pending | `selection-report.json`生成（策展输入/配额/最终选择，violations非空即pending）；`restore-report.json`绑定来源dump SHA、PG/pgvector版本、恢复目标、表/sequence与规范化hash（RCL-FR-002/004/005） |
| P0 manifest未绑定内容 | `buildRclManifest`绑定旧目标行ID+内容hash、新行hash、快照ID/hash、评分与来源映射；任一漂移manifestHash变化（RCL-FR-006/AC-003） |
| P1 无可比断言仍判match | `compareReplayWithAssertions`声明断言（eq/contains/is_null）必须至少1条实际计算比对；无可比断言→失败不得分（RCL-FR-016/AC-006） |
| P1 质量分空 | `scoreCase`总分+逐项分解（输入40/覆盖30/断言重放30），case/showcase真实落库（RCL-FR-015/AC-009） |
| P1 多标签未接入 | `classifyScenario`接入生成器：地区/性别/年龄/就业/险种/能力/needs-agent同时保留（RCL-FR-017） |
| P1 并发无行锁/唯一约束 | `executeRclApply`批次行`FOR UPDATE`、状态机`restore_verified→applying→applied`条件更新、归档条目`(batch,entity_type,entity_id)`唯一约束；并发仅一组成功（RCL-FR-019/AC-010） |
| P1 地区默认硬编码 | 0018移除`jurisdiction_code`默认值；生成器显式写入310000/440000（RCL-FR-012/022） |
| P2 管理查询OR | `searchCases`改为`active AND filters`（RCL-FR-020/AC-012） |
| P2 无任务4 E2E | 新增`e2e/task4-case-library.spec.ts`（RCL-AC-012/013/015） |

## 迁移与隔离

- `drizzle/0016_clg_case_governance.sql`（SHA-256 `3a9adc91…30dfd5`）未改写（`rcl-0018-rebuild-schema.integration.test.ts`哈希不变量断言）。
- 新增`drizzle/0018_case_library_rebuild.sql`（journal idx17/`1788796860000`）：移除地区默认值、cases/showcase新增scenario/generator/asOf/snapshotHash/coverage/evidence/qualityBreakdown/multiLabels/assertions、批次CHECK增加`applying`、归档条目唯一约束。
- 组合journal（0000→0018）从零执行两次幂等（隔离库`rcl_drill*`，非持久库）；持久库0018未执行。

## 确定性生成与计数

- `src/lib/case-governance/generator.ts`（RCL-GEN-1.0）：36条showcase场景（上海18+广东18），每地区男女9/9、三个年龄段各6、三种就业状态各6（RCL-AC-008）；UID `RPC-<地区>-<场景键>-V1`、测试UID `RPCT-…-V1`（RCL-FR-013）；相同模板逐字节一致（RCL-AC-005）。
- 期望值由修复后的快照规划器（任务3 `computeJurisdictionPlan`）计算并回填断言；广东mi-2030场景落在2030窗口快照（男30/女25），其余在2026窗口（RCL-FR-010）。
- 覆盖manifest：N=唯一case数，最终`N/36/N+42`（42条DSL示例=CN19+上海9+广东10+四川4），不硬编码452/500（RCL-FR-015/AC-011）。
- 四川始终unsupported且不生成case（RCL-AC-013）；CN仅内部DSL基线。

## 测试证据（2026-09-08本地新鲜执行）

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| Node单元 | `npm test` | 650 passed / 71 files，0 skip |
| TypeScript | `npx tsc --noEmit` | 退出0 |
| ESLint | `npx eslint src` | 0 error（4条既有warning非本次引入） |
| 生产构建 | `npm run build` | Compiled successfully（standalone） |
| DB集成 | `npm run test:db`（全新PG17+pgvector+btree_gist，migration×2+seed） | 114 passed / 25 files，0 skip（两次全新库复验稳定） |
| Chromium E2E | `npm run test:e2e:auth` | 16 passed（Auth 10 + 任务3 3 + 任务4 3） |
| Python单元 | ruff / mypy / `pytest -m "not integration"` | 全部通过（94 passed） |
| scan-secrets | `node scripts/scan-secrets.mjs --all` | clean（774文件零命中） |
| Gitleaks | 8.29.1完整历史（bundle克隆76 commits） | no leaks found |
| allowlist哨兵 | `node scripts/verify-gitleaks-allowlist.mjs` | 全部通过 |

任务4专用测试（Red→Green驱动）：

- `src/lib/case-governance/__tests__/archive.test.ts`（9）：真实文件SHA、篡改检测、必备文件、sha清单不自包含、selection/restore报告、恢复门禁。
- `src/lib/case-governance/__tests__/replay.test.ts`（6）：断言可比、无可比断言失败、contains/is_null。
- `src/lib/case-governance/__tests__/manifest.test.ts`（7）：精确绑定、漂移检测、N/36/N+42计数、不硬编码452/500。
- `src/lib/case-governance/__tests__/generator.test.ts`（12）：地区范围、配额、UID、覆盖义务、确定性、回归test。
- `src/lib/case-governance/__tests__/scoring.test.ts`（6）、`multi-label.test.ts`（3）：质量分解、多标签。
- `src/server/modules/policy/__tests__/rcl-0018-rebuild-schema.integration.test.ts`（3）：0018结构+applying+唯一约束+0016哈希不变。
- `src/server/modules/policy/__tests__/rcl-apply.integration.test.ts`（7）：删除旧+插入新、prepared拒绝、hash漂移、并发no-op、重复no-op、唯一约束。
- `src/server/modules/policy/__tests__/rcl-end-to-end.integration.test.ts`（2）：生成→快照规划器计算期望→评分→计数N/36/N+42；四川unsupported。
- `e2e/task4-case-library.spec.ts`（3）：公开案例、四川负例、归档权限。

## 未授权动作（保持未执行）

- 持久库0018迁移、删除旧452/36/500、插入新N/36/N、归档状态写入：全部待WI-20260907-04在fresh audit后经用户明确授权执行。
- 本机持久库（`socila-postgres/policyops`）未被修改；所有集成测试仅使用隔离库。

## Definition of Done对照

- RCL-FR-001～022、RCL-NFR-001～008、RCL-AC-001～015均有实现、专用测试与traceability。
- 旧完整库归档可恢复（真SHA+selection+restore报告）；现有错误归档不再被标记为通过证据。
- 新案例确定性生成，最终`N/36/N+42`与manifest逐项一致；沪粤公开各18条；CN和四川严格留在内部测试边界。
- 代码阶段不写持久库；真实替换只有在fresh audit后取得用户明确授权才执行。
- Node、DB、Chromium、TypeScript、ESLint、Build、Python与安全门禁全部新鲜通过且零skip。
- README、PROGRESS、ARCHITECTURE、TESTING、OPERATIONS、traceability与复审报告同步。
