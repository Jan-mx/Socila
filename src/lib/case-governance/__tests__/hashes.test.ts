/**
 * CLG-FR-005 规范化SHA-256内容哈希：
 * - 稳定字段顺序（键排序）；时间戳和数据库自增ID不进入业务内容哈希；
 * - 相同内容相同哈希，键序不同不影响结果。
 *
 * Red：实现前模块 `src/lib/case-governance/hashes` 不存在。
 */
import { describe, it, expect } from "vitest";
import {
  canonicalJson,
  sha256hex,
  rowContentHash,
  testRowContentHash,
  TEST_INFRA_COLUMNS,
} from "../hashes";

describe("CLG-FR-005 canonicalJson", () => {
  it("键排序：JSON.stringify序不同但canonicalJson相同", () => {
    const a = canonicalJson({ b: 1, a: [3, 2], c: { y: 1, x: 2 } });
    const b = canonicalJson({ c: { x: 2, y: 1 }, a: [3, 2], b: 1 });
    expect(a).toBe(b);
  });

  it("canonicalJson确定性：同一对象两次完全一致", () => {
    const obj = { name: "x", nested: { deep: [1, 2, { z: true }] } };
    expect(canonicalJson(obj)).toBe(canonicalJson(obj));
  });

  it("不同内容生成不同JSON", () => {
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
  });
});

describe("CLG-FR-005 sha256hex", () => {
  it("输出64位十六进制摘要", () => {
    expect(sha256hex("content")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("相同输入相同摘要；不同输入不同摘要", () => {
    expect(sha256hex("abc")).toBe(sha256hex("abc"));
    expect(sha256hex("abc")).not.toBe(sha256hex("abd"));
  });
});

describe("CLG-FR-005 rowContentHash（时间戳与自增ID排除）", () => {
  const createTimestamp = (n: number) => new Date(1700000000000 + n * 1000);

  it("id/created_at/updated_at不进入业务哈希", () => {
    const a = rowContentHash(
      { id: 1, caseUid: "u-1", transcriptText: "hello", createdAt: createTimestamp(1), updatedAt: createTimestamp(2) },
      ["id", "created_at", "updated_at"],
    );
    const b = rowContentHash(
      { id: 2, caseUid: "u-1", transcriptText: "hello", createdAt: createTimestamp(9), updatedAt: createTimestamp(9) },
      ["id", "created_at", "updated_at"],
    );
    expect(a).toBe(b);
  });

  it("业务内容差异改变哈希", () => {
    const a = rowContentHash({ caseUid: "u-1", transcriptText: "hello" }, []);
    const b = rowContentHash({ caseUid: "u-1", transcriptText: "world" }, []);
    expect(a).not.toBe(b);
  });

  it("暴露的排除列名同时接受camelCase与snake_case", () => {
    const a = rowContentHash({ id: 1, createdAt: createTimestamp(1), v: 1 }, ["id", "createdAt"]);
    const b = rowContentHash({ id: 9, createdAt: createTimestamp(9), v: 1 }, ["id", "created_at"]);
    expect(a).toBe(b);
  });

  it("Date对象按YYYY-MM-DD确定性序列化（跨时区不漂移，RCL第三轮复审）", () => {
    // node-postgres对date列返回本地时区Date；规范化必须与字符串"2026-09-01"一致。
    const localDate = new Date(2026, 8, 1);
    const a = canonicalJson({ as_of_date: localDate });
    const b = canonicalJson({ as_of_date: "2026-09-01" });
    expect(a).toBe(b);
    const utcDate = new Date(Date.UTC(2026, 8, 1));
    expect(canonicalJson({ as_of_date: utcDate })).toBe(b);
  });
});

describe("RCL第三轮复审：旧regression test完整内容hash（RCL-FR-002/AC-003）", () => {
  const ts = (n: number) => new Date(1700000000000 + n * 1000);

  /** 与`SELECT * FROM tests`一致的原始行（snake_case，含基础/运行时列）。 */
  function testRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 700,
      name: "R-100: 正常退休示例",
      jurisdiction_code: "310000",
      rule_id: "R-100",
      input: { user: { basic: { gender: "male" } } },
      params_override: { "P-X": 1 },
      expected: { calc: { retirement: { legal_retire_age_years: 60 } } },
      source: "regression",
      source_case_uid: "RPC-310000-SH-X-V1",
      last_run_result: null,
      last_run_at: null,
      created_at: ts(1),
      updated_at: ts(2),
      ...overrides,
    };
  }

  it("testRowContentHash输出64位非空SHA-256", () => {
    const h = testRowContentHash(testRow());
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toBe("".padEnd(64, "0"));
  });

  it("八个业务字段任一漂移均改变hash（name/jurisdictionCode/ruleId/input/paramsOverride/expected/source/sourceCaseUid）", () => {
    const base = testRowContentHash(testRow());
    const drifts: Array<[string, Record<string, unknown>]> = [
      ["name", { name: "R-100: 修改后的名字" }],
      ["jurisdiction_code", { jurisdiction_code: "440000" }],
      ["rule_id", { rule_id: "R-200" }],
      ["input", { input: { user: { basic: { gender: "female" } } } }],
      ["params_override", { params_override: { "P-X": 2 } }],
      ["expected", { expected: { calc: { retirement: { legal_retire_age_years: 61 } } } }],
      ["source", { source: "example" }],
      ["source_case_uid", { source_case_uid: "RPC-310000-SH-Y-V1" }],
    ];
    for (const [label, drift] of drifts) {
      const h = testRowContentHash(testRow(drift));
      expect(h).not.toBe(base);
      void label;
    }
  });

  it("基础设施列（自增ID/受控时间戳/运行时执行状态）不进入hash", () => {
    const base = testRowContentHash(testRow());
    const moved = testRowContentHash(
      testRow({ id: 999, created_at: ts(99), updated_at: ts(100), last_run_at: ts(101) }),
    );
    expect(moved).toBe(base);
    // last_run_result 是运行时产物而非业务字段：不进入内容hash。
    const run = testRowContentHash(testRow({ last_run_result: { pass: true } }));
    expect(run).toBe(base);
  });

  it("TEST_INFRA_COLUMNS恰好排除基础列，业务列全部保留", () => {
    expect(TEST_INFRA_COLUMNS).toEqual([
      "id",
      "created_at",
      "updated_at",
      "last_run_at",
      "last_run_result",
    ]);
    // 业务字段不在排除集合中。
    for (const biz of ["name", "jurisdiction_code", "rule_id", "input", "params_override", "expected", "source", "source_case_uid"]) {
      expect(TEST_INFRA_COLUMNS).not.toContain(biz);
    }
  });
});