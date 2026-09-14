# WI-20260914-01：闭环v1.0.1发布CI门禁

> Author: Jan
> Status: Accepted（2026-09-15独立复审通过；GitHub运行#29验证最终功能分支HEAD `0fc16da`，六项job全部success）
> Updated: 2026-09-15

## Work Item

- ID：WI-20260914-01
- 关联PRD：`docs/prd/09-03-stage-policyops-pre-merge-release.md` §PMG-FR-015～029、PMG-NFR-001～009
- 关联需求：PMG-FR-020（gates）、PMG-FR-022（database-gates）、PMG-FR-023（e2e-gates）、PMG-FR-024（container-gates）、PMG-NFR-001（不依赖开发机缓存、已存在容器）、PMG-NFR-003（失败关闭）、PMG-NFR-005（零未解释警告）、PMG-NFR-007（可审计）
- 关联验收：PMG-AC-002/005/007/009/011
- 起点：`origin/main@6411ea604b4ec10ff3fa7d2d6f70fd9f761f0034`（`v1.0.1` tag精确指向，禁止移动）
- 工作分支：`codex/ci-v1.0.1-closure`
- 失败运行：<https://github.com/Jan-mx/Socila/actions/runs/34833854266>（CI #23，push main）

## 背景与RED证据（CI #23，2026-09-14T10:34Z，经GitHub Actions API读取job日志）

六项必需检查中`agent-gates`与`security-gates`通过，其余四项失败。以下为各job的**首个实际错误**（非通用退出码推断）：

| Job | 失败步骤 | 首个实际错误（日志原文摘录） | 根因分类 |
| --- | --- | --- | --- |
| `gates` | TypeScript | `src/app/api/rag/originals/[documentVersionId]/route.ts(23,15): error TS2304: Cannot find name 'RouteContext'.` | 路由签名依赖Next `next build`生成的`.next/types/routes.d.ts`全局`RouteContext`；干净checkout无`.next`目录时`tsc --noEmit`不可见该类型 |
| `gates` | ESLint（通过但含warning） | 7条`@typescript-eslint/no-unused-vars`/`react-hooks/exhaustive-deps` warning（`npx eslint src`未设`--max-warnings 0`） | 违反PMG-NFR-005零未解释警告；本地`npx eslint src e2e --max-warnings 0`为8条（e2e目录多1条） |
| `database-gates` | Node database suite | `shv2-shanghai-delta.integration.test.ts`：`Command failed: git show d7fd63a0de5b4da7d48ea66445223ee51666e620:dsl/regions/cn_dsl_v1/rules_manifest.json` / `fatal: path ... exists on disk, but not in 'd7fd63a…'` | 测试硬编码`git show`历史提交`d7fd63a`；squash后的`main`不可达该对象（git对不存在对象亦输出该提示，本地已复现） |
| `database-gates` | Node database suite | `rcl-cli.integration.test.ts`与`rcl-rewrite-cli.integration.test.ts`：`Error response from daemon: No such container: jrp-drill-pg`（prepare-archive `docker exec jrp-drill-pg pg_dump -U ci_db_user -Fc policyops_ci`） | 测试默认容器名`jrp-drill-pg`（本机开发容器）；CI未传入GitHub service容器ID；恢复演练还硬编码`-U postgres`（CI管理用户为`ci_db_user`） |
| `e2e-gates` | auth E2E | 29用例：3失败/19通过/7未运行。①`shv2-case-copy.spec.ts:46` `expect(locator('[data-case-card]')).toHaveCount(10)` Received 0；②`task3-regional.spec.ts:171` compute `Expected: 200 Received: 422`；③`task4-case-library.spec.ts:74` `expect(res.cases.length).toBe(36)` Received 0 | e2e-gates初始化只做migration/bootstrap/seed，缺少仓库验收文档要求的`npx tsx scripts/e2e-rcl-setup.ts`（激活沪粤快照+受控替换为36/36/80案例库）——公开案例0条、无活动release导致规划422 |
| `container-gates` | compose up | `minio Error pull access denied for minio/minio, repository does not exist or may require 'docker login': denied: requested access to the resource is denied`（redis/postgres/proxy随之Interrupted） | GitHub-hosted runner匿名拉取Docker Hub `minio/minio:RELEASE.2025-09-07T16-13-09Z`被拒——后续经Docker Hub API核验该仓库已不可用（`object not found`，非单纯限流/配额问题）；CI改用Quay同digest镜像（生产`docker-compose.yml`未修改，镜像源切换为单独待处理事项）；现有工作流在`down -v`前未保留容器日志与状态，无诊断artifact |

