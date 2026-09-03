# 09-03 阶段验收报告：PolicyOps P0 合并质量门禁与 v0.2.0 发布

> Author: Jan
> Status: Active
> Updated: 2026-09-03
> 执行者：Agent（本地门禁与文档）；GitHub 检查与发布动作：CI/人工（见 §9 暂停点）

## 1. 范围

本阶段交付 `docs/prd/09-03-stage-policyops-pre-merge-release.md` 定义的 PMG-FR-001～041 与 PMG-NFR-001～009：修复 Auth E2E 协议假阳性、建立 Node/Python 测试分层与无 skip 数据库门禁、重写六 job CI 工作流（固定 Action SHA）、Gitleaks/Trivy/Secret 安全门禁、Web/Agent 镜像加固、`AUTH_REFRESH_PEPPER` 必填配置、0.2.0 版本元数据、文档同步与发布治理准备。

Auth 由提交 `71da7fc feat: 完成用户与管理员双角色鉴权` 交付，本阶段未重新实现、拆分或改写该提交。

## 2. 环境与约束

- 开发机：Windows + Git Bash + Docker Desktop；本地 prod-like Compose 栈（`socila-*`，宿主端口 80/443/5432/6380/9000）全程未触碰。
- 数据库门禁使用全新本地演练容器 `socila-pmg-pg`（pgvector/pgvector:pg17，宿主端口 5435，独立 volume），仅合成凭据；E2E、Compose 冒烟同样只用合成值。
- 未读取或修改任何生产数据；未改写 `archive/` 与既有历史报告；未降低任何测试、安全、Schema、Secret 或漏洞阈值。

## 3. 提交与分支

- 分支：`refactor/policy-ops-agent-platform`（upstream 同名）。
- 本阶段父提交：`b01c372`（`feat: 调整密码策略为8位以上且含字母数字`）。
- 本阶段提交：`ci: 补齐鉴权后的合并门禁与发布流程`（本报告随该提交入库；提交后分支 HEAD 即该 SHA，见推送后用户报告）。
- `origin/main` 审阅时未前进：merge-base 与 `origin/main` 同为 `1c0f6e7`。

## 4. PMG-AC-001：Auth 协议修正 Red/Green

- Red（`src/lib/ai/agent.ts` 仍走默认 `/v1/responses`，mock 仅支持 Chat Completions，E2E 新增助手回复断言）：`1 failed / 4 passed`，失败原因 `AI_APICallError: not found`（`/v1/responses` 404），助手回复断言不成立。
- Green（改为 `openai.chat(model)` 强制 `POST /chat/completions`）：`10 passed`，退出码 0；日志零 `AI_APICallError`、零 404；助手回复与刷新会话持久化断言通过。

## 5. 六项门禁本地复现（全部新鲜执行）

| # | CI job | 本地命令 | 退出码 | 数量/结论 | skip | warning |
| --- | --- | --- | ---: | --- | ---: | --- |
| 1 | `gates` | `npx tsc --noEmit` | 0 | 类型检查通过 | 0 | 0 |
| 1 | `gates` | `npx eslint src` | 0 | lint 通过 | 0 | 0 |
| 1 | `gates` | `npm test` | 0 | 29 文件 / 237 测试通过 | 0 | 0 |
| 2 | `agent-gates` | `uv run ruff check .` | 0 | 0 问题（含 CJK 忽略 RUF001/002/003，见 §8 决策记录） | 0 | 0 |
| 2 | `agent-gates` | `uv run mypy agent` | 0 | 30 源文件 0 错误 | 0 | 0 |
| 2 | `agent-gates` | `uv run pytest -m "not integration"` | 0 | 38 通过、5 deselected（marker 分层） | 0 | 0（DeprecationWarning 提升为 error） |
| 2 | `agent-gates` | `uv run pip-audit` | 0 | No known vulnerabilities found | 0 | 0 |
| 3 | `database-gates` | `npm run db:migrate` ×2、`bootstrap-admin` ×2、`npm run seed` | 0 | 二次执行均为幂等 no-op | 0 | 0 |
| 3 | `database-gates` | `npm run test:db` | 0 | 7 文件 / 23 测试通过 | 0 | 0 |
| 3 | `database-gates` | `uv run python -m agent.migrate --with-roles` | 0 | 幂等；空 agent 密码 RAISE EXCEPTION | 0 | 0 |
| 3 | `database-gates` | `uv run pytest -q -m integration` | 0 | 5 通过、38 deselected | 0 | 0 |
| 4 | `e2e-gates` | `npm run test:e2e:auth` | 0 | 10 通过（真实 standalone + mock 模型） | 0 | 0 |
| 5 | `container-gates` | `docker build -f Dockerfile -t web:latest .` | 0 | 镜像构建成功 | — | — |
| 5 | `container-gates` | `docker build -f services/agent/Dockerfile -t agent:latest services/agent` | 0 | 镜像构建成功 | — | — |
| 5 | `container-gates` | `docker compose config`（缺 `AUTH_REFRESH_PEPPER`） | 1 | 必填插值拒绝：`required variable AUTH_REFRESH_PEPPER is missing a value` | — | 0 |
| 5 | `container-gates` | `docker compose config`（合成 env 完整） | 0 | 配置解析通过 | — | 0（未设可选变量仅本地 config 校验噪音，CI env 文件已含全部值） |
| 5 | `container-gates` | `docker compose up -d`（合成 env、临时卷）+ 健康检查 + `down -v` | 0 | web `/api/health`=`"status":"ok"`（第 1 次探测）；agent `/internal/health`=200；容器/卷/网络全部删除 | — | 0 |
| 5 | `container-gates` | Trivy 0.74.0 `--scanners vuln --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1` ×2 | 0 | web:latest 0 发现；agent:latest 0 发现 | — | — |
| 6 | `security-gates` | `node scripts/scan-secrets.mjs --all` | 0 | 526 个候选文件无命中 | — | 0 |
| 6 | `security-gates` | Gitleaks 8.29.1 完整历史（`detect -v`，29 commits） | 0 | no leaks found（`.gitleaksignore` 仅 5 个已核实 fingerprint） | — | 0 |

