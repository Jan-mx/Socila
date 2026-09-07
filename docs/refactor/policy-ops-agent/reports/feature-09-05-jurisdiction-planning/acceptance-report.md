# 09-05 Feature 用户规划按地区快照触发（任务3）验收报告

> Author: Jan
> Status: Accepted
> Updated: 2026-09-07
> 分支：`codex/task3-jurisdiction-planning`（从冻结提交 `93b2b6302920db02d61e98e6cdac008ae833d940` 创建）
> PRD：`docs/prd/09-05-feature-jurisdiction-aware-planning.md`

## 1. 范围与结论

任务3实现"地区选择→活动快照→确定性执行→规划留痕"的唯一规划入口：`jurisdiction_code` 必填、客户端禁止版本注入、规则引擎只从不可变 PolicySnapshot 成员执行、plan 落库记录地区/继承链/快照/日期；会话级 `UserProfile.jurisdiction` 只有用户明确确认才写入；地区发布记录只允许 publishing 应用用例+新鲜管理员激活；四川保持地区级 unsupported；广东2030年前缺参仅能力级 needs_agent。

**任务3 Accepted。** 全部门禁新鲜复现（见 §5）；持久库 0015 迁移、地区激活、快照操作均未执行（边界见 §7）。

## 2. 需求与验收映射

### 2.1 功能需求

| 需求 | 实现路径 | 测试路径 |
| --- | --- | --- |
| JRP-FR-001 必填地区 | `src/lib/validators/plan-input.ts`、`src/lib/ai/tools.ts`（computePlanSchema）、`src/server/modules/planning/application/jurisdiction-compute.use-case.ts` | `plan-input-jurisdiction.test.ts`、`tools-jurisdiction.test.ts`、`jurisdiction-compute.use-case.test.ts` |
| JRP-FR-002 稳定代码 | 同上（`^(CN\|\d{6})$`）；服务端地区树重新解析 | 同上 |
| JRP-FR-003 禁止版本注入 | `plan-input.ts` strict Schema 拒绝 rule_set_id/policy_pack_id/snapshot_id/未知字段 | `plan-input-jurisdiction.test.ts`（4用例） |
| JRP-FR-004 活动快照 | `jurisdiction-planning-read.repository.ts` 按发布记录读唯一快照（无"最新创建"隐式替换） | `jurisdiction-compute.use-case.test.ts`（快照缺失409） |
| JRP-FR-005 地区发布记录 | `drizzle/0015_jurisdiction_planning_releases.sql`、schema、`jurisdiction-release.repository.ts` | `jrp-0015-migration.integration.test.ts`、`jurisdiction-release.use-case.test.ts` |
| JRP-FR-006 激活权限 | `src/app/api/admin/jurisdictions/[code]/release/route.ts`（requireFreshAdmin）+`jurisdiction-release.use-case.ts`；禁止直接SQL | `jurisdiction-release.use-case.test.ts`（AC-010） |
| JRP-FR-007 激活门禁 | 快照存在+地区匹配+无未解决冲突+成员非空；切换不删旧快照 | `jurisdiction-release.use-case.test.ts` |
| JRP-FR-008 快照执行 | `src/lib/engine/orchestrator.ts`（orchestrateSnapshot） | `orchestrator-snapshot.test.ts`、端到端 |
| JRP-FR-009 规划留痕 | plans 新增 jurisdiction_code/resolved_jurisdiction_path/snapshot_id | `jurisdiction-compute.use-case.test.ts`、`jurisdiction-compute.integration.test.ts` |
| JRP-FR-010 直接入口 | `src/app/api/plan/compute/route.ts`（必填地区+稳定错误映射） | `plan-input-jurisdiction.test.ts`、路由错误映射（§8.4） |
| JRP-FR-011 对话入口 | `src/lib/ai/agent.ts`（confirmedJurisdictionCode注入）、`tools.ts`（assertToolJurisdiction） | `tools-jurisdiction.test.ts` |
| JRP-FR-012 文本映射 | `jurisdiction-profile.use-case.ts`（deriveJurisdictionCandidate：多/零候选必须确认） | `jurisdiction-profile.use-case.test.ts` |
| JRP-FR-013 独立开放 | 发布记录按地区独立；四川无记录→unsupported | `jurisdiction-compute.use-case.test.ts`（AC-017） |
| JRP-FR-014 历史复算 | plans.snapshot_id 创建后不变；切换只更新发布记录 | `jurisdiction-compute.integration.test.ts`（AC-008） |
| JRP-FR-015 地区画像 | `jurisdiction-profile.use-case.ts`（服务端规范化+confirmedAt/source） | `jurisdiction-profile.use-case.test.ts` |
| JRP-FR-016 候选与确认 | updateProfile 候选不产生 confirmed；确认仅经专用接口 | `tools-jurisdiction.test.ts`、`jurisdiction-profile.use-case.test.ts`（AC-014） |
| JRP-FR-017 会话持久化 | conversations.user_profile 保存/恢复；无画像重新确认 | `jurisdiction-profile.use-case.test.ts`（AC-013） |
| JRP-FR-018 上下文一致性 | chat 路由 409 校验+工具层校验（JURISDICTION_CONTEXT_MISMATCH） | `jurisdiction-compute.use-case.test.ts`、`jurisdiction-compute.integration.test.ts`（AC-015） |
| JRP-FR-019 地区切换 | 保留 messages、清除 derived_state（questions/plan/snapshot/calc缓存） | `jurisdiction-profile.use-case.test.ts`（AC-016） |
| JRP-FR-020 能力级缺口 | 快照驱动执行沿用 R-220 needs_agent/W-MI-LOCAL-YEARS-MISSING 契约；不新增全局日期错误 | `orchestrator-snapshot.test.ts`、`jurisdiction-compute.integration.test.ts`（AC-005） |