本地RED复现：`npx eslint src e2e --max-warnings 0`退出非0（8 warning）；`git show 0123…:dsl/regions/cn_dsl_v1/rules_manifest.json`对不存在对象输出与CI相同的`exists on disk, but not in`提示；`.next/types/routes.d.ts:137`确认`RouteContext`为构建生成类型。

## 范围

1. **gates**：RAG原件下载路由改为显式`params: Promise<{ documentVersionId: string }>`签名，新增源码契约测试；清零全部ESLint warning；CI命令改为`npx eslint src e2e --max-warnings 0`。
2. **database-gates**：把`d7fd63a`基线固化为版本化测试夹具（schema/version、source commit、内容SHA-256、基线预期计数），测试直接读取并校验夹具；RCL演练容器与数据库参数从`RCL_DRILL_PG_CONTAINER`与实际`DATABASE_URL`读取，缺失即前置明确失败。
3. **e2e-gates**：初始化顺序与仓库验收文档一致（migration→bootstrap-admin→seed→`CREATE EXTENSION vector`→`e2e-rcl-setup`→build→E2E）；失败时上传playwright-report/test-results/trace/standalone Web日志/mock日志。
4. **container-gates**：`down -v`前`if: failure()`诊断步骤并上传artifact；CI专用Compose override（无固定container_name、项目级临时volume、不绑定宿主固定端口、唯一project name）；按真实首错修复镜像拉取。
5. 文档：本WI、`PROGRESS.md`、`TESTING.md`、`reports/traceability.md`；Compose CI边界变化同步`OPERATIONS.md`。

## 非目标

- 不修改`main`、`refactor/*`分支；不移动/删除`v1.0.1`或`v1.0.0` tag；不创建新tag、PR或GitHub Release。
- 不修改生产容器`socila-*`、生产PostgreSQL、MinIO、RAG数据或`socila_pg-data`/`socila_minio-data`/`socila_caddy-data` volume。
- 不降低断言、不跳过测试、不扩大Gitleaks allowlist、不用`continue-on-error`/重试/延长超时掩盖确定性失败。
- 不改变`infra/prod/docker-compose.yml`的生产运行语义（CI差异只经override文件表达）。
- 不长期依赖refactor分支或本机Git对象、固定开发容器名、生产volume。

## 需求

