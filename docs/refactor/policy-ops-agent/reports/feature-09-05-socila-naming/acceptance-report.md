# 09-05 Socila命名统一与地区DSL分层 验收报告

> Author: Jan
> Status: Accepted
> Updated: 2026-09-05
> PRD: `docs/prd/09-05-feature-socila-naming-regional-dsl.md`
> ADR: `docs/refactor/policy-ops-agent/decisions/ADR-0008-Gitleaks测试合成值allowlist.md`

## 1. 验收环境

- 开发机 Windows 11 / Git Bash，Node v22、Python 3.11（uv 管理，`services/agent` 虚拟环境）。
- 数据库门禁复现：**一次性**演练 PostgreSQL 17 + pgvector 容器（`sdl-drill-pg`，本地端口 5438，库 `sdl_drill`；E2E 另建同容器 `sdl_e2e` 库）；迁移×2、引导×2、seed 后执行 `npm run test:db` 与 `pytest -m integration`。演练容器验收后已删除，零残留。
- Auth E2E：全新 `sdl_e2e` 库（migrate → `ADMIN_USERNAME=Jan` 引导 → seed）+ standalone 产物 + mock 模型，`SOCILA_E2E_*` 新变量。
- Compose 双向服务JWT冒烟：**完全隔离** Compose 副本 `docker-compose.smoke.yml`（项目名 `sdljwt-smoke`、容器名/卷名/宿主端口全部独立、合成 Secret 一次性写入 `.smoke.env`）；真实 `socila-*` 生产 Compose 栈及其数据卷全程未被冒烟触碰；冒烟后 `down -v` 并验证容器/卷/临时文件零残留。
- 持久库示例清理：本机 `socila-postgres`（Compose 栈）中的 `policyops` 库；删除前完成新鲜备份、SHA-256 清单、临时 PG17+pgvector 真实恢复与逐表对账（见 §5）。
- CI 冒烟镜像：本次实现后的 `web:latest` / `agent:latest` 本地重建（exit 0）。

## 2. 实现范围（SDL-FR/NFR）