说明：

- 本地 Compose 冒烟使用端口剥离、容器/卷改名的临时 compose 副本（本地栈占用宿主端口），服务定义、健康检查与 CI 完全一致；副本与 `.ci.env` 在冒烟后删除，未入库。
- Trivy 0.74.0 将扫描器类别更名为 `vuln/misconfig/secret/license`；`--scanners vuln` 即 PRD 要求的“OS 与语言依赖”扫描范围，CI 工作流已同步为 `scanners: vuln`。
- RAG 黄金门禁（integration 内）：precision 1.0、recall 1.0、citation 1.0、wrong_jurisdiction 0，全部高于 TESTING.md 最低值。

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
- Trivy 扫描器参数说明：0.74.0 将 OS 包与语言依赖扫描合并为 `vuln` 扫描组，CI 中 `scanners: vuln` 即 PRD“扫描 OS 与语言依赖”的等价参数（`os-pkg,lang-pkg` 在 0.74.0 已不被接受）。
- Gitleaks 8.29.1 本地以官方 8.29.1 构建执行 `detect -v`（完整 Git 历史，29 commits）；CI 使用 gitleaks-action v3 + `GITLEAKS_VERSION 8.29.1` + `fetch-depth: 0`，等价。
- 镜像加固细节：web 运行镜像删除 `/usr/local/lib/node_modules/{npm,npx,corepack}` 与 `/usr/bin/{npm,npx,corepack}`（node:22-alpine 的 npm 非 apk 包，旧路径删除无效是首轮 Trivy 命中的根因），保留非 root `node` 用户与 `apk upgrade`；agent 运行镜像新增 `apt-get upgrade`（消除 openssl CVE-2026-14456，3.5.6→3.5.7-1~deb13u2），保留非 root `appuser`、运行 venv，删除全局 pip/setuptools/wheel，uv 仅存在于 build stage。
- 测试分层：`vitest.config.ts` 排除 `*.integration.test.ts`；`vitest.integration.config.ts` 仅收集集成测试且 `SSP_TEST_DATABASE_URL` 缺失时 fail-fast 抛错（不允许以 skip 关闭）；单测文件使用 `describe(name, { timeout: 15_000 })` 统一 15 秒超时；Python 以 `-m integration` 标记分层，单测运行零环境 skip。
- `package-lock.json` 除 0.1.0→0.2.0 两处版本变更外，新增 `@tailwindcss/oxide-wasm32-wasi` 的 `inBundle` 可选依赖记录（`optional:true`/`dev:true`/`inBundle:true`，属构建时 wasm 工具链，非运行依赖，不升级任何无关运行依赖）。
- ruff 忽略 `RUF001/RUF002/RUF003`（CJK 全角字符误报）：Python 源码大量中文注释/字符串，该类规则对 CJK 为已知误报；其余规则（含 F、B、UP、SIM、I）全部生效并清零。

## 9. `origin/main...HEAD` 全量差异审阅（PMG-FR-037）

- 审阅范围：`origin/main...HEAD`（merge-base `1c0f6e7`，审阅时 HEAD `b01c372`）。
- 统计：391 文件，+30901 / −1837；A 336、M 51、D 2、R 2。
- 构成：01～07 七阶段重构、09-02 鉴权 Feature、09-03 本阶段门禁与发布准备（全部需求见 traceability）。
- 敏感项人工核对：无 API Key、私钥、生产备份、用户数据、`docs/**/config/*.local.env` 或生成依赖目录进入差异；DSL 业务键误报仅以 5 个 fingerprint 基线记录于 `.gitleaksignore`。
- 结论：差异与已接受阶段/Feature 一一对应，无计划外改动，可进入人工 PR 流程。

## 10. 验收结论与暂停点

- PMG-AC-001～010（自动门禁类）全部取得新鲜本地证据，结论 PASS。
- PMG-AC-011～014 为人工治理场景，依赖用户动作，按强制暂停点执行：

| 暂停点 | 状态 |
| --- | --- |
| 创建/合并 PR、配置 main ruleset、merge commit | 等待用户授权 |
| 直接/force-push `main`、创建/推送 tag、发布 Release | 等待用户授权 |
| 生产 migration、Secret 配置/轮换、入口切换 | 等待用户授权 |

- 用户人工完成 `v0.1.0` 基线 tag、Draft PR、ruleset、merge commit、main 复验与 `v0.2.0` Release 后，PROGRESS 方可记录本阶段 Accepted（见 PROGRESS“精确下一步”）。

## 11. 六项 GitHub 检查（推送后生效）

检查名称（与 PMG-FR-038 必需状态检查一致）：`gates`、`agent-gates`、`database-gates`、`e2e-gates`、`container-gates`、`security-gates`。触发：`pull_request`、`main` push、`workflow_dispatch`；同 ref 并发取消；job timeout；默认 token 仅 `contents: read`。Actions 运行链接在分支推送/PR 创建后产生，由用户报告环节提供。