### 2.2 非功能需求

| 需求 | 覆盖 |
| --- | --- |
| JRP-NFR-001 地区隔离 | 快照地区≠发布地区/请求地区 fail-closed（PolicyStoreUnavailable）；激活拒绝跨区快照；四川零快照读取 |
| JRP-NFR-002 确定性 | 快照成员固定+`orchestrateSnapshot` 无 DB 查询与窗口过滤；端到端同快照重放一致 |
| JRP-NFR-003 Fail-closed | 未知/未激活/无快照/冲突/上下文不一致全部拒绝且零写入 |
| JRP-NFR-004 隐私 | 不新增外部模型调用；规划数据不进入政策服务（既有边界不变） |
| JRP-NFR-005 可观测 | 日志记录 requestId/ownerUserId（chat 既有）；规划日志不含完整用户输入 |
| JRP-NFR-006 可回退 | 切换只更新发布记录、旧快照保留、历史 plan 引用不变（集成 AC-008） |
| JRP-NFR-007 可测试 | 用例依赖全部注入；单元测试零数据库（6文件52用例零DB） |
| JRP-NFR-008 单一权威上下文 | 服务端重新解析地区树；客户端画像 jurisdiction 剥离+合并；工具/路由双重校验 |
| JRP-NFR-009 局部失败隔离 | 广东缺参仅对应能力 needs_agent，其他模块结果保留（引擎级+端到端断言） |

### 2.3 验收场景

| 验收 | 证据 |
| --- | --- |
| JRP-AC-001 缺代码400 | schema+用例测试（不创建plan） |
| JRP-AC-002 未知地区422 | 用例测试（999999→JURISDICTION_INVALID） |
| JRP-AC-003 未激活422 | 用例测试（四川510000→JURISDICTION_UNSUPPORTED，零快照读取） |
| JRP-AC-004 上海快照执行+meta | 用例+端到端（plan留痕断言） |
| JRP-AC-005 广东2030前/后 | 引擎级（2030前needs_agent+warning+其他模块保留；2030-01-01男30/女25）+端到端（广州2412） |
| JRP-AC-006 版本注入400 | schema strict 测试（rule_set_id/policy_pack_id/snapshot_id 拒绝） |
| JRP-AC-007 冲突409 | 用例测试（POLICY_CONFLICT，不执行） |
| JRP-AC-008 切换后历史重放 | 端到端（历史plan保持原snapshotId） |
| JRP-AC-009 多候选确认 | deriveJurisdictionCandidate 测试（多/零候选） |
| JRP-AC-010 非admin拒绝 | release 用例测试（user/disabled admin→拒绝且零upsert） |
| JRP-AC-011 快照不可用 | 用例测试（POLICY_SNAPSHOT_UNAVAILABLE 409，不生成部分plan） |
| JRP-AC-012 单地区失败不影响其他 | 按地区独立发布记录设计；四川无记录不影响上海/广东（端到端上海/广东均成功） |
| JRP-AC-013 画像持久化恢复 | profile 用例（confirmedAt/source/服务端名称；恢复返回） |
| JRP-AC-014 候选不升级 | tools+profile 用例（不写confirmed、不调用规划） |
| JRP-AC-015 请求/画像不一致409 | 用例+端到端（画像/plan/快照引用不变） |
| JRP-AC-016 上海→广东切换 | profile 用例（消息保留+derived_state清除+新地区写入） |
| JRP-AC-017 四川422 | 用例+端到端（不创建plan、无活动发布记录、不读上海/广东快照） |

