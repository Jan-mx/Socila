/**
 * 步骤03.3 overlay 合并器测试（POL-FR-003～007 / POL-AC-001/002）：
 * 单元（四种操作 + 冲突检测）与属性（任意合法组合 → 结果唯一、顺序稳定、输入不变）。
 */
import { describe, it, expect } from "vitest";
import {
  mergePolicyContext,
  type MergeInputEntity,
} from "@/server/modules/policy/domain/overlay";

const CHAIN = ["CN", "310000"];
const AS_OF = "2026-01-01";

function entity(overrides: Partial<MergeInputEntity>): MergeInputEntity {
  return {
    businessKey: "k",
    jurisdictionCode: "CN",
    packId: "PACK",
    version: 1,
    payload: { v: 1 },
    role: "baseline",
    effectiveFrom: "2025-01-01",
    effectiveTo: null,
    ...overrides,
  };
}

describe("overlay merger (unit)", () => {
  it("baseline alone yields the national set with provenance", () => {
    const result = mergePolicyContext(
      [entity({ businessKey: "R-base", role: "baseline" })],
      CHAIN,
      AS_OF,
    );
    expect(result.conflicts).toEqual([]);
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].provenance).toEqual([
      { jurisdictionCode: "CN", packId: "PACK", version: 1, operation: "baseline" },
    ]);
  });

  it("add introduces new keys; duplicate-add conflicts", () => {
    const add = entity({ businessKey: "R-sh-1", jurisdictionCode: "310000", role: "add" });
    const ok = mergePolicyContext(
      [entity({ businessKey: "R-base", role: "baseline" }), add],
      CHAIN,
      AS_OF,
    );
    expect(ok.conflicts).toEqual([]);
    expect(ok.entities.map((e) => e.businessKey)).toEqual(["R-base", "R-sh-1"]);

    const dup = mergePolicyContext(
      [entity({ businessKey: "R-base", role: "baseline" }), entity({ businessKey: "R-base", jurisdictionCode: "310000", role: "add" })],
      CHAIN,
      AS_OF,
    );
    expect(dup.conflicts[0]).toMatchObject({ kind: "duplicate-add", businessKey: "R-base" });
  });

  it("replace/exempt/restrict require an existing key and record provenance", () => {
    const base = entity({ businessKey: "P-cap", payload: { cap: 100 }, role: "baseline" });
    const sh = entity({
      businessKey: "P-cap",
      jurisdictionCode: "310000",
      version: 2,
      payload: { cap: 80 },
      role: "replace",
      packId: "SH-OVERLAY",
    });
    const merged = mergePolicyContext([base, sh], CHAIN, AS_OF);
    expect(merged.conflicts).toEqual([]);
    expect(merged.entities[0].payload).toEqual({ cap: 80 });
    expect(merged.entities[0].provenance).toHaveLength(2);

    const unknown = mergePolicyContext(
      [entity({ businessKey: "X", jurisdictionCode: "310000", role: "replace" })],
      CHAIN,
      AS_OF,
    );
    expect(unknown.conflicts[0]).toMatchObject({ kind: "unknown-key" });

    const restricted = mergePolicyContext(
      [base, entity({ businessKey: "P-cap", jurisdictionCode: "310000", payload: { maxAge: 60 }, role: "restrict" })],
      CHAIN,
      AS_OF,
    );
    expect(restricted.entities[0].restrictions).toEqual([{ maxAge: 60 }]);
    expect(restricted.entities[0].payload).toEqual({ cap: 100 });

    const exempted = mergePolicyContext(
      [base, entity({ businessKey: "P-cap", jurisdictionCode: "310000", role: "exempt" })],
      CHAIN,
      AS_OF,
    );
    expect(exempted.entities[0].exempted).toBe(true);
  });

  it("same-pack multiple versions are succession (latest wins), not conflict", () => {
    const merged = mergePolicyContext(
      [
        entity({ businessKey: "K", jurisdictionCode: "310000", version: 1, effectiveFrom: "2024-01-01", payload: { v: 1 }, role: "add" }),
        entity({ businessKey: "K", jurisdictionCode: "310000", version: 2, effectiveFrom: "2025-06-01", payload: { v: 2 }, role: "add" }),
      ],
      CHAIN,
      AS_OF,
    );
    expect(merged.conflicts).toEqual([]);
    expect(merged.entities).toHaveLength(1);
    expect(merged.entities[0].payload).toEqual({ v: 2 });
    expect(merged.entities[0].provenance[0].version).toBe(2);
  });

  it("same-level overlap conflicts and cross-jurisdiction isolation", () => {
    const overlap = mergePolicyContext(
      [
        entity({ businessKey: "K", jurisdictionCode: "310000", version: 1, role: "add", packId: "A" }),
        entity({ businessKey: "K", jurisdictionCode: "310000", version: 2, role: "add", packId: "B" }),
      ],
      CHAIN,
      AS_OF,
    );
    expect(overlap.conflicts[0]).toMatchObject({ kind: "same-level-overlap", businessKey: "K" });

    // POL-AC-002：广东 overlay 不进入上海解析。
    const gd = entity({ businessKey: "K-gd", jurisdictionCode: "440000", role: "add" });
    const sh = mergePolicyContext(
      [entity({ businessKey: "R-base", role: "baseline" }), gd],
      ["CN", "310000"],
      AS_OF,
    );
    expect(sh.entities.map((e) => e.businessKey)).not.toContain("K-gd");
  });

  it("respects asOfDate filtering (future entities excluded)", () => {
    const future = mergePolicyContext(
      [entity({ businessKey: "F", effectiveFrom: "2027-01-01", role: "baseline" })],
      CHAIN,
      AS_OF,
    );
    expect(future.entities).toEqual([]);
  });
});

describe("overlay merger (property-style)", () => {
  it("arbitrary valid combos: unique keys, stable order, inputs unmutated", () => {
    const combos: MergeInputEntity[][] = [
      [entity({ businessKey: "A", role: "baseline" }), entity({ businessKey: "B", role: "baseline" })],
      [
        entity({ businessKey: "A", role: "baseline" }),
        entity({ businessKey: "B", role: "baseline" }),
        entity({ businessKey: "B", jurisdictionCode: "310000", role: "restrict" }),
        entity({ businessKey: "C", jurisdictionCode: "310000", role: "add" }),
      ],
      [
        entity({ businessKey: "A", role: "baseline" }),
        entity({ businessKey: "A", jurisdictionCode: "310000", role: "exempt" }),
        entity({ businessKey: "B", role: "baseline" }),
      ],
    ];

    for (const entities of combos) {
      const snapshot = JSON.stringify(entities);
      const first = mergePolicyContext(structuredClone(entities), CHAIN, AS_OF);
      const second = mergePolicyContext(entities, CHAIN, AS_OF);
      // 输入不变
      expect(JSON.stringify(entities)).toBe(snapshot);
      // 结果唯一且顺序稳定
      expect(second).toEqual(first);
      // 键唯一
      const keys = first.entities.map((e) => e.businessKey);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
