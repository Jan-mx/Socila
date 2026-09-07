/**
 * CLG-FR-005 规范化SHA-256内容哈希：
 * - 稳定字段顺序（键排序）；时间戳和数据库自增ID不进入业务内容哈希；
 * - 相同内容相同哈希，键序不同不影响结果。
 *
 * Red：实现前模块 `src/lib/case-governance/hashes` 不存在。
 */
import { describe, it, expect } from "vitest";
import { canonicalJson, sha256hex, rowContentHash } from "../hashes";

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
});