/**
 * WI-20260914-01 CIG-FR-005（PMG-FR-022/NFR-001）：RCL演练PostgreSQL环境解析契约。
 *
 * CI #23 database-gates根因：`rcl-cli`/`rcl-rewrite-cli`集成测试与`e2e-rcl-setup`
 * 默认容器名`jrp-drill-pg`（本机开发容器）并硬编码`-U postgres`；GitHub service容器
 * 既无该名称也无`postgres`角色（POSTGRES_USER=ci_db_user）。
 *
 * 契约：容器ID只来自`RCL_DRILL_PG_CONTAINER`（无默认值）；用户名/数据库名/端口只来自
 * 实际数据库URL；任一缺失抛出带缺失项名称的`DrillPgEnvError`，不产生undefined级联。
 * psql/pg_restore参数使用URL用户并显式`-d`。纯单元：零子进程、零数据库。
 */
import { describe, expect, it } from "vitest";
import {
  DrillPgEnvError,
  dockerPgRestoreArgs,
  dockerPsqlArgs,
  resolveDrillPgEnv,
} from "../drill-pg-env";

const URL_OK = "postgresql://ci_db_user:ci-synthetic-db-password-not-real@localhost:5432/policyops_ci";

describe("resolveDrillPgEnv（CIG-FR-005）", () => {
  it("成功：容器ID、URL用户名、库名、端口、主机全部来自输入", () => {
    const env = resolveDrillPgEnv({
      container: "3f2a1b9c0d",
      databaseUrl: URL_OK,
      databaseUrlVar: "SOCILA_TEST_DATABASE_URL",
    });
    expect(env).toEqual({
      container: "3f2a1b9c0d",
      username: "ci_db_user",
      database: "policyops_ci",
      host: "localhost",
      port: 5432,
    });
  });

  it("URL省略端口时使用PostgreSQL协议默认5432；非默认端口原样读取", () => {
    const noPort = resolveDrillPgEnv({
      container: "c1",
      databaseUrl: "postgresql://u:p@db.internal/policyops",
      databaseUrlVar: "SOCILA_E2E_DATABASE_URL",
    });
    expect(noPort.port).toBe(5432);
    const custom = resolveDrillPgEnv({
      container: "c1",
      databaseUrl: "postgres://u:p@127.0.0.1:54321/x",
      databaseUrlVar: "SOCILA_E2E_DATABASE_URL",
    });
    expect(custom.port).toBe(54321);
    expect(custom.database).toBe("x");
  });

  it("用户名/库名经URL解码（含百分号编码）", () => {
    const env = resolveDrillPgEnv({
      container: "c1",
      databaseUrl: "postgresql://ci%2Duser:pw@localhost:5432/policy%20ops",
      databaseUrlVar: "SOCILA_TEST_DATABASE_URL",
    });
    expect(env.username).toBe("ci-user");
    expect(env.database).toBe("policy ops");
  });

  it("缺容器ID → 明确错误并指明RCL_DRILL_PG_CONTAINER（不回退jrp-drill-pg）", () => {
    for (const container of [undefined, "", "   "]) {
      expect(() =>
        resolveDrillPgEnv({ container, databaseUrl: URL_OK, databaseUrlVar: "SOCILA_TEST_DATABASE_URL" }),
      ).toThrow(DrillPgEnvError);
      try {
        resolveDrillPgEnv({ container, databaseUrl: URL_OK, databaseUrlVar: "SOCILA_TEST_DATABASE_URL" });
      } catch (err) {
        expect((err as Error).message).toContain("RCL_DRILL_PG_CONTAINER");
        expect((err as Error).message).not.toContain("jrp-drill-pg");
      }
    }
  });

  it("缺数据库URL → 明确错误并指明URL变量名", () => {
    expect(() =>
      resolveDrillPgEnv({ container: "c1", databaseUrl: undefined, databaseUrlVar: "SOCILA_E2E_DATABASE_URL" }),
    ).toThrow(/SOCILA_E2E_DATABASE_URL/);
    expect(() =>
      resolveDrillPgEnv({ container: "c1", databaseUrl: "not a url", databaseUrlVar: "SOCILA_E2E_DATABASE_URL" }),
    ).toThrow(/SOCILA_E2E_DATABASE_URL/);
    expect(() =>
      resolveDrillPgEnv({ container: "c1", databaseUrl: "mysql://u:p@h/db", databaseUrlVar: "SOCILA_E2E_DATABASE_URL" }),
    ).toThrow(/postgres/);
  });

  it("URL缺用户名 → 明确错误（不假设管理用户为postgres）", () => {
    expect(() =>
      resolveDrillPgEnv({ container: "c1", databaseUrl: "postgresql://localhost:5432/db", databaseUrlVar: "SOCILA_TEST_DATABASE_URL" }),
    ).toThrow(/用户名/);
    try {
      resolveDrillPgEnv({ container: "c1", databaseUrl: "postgresql://localhost:5432/db", databaseUrlVar: "SOCILA_TEST_DATABASE_URL" });
    } catch (err) {
      expect((err as Error).message).not.toMatch(/-U postgres|默认postgres/);
    }
  });

  it("URL缺数据库名 → 明确错误", () => {
    expect(() =>
      resolveDrillPgEnv({ container: "c1", databaseUrl: "postgresql://u:p@localhost:5432/", databaseUrlVar: "SOCILA_TEST_DATABASE_URL" }),
    ).toThrow(/数据库名/);
    expect(() =>
      resolveDrillPgEnv({ container: "c1", databaseUrl: "postgresql://u:p@localhost:5432", databaseUrlVar: "SOCILA_TEST_DATABASE_URL" }),
    ).toThrow(/数据库名/);
  });

  it("URL携带query时只取authority与路径（不受?host=/?port=影响）", () => {
    const env = resolveDrillPgEnv({
      container: "c1",
      databaseUrl: "postgresql://u:p@localhost:5432/db?sslmode=disable",
      databaseUrlVar: "SOCILA_TEST_DATABASE_URL",
    });
    expect(env.database).toBe("db");
    expect(env.port).toBe(5432);
  });
});