## 3. 执行要求对照（用户目标清单）

| 要求 | 证据 |
| --- | --- |
| 1. 用户选择上海/广东后保存权威jurisdiction对象 | profile 用例：code/name(服务端)/level/confirmed/confirmedAt/source 全断言 |
| 2. 模型候选不得写confirmed | updateProfile 候选契约测试+chat 路由 sanitizeClientProfile |
| 3. 请求/画像/快照不一致fail-closed | 用例3场景（ContextMismatch、Snapshot地区不匹配→PolicyStoreUnavailable） |
| 4. 不默认上海、不回退 | schema 无默认值+用例"广东只查广东"断言+路由无默认代码 |
| 5. 四川422不建plan不读快照 | 用例+端到端 |
| 6. 广东2030前缺参契约 | 引擎级+端到端（整体成功/needs_agent/W-MI-LOCAL-YEARS-MISSING/医保结论空/其他保留） |
| 7. 2030-01-01男30女25 | 引擎级（lifetime_required_months=360/缺口240；无缺参warning） |
| 8. 失业待遇只传领取地市 | 引擎级（广州2412/深圳2430由快照规则计算；无claim_city→needs_agent金额空）；任务3无金额公式代码 |
| 9. 切换保留消息清派生状态 | profile 用例（updateConversation只含userProfile键；derived_state删除） |
| 10. 不读任务4状态/36条案例 | 本任务未触碰 showcase_cases/cases 治理代码与452/36/528目标；测试无相关读取 |

## 4. TDD Red 证据（2026-09-07首跑，实现前）

6 个新测试文件首跑 **19 failed / 3 passed**，失败全部对应目标行为缺失：

| 文件 | Red 输出 |
| --- | --- |
| `jurisdiction-compute.use-case.test.ts` | 模块不存在（Cannot find module）→ 10失败 |
| `jurisdiction-profile.use-case.test.ts` | 模块不存在 → 9失败 |
| `jurisdiction-release.use-case.test.ts` | 模块不存在 → 8失败 |
| `plan-input-jurisdiction.test.ts` | 缺 jurisdiction_code 仍通过、版本注入被接受、未知字段被剥离 → 6失败 |
| `orchestrator-snapshot.test.ts` | orchestrateSnapshot/转换函数不存在 → 5失败 |
| `tools-jurisdiction.test.ts` | 工具无地区契约 → 3失败（3个通过项为宽松实现恰好满足的断言，不掩盖缺失） |

## 5. 门禁汇总（2026-09-07 本地新鲜执行）

| 门禁 | 结果 |
| --- | --- |
| `npm test` | PASS；58文件/538通过、skip 0（基线485 + 任务3新增53） |
| `npm run test:db`（全新PG17 `jrp_drill`：migration含0015×2幂等+seed） | PASS；21文件/95通过、skip 0（基线87 + 新增8） |
| `npx tsc --noEmit` | PASS；退出0 |
| `npx eslint src scripts` | PASS；0 error / 6 warning（全部位于未修改的HEAD既有文件，任务3未新增warning） |
| `npm run build` | PASS；退出0、零warning（standalone产物生成） |
| Auth E2E（全新`jrp_e2e`库+Jan引导+seed+standalone+mock，`SOCILA_E2E_*`） | PASS；10通过（55.5s） |
| Python单元（ruff/mypy/pytest非集成） | PASS；0问题、33文件0错误、94通过（skip 0） |
| Python集成（`pytest -m integration`，jrp_drill库+agent.migrate --with-roles×2幂等） | PASS；20通过（skip 0） |
| pip-audit | PASS；无已知漏洞（项目自身“not found on PyPI”为预期提示） |
| `scan-secrets --all` | PASS；691候选文件零命中 |
| Gitleaks 8.29.1完整历史（docker镜像，主仓库69 commits含全部分支） | PASS；no leaks found |
| allowlist哨兵回归 | PASS；3场景全过 |

### 5.1 既有 ESLint warning 如实记录

