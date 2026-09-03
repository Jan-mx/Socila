/**
 * 共享 plain-Node 环境加载器契约（09-03 CFG-FR-002，CFG-AC-001/002）。
 *
 * 宿主机脚本（run-migrations.mjs、bootstrap-admin.mjs、drizzle.config.ts）
 * 必须与 src/lib/env/load-environment.ts 使用完全相同的加载语义：
 * `.env.local` 优先、`.env` 回退、进程变量不覆盖（override:false）、零环境依赖。
 * 本文件对 scripts/lib/load-environment.mjs 做零环境依赖的单元测试，
 * 并约束各 plain-Node 入口统一经共享加载器取配置。
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../..", import.meta.url));

type ScriptsLoaderModule = {
  loadEnvironment?: (cwd?: string) => void;
};

const databaseUrlKey = "DATABASE_URL";
let originalEnvironment: NodeJS.ProcessEnv;

async function scriptsLoaderModule(): Promise<Required<ScriptsLoaderModule>> {
  const modulePath = "../../../scripts/lib/load-environment.mjs";
  const loaded = (await import(/* @vite-ignore */ modulePath).catch(
    () => null,
  )) as ScriptsLoaderModule | null;
  expect(loaded?.loadEnvironment).toBeTypeOf("function");
  return loaded as Required<ScriptsLoaderModule>;
}

function withTemporaryEnvironment(
  files: Record<string, string>,
  run: (cwd: string) => Promise<void>,
) {
  const cwd = mkdtempSync(join(tmpdir(), "ssp-scripts-environment-"));
  for (const [file, contents] of Object.entries(files)) {
    writeFileSync(join(cwd, file), contents);
  }
  return run(cwd).finally(() => rmSync(cwd, { force: true, recursive: true }));
}

beforeEach(() => {
  originalEnvironment = { ...process.env };
});

afterEach(() => {
  process.env = originalEnvironment;
});

describe("scripts/lib/load-environment.mjs（CFG-FR-002）", () => {
  it("loads DATABASE_URL from a directory containing only .env.local", async () => {
    await withTemporaryEnvironment(
      { ".env.local": "DATABASE_URL=postgres://local-only\n" },
      async (cwd) => {
        const { loadEnvironment } = await scriptsLoaderModule();
        delete process.env[databaseUrlKey];

        loadEnvironment(cwd);

        expect(process.env.DATABASE_URL).toBe("postgres://local-only");
      },
    );
  });

  it("falls back to .env when .env.local is absent", async () => {
    await withTemporaryEnvironment(
      { ".env": "DATABASE_URL=postgres://fallback-only\n" },
      async (cwd) => {
        const { loadEnvironment } = await scriptsLoaderModule();
        delete process.env[databaseUrlKey];

        loadEnvironment(cwd);

        expect(process.env.DATABASE_URL).toBe("postgres://fallback-only");
      },
    );
  });

  it("prefers .env.local when both environment files define DATABASE_URL", async () => {
    await withTemporaryEnvironment(
      {
        ".env.local": "DATABASE_URL=postgres://local\n",
        ".env": "DATABASE_URL=postgres://fallback\n",
      },
      async (cwd) => {
        const { loadEnvironment } = await scriptsLoaderModule();
        delete process.env[databaseUrlKey];

        loadEnvironment(cwd);

        expect(process.env.DATABASE_URL).toBe("postgres://local");
      },
    );
  });

  it("does not overwrite an existing process DATABASE_URL（CI 注入优先）", async () => {
    await withTemporaryEnvironment(
      { ".env.local": "DATABASE_URL=postgres://local\n" },
      async (cwd) => {
        const { loadEnvironment } = await scriptsLoaderModule();
        process.env[databaseUrlKey] = "postgres://ci-injected";

        loadEnvironment(cwd);

        expect(process.env.DATABASE_URL).toBe("postgres://ci-injected");
      },
    );
  });

  it("leaves process env untouched when neither file exists", async () => {
    await withTemporaryEnvironment({}, async (cwd) => {
      const { loadEnvironment } = await scriptsLoaderModule();
        delete process.env[databaseUrlKey];

        expect(() => loadEnvironment(cwd)).not.toThrow();

        expect(process.env.DATABASE_URL).toBeUndefined();
    });
  });
});

describe("plain-Node 入口统一使用共享加载器（CFG-FR-002）", () => {
  for (const entry of [
    "scripts/run-migrations.mjs",
    "scripts/bootstrap-admin.mjs",
    "drizzle.config.ts",
  ]) {
    it(`${entry} imports the shared loader and no longer uses bare dotenv/config`, () => {
      const source = readFileSync(join(root, entry), "utf8");
      expect(source).toContain("load-environment.mjs");
      expect(source).not.toContain("dotenv/config");
    });
  }
});