| 需求 | 实现 |
| --- | --- |
| SDL-FR-001 协议标识 | 24条上海规则JSON、Manifest、Schema `const` 钉死 `SOCILA-DSL-1.0`；`materialize.ts`/`write-repository` 草稿写入同步 |
| SDL-FR-002 目录分层 | `dsl/protocol/socila_dsl_v1/`（socila_rule_dsl/socila_policy_params/user_profile Schema + 发布工作流 + README）、`dsl/regions/shanghai_dsl_v1/`（rules/params/rule_sets/tests/Manifest）、`dsl/README.md` 分层说明；`dsl/ssp_dsl_v1` 删除（git mv 保留历史） |
| SDL-FR-003 地区Manifest | `dsl/regions/shanghai_dsl_v1/rules_manifest.json`：dsl_version/region_slug=shanghai/jurisdiction_code=310000/bundle_version=1/params_file/rule_set_file/tests_file/rules[24]；类型定义 `src/lib/dsl/region-manifest.ts` |
| SDL-FR-004 Seed发现 | `discoverRegionDsl()`（协议根/地区根可注入）：Manifest校验（规范值、slug与目录一致、路径越界拒绝、清单与目录双向一致、规则文件rule_id/dsl_version一致）→ seed-rules/seed-params/seed-misc 按 DiscoveredRegion 装载；`seed/index.ts` 零硬编码地区目录与310000；工作流从协议目录装载 |
| SDL-FR-005 上海稳定标识 | `SHANGHAI_BASE`、`RS-SHANGHAI-PLAN-V1`、`P-SH-*`、`shanghai-migration.integration.test.ts` 名称全部保留 |
| SDL-FR-006 活动命名切换 | `package.json` name `socila-web`（package-lock 同步）；`SOCILA_TEST_DATABASE_URL`（9个TS集成测试+2个Python测试+CI）；`SOCILA_PG_DEV_PASSWORD`（dev compose + neon_drill + 本地未跟踪 infra/dev/.env）；`SOCILA_E2E_*`（run-auth-e2e.mjs、playwright.config.ts、CI） |
| SDL-FR-007 浏览器与进程标识 | Cookie `socila-anon-session`、localStorage `socila-session-id`（键名硬切换，旧键不读取不写入）、`__socilaRateLimitBuckets`、测试临时目录前缀 `socila-*-environment-` |
| SDL-FR-008 服务身份 | Node `NEXT_IDENTITY.issuer`/`AGENT_IDENTITY.audience` = `socila-next-core`；Python `ServiceIdentity` 同步；`testdata/service-jwt-vectors.json` 全部令牌同Secret/同JTI/同fixedNow重签（Node+PyJWT 双栈再生成）；CI 冒烟脚本身份字符串同步；旧身份统一401 |
| SDL-FR-009 开发资源 | dev compose 容器/卷 `socila-pg-dev`/`socila-redis-dev`/`socila-minio-dev`；旧 `ssp-*` 资源不自动删除（OPERATIONS 记录人工处置口径） |
| SDL-FR-010 数据文件 | `data/shanghai-test-cases-from-transcripts.xlsx`（git mv，SHA-256 前后一致 `708ad300f5c6ee759103b22a2dbe1b1fe61cfff9ba72e72bd977d226509f839a`） |
| SDL-FR-011 DB规范化 | `drizzle/0010_sdl_dsl_normalization_example_cleanup.sql` + journal idx9：未知值 `RAISE EXCEPTION` 阻止自动继续；已知旧值 `SSP-DSL-1.0`/`ssp_dsl_v1` → `SOCILA-DSL-1.0` |
| SDL-FR-012/013 示例清理 | 同一migration精确清理：目标行精确性检查（固定ID×预期地区×版本1）、引用检查（policy_snapshot_members/policy_conflicts/publishes）、DELETE 仅固定六条（先params后packs）、NOTICE 记录数量；`seed-regional.ts` 删除，生产Seed不再写入；夹具 `src/server/modules/policy/__tests__/fixtures/regional-examples.ts` 显式安装/清理 |
| SDL-FR-014 文档边界 | ARCHITECTURE/TESTING/OPERATIONS/traceability/验收报告/PRD 使用新名称；`reports/`与`archive/` 历史内容未改写 |
| SDL-NFR-001 无语义漂移 | 目录迁移仅改名/移动/改dsl_version字符串；黄金回归（golden.test.ts/golden-snapshot/内存执行）与DB侧 shanghai-migration 对账全部通过 |
| SDL-NFR-002 可恢复 | §5 备份+SHA清单+PG17真实恢复+逐表对账 |
| SDL-NFR-003 原子切换 | Node/Python身份、固定向量、CI冒烟在同一未推送工作树完成，单提交交付 |
| SDL-NFR-004 Fail-fast | 旧环境变量无任何读取路径（命名扫描保证）；缺新变量时集成测试直接失败（无skip） |
| SDL-NFR-005 最小删除 | migration只删六条示例；逐表对账证明其余数据不变 |
| SDL-NFR-006 可审计 | migration日志仅固定业务键与数量；备份文件与SHA清单落 `backup/`（Git忽略） |
| SDL-NFR-007 安全门禁 | ADR-0008：`.gitleaks.toml` 仅对7个测试资产路径×2类已核实误报规则精确allowlist；`scan-secrets`、服务JWT、引用与发布门禁未降低 |

## 3. TDD 执行（Red先行）

- Red批次一（单元，2026-09-05）：新增 `socila-naming-contract.test.ts`、`region-manifest.test.ts`、`dsl-layout.test.ts`、`data-file-contract.test.ts`、`seed/index.test.ts` 契约段、`documentation-copy.test.ts` 新路径断言后运行：**6文件/15失败**（旧目录与旧标识仍在、Manifest模块不存在、生产Seed仍引用seed-regional、新文件名不存在）。
- Red批次二（JWT身份）：`service-jwt.test.ts` 增补SDL-FR-008三用例 → **3失败**；`test_service_jwt.py` 增补三用例 → **3失败**（旧身份仍为常量、旧身份令牌未被拒绝）。
- 随后实现（目录迁移→Manifest发现器→Seed重构→命名硬切换→向量重签→migration→夹具）全部转绿。

## 4. 验收证据（新鲜执行，2026-09-05）

### 4.1 静态与单元

```
npx tsc --noEmit        # exit 0
npx eslint src          # 0 problems（0 error / 0 warning）
npm test                # Test Files 41 passed (41) / Tests 351 passed (351)，skip 0
npm run build           # exit 0，零warning（standalone产物）
```

