/**
 * 活动配置契约（09-03 CFG-FR-001/003/004/009/010，CFG-NFR-001，CFG-AC-009）。
 *
 * 扫描 Compose、可提交模板、运行时模板、根 README 与旧部署入口：
 * - 无活动 Neon 连接或 Vercel 部署入口（Neon/Vercel 口径只留在历史材料）；
 * - 无常驻管理员引导运行变量（ADMIN_USERNAME/ADMIN_PASSWORD_HASH）；
 * - migration 内部非 loopback 例外仅限 Compose 的 migrate 服务（最小权限）；
 * - 模板只列出运行时代码/Compose 实际读取的变量。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../..", import.meta.url));

function sourceOf(relativePath: string): string {
  return readFileSync(join(root, relativePath), "utf8");
}

function activeKeys(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split("=")[0].trim())
    .filter((key) => key && !key.includes(" "));
}

/** 解析 compose 文件指定服务的 environment 映射（缩进敏感，针对本仓库 Compose 结构）。 */
function composeServiceEnv(yaml: string, service: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = yaml.split(/\r?\n/);
  let inServices = false;
  let inService = false;
  let inEnv = false;
  for (const line of lines) {
    if (/^[A-Za-z_][\w-]*:/.test(line)) {
      inServices = line.startsWith("services:");
      inService = false;
      inEnv = false;
      continue;
    }
    if (!inServices) continue;
    const serviceMatch = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (serviceMatch) {
      inService = serviceMatch[1] === service;
      inEnv = false;
      continue;
    }
    if (!inService) continue;
    if (/^    environment:\s*$/.test(line)) {
      inEnv = true;
      continue;
    }
    if (inEnv) {
      const entry = line.match(/^      ([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
      if (entry) {
        out[entry[1]] = entry[2].trim();
      } else if (/^    \S/.test(line) || !line.trim()) {
        inEnv = false;
      }
    }
  }
  return out;
}

const composeYaml = sourceOf("infra/prod/docker-compose.yml");
const allComposeServices = [
  "proxy",
  "web",
  "agent",
  "worker",
  "beat",
  "migrate",
  "postgres",
  "redis",
  "minio",
];

/** 运行时代码与 Compose/Caddy 实际读取的变量白名单（CFG-FR-010）。 */
const consumedVariables = new Set([
  // Web（Next.js Core）运行时
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "AUTH_SECRET",
  "AUTH_URL",
  "AUTH_REFRESH_PEPPER",
  "NEXTAUTH_URL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "OPENAI_URL",
  "OPENAI_BASE_URL",
  "AGENT_INTERNAL_URL",
  "DATABASE_POOL_MAX",
  "DATABASE_IDLE_TIMEOUT_MS",
  "DATABASE_CONNECTION_TIMEOUT_MS",
  "ALLOW_REMOTE_DATABASE",
  // Agent 运行时（AGENT_ 前缀 pydantic Settings + 直接读取）
  "AGENT_DATABASE_URL",
  "AGENT_REDIS_URL",
  "AGENT_CORE_BASE_URL",
  "AGENT_CORE_SERVICE_NAME",
  "AGENT_CORE_TIMEOUT_SECONDS",
  "AGENT_WORKFLOW_VERSION",
  "AGENT_MAX_VERIFY_RETRIES",
  "AGENT_TASK_MAX_RETRIES",
  "AGENT_API_HOST",
  "AGENT_API_PORT",
  "AGENT_MINIO_ENDPOINT",
  "AGENT_MINIO_ACCESS_KEY",
  "AGENT_MINIO_SECRET_KEY",
  "AGENT_MINIO_BUCKET",
  "AGENT_MINIO_SECURE",
  "AGENT_DB_PASSWORD",
  "SILICONFLOW_API_KEY",
  "SILICONFLOW_BASE_URL",
  "SILICONFLOW_EMBEDDING_MODEL",
  "SILICONFLOW_EMBEDDING_DIMENSIONS",
  "SILICONFLOW_RERANK_MODEL",
  "RAG_RERANK_MIN_SCORE",
  // 服务 JWT（保留供后续 Feature 接线，本 Stage 不实现）
  "AGENT_SERVICE_JWT_CURRENT",
  "AGENT_SERVICE_JWT_PREVIOUS",
  // Compose / Caddy 基础设施
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DB",
  "REDIS_PASSWORD",
  "MINIO_ROOT_USER",
  "MINIO_ROOT_PASSWORD",
  "SITE_ADDRESS",
]);

describe("Compose 契约（CFG-FR-004/009，CFG-NFR-001）", () => {
  it("web 服务不再注入常驻管理员引导变量", () => {
    const webEnv = composeServiceEnv(composeYaml, "web");
    expect(webEnv.ADMIN_USERNAME).toBeUndefined();
    expect(webEnv.ADMIN_PASSWORD_HASH).toBeUndefined();
  });

  it("仅 migrate 服务显式设置 ALLOW_REMOTE_DATABASE=1（内部 DNS postgres 例外）", () => {
    const migrateEnv = composeServiceEnv(composeYaml, "migrate");
    expect(migrateEnv.ALLOW_REMOTE_DATABASE).toBe('"1"');
  });

  it("其余 Compose 服务均不持有远程例外（最小权限）", () => {
    for (const service of allComposeServices.filter((s) => s !== "migrate")) {
      const env = composeServiceEnv(composeYaml, service);
      expect(env.ALLOW_REMOTE_DATABASE, `${service} 不应持有 ALLOW_REMOTE_DATABASE`).toBeUndefined();
    }
  });
});

describe("可提交模板契约（CFG-FR-004/010）", () => {
  it("根 .env.example 只列出宿主运行时实际消费的变量", () => {
    const keys = activeKeys(sourceOf(".env.example"));
    const expected = [
      "DATABASE_URL",
      "NEXTAUTH_SECRET",
      "AUTH_REFRESH_PEPPER",
      "NEXTAUTH_URL",
      "OPENAI_API_KEY",
      "OPENAI_MODEL",
      "OPENAI_URL",
    ].sort();
    expect([...keys].sort()).toEqual(expected);
  });

  it("infra/prod/.env.example 只列出 Compose 实际插值的变量", () => {
    const keys = activeKeys(sourceOf("infra/prod/.env.example"));
    const expected = [
      "POSTGRES_USER",
      "POSTGRES_PASSWORD",
      "POSTGRES_DB",
      "DATABASE_URL",
      "AGENT_DATABASE_URL",
      "MINIO_ROOT_USER",
      "MINIO_ROOT_PASSWORD",
      "NEXTAUTH_SECRET",
      "AUTH_REFRESH_PEPPER",
      "NEXTAUTH_URL",
      "OPENAI_API_KEY",
      "OPENAI_MODEL",
      "OPENAI_URL",
      "AGENT_SERVICE_JWT_CURRENT",
      "AGENT_SERVICE_JWT_PREVIOUS",
      "SILICONFLOW_API_KEY",
      "REDIS_PASSWORD",
    ].sort();
    expect([...keys].sort()).toEqual(expected);
  });

  it("活动运行时模板不含未消费变量", () => {
    for (const template of [
      ".env.example",
      "infra/prod/.env.example",
      "docs/refactor/policy-ops-agent/config/runtime.env.example",
    ]) {
      for (const key of activeKeys(sourceOf(template))) {
        expect(
          consumedVariables.has(key),
          `${template} 列出了运行时代码未消费的变量 ${key}`,
        ).toBe(true);
      }
    }
  });
});

describe("活动文档与入口清理（CFG-FR-001/010，CFG-AC-009）", () => {
  it("根 README 不再包含 Neon 或 Vercel 当前部署口径", () => {
    const readme = sourceOf("README.md");
    expect(readme).not.toMatch(/neon/i);
    expect(readme).not.toMatch(/vercel/i);
  });

  it("vercel.json 活动部署入口已移除", () => {
    expect(existsSync(join(root, "vercel.json"))).toBe(false);
  });

  it("next.config.ts 不再保留 Vercel 口径", () => {
    expect(sourceOf("next.config.ts")).not.toMatch(/vercel/i);
  });

  it("活动配置与脚本不含 Neon 连接口径", () => {
    for (const file of [
      ".env.example",
      "infra/prod/.env.example",
      "infra/prod/docker-compose.yml",
      "scripts/run-migrations.mjs",
      "scripts/bootstrap-admin.mjs",
      "drizzle.config.ts",
      "docs/refactor/policy-ops-agent/config/runtime.env.example",
    ]) {
      expect(sourceOf(file).toLowerCase(), `${file} 含 neon 口径`).not.toContain("neon");
    }
  });

  it("活动模板与入口不含常驻管理员引导变量", () => {
    for (const file of [
      ".env.example",
      "infra/prod/.env.example",
      "docs/refactor/policy-ops-agent/config/runtime.env.example",
      "playwright.config.ts",
      "README.md",
    ]) {
      const source = sourceOf(file);
      expect(source, `${file} 含 ADMIN_USERNAME`).not.toContain("ADMIN_USERNAME");
      expect(source, `${file} 含 ADMIN_PASSWORD_HASH`).not.toContain("ADMIN_PASSWORD_HASH");
    }
  });
});
