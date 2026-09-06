/**
 * NRP-FR-017/NRP-NFR-009 数据库目标守卫加固（审查缺陷1）：
 * - 仅接受postgresql/postgres协议；
 * - host仅localhost/127.0.0.1/::1，port精确5432，database精确policyops；
 * - 拒绝一切search params、fragment、Unix socket与连接目标覆盖参数
 *   （pg-connection-string会让?host=/?port=覆盖authority——已证实）；
 * - 校验结果必须与node-postgres最终连接配置一致；
 * - 指纹基于实际连接目标；连接串与口令不进入异常消息。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse as parsePgConnectionString } from "pg-connection-string";
import {
  resolveTarget,
  TargetGuardError,
  type MaterializationTarget,
} from "./target";
import { computeTargetFingerprint, type ExistingState } from "./target";

function expectRejected(url: string): void {
  let message = "";
  try {
    resolveTarget({ DATABASE_URL: url });
  } catch (err) {
    message = (err as Error).message;
  }
  expect(message, `应拒绝 ${url}`).toMatch(/materialize-target/);
  // 连接串与口令不得进入异常消息（NRP-NFR-009）。
  expect(message).not.toContain(url);
}

function expectAccepted(
  url: string,
  expected: MaterializationTarget = {
    host: "localhost",
    port: "5432",
    database: "policyops",
  },
): void {
  const target = resolveTarget({ DATABASE_URL: url });
  expect(target).toEqual(expected);
  // 与node-postgres最终连接配置一致（审查缺陷1：query覆盖绕过）。
  // IPv6的方括号做归一（与守卫同一口径）。
  const parsed = parsePgConnectionString(url);
  expect(
    (parsed.host ?? "").replace(/^\[/, "").replace(/\]$/, "").toLowerCase(),
  ).toBe(expected.host);
  expect(String(parsed.port)).toBe(expected.port);
  expect(parsed.database).toBe(expected.database);
}

describe("目标守卫：连接目标覆盖与协议（审查缺陷1）", () => {
  it("合法localhost:5432/policyops通过（含凭据）", () => {
    expectAccepted("postgresql://u:p@localhost:5432/policyops");
    expectAccepted("postgres://u:p@localhost:5432/policyops");
    expectAccepted("postgresql://localhost:5432/policyops");
  });

  it("远程主机拒绝", () => {
    expectRejected("postgresql://u:p@remote.example:5432/policyops");
    expectRejected("postgresql://u:p@10.0.0.8:5432/policyops");
    expectRejected("postgresql://u:p@internal-db.local:5432/policyops");
  });

  it("localhost错误端口拒绝", () => {
    expectRejected("postgresql://u:p@localhost:5433/policyops");
    expectRejected("postgresql://u:p@localhost:6543/policyops");
  });

  it("host查询参数覆盖拒绝（node-postgres实际连接remote.example）", () => {
    expectRejected(
      "postgresql://u:p@localhost:5432/policyops?host=remote.example&port=6543",
    );
  });

  it("port查询参数覆盖拒绝", () => {
    expectRejected("postgresql://u:p@localhost:5432/policyops?port=6543");
  });

  it("database查询参数覆盖拒绝", () => {
    expectRejected("postgresql://u:p@localhost:5432/policyops?dbname=other");
    expectRejected("postgresql://u:p@localhost:5432/policyops?database=other");
  });

  it("任意search params与fragment拒绝", () => {
    expectRejected("postgresql://u:p@localhost:5432/policyops?sslmode=disable");
    expectRejected("postgresql://u:p@localhost:5432/policyops?application_name=x");
    expectRejected("postgresql://u:p@localhost:5432/policyops#frag");
  });

  it("URL编码路径不等于policyops（pg不解码percent-encoding）", () => {
    expectRejected("postgresql://u:p@localhost:5432/polic%79ops");
    expectRejected("postgresql://u:p@localhost:5432/policyops%00");
  });

  it("IPv6本机接受（WHATWG URL将全写形式规范化为::1）、非本机IPv6拒绝", () => {
    expectAccepted(
      "postgresql://u:p@[::1]:5432/policyops",
      { host: "::1", port: "5432", database: "policyops" },
    );
    // URL类把0:0:0:0:0:0:0:1规范化为::1——实际连接目标相同（仍为本机回环）。
    expectAccepted(
      "postgresql://u:p@[0:0:0:0:0:0:0:1]:5432/policyops",
      { host: "::1", port: "5432", database: "policyops" },
    );
    expectRejected("postgresql://u:p@[::2]:5432/policyops");
    expectRejected("postgresql://u:p@[fe80::1]:5432/policyops");
  });

  it("空值、非法URL、非PostgreSQL协议拒绝", () => {
    expect(() => resolveTarget({})).toThrow(TargetGuardError);
    expect(() => resolveTarget({ DATABASE_URL: "" })).toThrow(TargetGuardError);
    expect(() => resolveTarget({ DATABASE_URL: "   " })).toThrow(TargetGuardError);
    expectRejected("not-a-url");
    expectRejected("http://localhost:5432/policyops");
    expectRejected("mysql://u:p@localhost:5432/policyops");
  });

  it("Unix socket连接拒绝", () => {
    expectRejected("postgresql:///policyops?host=/var/run/postgresql");
    expectRejected("postgresql://%2Fvar%2Frun%2Fpostgresql/policyops");
    expectRejected("postgresql://u:p@%2Ftmp%2Fsocket:5432/policyops");
  });

  it("指纹基于实际连接目标且不含连接串", async () => {
    const state: ExistingState = {
      counts: { rules: 24 },
      publishedRowsHash: "h",
      maxVersions: new Map(),
      packVersions: new Map(),
    };
    const local = resolveTarget({
      DATABASE_URL: "postgresql://u:p@localhost:5432/policyops",
    });
    const fp = computeTargetFingerprint(local, state);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(fp).not.toContain("postgres");
    // 相同实际连接目标 → 指纹稳定。
    expect(
      computeTargetFingerprint(
        resolveTarget({ DATABASE_URL: "postgres://localhost:5432/policyops" }),
        state,
      ),
    ).toBe(fp);
  });

  it("源码契约：目标守卫不导入dotenv/load-environment（审查缺陷9关联）", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/policy-materialization/target.ts"),
      "utf8",
    );
    // 仅检查导入语句（注释中的禁止性描述不触发）。
    expect(source).not.toMatch(/from\s+["'](dotenv|.*load-environment)["']/);
    expect(source).not.toMatch(/require\(["'](dotenv|.*load-environment)["']\)/);
  });
});
