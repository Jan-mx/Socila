import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

type EnvironmentModule = {
  loadEnvironment?: (cwd?: string) => void;
};

const databaseUrlKey = "DATABASE_URL";
let originalDatabaseUrl: string | undefined;

async function environmentModule(): Promise<Required<EnvironmentModule>> {
  const modulePath = "./load-environment";
  const environment = await import(modulePath).catch(() => null) as EnvironmentModule | null;
  expect(environment?.loadEnvironment).toBeTypeOf("function");
  return environment as Required<EnvironmentModule>;
}

function withTemporaryEnvironment(files: Record<string, string>, run: (cwd: string) => Promise<void>) {
  const cwd = mkdtempSync(join(tmpdir(), "socila-environment-"));
  for (const [file, contents] of Object.entries(files)) {
    writeFileSync(join(cwd, file), contents);
  }
  return run(cwd).finally(() => rmSync(cwd, { force: true, recursive: true }));
}

beforeEach(() => {
  originalDatabaseUrl = process.env[databaseUrlKey];
});

afterEach(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env[databaseUrlKey];
  } else {
    process.env[databaseUrlKey] = originalDatabaseUrl;
  }
});

describe("loadEnvironment", () => {
  it("loads DATABASE_URL from a directory containing only .env.local", async () => {
    await withTemporaryEnvironment(
      { ".env.local": "DATABASE_URL=postgres://local-only\n" },
      async (cwd) => {
        const { loadEnvironment } = await environmentModule();
        delete process.env[databaseUrlKey];

        loadEnvironment(cwd);

        expect(process.env.DATABASE_URL).toBe("postgres://local-only");
      },
    );
  });

  it("loads DATABASE_URL from a directory containing only .env", async () => {
    await withTemporaryEnvironment(
      { ".env": "DATABASE_URL=postgres://fallback-only\n" },
      async (cwd) => {
        const { loadEnvironment } = await environmentModule();
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
        const { loadEnvironment } = await environmentModule();
        delete process.env[databaseUrlKey];

        loadEnvironment(cwd);

        expect(process.env.DATABASE_URL).toBe("postgres://local");
      },
    );
  });

  it("does not overwrite an existing DATABASE_URL", async () => {
    process.env.DATABASE_URL = "postgres://existing";

    await withTemporaryEnvironment(
      { ".env.local": "DATABASE_URL=postgres://local\n" },
      async (cwd) => {
        const { loadEnvironment } = await environmentModule();

        loadEnvironment(cwd);

        expect(process.env.DATABASE_URL).toBe("postgres://existing");
      },
    );
  });
});
