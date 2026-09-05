/**
 * NRP-FR-007/FR-006/FR-011 overlay 合并器测试（显式操作与目标业务键）：
 * 单元（baseline + 四种overlay + 显式目标键 + 冲突检测）与属性
 * （任意合法组合 → 结果唯一、顺序稳定、输入不变）。
 *
 * PRD §7不变量：CN实体只能使用baseline，地区实体不能使用baseline；
 * replace/restrict/exempt必须解析到继承链上唯一上级业务键；
 * add不得覆盖已存在的有效业务键。
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
    operation: "baseline",
    targetBusinessKey: null,
    effectiveFrom: "2025-01-01",
    effectiveTo: null,
    ...overrides,
  };
}

describe("overlay merger (unit, explicit operations)", () => {
  it("baseline alone yields the national set with provenance", () => {
    const result = mergePolicyContext(
      [entity({ businessKey: "R-base", operation: "baseline" })],
      CHAIN,
      AS_OF,
    );
    expect(result.conflicts).toEqual([]);
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].provenance).toEqual([
      {
        jurisdictionCode: "CN",
        packId: "PACK",
        version: 1,
        operation: "baseline",
        targetBusinessKey: null,
      },
    ]);
  });

  it("add introduces new keys; duplicate-add conflicts", () => {
    const add = entity({
      businessKey: "R-sh-1",
      jurisdictionCode: "310000",
      operation: "add",
    });
    const ok = mergePolicyContext(
      [entity({ businessKey: "R-base", operation: "baseline" }), add],
      CHAIN,
      AS_OF,
    );
    expect(ok.conflicts).toEqual([]);
    expect(ok.entities.map((e) => e.businessKey)).toEqual(["R-base", "R-sh-1"]);

    const dup = mergePolicyContext(
      [
        entity({ businessKey: "R-base", operation: "baseline" }),
        entity({
          businessKey: "R-base",
          jurisdictionCode: "310000",
          operation: "add",
        }),
      ],
      CHAIN,
      AS_OF,
    );
    expect(dup.conflicts[0]).toMatchObject({
      kind: "duplicate-add",
      businessKey: "R-base",
    });
  });

  it("replace with explicit upper-level target replaces payload and records provenance", () => {
    const base = entity({
      businessKey: "P-cap",
      payload: { cap: 100 },
      operation: "baseline",
    });
    const sh = entity({
      businessKey: "P-cap",
      jurisdictionCode: "310000",
      version: 2,
      payload: { cap: 80 },
      operation: "replace",
      targetBusinessKey: "P-cap",
      packId: "SH-OVERLAY",
    });
    const merged = mergePolicyContext([base, sh], CHAIN, AS_OF);
    expect(merged.conflicts).toEqual([]);
    expect(merged.entities[0].businessKey).toBe("P-cap");
    expect(merged.entities[0].payload).toEqual({ cap: 80 });
    expect(merged.entities[0].provenance).toHaveLength(2);
    expect(merged.entities[0].provenance[1]).toEqual({
      jurisdictionCode: "310000",
      packId: "SH-OVERLAY",
      version: 2,
      operation: "replace",
      targetBusinessKey: "P-cap",
    });
  });

  it("replace with missing target conflicts (missing-target)", () => {
    const merged = mergePolicyContext(
      [
        entity({ businessKey: "A", operation: "baseline" }),
        entity({
          businessKey: "B",
          jurisdictionCode: "310000",
          operation: "replace",
          targetBusinessKey: null,
        }),
      ],
      CHAIN,
      AS_OF,
    );
    expect(merged.conflicts[0]).toMatchObject({ kind: "missing-target" });
    expect(merged.entities.map((e) => e.businessKey)).toEqual(["A"]);
  });

  it("replace targeting an unknown key conflicts (unknown-key)", () => {
    const merged = mergePolicyContext(
      [
        entity({ businessKey: "A", operation: "baseline" }),
        entity({
          businessKey: "B",
          jurisdictionCode: "310000",
          operation: "replace",
          targetBusinessKey: "X-missing",
        }),
      ],
      CHAIN,
      AS_OF,
    );
    expect(merged.conflicts[0]).toMatchObject({
      kind: "unknown-key",
      businessKey: "B",
    });
  });

  it("replace targeting a same-level key conflicts (same-level-target)", () => {
    const merged = mergePolicyContext(
      [
        entity({ businessKey: "A", operation: "baseline" }),
        entity({
          businessKey: "B",
          jurisdictionCode: "310000",
          operation: "add",
        }),
        entity({
          businessKey: "C",
          jurisdictionCode: "310000",
          operation: "replace",
          targetBusinessKey: "B",
        }),
      ],
      CHAIN,
      AS_OF,
    );
    expect(merged.conflicts[0]).toMatchObject({
      kind: "same-level-target",
      businessKey: "C",
    });
  });

  it("restrict/exempt require an existing upper-level target and record provenance", () => {
    const base = entity({
      businessKey: "P-cap",
      payload: { cap: 100 },
      operation: "baseline",
    });
    const restricted = mergePolicyContext(
      [
        base,
        entity({
          businessKey: "P-cap-r",
          jurisdictionCode: "310000",
          payload: { maxAge: 60 },
          operation: "restrict",
          targetBusinessKey: "P-cap",
        }),
      ],
      CHAIN,
      AS_OF,
    );
    expect(restricted.conflicts).toEqual([]);
    expect(restricted.entities[0].restrictions).toEqual([{ maxAge: 60 }]);
    expect(restricted.entities[0].payload).toEqual({ cap: 100 });

    const exempted = mergePolicyContext(
      [
        base,
        entity({
          businessKey: "P-cap-e",
          jurisdictionCode: "310000",
          operation: "exempt",
          targetBusinessKey: "P-cap",
        }),
      ],
      CHAIN,
      AS_OF,
    );
    expect(exempted.entities[0].exempted).toBe(true);

    const missingTarget = mergePolicyContext(
      [
        base,
        entity({
          businessKey: "P-cap-x",
          jurisdictionCode: "310000",
          operation: "restrict",
          targetBusinessKey: null,
        }),
      ],
      CHAIN,
      AS_OF,
    );
    expect(missingTarget.conflicts[0]).toMatchObject({ kind: "missing-target" });
  });

  it("CN entities must use baseline; regional entities must not (PRD §7)", () => {
    // CN + add → national-not-baseline。
    const nationalAdd = mergePolicyContext(
      [entity({ businessKey: "A", operation: "add" })],
      CHAIN,
      AS_OF,
    );
    expect(nationalAdd.conflicts[0]).toMatchObject({
      kind: "national-not-baseline",
    });

    // 地区 + baseline → regional-baseline。
    const regionalBaseline = mergePolicyContext(
      [
        entity({ businessKey: "A", operation: "baseline" }),
        entity({
          businessKey: "B",
          jurisdictionCode: "310000",
          operation: "baseline",
        }),
      ],
      CHAIN,
      AS_OF,
    );
    expect(regionalBaseline.conflicts[0]).toMatchObject({
      kind: "regional-baseline",
      businessKey: "B",
    });
  });

  it("same-pack multiple versions are succession (latest wins), not conflict", () => {
    const merged = mergePolicyContext(
      [
        entity({
          businessKey: "K",
          jurisdictionCode: "310000",
          version: 1,
          effectiveFrom: "2024-01-01",
          payload: { v: 1 },
          operation: "add",
        }),
        entity({
          businessKey: "K",
          jurisdictionCode: "310000",
          version: 2,
          effectiveFrom: "2025-06-01",
          payload: { v: 2 },
          operation: "add",
        }),
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
        entity({
          businessKey: "K",
          jurisdictionCode: "310000",
          version: 1,
          operation: "add",
          packId: "A",
        }),
        entity({
          businessKey: "K",
          jurisdictionCode: "310000",
          version: 2,
          operation: "add",
          packId: "B",
        }),
      ],
      CHAIN,
      AS_OF,
    );
    expect(overlap.conflicts[0]).toMatchObject({
      kind: "same-level-overlap",
      businessKey: "K",
    });

    // POL-AC-002：广东 overlay 不进入上海解析。
    const gd = entity({
      businessKey: "K-gd",
      jurisdictionCode: "440000",
      operation: "add",
    });
    const sh = mergePolicyContext(
      [entity({ businessKey: "R-base", operation: "baseline" }), gd],
      ["CN", "310000"],
      AS_OF,
    );
    expect(sh.entities.map((e) => e.businessKey)).not.toContain("K-gd");
  });

  it("respects asOfDate filtering (future entities excluded)", () => {
    const future = mergePolicyContext(
      [
        entity({
          businessKey: "F",
          effectiveFrom: "2027-01-01",
          operation: "baseline",
        }),
      ],
      CHAIN,
      AS_OF,
    );
    expect(future.entities).toEqual([]);
  });

  it("replace chain: SH replaces CN baseline, provenance preserves full chain", () => {
    // 三级链：CN baseline → SH replace。省份解析保持替换结果与完整provenance。
    const merged = mergePolicyContext(
      [
        entity({
          businessKey: "P-tbl",
          payload: { rows: "national" },
          operation: "baseline",
        }),
        entity({
          businessKey: "P-tbl-sh",
          jurisdictionCode: "310000",
          packId: "SH-OVERLAY",
          version: 1,
          payload: { rows: "shanghai" },
          operation: "replace",
          targetBusinessKey: "P-tbl",
        }),
      ],
      ["CN", "310000"],
      AS_OF,
    );
    expect(merged.conflicts).toEqual([]);
    expect(merged.entities).toHaveLength(1);
    expect(merged.entities[0].payload).toEqual({ rows: "shanghai" });
    expect(
      merged.entities[0].provenance.map((p) => p.operation),
    ).toEqual(["baseline", "replace"]);
  });
});

describe("overlay merger (property-style)", () => {
  it("arbitrary valid combos: unique keys, stable order, inputs unmutated", () => {
    const combos: MergeInputEntity[][] = [
      [
        entity({ businessKey: "A", operation: "baseline" }),
        entity({ businessKey: "B", operation: "baseline" }),
      ],
      [
        entity({ businessKey: "A", operation: "baseline" }),
        entity({ businessKey: "B", operation: "baseline" }),
        entity({
          businessKey: "B-r",
          jurisdictionCode: "310000",
          operation: "restrict",
          targetBusinessKey: "B",
        }),
        entity({ businessKey: "C", jurisdictionCode: "310000", operation: "add" }),
      ],
      [
        entity({ businessKey: "A", operation: "baseline" }),
        entity({
          businessKey: "A-e",
          jurisdictionCode: "310000",
          operation: "exempt",
          targetBusinessKey: "A",
        }),
        entity({ businessKey: "B", operation: "baseline" }),
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
