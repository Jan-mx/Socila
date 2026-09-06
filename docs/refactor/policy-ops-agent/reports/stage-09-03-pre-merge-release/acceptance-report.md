# 09-03 阶段验收报告：PolicyOps P0 合并质量门禁与 v2.0.0 发布准备

> Author: Jan
> Status: Active
> Updated: 2026-09-03
> 执行者：Agent（本地门禁与文档）；PR/ruleset/merge/tag/Release：未来人工动作（见 §10 与 PRD §17）

## 1. 范围

本阶段交付 `docs/prd/09-03-stage-policyops-pre-merge-release.md` 定义的 PMG-FR-001～041 与 PMG-NFR-001～009：修复 Auth E2E 协议假阳性、建立 Node/Python 测试分层与无 skip 数据库门禁、重写六 job CI 工作流（固定 Action SHA）、Gitleaks/Trivy/Secret 安全门禁、Web/Agent 镜像加固、`AUTH_REFRESH_PEPPER` 必填配置、0.2.0 版本元数据、文档同步与发布治理准备。

Auth 由提交 `71da7fc feat: 完成用户与管理员双角色鉴权` 交付，本阶段未重新实现、拆分或改写该提交。

## 2. 环境与约束

- 开发机：Windows + Git Bash + Docker Desktop；本地 prod-like Compose 栈（`socila-*`，宿主端口 80/443/5432/6380/9000）全程未触碰。
- 数据库门禁使用全新本地演练容器（`pgvector/pgvector:pg17`，独立 volume，仅合成凭据）：首轮 `socila-pmg-pg`（宿主端口 5435）、复验 `socila-pmg-pg2`（5436）；E2E 使用独立全新演练库 `socila-pmg-pg3`（5437）；Compose 冒烟同样只用合成值。
- 未读取或修改任何生产数据；未改写 `archive/` 与既有历史报告；未降低任何测试、安全、Schema、Secret 或漏洞阈值。

## 3. 提交与分支

- 分支：`refactor/policy-ops-agent-platform`（upstream 同名，已同步）。
- 本阶段父提交：`b01c372`（`feat: 调整密码策略为8位以上且含字母数字`）。
- 本阶段提交（按时间顺序）：
  1. `67c7c616e99e22c573da63a3a102f0cfc7257508` — `ci: 补齐鉴权后的合并门禁与发布流程`（P0 提交，未 amend、未 force-push）；
  2. `20e12d9ed1a08f42a8044e2d4c29c0087d1f06c5` — `fix: 修正开发分支门禁与验收闭环`（e2e-gates 先 `npm ci` 再安装 Chromium；SC2155/SC2034 修正；container-gates 全 8 服务状态与健康断言）；
  3. `ced6a5ac3f346dc783ae2e3dd911b4b3faf2df20` — `fix: 对齐E2E管理员引导账号与测试规格`（复验发现 CI 引导账号与 `e2e/auth.spec.ts` 既有验收契约不一致，对齐为规格契约值，不引入新凭据字面量）。
- `origin/main` 审阅期间未前进：merge-base 与 `origin/main` 同为 `1c0f6e7eb48d0e6b4ef52063454afdb0c8375d4c`。
- 代码审阅范围截止修正提交 `ced6a5a`（§9）；其后仅有验收证据与状态文档变更（docs-only 提交 `docs: 完成P0开发分支验收记录`，不含代码变化）。

## 4. PMG-AC-001：Auth 协议修正 Red/Green

- Red（`src/lib/ai/agent.ts` 仍走默认 `/v1/responses`，mock 仅支持 Chat Completions，E2E 新增助手回复断言）：`1 failed / 4 passed`，失败原因 `AI_APICallError: not found`（`/v1/responses` 404），助手回复断言不成立。
- Green（改为 `openai.chat(model)` 强制 `POST /chat/completions`）：`10 passed`，退出码 0；日志零 `AI_APICallError`、零 404；助手回复与刷新会话持久化断言通过。

## 5. 六项门禁本地复现（全部新鲜执行）