含：命名契约扫描（活动代码与配置零历史标识命中）、dsl布局契约（协议/地区目录、24规则、29参数、RS-SHANGHAI-PLAN-V1）、Manifest发现（含未来地区发现、不一致拒绝、路径越界拒绝）、黄金回归（golden.test.ts 3用例无漂移）、golden-snapshot、数据文件SHA-256契约。

### 4.2 Python

```
uv run ruff check .               # All checks passed!
uv run mypy agent tests           # 48 files, 0 errors
uv run pytest -m "not integration"    # 94 passed, 20 deselected（skip 0、warning 0）
uv run pip-audit                  # No known vulnerabilities found（policyops-agent自身"not found on PyPI"为预期提示）
```

含 `test_service_jwt.py`/`test_service_jwt_vectors.py`：新身份互验 + 旧身份统一拒绝。

### 4.3 数据库门禁（演练库 sdl_drill，全新PG17+pgvector）

```
npm run db:migrate   ×2   # 两次exit 0（含0010，幂等）
bootstrap-admin ×2        # created / no-op
npm run seed              # Manifest发现装载，851案例+500回归测试
npm run test:db           # Test Files 11 passed (11) / Tests 47 passed (47)，skip 0
agent.migrate --with-roles ×2（幂等）→ uv run pytest -q -m integration   # 20 passed
```

落库核验（psql直查，SDL-AC-001/005）：

```
rules(dsl_version='SOCILA-DSL-1.0' AND jurisdiction_code='310000') = 24
rules(dsl_version<>'SOCILA-DSL-1.0') = 0
params(jurisdiction_code='310000') = 29
policy_pack_versions(GD/SC示例包) = 0；params(四个示例参数) = 0
P-SH-CONTRIB-BASE-LOWER = 1（上海资产在位）
```

`test:db` 47用例含：0010 migration行为（规范化/未知值中止/六条精确删除+对照行/非预期地区与版本中止/快照与冲突引用中止/幂等）、区域隔离（夹具显式安装+afterAll清理零残留）、seed干净断言、上海迁移对账（legacy路径与快照路径逐案一致）、JWT集成、identity、tree、write-repository。

### 4.4 Auth E2E（SDL-AC-009）

```
SOCILA_E2E_DATABASE_URL / SOCILA_E2E_NEXTAUTH_SECRET / SOCILA_E2E_REFRESH_PEPPER（合成值）
npm run test:e2e:auth     # 10 passed (47.7s)，零AI API错误
```

### 4.5 Compose双向服务JWT冒烟（SDL-AC-004、SJWT-AC-017同构）

隔离栈 `sdljwt-smoke`（合成env、临时卷、独立端口）：`config --quiet` 通过 → 8服务running、6健康检查healthy → `/api/health`=`{"status":"ok","database":"ok"}`、`/internal/health`=200 → smoke库migration exit 0 → agent容器内PyJWT冒烟9断言全过：

1. `/internal/health`免JWT 200；2. 无JWT 401；3. 仅X-Service-Name 401；4. **新身份Next→Agent 200**；5. **旧身份（ssp-next-core）401无兼容**；6. 伪造服务名401；7. **新身份Agent→Core物化200且台账入库**；8. 同JTI重放401；9. 错误方向401。

`down -v` 后：sdljwt容器0、sdljwt卷0、临时compose/env文件已删除；`socila-*` 九容器与三数据卷全程未动。

### 4.6 Secret与Gitleaks（SDL-NFR-007）

```
node scripts/scan-secrets.mjs --all    # 563个候选文件零命中
node scripts/scan-secrets.mjs          # 98个候选文件零命中
Gitleaks 8.29.1完整历史（docker，--redact）：
  首跑40 commits发现19条 → 逐条核实均为测试合成值/业务字段名（详见ADR-0008）
  新增.gitleaks.toml（useDefault+精确路径×规则allowlist）→ 复跑 "no leaks found"（0发现）
```

### 4.7 持久库示例清理与对账（SDL-AC-007、NFR-002/005/006）

严格串行，全部步骤留痕于 `backup/`（Git忽略）：