- **CIG-FR-001 显式路由签名**：`src/app/api/rag/originals/[documentVersionId]/route.ts`的`GET`第二参数类型为`{ params: Promise<{ documentVersionId: string }> }`，不引用全局`RouteContext`；鉴权、UUID校验、服务JWT代理、下载响应与安全头行为不变。
- **CIG-FR-002 零ESLint warning**：`npx eslint src e2e --max-warnings 0`退出0；未使用import/变量删除或参与真实断言；`identityQuery`的`useEffect`依赖正确处理（不禁用规则）。
- **CIG-FR-003 基线夹具**：`src/lib/policy-materialization/__fixtures__/policy-baseline-d7fd63a.json`记录`schema`、`fixtureVersion`、`sourceCommit`、`contentSha256`（files映射规范化JSON的SHA-256）、`expectedCounts {rules:26, params:46, ruleSets:4, packs:4}`与四地区DSL文件原文；由只读脚本从本地Git对象一次性提取。
- **CIG-FR-004 夹具校验**：`shv2-shanghai-delta.integration.test.ts`不再执行`git show`；加载夹具时校验schema/版本/sourceCommit/内容SHA-256/预期计数，任一不符即失败；业务断言（基线26/46/4/4、当前只产生上海delta 10/31/1/1、CN/广东/四川零新增零漂移、复跑no-op）保持不变。
- **CIG-FR-005 演练环境解析**：新增共享解析器（`resolveDrillPgEnv`）：容器ID只来自`RCL_DRILL_PG_CONTAINER`（无默认值）；用户名、数据库名、端口来自实际数据库URL；任一缺失抛出带缺失项名称的明确错误。RCL两个集成测试与`scripts/e2e-rcl-setup.ts`全部经该解析器获取参数，psql/pg_restore使用`-U <url用户>`并显式`-d`。
- **CIG-FR-006 CI传入容器ID**：`database-gates`与`e2e-gates`设置`RCL_DRILL_PG_CONTAINER: ${{ job.services.postgres.id }}`。
- **CIG-FR-007 E2E初始化一致**：e2e-gates步骤依次为migration、bootstrap-admin、seed、`CREATE EXTENSION IF NOT EXISTS vector`（如migration未保证）、`npx tsx scripts/e2e-rcl-setup.ts`、production build、`npm run test:e2e:auth`；保持29项Chromium契约不删不改断言。
- **CIG-FR-008 E2E诊断artifact**：E2E失败（`if: failure()`）上传`playwright-report/`、`test-results/`（含trace）、standalone Web日志与mock OpenAI/Agent日志。
- **CIG-FR-009 Compose诊断**：container-gates在`down -v`前增加`if: failure()`步骤输出并保存`docker compose ps -a`、`logs --no-color`、各容器`State.Status/Health.Status/ExitCode`、`docker info`、`docker system df`、已占用端口、Compose网络与volume清单，并以artifact上传后才清理。
- **CIG-FR-010 CI Compose override**：新增`infra/prod/docker-compose.ci.yml`：移除固定`container_name`、使用项目级临时volume（不使用`socila_pg-data`/`socila_minio-data`/`socila_caddy-data`）、不绑定80/443/5432/6380/9000/9001宿主固定端口（需要宿主访问的端口改为随机映射）、保留服务间内部DNS/健康检查/服务JWT冒烟；`COMPOSE_PROJECT_NAME`含`run_id`唯一；成功或失败均无条件清理任务专属容器/网络/volume。
- **CIG-FR-011 镜像拉取首错修复**：依据CI #23真实首错（`pull access denied for minio/minio, repository does not exist or may require 'docker login'`；后续经Docker Hub API核验仓库不可用）做最小修复，不在未知根因下同时改多个服务。
- **CIG-NFR-001 干净可复现**：全部测试在fresh clone（仅main squash历史，不含`d7fd63a`对象）与fresh PG17+pgvector上可复现。
- **CIG-NFR-002 不引入临时触发**：最终提交的`ci.yml`触发条件保持`pull_request`/`main` push/`workflow_dispatch`；验证功能分支使用`workflow_dispatch`指定ref。

## 测试矩阵

| 需求 | 测试 | 层级 |
| --- | --- | --- |
| CIG-FR-001 | `src/app/api/rag/originals/__tests__/route-signature.contract.test.ts`（源码契约：无`RouteContext`引用、参数类型为显式Promise对象）+ 既有`route.test.ts` 4例（401/400/附件头/404/502） | 单元 |
| CIG-FR-002 | `npx eslint src e2e --max-warnings 0` | 静态 |
| CIG-FR-003/004 | `src/lib/policy-materialization/__tests__/policy-baseline-fixture.test.ts`（schema/sourceCommit/SHA-256/计数/篡改拒绝/缺文件拒绝）+ `shv2-shanghai-delta.integration.test.ts` 3例 | 单元 + DB集成 |
| CIG-FR-005 | `src/lib/case-governance/__tests__/drill-pg-env.test.ts`（缺容器/缺URL/缺用户名/缺库名/端口默认/成功解析） | 单元 |
| CIG-FR-005/006 | `rcl-cli.integration.test.ts`、`rcl-rewrite-cli.integration.test.ts`在`RCL_DRILL_PG_CONTAINER=<容器ID>`+`POSTGRES_USER=ci_db_user`容器上通过 | DB集成 |
| CIG-FR-007 | 全新PG17库经完整初始化后Chromium E2E 29/29 | E2E |
| CIG-FR-009/010 | `src/lib/env/ci-compose-override-contract.test.ts`（override无container_name、无固定宿主端口、无生产volume名、合并config通过）+ 本地CI Compose完整启动/健康/冒烟/清理 | 单元 + 部署 |
| CIG-NFR-002 | `actionlint` + 手工核对`on:`块 | 静态 |