| # | CI job | 本地命令 | 退出码 | 数量/结论 | skip | warning |
| --- | --- | --- | ---: | --- | ---: | --- |
| 1 | `gates` | `npx tsc --noEmit` | 0 | 类型检查通过 | 0 | 0 |
| 1 | `gates` | `npx eslint src` | 0 | lint 通过 | 0 | 0 |
| 1 | `gates` | `npm test` | 0 | 29 文件 / 237 测试通过 | 0 | 0 |
| 1 | `gates` | `npm run build` | 0 | 生产构建（standalone）通过 | 0 | 0 |
| 2 | `agent-gates` | `uv run ruff check .` | 0 | 0 问题（含 CJK 忽略 RUF001/002/003，见 §8 决策记录） | 0 | 0 |
| 2 | `agent-gates` | `uv run mypy agent tests` | 0 | 42 源文件 0 错误 | 0 | 0 |
| 2 | `agent-gates` | `uv run pytest -m "not integration"` | 0 | 38 通过、5 deselected（marker 分层） | 0 | 0（DeprecationWarning 提升为 error） |
| 2 | `agent-gates` | `uv run pip-audit` | 0 | No known vulnerabilities found；本地项目自身 "not found on PyPI" 提示见 §5 说明 | 0 | 0 |
| 3 | `database-gates` | `npm run db:migrate` ×2、`bootstrap-admin` ×2、`npm run seed`（5436 全新库） | 0 | 8 个 migration 全部应用；二次 migration/引导均为幂等 no-op；seed 851 案例 + 500 回归 | 0 | 0 |
| 3 | `database-gates` | `npm run test:db` | 0 | 7 文件 / 23 测试通过 | 0 | 0 |
| 3 | `database-gates` | `uv run python -m agent.migrate --with-roles` | 0 | 幂等；空 agent 密码 RAISE EXCEPTION | 0 | 0 |
| 3 | `database-gates` | `uv run pytest -q -m integration` | 0 | 5 通过、38 deselected | 0 | 0 |
| 4 | `e2e-gates` | `npm run build` + `npm run test:e2e:auth`（5437 全新库） | 0 | 10 通过（59.1s，真实 standalone + mock 模型，零 AI API 错误） | 0 | 0 |
| 5 | `container-gates` | `docker build -f Dockerfile -t web:latest .` | 0 | 镜像构建成功 | — | — |
| 5 | `container-gates` | `docker build -f services/agent/Dockerfile -t agent:latest services/agent` | 0 | 镜像构建成功 | — | — |
| 5 | `container-gates` | `docker compose config`（缺 `AUTH_REFRESH_PEPPER`） | 1 | 必填插值拒绝：`required variable AUTH_REFRESH_PEPPER is missing a value` | — | 0 |
| 5 | `container-gates` | `docker compose config`（合成 env 完整） | 0 | 配置解析通过 | — | 0（未设可选变量仅本地 config 校验噪音，CI env 文件已含全部值） |
| 5 | `container-gates` | `docker compose up -d`（合成 env、临时卷）+ 健康检查 + 全 8 服务状态断言 + `down -v` | 0 | 8 服务全部 running；web/agent/worker/postgres/redis/minio 健康检查全部 healthy（web 第 1 次探测 ok）；agent `/internal/health`=200；容器/卷/网络残留 0 | — | 0 |
| 5 | `container-gates` | Trivy 0.74.0 `--scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1` ×2 | 0 | web:latest 0 发现；agent:latest 0 发现 | — | — |
| 6 | `security-gates` | `node scripts/scan-secrets.mjs --all` | 0 | 533 个跟踪文件无命中 | — | 0 |
| 6 | `security-gates` | Gitleaks 8.29.1 完整历史（`detect -v`，32 commits） | 0 | no leaks found（`.gitleaksignore` 仅 5 个已核实 fingerprint） | — | 0 |
| — | workflow 静态校验 | actionlint 1.7.7（`rhysd/actionlint:1.7.7`） | 0 | 零发现：六 job 名称、触发器、token 权限与 timeout 设置正确（PMG-AC-011） | — | 0 |

说明：

- 本地 Compose 冒烟使用端口剥离、容器/卷改名的临时 compose 副本（本地栈占用宿主端口），服务定义、健康检查与 CI 完全一致；副本与 `.ci.env` 在冒烟后删除，未入库。
- Trivy 0.74.0 将扫描器类别更名为 `vuln/misconfig/secret/license`；`--scanners vuln` 即 PRD 要求的“OS 与语言依赖”扫描范围，CI 工作流已同步为 `scanners: vuln`。
- RAG 黄金门禁（integration 内）：precision 1.0、recall 1.0、citation 1.0、wrong_jurisdiction 0，全部高于 TESTING.md 最低值。
- pip-audit 对本地项目 `policyops-agent (0.2.0)` 自身输出 “Dependency not found on PyPI and could not be audited”：这是本地不可发布项目自身不在 PyPI 的预期提示，不是依赖漏洞，也不是测试 skip；其余全部依赖 No known vulnerabilities found，退出码 0。
- E2E 复验前两轮失败（AUTH-AC-004 管理员登录 invalid）根因：验收库引导账号与 `e2e/auth.spec.ts` 既有验收契约（Jan + 规格内拆分构造的一次性口令）不一致——本地 5437 首轮复用了 CI 旧 env 值，且 CI 工作流自身携带与规格不一致的 `SSRP_E2E_ADMIN_USERNAME/SSRP_E2E_ADMIN_PASSWORD` 覆盖。已修正：全新 5437 按规格契约引导后 10 项全通过；ci.yml 删除该覆盖、bootstrap 按规格相同拆分构造生成（提交 `ced6a5a`）。未改动已验收的 Auth 规格与 `71da7fc` 提交。