1. 新鲜备份：`pg_dump -Fc` → `backup/policyops-sdl-pre-cleanup-20260905-174402.dump`（664,823 B）；SHA-256 `3f9e336f8d191c238b6edf53cdf3b30387dc68d024bbcfe81c84f3089c6a3aa9`（清单文件同目录）。
2. 真实恢复：临时容器 `sdl-restore-verify`（pgvector/pgvector:pg17）`pg_restore` exit 0、0错误、`vector`扩展在位。
3. 逐表对账（源库 vs 恢复库）：public+agent共25表行数**完全一致**（users 4、plans 9、conversations 12、cases 851、showcase_cases 117、tests 528、rules 24、params 33、policy_pack_versions 2…）。
4. 目标确认（删除前）：恰好2包（GD-EXAMPLE-BASE/440000/v1/published、SC-EXAMPLE-BASE/510000/v1/published）+4参数（与包/地区配对、v1/published）；快照成员/冲突/发布台账引用均为0；无额外版本或地区。
5. 执行 `npm run db:migrate`（应用0010）×2（第二次幂等exit 0）。
6. 清理后逐表对账（对照基线diff）：仅 `params 33→29`、`policy_pack_versions 2→0`，另新增 `public.service_jwt_replays|0`（0009于本次补齐，空表）；其余23表（含全部用户/规划/对话/案例/规则/测试）逐行计数不变。
7. 备份文件、旧Docker卷（`socila_pg-data`等）、历史备份与不可变政策快照均未删除。
8. 依PRD §9.5以新镜像重建 web/agent/worker/beat（`compose up -d web agent worker beat`），8服务全部healthy、`/api/health`与`/internal/health`通过——服务JWT身份切换在持久栈同步生效。

## 5. 验收场景结论（SDL-AC-001～010）

| 场景 | 结论 | 证据 |
| --- | --- | --- |
| AC-001 Seed落库310000/SOCILA-DSL-1.0 | PASS | §4.3 psql直查（24规则/29参数） |
| AC-002 未来地区Manifest发现 | PASS | region-manifest.test.ts（tmp双地区发现，上海常量零改动） |
| AC-003 命名契约扫描 | PASS | socila-naming-contract.test.ts（0命中；例外仅migration与守卫测试） |
| AC-004 旧身份401/新身份双向成功 | PASS | §4.5冒烟断言4/5/7 + Node/Python身份用例 |
| AC-005 全新库Seed无粤川示例 | PASS | §4.3直查 + seed-regional-clean.integration.test.ts |
| AC-006 粤川夹具可用且互不串入、零残留 | PASS | regional-isolation.integration.test.ts（afterAll断言0残留） |
| AC-007 备份恢复后migration只删固定目标 | PASS | §4.7（恢复对账+清理后diff精确） |
| AC-008 上海黄金回归无漂移 | PASS | golden.test.ts/golden-snapshot + shanghai-migration对账（§4.1/§4.3） |
| AC-009 新旧环境变量fail-fast | PASS | E2E以SOCILA_E2E_*运行通过；旧变量零读取路径（扫描）；缺变量集成测试直接失败 |
| AC-010 Excel重命名SHA-256一致 | PASS | data-file-contract.test.ts（708ad300…） |

## 6. 偏差与说明

- **Gitleaks allowlist机制**：PRD SDL-NFR-007预期以fingerprint登记新误报；实测发现fingerprint绑定提交SHA，契约向量随服务身份切换必然重签（本Feature即重签一次），逐提交fingerprint不可维护。改用`.gitleaks.toml`路径×规则精确allowlist（默认规则集完整保留），核实记录与影响面见ADR-0008。该机制已同步至ARCHITECTURE/TESTING/CI描述。
- **持久库0009补齐**：本机持久库此前停在0008，本次迁移顺带应用0009（`service_jwt_replays`，空表）——属既有已验收migration的正常补齐，非本Feature新增行为；对账diff中已单独标注。
- **历史提交中的Gitleaks命中**：19条命中全部由提交`35d673c`（09-03 SJWT）引入，属该Feature遗留的完整历史扫描缺口，本次一并闭环。
- 工作树中用户既有文档改动（09-03 PRD版本锚点修正、09-05 PRD §17移除、PROGRESS/README/验收报告v2.0.0口径）全程保留，未回退、未覆盖。

## 7. 结论

**PASS。** SDL-FR-001～014、SDL-NFR-001～007全部有实现与测试映射；SDL-AC-001～010取得新鲜证据；持久库六条示例在可恢复备份、真实恢复对账与精确目标确认后完成清理，历史快照、用户数据与备份未受影响；活动代码与配置完成Socila硬切换且命名扫描零命中；服务JWT身份两端原子切换为`socila-next-core`。Definition of Done满足，PRD状态更新为Active。