## 验收场景

- **CIG-AC-001** Given无`.next`目录的干净checkout，When执行`npx tsc --noEmit`，Then退出0。
- **CIG-AC-002** Given当前源码，When执行`npx eslint src e2e --max-warnings 0`，Then退出0且0 warning。
- **CIG-AC-003** Given仅含main squash历史且不含`d7fd63a`对象的全新clone与全新PG17+pgvector库，When执行`npm run test:db`，Then`shv2-shanghai-delta`3例通过（基线26/46/4/4、上海delta 10/31/1/1、其他地区零新增、复跑no-op），零失败零skip。
- **CIG-AC-004** Given夹具`contentSha256`或任一文件被篡改，When加载夹具，Then测试以明确错误失败。
- **CIG-AC-005** Given未设置`RCL_DRILL_PG_CONTAINER`或URL缺用户名，When RCL集成测试/`e2e-rcl-setup`启动，Then前置检查抛出含缺失项名称的错误，不产生undefined或计数级联失败。
- **CIG-AC-006** Given `POSTGRES_USER=ci_db_user`的PG17+pgvector容器与其容器ID，When执行RCL两个CLI集成测试，Then pg_dump→pg_restore→全表/sequence/hash对账、错误授权、篡改、幂等、漂移断言全部通过。
- **CIG-AC-007** Given全新PG17库按CIG-FR-007顺序初始化并production build，When执行`npm run test:e2e:auth`，Then 29/29通过；Given任一失败，Then artifact含playwright-report/test-results/trace/Web与mock日志。
- **CIG-AC-008** Given CI override与合成env，When`docker compose -f docker-compose.yml -f docker-compose.ci.yml up`，Then 8服务running、6健康检查healthy、`/api/health`与`/internal/health`通过、SJWT-AC-017双向冒烟通过；Then无条件清理后任务专属容器/网络/volume为0，`socila-*`资源未动；Given启动失败，Then artifact含ps/logs/inspect/docker info/df/端口/网络/volume清单。
- **CIG-AC-009** Given推送`codex/ci-v1.0.1-closure`并`workflow_dispatch`该ref，Then六项job全部success且无ESLint warning。
- **CIG-AC-010** Given最终提交，Then`main`、`refactor/*`、`v1.0.1`、`v1.0.0`与生产环境SHA/容器/volume均未变化。

## 风险与回退

- 夹具体积：四地区DSL原文约数百KB，作为测试夹具进入仓库；回退为删除夹具与测试改动（单一提交revert）。
- Compose override与生产文件分离，生产`docker compose up`不受影响；CI仅经`-f docker-compose.yml -f docker-compose.ci.yml`叠加。
- 镜像拉取修复（Quay同digest镜像）若仍不可达，诊断artifact可精确定位；不以重试掩盖。
- 全部改动可通过revert单一提交恢复到`6411ea6`。

## 文档同步清单

- 本WI（RED→GREEN证据、全绿运行URL）
- `docs/refactor/policy-ops-agent/PROGRESS.md`
- `docs/refactor/policy-ops-agent/TESTING.md`
- `docs/refactor/policy-ops-agent/reports/traceability.md`
- `docs/refactor/policy-ops-agent/OPERATIONS.md`（CI Compose边界）
- `docs/work-items/README.md`（Updated日期）

## 验证命令

```powershell
npx tsc --noEmit                                  # 干净checkout、无.next
npx eslint src e2e --max-warnings 0
npm test                                          # 零失败零skip
$env:SOCILA_TEST_DATABASE_URL="..."; $env:RCL_DRILL_PG_CONTAINER="<id>"; npm run test:db
cd services/agent; uv sync --frozen; uv run ruff check .; uv run mypy agent tests; uv run pytest -q -m "not integration"; uv run pytest -q -m integration; uv run pip-audit
npm run build
npm run test:e2e:auth                             # 全新库+e2e-rcl-setup后
docker compose -f docker-compose.yml -f docker-compose.ci.yml --env-file .ci.env config --quiet
npx tsx scripts/citation-check.ts / rcl-case-library-v2-doc.ts --check / Markdown链接检查
node scripts/scan-secrets.mjs --all
gitleaks + node scripts/verify-gitleaks-allowlist.mjs
actionlint .github/workflows/ci.yml
git diff --check
```