`npx eslint src scripts` 输出 **6 个 warning（0 error）**，全部位于本次未修改的 HEAD 既有文件：`scripts/restore-reconcile.ts`（manifestHash、SCHEMAS 未使用×2）、`src/app/admin/rules/[ruleId]/page.tsx`（react-hooks/exhaustive-deps×1）、`src/app/api/admin/__tests__/nrp-stage-e-fix.integration.test.ts`（LEGACY_RULE_KEYS、execMigrations 未使用×2）、`src/server/modules/policy/__tests__/snapshot-service.integration.test.ts`（isNotNull 未使用×1）。任务3 新增代码零 warning（已清理实现过程中的3处未使用参数）。

### 5.2 环境说明

- 任务3演练库 `jrp_drill`/`jrp_e2e` 位于全新 PG17+pgvector 容器 `jrp-drill-pg`（端口5439，数据卷 `jrp-drill-pg-data`）；端口5439与materializer集成测试的allowedPorts硬编码一致（任务2演练容器`nrp-drill-pg`已停止，容器与数据卷保留）。
- Python 门禁首跑曾出现 jieba 导入 SyntaxError（venv 重建瞬时状态），重跑后 94 通过；未修改任何 Python 代码。
- 演练库中可能残留其他集成测试创建的快照（共享库惯例），任务3 四川断言以"无活动发布记录/零plan"为准（持久库 510000 快照=0 由任务2证据保证）。

## 6. Definition of Done 对照

| DoD | 结果 |
| --- | --- |
| JRP-FR-001～020、NFR-001～009均有实现和测试映射 | ✓（见§2.1/2.2与traceability） |
| JRP-AC-001～017取得新鲜证据 | ✓（见§2.3） |
| 所有规划入口强制地区代码，旧请求不默认上海 | ✓（strict schema；路由无默认值） |
| 已确认地区按会话画像持久化；候选不自动升级；切换不复用旧派生状态 | ✓ |
| 用户不能直接指定规则集、参数包、快照或实体版本 | ✓（strict拒绝+引擎只读快照成员） |
| 每个成功plan保存地区、继承链、快照和日期 | ✓（集成断言plans行） |
| 地区逐个通过门禁并由publishing用例激活 | ✓（激活用例+admin校验+门禁） |
| 广东能力级needs_agent不阻断其他模块；四川保持地区级unsupported | ✓ |
| Node、数据库集成、Auth E2E、TypeScript、ESLint、Build和Secret门禁通过 | ✓（§5） |
| README、架构、测试、运维、traceability、PROGRESS和报告同步 | ✓ |
| 每个Accepted任务使用`英文行为: 中文简短总结`提交并推送，不创建PR或合并main | ✓（提交`feat: 完成地区感知用户规划`，推送`codex/task3-jurisdiction-planning`） |

## 7. 边界与未执行动作

- 未对本机持久 policyops 库执行 migration 0015（代码与测试已交付，迁移执行需用户单独明确授权）。
- 未激活上海或广东用户流量；未创建、替换或删除任何持久库 PolicySnapshot。
- 未修改四川实体（唯一相关改动是 `dsl/regions/sichuan_dsl_v1/rules/.gitkeep`——该空目录不被git跟踪导致全新检出缺目录、region-manifest/golden测试失败，.gitkeep仅恢复目录结构，规则文件数仍为0）。
- 未读取任务4案例治理状态或36条展示案例；未触碰案例治理、评分、归档、策展代码与452/36/528目标。
- 未执行 Secret 轮换、远程数据库操作或生产部署。
- 演练资源：`jrp-drill-pg` 容器与 `jrp-drill-pg-data` 卷为任务3演练设施；`nrp-drill-pg`（历史演练）已停止但容器/卷保留；`socila-*` 持久资源未删除未重建。

## 8. 集成注意事项（任务3→任务4串行集成）

1. 任务3 已交付 migration 0015（journal idx 14）；任务4 使用 0016，两条分支不得各自覆盖 `drizzle/meta/_journal.json`，最终按 0015→0016 串行集成。
2. 集成时共享文档（README/PROGRESS/ARCHITECTURE/TESTING/OPERATIONS/traceability）按任务3后任务4顺序合并。
3. 任务4 不得修改 planning、conversation 或地区发布记录代码/测试（PRD §6.2 边界）。
4. 地区激活与持久库 0015 仍为未来人工动作（OPERATIONS 新增runbook §"地区规划发布记录激活runbook"）。