describe("docker参数构造（psql/pg_restore使用URL用户并显式-d）", () => {
  const env = resolveDrillPgEnv({ container: "abc123", databaseUrl: URL_OK, databaseUrlVar: "SOCILA_TEST_DATABASE_URL" });

  it("psql：exec 容器 psql -U <url用户> -d <url库> -v ON_ERROR_STOP=1 -c <sql>", () => {
    expect(dockerPsqlArgs(env, 'CREATE DATABASE "r1"')).toEqual([
      "exec", "abc123", "psql", "-U", "ci_db_user", "-d", "policyops_ci", "-v", "ON_ERROR_STOP=1", "-c", 'CREATE DATABASE "r1"',
    ]);
    // 显式目标库覆盖（如对恢复库执行语句）。
    expect(dockerPsqlArgs(env, "select 1", "r1")).toEqual([
      "exec", "abc123", "psql", "-U", "ci_db_user", "-d", "r1", "-v", "ON_ERROR_STOP=1", "-c", "select 1",
    ]);
  });

  it("pg_restore：exec -i 容器 pg_restore -U <url用户> -d <目标库> --clean --if-exists", () => {
    expect(dockerPgRestoreArgs(env, "rcl_restore_x")).toEqual([
      "exec", "-i", "abc123", "pg_restore", "-U", "ci_db_user", "-d", "rcl_restore_x", "--clean", "--if-exists",
    ]);
  });

  it("参数中不出现字面postgres用户或jrp-drill-pg", () => {
    const all = [...dockerPsqlArgs(env, "select 1"), ...dockerPgRestoreArgs(env, "r")];
    expect(all).not.toContain("postgres");
    expect(all).not.toContain("jrp-drill-pg");
  });
});