## 完成条件

- CIG-AC-001～010全部有实际证据路径；六项GitHub job全绿运行URL记录于本WI与PROGRESS。
- 无ESLint warning；E2E与Compose失败必产出可下载诊断artifact。
- CI不依赖本机Git对象、固定开发容器名或生产volume。
- traceability记录实现与测试路径；PROGRESS/TESTING/OPERATIONS同步；README状态从Updating恢复Active。
- 代码修复提交与docs-only事实修正提交均已推送至`origin/codex/ci-v1.0.1-closure`，本地HEAD等于远端；先达到`Ready for independent review`，再经2026-09-15独立复审转为`Accepted`。

## 交付记录（2026-09-14；起点`6411ea6`，分支`codex/ci-v1.0.1-closure`，最终SHA=本提交HEAD）

### 根因与RED→GREEN

| 门禁 | RED（真实证据） | 修复 | GREEN |
| --- | --- | --- | --- |
| gates/TypeScript | CI #23 `route.ts(23,15) TS2304 RouteContext`；本地`.next/types/routes.d.ts:137`证实为构建生成类型；新增`route-signature.contract.test.ts`首跑2失败/1通过 | 显式`{ params: Promise<{ documentVersionId: string }> }` | 契约3/3+行为4/4；fresh clone（无`.next`）`npx tsc --noEmit`退出0 |
| gates/ESLint | `npx eslint src e2e --max-warnings 0`退出非0（8 warning，与CI 7条+e2e 1条一致） | 删除死代码/未用import与解构；常量与`finalFingerprint`参与真实断言；`identityQuery`入依赖 | 退出0、0 warning |
| database-gates/d7fd63a | CI与本地同报`git show d7fd63a…`失败（git对不存在对象同样输出`exists on disk, but not in`）；`baseline-fixture.test.ts`首跑模块缺失 | 版本化夹具（38文件、`contentSha256 9f9da11d…`、26/46/4/4）+失败关闭加载器；测试改读夹具 | 夹具11/11；`shv2-shanghai-delta` 3/3在**不含d7fd63a对象的fresh clone**通过 |
| database-gates/RCL容器 | CI `No such container: jrp-drill-pg`；`drill-pg-env.test.ts`首跑模块缺失 | `resolveDrillPgEnv`（容器ID无默认、用户/库/端口来自URL、缺失明确报错）；psql/pg_restore用URL用户+显式`-d` | 11/11；两个RCL集成测试在`POSTGRES_USER=ci_db_user`容器（`RCL_DRILL_PG_CONTAINER=<容器ID>`）通过 |
| database-gates/未处理错误（新增发现） | CI #23第1177行与本地首轮同报`[vitest-worker]: Timeout calling "onTaskUpdate"`——全部用例通过仍`test:db`退出1（首轮29文件/160通过、exit 1） | `run-subprocess.ts`异步helper（含事件循环响应性单测）；两个RCL测试的CLI/seed/docker调用改`await` | helper 6/6；全新容器第二轮`npm run test:db` 29文件/160通过、**exit 0、零Unhandled** |
| database-gates/Python skip（新增发现） | 本地首轮`pytest -m integration` 99通过/**32 skipped**（全部`requires RAG_SYNC_TEST_MINIO_ENDPOINT`；CI该job无MinIO） | database-gates临时启动两个隔离MinIO（Quay同digest、回环19000/19001、合成凭据、`if: always()`删除）；契约测试先RED后GREEN | CI同款配置本地`pytest -m integration` **131通过/0 skip** |
| e2e-gates | CI #23：`[data-case-card]`期望10实际0、compute期望200实际422、cases期望36实际0（3失败/7未运行）——初始化缺`e2e-rcl-setup` | 初始化顺序migration→Jan引导→seed→`CREATE EXTENSION vector`→`e2e-rcl-setup`→build→E2E；失败上传playwright-report/test-results/trace/Web与mock日志（Playwright html报告+webServer pipe） | 全新库`e2e-rcl-setup` 36/36/80 → Chromium **29/29**（1.6m）；`playwright-report/`、`test-results/`、`e2e-artifacts/e2e-run.log`（35行`[WebServer]`日志）均生成 |
| gates/单测跨平台（GitHub运行#24新发现） | 运行#24 `case-library-doc.test.ts`失败：`SH-male-before_1970-employed-RETIREMENT`已提交manifest与内存生成器仅在同文档两条来源（`附件1-3`/`国务院办法第一条`）**顺序**上不同；根因`dsl-evidence-index.ts`用无locale的`localeCompare`排序中文（Windows zh-CN与Linux root collation不同）；新增`dsl-evidence-index.test.ts`在Windows旧实现下2/2失败（RED） | 排序改为UTF-16 code-unit元组序（documentId→locator.reference→excerpt）；以测试同款内存生成器重建已提交manifest与Markdown（回填原快照绑定、重算contentHash；36场景中29个来源顺序规范化、内容零变化；manifestHash `c974157d…`→`d4a2b01c…`） | 新测试2/2；`case-library-doc.test.ts`通过；`--check` ok；`npm test` 94文件/950 |
| container-gates/Trivy（GitHub运行#24新发现） | 运行#24 Compose全部步骤通过后Trivy失败：`aquasecurity/trivy crit unable to find '0.74.0'`——trivy-action `version`输入须与release tag同形（默认`v0.70.0`），`v0.74.0`存在且为最新；契约测试先RED | 两处`version: "v0.74.0"` | 契约13/13；actionlint 0 |
| container-gates/agent就绪竞态（GitHub运行#25新发现） | 运行#25 Compose up后`health checks`失败：web首轮探测即就绪，随后agent `/internal/health`**单次无等待探测**在uvicorn完成启动前返回`Connection refused`（诊断artifact：8容器均running、exitCode 0、无重启）；契约测试先RED | 健康检查改为对web与agent都做就绪条件轮询（`wait_for`，各最多180秒；不是延长超时掩盖确定性失败，而是补齐缺失的等待条件） | 契约13/13；actionlint 0；`wait_for`引号/退出码本地验证 |
| container-gates | CI #23 `pull access denied for minio/minio, repository does not exist`；Docker Hub API核实仓库已不存在（`object not found`），非限流；`ci-compose-override-contract.test.ts`对原状态ENOENT | `docker-compose.ci.yml`（`!reset`容器名/端口、`external`生产卷、`ci-*`临时卷、postgres随机端口、`quay.io/minio/minio@sha256:14cea493…`与生产在用镜像RepoDigest一致）；`COMPOSE_FILE`+唯一项目名；`if: failure()`诊断→上传→`down -v`→零残留核验；container-gates补`npm ci`（首错之后的潜在失败） | 契约13/13；本地完整流程：`config --quiet`、契约核验4项OK、8 running/6 healthy、随机端口58980 migration、SJWT-AC-017 OK、诊断采集、`down -v`、残留0/0/0；`socila-*`容器与三个生产卷未动 |

### 本地新鲜门禁（fresh clone `F:/Socila-ci-verify`：单分支克隆、无`d7fd63a`对象、无`.next`；任务专属容器`ci-closure-pg`=pgvector/pgvector:pg17、`POSTGRES_USER=ci_db_user`）

| 门禁 | 结果 |
| --- | --- |
| TypeScript（干净checkout） | `npx tsc --noEmit`退出0 |
| ESLint | `npx eslint src e2e --max-warnings 0`退出0 |
| Node单元 | `npm test` 94文件/950通过、零失败零skip（新增route-signature 3、baseline-fixture 11、drill-pg-env 11、run-subprocess 6、ci-compose-override-contract 13、dsl-evidence-index 2） |
| 数据库门禁（CI顺序） | migration×2、bootstrap×2、seed、vector扩展全部退出0；`npm run test:db` 29文件/160通过、exit 0、零Unhandled；`agent.migrate --with-roles`×2幂等；`pytest -m integration` 131通过/0 skip（两个隔离MinIO） |
| Agent | `uv sync --frozen`、ruff 0问题、mypy 54文件0错误、`pytest -m "not integration"` 137通过；**pip-audit环境阻塞**（本机代理到PyPI `ProxyError`，与PROGRESS 2026-09-04记录同因；`pyproject.toml`/`uv.lock`零diff，CI #23 agent-gates pip-audit已通过） |
| Build + E2E | `npm run build`退出0；全新库Chromium 29/29 |
| CI Compose | 见上表；**Trivy环境阻塞**（本机无法拉取`aquasec/trivy:0.74.0`且漏洞库镜像连接拒绝；本任务未改`Dockerfile`/`services/agent/Dockerfile`，以GitHub container-gates Trivy 0.74.0为准） |
| citation/案例库/链接 | citation组9/9；`rcl-case-library-v2-doc.ts --check` ok（重建后manifestHash `d4a2b01c…`）；变更Markdown相对链接8/8存在 |
| 安全 | `scan-secrets --all` 966文件零命中；Gitleaks 8.29.1完整历史（fresh clone）零发现；allowlist哨兵3场景全过 |
| 工作流 | actionlint 1.7.7零发现；`git diff --check`通过 |

### GitHub Actions（功能分支`workflow_dispatch`）

- 运行#24 <https://github.com/Jan-mx/Socila/actions/runs/34854340650>（提交`aaee1ed`，首次dispatch）：agent-gates/security-gates/database-gates/e2e-gates成功；gates失败于`case-library-doc.test.ts`（跨平台排序）、container-gates失败于Trivy安装（版本前缀）——两项根因已如上修复并重新验证。
- 运行#25 <https://github.com/Jan-mx/Socila/actions/runs/34857595911>（提交`689469f`）：gates/agent-gates/security-gates/database-gates/e2e-gates成功（5/6）；container-gates在Compose up后失败于agent就绪竞态（诊断artifact `compose-diagnostics-34857595911-1`已按设计上传）——已修复。
- **运行#26 <https://github.com/Jan-mx/Socila/actions/runs/34859661518>（SHA=`087cf8f19144d2b0120d7b0e9e4565932aae06e1`）：gates、agent-gates、database-gates、e2e-gates、container-gates、security-gates六项全部success。**
- 运行#27 <https://github.com/Jan-mx/Socila/actions/runs/34861445884>（SHA同为`087cf8f…`，与#26内容相同）：状态**cancelled**（同ref并发组取消），**不能作为验收证据**。
- **运行#28 <https://github.com/Jan-mx/Socila/actions/runs/34861667883>（SHA=`20007c5547ba5f030d2df4ff4bdcfef7b9d71b5a`）：gates、agent-gates、database-gates、e2e-gates、container-gates、security-gates全部success——这是代码交付提交`20007c5`的最终有效验收证据。**本docs-only事实修正提交不改变任何代码；其CI运行结果记录于交付报告，不在本文档循环记录自身运行URL。

### 边界

- `main`、`refactor/*`、`v1.0.0`、`v1.0.1`未修改；未创建PR/tag/Release；生产`socila-*`容器、生产PostgreSQL/MinIO/RAG与`socila_*`卷未连接未修改（本地验证全程使用任务专属`ci-closure-pg`、`rag-minio-a/b`与唯一项目名Compose栈，结束后删除）。
- 本地`web:latest`/`agent:latest`标签未改写（Compose模拟使用`web:ci-closure-local`/`agent:ci-closure-local`临时标签，验证后删除）。
- 生产`infra/prod/docker-compose.yml`未修改；Docker Hub `minio/minio`仓库消失对全新部署的风险记录于`OPERATIONS.md`，切换生产镜像来源需用户另行授权。

## 独立复审与集成授权（2026-09-15）

- 独立复审覆盖`main@6411ea6..codex/ci-v1.0.1-closure@0fc16da`：Critical=0、Important=0、Minor=0；此前两处运行号事实错误与一处MinIO根因表述不一致均已闭环。
- GitHub Actions运行#29：<https://github.com/Jan-mx/Socila/actions/runs/34867806117>，精确绑定`0fc16da6bfd20bdb5b83a9217c00778139350459`，六项job全部success。
- 用户授权将功能分支最终状态以squash方式作为一个普通提交合入`main`，并在新的main提交通过六项CI后移动annotated tag `v1.0.1`；最终main SHA与tag对象在发布交付报告中记录。
