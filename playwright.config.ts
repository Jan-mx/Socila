/**
 * Playwright 配置（09-02 Chromium E2E，AUTH-US-001～005）。
 *
 * 运行前提（验收脚本负责）：
 * - SSRP_E2E_DATABASE_URL 指向已迁移+已引导+已 seed 的全新 PostgreSQL 17 库；
 * - npm run build 已产出生产构建（next start）。
 * Next 服务器进程环境覆盖仓库内 .env*（process env 优先），避免误连开发/生产库。
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.SSRP_E2E_PORT ?? 3100);
const MOCK_PORT = Number(process.env.SSRP_E2E_MOCK_PORT ?? 8787);
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
      command: `npx next start -p ${PORT}`,
      url: `http://127.0.0.1:${PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: process.env.SSRP_E2E_DATABASE_URL ?? "",
        NEXTAUTH_URL: baseURL,
        NEXTAUTH_SECRET: process.env.SSRP_E2E_NEXTAUTH_SECRET ?? "",
        AUTH_REFRESH_PEPPER: process.env.SSRP_E2E_REFRESH_PEPPER ?? "",
        ADMIN_USERNAME: process.env.SSRP_E2E_ADMIN_USERNAME ?? "Jan",
        ADMIN_PASSWORD_HASH: process.env.SSRP_E2E_ADMIN_PASSWORD_HASH ?? "",
        OPENAI_URL: `http://127.0.0.1:${MOCK_PORT}/v1`,
        OPENAI_API_KEY: ["e2e", "local", "mock"].join("-"),
        OPENAI_MODEL: "e2e-mock-model",
      },
    },
  ],
});
