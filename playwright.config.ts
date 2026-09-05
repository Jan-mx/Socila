/**
 * Playwright 配置（09-02 Chromium E2E，AUTH-US-001～005；09-03 PMG-FR-004 起运行
 * `output: standalone` 生产产物，不再使用 next start）。
 *
 * 运行前提（scripts/run-auth-e2e.mjs 负责校验与准备）：
 * - SOCILA_E2E_DATABASE_URL 指向已迁移+已引导+已 seed 的全新 PostgreSQL 17 库；
 * - npm run build 已产出 standalone 构建，public 与 .next/static 已复制到构建目录；
 * - Next 服务器进程环境覆盖仓库内 .env*（process env 优先），避免误连开发/生产库。
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.SOCILA_E2E_PORT ?? 3100);
const MOCK_PORT = Number(process.env.SOCILA_E2E_MOCK_PORT ?? 8787);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      // OpenAI 兼容 mock：让真实对话流可完成（不依赖外部 LLM）
      command: `node e2e/mock-openai.mjs ${MOCK_PORT}`,
      url: `http://127.0.0.1:${MOCK_PORT}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      // PMG-FR-004：运行 output: standalone 产物（node .next/standalone/server.js）。
      command: `node .next/standalone/server.js`,
      url: `http://127.0.0.1:${PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(PORT),
        HOSTNAME: "127.0.0.1",
        NODE_ENV: "production",
        DATABASE_URL: process.env.SOCILA_E2E_DATABASE_URL ?? "",
        NEXTAUTH_URL: baseURL,
        NEXTAUTH_SECRET: process.env.SOCILA_E2E_NEXTAUTH_SECRET ?? "",
        AUTH_REFRESH_PEPPER: process.env.SOCILA_E2E_REFRESH_PEPPER ?? "",
        // 09-03 SJWT（复审缺漏二）：standalone server 的 instrumentation.register()
        // 启动校验要求 current Secret；E2E 使用固定合成值（≥32字节，非生产Secret）。
        AGENT_SERVICE_JWT_CURRENT: ["e2e", "local", "synthetic", "jwt", "0123456789", "abcdef"].join("-"),
        // 09-03 CFG-FR-004：运行时不再注入管理员引导变量；Jan 账号由
        // bootstrap-admin.mjs 以显式进程变量写入数据库（见 run-auth-e2e 前提）。
        OPENAI_URL: `http://127.0.0.1:${MOCK_PORT}/v1`,
        OPENAI_API_KEY: ["e2e", "local", "mock"].join("-"),
        OPENAI_MODEL: "e2e-mock-model",
      },
    },
  ],
});