## 6. 镜像摘要

| 镜像 | 基础 | 加固动作 | 运行用户 | 验证 |
| --- | --- | --- | --- | --- |
| `web:latest` | node:22-alpine | `apk upgrade`；删除 npm/npx/corepack 完整目录（node 官方 alpine 镜像的 npm 位于 `/usr/local/lib/node_modules`，旧删除路径未生效导致 npm 依赖树残留并触发 Trivy 11 项可修复 HIGH/CRITICAL，已修正删除路径） | node (uid 1000) | 非 root；`node_modules` 目录为空；Trivy 0 发现 |
| `agent:latest` | python:3.11-slim（Debian 13.6） | 运行层 `apt-get upgrade`（OpenSSL 3.5.6→3.5.7-1~deb13u2，消除 CVE-2026-14456 共 3 项）；删除全局 pip/setuptools/wheel；uv 仅在 build stage | appuser (uid 1000) | 非 root；OpenSSL 3.5.7；Trivy 0 发现 |

## 7. 版本与锁文件

- `package.json` / `package-lock.json`：0.1.0 → 0.2.0；lock diff 仅版本号与 npm 对既有可选 `inBundle` dev wasm 包（@tailwindcss/oxide-wasm32-wasi 的 @emnapi/*、tslib 等）的显式物化，未升级任何无关运行依赖（PMG-FR-033）。
- `services/agent/pyproject.toml` / `uv.lock`：0.1.0 → 0.2.0。

## 8. 关键决策记录

1. **ruff CJK 忽略**：基线 596 项中 596-48=548 项为 RUF001/002/003（CJK 标点/连字符启发式误报），按中文代码库惯例在 pyproject 配置级忽略这三条规则；其余全部真实修复，最终 `ruff check .` 为 0。未降低任何语义规则。
2. **Trivy 扫描器名称**：0.74.0 不再接受 `os-pkg,lang-pkg`，采用 `vuln`（等价覆盖 OS 包 + 语言依赖），severity/ignore-unfixed/exit-code 保持 PRD 阈值不变。
3. **Auth E2E 入口**：`scripts/run-auth-e2e.sh`（旧 shell 入口）删除，统一为 `scripts/run-auth-e2e.mjs`（环境校验、bcrypt 哈希、mock 资产复制、Playwright 启动）。
4. **e2e-gates 依赖安装顺序**：`npx playwright install --with-deps chromium` 前必须先 `npm ci`，避免 npx 解析到未锁定的 Playwright 版本；SC2155（声明与赋值分离后再 export）与 SC2034（未用循环变量改 `_`）按 shellcheck 修正。
5. **container-gates 服务断言**：健康检查后新增全 8 服务状态断言（proxy/web/agent/worker/beat/postgres/redis/minio 必须存在且非 exited），带健康检查的 6 个服务必须 healthy；失败时输出脱敏日志并退出 1；`down -v` 保持 `if: always()` 无条件清理。
6. **E2E 管理员账号契约**：`e2e/auth.spec.ts`（`71da7fc` 交付的已验收契约）固定管理员 Jan 与拆分构造口令；CI 引导账号必须与之一致。ci.yml 原 `ci-admin`/合成口令覆盖会使 e2e-gates 在 GitHub 上必然失败 AUTH-AC-004，已对齐为规格契约（bootstrap 内按相同拆分构造生成哈希，不引入新凭据字面量）。
- Trivy 扫描器参数说明：0.74.0 将 OS 包与语言依赖扫描合并为 `vuln` 扫描组，CI 中 `scanners: vuln` 即 PRD“扫描 OS 与语言依赖”的等价参数（`os-pkg,lang-pkg` 在 0.74.0 已不被接受）。
- Gitleaks 8.29.1 本地以官方 8.29.1 构建执行 `detect -v`（完整 Git 历史，32 commits）；CI 使用 gitleaks-action v3 + `GITLEAKS_VERSION 8.29.1` + `fetch-depth: 0`，等价。
- 镜像加固细节：web 运行镜像删除 `/usr/local/lib/node_modules/{npm,npx,corepack}` 与 `/usr/bin/{npm,npx,corepack}`（node:22-alpine 的 npm 非 apk 包，旧路径删除无效是首轮 Trivy 命中的根因），保留非 root `node` 用户与 `apk upgrade`；agent 运行镜像新增 `apt-get upgrade`（消除 openssl CVE-2026-14456，3.5.6→3.5.7-1~deb13u2），保留非 root `appuser`、运行 venv，删除全局 pip/setuptools/wheel，uv 仅存在于 build stage。
- 测试分层：`vitest.config.ts` 排除 `*.integration.test.ts`；`vitest.integration.config.ts` 仅收集集成测试且 `SSP_TEST_DATABASE_URL` 缺失时 fail-fast 抛错（不允许以 skip 关闭）；单测文件使用 `describe(name, { timeout: 15_000 })` 统一 15 秒超时；Python 以 `-m integration` 标记分层，单测运行零环境 skip。
- `package-lock.json` 除 0.1.0→0.2.0 两处版本变更外，新增 `@tailwindcss/oxide-wasm32-wasi` 的 `inBundle` 可选依赖记录（`optional:true`/`dev:true`/`inBundle:true`，属构建时 wasm 工具链，非运行依赖，不升级任何无关运行依赖）。
- ruff 忽略 `RUF001/RUF002/RUF003`（CJK 全角字符误报）：Python 源码大量中文注释/字符串，该类规则对 CJK 为已知误报；其余规则（含 F、B、UP、SIM、I）全部生效并清零。

## 9. `origin/main...HEAD` 全量差异审阅（PMG-FR-037）

- 审阅范围：`origin/main...HEAD`，merge-base `1c0f6e7eb48d0e6b4ef52063454afdb0c8375d4c`（= `origin/main`，未前进），审阅 HEAD 为最新修正提交 `ced6a5ac3f346dc783ae2e3dd911b4b3faf2df20`。
- 统计：401 文件，+32501 / −1851；A 342、M 55、D 2、R 2；`git diff --check` 退出 0（无空白错误）。
- 构成：01～07 七阶段重构、09-02 鉴权 Feature、09-03 本阶段门禁与发布准备（全部需求见 traceability）。
- 敏感项人工核对：无 API Key、私钥、生产备份、用户数据、`docs/**/config/*.local.env` 或生成依赖目录进入差异；DSL 业务键误报仅以 5 个 fingerprint 基线记录于 `.gitleaksignore`。
- 代码审阅范围截止修正提交 `ced6a5a`；其后仅有验收证据和状态文档变更。
- 结论：差异与已接受阶段/Feature 一一对应，无计划外改动；开发分支发布准备就绪，可进入未来人工 PR 流程。

## 10. 验收结论与未执行的未来动作

- **开发分支发布准备验收结论：PASS。** PMG-AC-001～014 全部取得新鲜本地证据：AC-001～010 为六类自动门禁的本地复现（§5，全部退出 0、零 skip、零未解释 warning）；AC-011 为 actionlint 1.7.7 静态校验零发现；AC-012 为全 8 服务 running + 6 健康检查 healthy；AC-013 为以修正提交 `ced6a5a` 为 HEAD 的完整差异审阅（§9，统计与 SHA 准确）；AC-014 为活动文档同步（本报告、PRD、traceability、PROGRESS、README，无过期状态）。
- 本阶段只交付开发分支证据：workflow 已静态校验、六类门禁已本地复现；**不声称 GitHub-hosted 六项 checks 已经运行**（分支推送不触发运行，checks 在 Draft PR 创建后产生）。
- 重构前版本基线已在开发分支验收后由用户授权完成：annotated tag `v1.0.0`已推送至origin，
  并精确指向`main`提交`1c0f6e7eb48d0e6b4ef52063454afdb0c8375d4c`。
- 以下未来外部动作仍未执行，需用户另行授权：

| 未来动作 | 状态 |
| --- | --- |
| 创建 Draft PR / 转 Ready / merge commit 合并 | 未执行 |
| 配置 main Active ruleset（六项必需检查） | 未执行 |
| 直接/force-push `main` | 未执行 |
| 已有`v1.0.0`基线tag的移动、重建或改指向 | 禁止执行 |
| 创建/推送 `v2.0.0` tag 与PolicyOps+Auth Release | 未执行 |
| 生产 migration、Secret 配置/轮换、入口切换 | 未执行 |

- 本阶段在 PROGRESS 记录为 `Accepted（开发分支发布准备）`；未来人工发布完成后另建 docs-only 任务记录 PR、merge SHA、tag 与 Release 链接。

## 11. 六项 GitHub 检查（未来 PR 后产生）

检查名称（与 PMG-FR-038 必需状态检查一致）：`gates`、`agent-gates`、`database-gates`、`e2e-gates`、`container-gates`、`security-gates`。触发：`pull_request`、`main` push、`workflow_dispatch`；同 ref 并发取消；job timeout；默认 token 仅 `contents: read`。分支推送本身不触发运行；六项 checks 与 Actions 运行链接将在用户创建 Draft PR 后产生，本阶段不声称其已运行。
