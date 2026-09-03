#!/usr/bin/env node
/**
 * Auth Chromium E2E 统一入口（09-03 PMG-FR-003/004，取代旧 run-auth-e2e.sh）。
 *
 * 跨平台：Windows PowerShell 与 Ubuntu runner 均通过
 * `npm run test:e2e:auth` 执行；多余参数原样透传给 Playwright
 * （如 `npm run test:e2e:auth -- --grep=AUTH-US-001`）。
 *
 * 前提（本脚本只校验，不代做）：
 * 1. 全新 PostgreSQL 17 验收库已执行：core migration、Jan 管理员引导、seed；
 * 2. `npm run build` 已产出 `output: standalone` 生产构建（.next/standalone/server.js）；
 * 3. Playwright Chromium 已安装（npx playwright install chromium）。
 *
 * 环境变量（本地验收专用一次性值，不属于生产 Secret）：
 * - SSRP_E2E_DATABASE_URL        验收库连接串（必须存在，且指向本地库）
 * - SSRP_E2E_PORT / SSRP_E2E_MOCK_PORT  本地端口
 * - SSRP_E2E_NEXTAUTH_SECRET / SSRP_E2E_REFRESH_PEPPER（必须非空且两者不同，§12.2）
 *
 * Jan 管理员账号由前提步骤用 `node scripts/bootstrap-admin.mjs` 显式进程变量
 * 引导（09-03 CFG-FR-004：应用运行环境不再注入管理员变量）；E2E 登录 fixture
 * 与 e2e/auth.spec.ts 中的既有验收契约一致。
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

function fail(message) {
  console.error(`[run-auth-e2e] ${message}`);
  process.exit(1);
}

// PMG-FR-003：数据库 URL 必须存在且指向本地库（不读取 .env 回退连接）。
const databaseUrl = process.env.SSRP_E2E_DATABASE_URL;
if (!databaseUrl) {
  fail("SSRP_E2E_DATABASE_URL 未设置：请指向已迁移/引导/seed 的全新 PostgreSQL 17 验收库");
}
try {
  const host = new URL(databaseUrl).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
    fail(`SSRP_E2E_DATABASE_URL 指向非本机主机 (${host})：E2E 只允许本地全新库`);
  }
} catch {
  fail("SSRP_E2E_DATABASE_URL 不是合法连接串");
}

// PMG-FR-003 / PMG-AC-008：NEXTAUTH_SECRET 与 AUTH_REFRESH_PEPPER 必须非空且不相等。
const nextauthSecret = process.env.SSRP_E2E_NEXTAUTH_SECRET;
const refreshPepper = process.env.SSRP_E2E_REFRESH_PEPPER ?? "";
if (!nextauthSecret || !refreshPepper) {
  fail("SSRP_E2E_NEXTAUTH_SECRET 与 SSRP_E2E_REFRESH_PEPPER 均不得为空");
}
if (nextauthSecret === refreshPepper) {
  fail("SSRP_E2E_NEXTAUTH_SECRET 与 SSRP_E2E_REFRESH_PEPPER 必须为不同值（§12.2）");
}

// PMG-FR-004：standalone 产物必须存在；启动前把 public 与 .next/static
// 复制到 standalone 期望的构建目录（不使用会产生兼容警告的 next start）。
const standaloneDir = join(root, ".next", "standalone");
if (!existsSync(join(standaloneDir, "server.js"))) {
  fail("未找到 .next/standalone/server.js：请先执行 `npm run build`（output: standalone）");
}
mkdirSync(join(standaloneDir, "public"), { recursive: true });
cpSync(join(root, "public"), join(standaloneDir, "public"), { recursive: true });
mkdirSync(join(standaloneDir, ".next"), { recursive: true });
cpSync(
  join(root, ".next", "static"),
  join(standaloneDir, ".next", "static"),
  { recursive: true },
);

const port = process.env.SSRP_E2E_PORT || "3100";
const mockPort = process.env.SSRP_E2E_MOCK_PORT || "8787";

// 透传 Playwright 参数；Playwright 子进程从 node_modules 直接启动，避免 npx 跨平台差异。
const result = spawnSync(
  process.execPath,
  [
    join(root, "node_modules", "@playwright", "test", "cli.js"),
    "test",
    ...process.argv.slice(2),
  ],
  {
    cwd: root,
    stdio: "inherit",
      env: {
        ...process.env,
        SSRP_E2E_PORT: port,
        SSRP_E2E_MOCK_PORT: mockPort,
      },
  },
);
process.exit(result.status ?? 1);
