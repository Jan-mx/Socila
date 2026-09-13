/**
 * RCL-FR-006/015、RCL-AC-003/011 精确manifest测试：
 * - 绑定旧目标行（删除集合）行ID与内容hash；任一漂移→manifest失效（RCL-AC-003）；
 * - 绑定新行hash、快照、评分与来源映射（RCL-FR-006）；
 * - 计数 N/36/N+44，N 来自覆盖manifest，禁止硬编码452/500（RCL-FR-015/AC-011）；
 * - 相同输入 manifestHash 确定性（RCL-NFR-002）。
 */
import { describe, it, expect } from "vitest";
import {
  buildRclManifest,
  assertRclCounts,
  computeManifestHash,
  recomputeManifestHash,
  assertManifestContentHashes,
  type RclManifest,
  type RclManifestInput,
} from "../manifest";

/** 64位hex占位hash（manifest行绑定要求RCL-AC-003非空SHA-256）。 */
import { createHash } from "node:crypto";
const H = (n: string | number) => createHash("sha256").update(String(n)).digest("hex");

function sampleInput(overrides: Partial<RclManifestInput> = {}): RclManifestInput {
  return {
    algorithmVersion: "RCL-MANIFEST-1.0",
    generatorVersion: "RCL-GEN-1.0",
    newCases: [
      { rowId: 1, uid: "RPC-310000-SH-A-V1", contentHash: H("case-1"), jurisdictionCode: "310000", scenarioKey: "SH-A", asOfDate: "2026-09-01", input: { basic: { gender: "male" } }, expected: { retirement: {} }, assertions: [{ path: "calc.retirement.legal_retire_age_years", operator: "eq", value: 60 }], coverageObligations: ["capability:retirement"], evidence: [{ documentId: "DOC", locator: "正文" }], qualityScore: 80, qualityBreakdown: { input: 40 }, multiLabels: ["male"], snapshotId: "snap-1", snapshotHash: "snap-h-1", sourceTestUid: "RPCT-310000-SH-A-V1" },
      { rowId: 2, uid: "RPC-440000-GD-A-V1", contentHash: H("case-2"), jurisdictionCode: "440000", scenarioKey: "GD-A", asOfDate: "2026-09-01", input: { basic: { gender: "female" } }, expected: { retirement: {} }, assertions: [{ path: "calc.retirement.legal_retire_age_years", operator: "eq", value: 55 }], coverageObligations: ["capability:retirement"], evidence: [{ documentId: "DOC", locator: "正文" }], qualityScore: 85, qualityBreakdown: { input: 40 }, multiLabels: ["female"], snapshotId: "snap-2", snapshotHash: "snap-h-2", sourceTestUid: "RPCT-440000-GD-A-V1" },
    ],
    newShowcase: Array.from({ length: 36 }, (_, i) => ({
      rowId: 1000 + i,
      uid: `RPC-${i % 2 === 0 ? "310000" : "440000"}-SHOW-${i}-V1`,
      contentHash: H(`show-${i}`),
      jurisdictionCode: i % 2 === 0 ? "310000" : "440000",
      scenarioKey: `SHOW-${i}`,
      asOfDate: "2026-09-01",
      input: { basic: { gender: "male" } },
      expected: { retirement: {} },
      assertions: [{ path: "calc.retirement.legal_retire_age_years", operator: "eq", value: 60 }],
      coverageObligations: ["capability:retirement"],
      evidence: [{ documentId: "DOC", locator: "正文" }],
      sourceCaseUid: `RPC-${i % 2 === 0 ? "310000" : "440000"}-SHOW-${i}-V1`,
      qualityScore: 80,
      qualityBreakdown: { input: 40 },
      multiLabels: ["male"],
      snapshotId: "snap-1",
      snapshotHash: "snap-h-1",
    })),
    newTests: [
      { rowId: 21, uid: "RPCT-310000-SH-A-V1", contentHash: H("test-1"), jurisdictionCode: "310000", sourceCaseUid: "RPC-310000-SH-A-V1", input: { user: { basic: { gender: "male" } } }, expected: { retirement: {} } },
      { rowId: 22, uid: "RPCT-440000-GD-A-V1", contentHash: H("test-2"), jurisdictionCode: "440000", sourceCaseUid: "RPC-440000-GD-A-V1", input: { user: { basic: { gender: "female" } } }, expected: { retirement: {} } },
    ],
    exampleTests: Array.from({ length: 44 }, (_, i) => ({
      rowId: 2000 + i,
      uid: `示例${i}`,
      contentHash: H(`ex-${i}`),
      jurisdictionCode: i % 2 === 0 ? "CN" : "310000",
    })),
    // RCL-FR-018/AC-011（第三轮复审）：44条DSL example的保留/更新/新增/删除集合。
    exampleSync: {
      retained: Array.from({ length: 44 }, (_, i) => ({
        rowId: 2000 + i,
        name: `示例${i}`,
        jurisdictionCode: i % 2 === 0 ? "CN" : "310000",
        contentHash: H(`ex-${i}`),
      })),
      updated: [],
      added: [],
      deleted: [],
    },
    oldTargets: {
      cases: [
        { rowId: 100, uid: "old-case-1", contentHash: H("old-case-1") },
        { rowId: 101, uid: "old-case-2", contentHash: H("old-case-2") },
      ],
      showcase: [{ rowId: 200, uid: "old-show-1", contentHash: H("old-sh-1") }],
      tests: [{ rowId: 300, uid: "old-test-1", contentHash: H("old-t-1") }],
    },
    snapshot: { id: "snap-1", contentHash: "snap-h-1" },
    ...overrides,
  };
}

describe("RCL-FR-006 精确manifest绑定", () => {
  it("绑定旧目标行ID与内容hash、新行hash、快照、评分与来源映射", () => {
    const manifest = buildRclManifest(sampleInput());
    expect(manifest.oldTargets.cases).toEqual([
      { rowId: 100, uid: "old-case-1", contentHash: H("old-case-1") },
      { rowId: 101, uid: "old-case-2", contentHash: H("old-case-2") },
    ]);
    expect(manifest.oldTargets.showcase[0].contentHash).toBe(H("old-sh-1"));
    expect(manifest.newCases[0]).toMatchObject({
      contentHash: H("case-1"),
      snapshotHash: "snap-h-1",
      qualityScore: 80,
      sourceTestUid: "RPCT-310000-SH-A-V1",
    });
    expect(manifest.newShowcase[0]).toMatchObject({
      sourceCaseUid: "RPC-310000-SHOW-0-V1",
      snapshotHash: "snap-h-1",
    });
    expect(manifest.newShowcase).toHaveLength(36);
    expect(manifest.snapshot).toEqual({ id: "snap-1", contentHash: "snap-h-1" });
  });

  it("任一旧目标行内容hash漂移 → manifestHash变化（RCL-AC-003）", () => {
    const base = buildRclManifest(sampleInput());
    const drifted = buildRclManifest(
      sampleInput({
        oldTargets: {
          cases: [
            { rowId: 100, uid: "old-case-1", contentHash: H("changed") },
            { rowId: 101, uid: "old-case-2", contentHash: H("old-case-2") },
          ],
          showcase: [{ rowId: 200, uid: "old-show-1", contentHash: H("old-sh-1") }],
          tests: [{ rowId: 300, uid: "old-test-1", contentHash: H("old-t-1") }],
        },
      }),
    );
    expect(drifted.manifestHash).not.toBe(base.manifestHash);
  });

  it("快照ID/hash漂移 → manifestHash变化（RCL-AC-003）", () => {
    const base = buildRclManifest(sampleInput());
    const drifted = buildRclManifest(
      sampleInput({ snapshot: { id: "snap-X", contentHash: "snap-h-X" } }),
    );
    expect(drifted.manifestHash).not.toBe(base.manifestHash);
  });

  it("manifestHash 64位hex且相同输入确定性（RCL-NFR-002）", () => {
    const a = buildRclManifest(sampleInput());
    const b = buildRclManifest(sampleInput());
    expect(a.manifestHash).toBe(b.manifestHash);
    expect(a.manifestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(computeManifestHash({ x: 1 })).toBe(computeManifestHash({ x: 1 }));
  });
});

describe("RCL-FR-015/AC-011 计数 N/36/N+44", () => {
  it("N = 覆盖manifest唯一case数；不硬编码452/500", () => {
    const manifest = buildRclManifest(sampleInput());
    expect(manifest.caseCount).toBe(2);
    expect(manifest.counts).toEqual({ cases: 2, showcase: 36, tests: 46 });
    expect(() => assertRclCounts(manifest)).not.toThrow();
  });

  it("showcase≠36 或 tests≠N+44 → 断言失败（RCL-AC-011）", () => {
    const bad = buildRclManifest(sampleInput());
    bad.counts.showcase = 35;
    expect(() => assertRclCounts(bad)).toThrow(/36/);

    const bad2 = buildRclManifest(sampleInput());
    bad2.counts.tests = 999;
    expect(() => assertRclCounts(bad2)).toThrow(/N\+44/);
  });

  it("manifest不含452/500硬编码计数", () => {
    const manifest = buildRclManifest(sampleInput());
    // 剔除64位hash噪声后检查（hash可能偶然包含数字串，与硬编码计数无关）。
    const withoutHashes = JSON.stringify(manifest).replace(/[0-9a-f]{64}/g, "<hash>");
    expect(withoutHashes).not.toContain("452");
    expect(withoutHashes).not.toContain("500");
  });

  it("exampleTestCount≠44（28/42/49等）→ assertRclCounts拒绝（RCL-AC-011，第三轮复审）", () => {
    for (const bad of [28, 49, 42, 43, 0]) {
      const m = buildRclManifest(
        sampleInput({ exampleTests: Array.from({ length: bad }, (_, i) => ({ rowId: 2000 + i, uid: `示例${i}`, contentHash: H(`ex-${i}`), jurisdictionCode: "CN" })) }),
      );
      expect(() => assertRclCounts(m)).toThrow(/44/);
    }
    const ok = buildRclManifest(sampleInput());
    expect(() => assertRclCounts(ok)).not.toThrow();
  });
});

describe("RCL第三轮复审：manifest自校验（文件声明/正文重算/批次三方一致）", () => {
  it("正文重算hash与声明hash一致（recomputeManifestHash）", () => {
    const m = buildRclManifest(sampleInput());
    expect(recomputeManifestHash(m)).toBe(m.manifestHash);
    expect(recomputeManifestHash(m)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("修改manifest正文但保留旧manifestHash → 重算hash不一致（fail-closed反例）", () => {
    const m = buildRclManifest(sampleInput());
    const tampered = {
      ...m,
      newCases: [{ ...m.newCases[0], scenarioKey: "TAMPERED-KEY" }],
      // manifestHash保持旧值（模拟篡改正文但不更新hash）。
    };
    expect(recomputeManifestHash(tampered)).not.toBe(tampered.manifestHash);
  });

  it("修改new row/old target/example同步/snapshot/counts任一 → 重算hash变化", () => {
    const m = buildRclManifest(sampleInput());
    const tamperCases: Array<[string, RclManifest]> = [
      ["new case contentHash", { ...m, newCases: [{ ...m.newCases[0], contentHash: H("x") }] }],
      ["old target contentHash", { ...m, oldTargets: { ...m.oldTargets, tests: [{ ...m.oldTargets.tests[0], contentHash: H("y") }] } }],
      ["exampleSync updated", { ...m, exampleSync: { ...m.exampleSync, updated: [{ rowId: 2000, name: "示例0", jurisdictionCode: "CN", contentHash: H("ex-0"), targetHash: H("t"), ruleId: "R-X", input: {}, paramsOverride: null, expected: {} }] } }],
      ["snapshot", { ...m, snapshot: { id: "snap-X", contentHash: "snap-h-X" } }],
      ["counts", { ...m, counts: { ...m.counts, tests: m.counts.tests + 1 } }],
    ];
    const base = recomputeManifestHash(m);
    for (const [label, t] of tamperCases) {
      expect(recomputeManifestHash(t), label).not.toBe(base);
    }
  });

  it("createdAt等非确定性元数据不进入hash（RCL-NFR-002）", () => {
    const a = buildRclManifest(sampleInput());
    const b = { ...a, createdAt: "2999-01-01T00:00:00.000Z" };
    expect(recomputeManifestHash(b)).toBe(recomputeManifestHash(a));
    // manifestHash字段本身也不进入自身计算。
    const c = { ...a, manifestHash: "x".repeat(64) };
    expect(recomputeManifestHash(c)).toBe(recomputeManifestHash(a));
  });
});

describe("RCL第三轮复审：manifest内容hash完整性（RCL-FR-002）", () => {
  it("旧test contentHash为空 → assertManifestContentHashes拒绝", () => {
    const m = buildRclManifest(
      sampleInput({
        oldTargets: {
          cases: sampleInput().oldTargets.cases,
          showcase: sampleInput().oldTargets.showcase,
          tests: [{ rowId: 300, uid: "old-test-1", contentHash: "" }],
        },
      }),
    );
    expect(() => assertManifestContentHashes(m)).toThrow(/old.*test|旧.*test|tests/i);
  });

  it("旧test contentHash非64位hex → 拒绝；全部64位hex → 通过", () => {
    const bad = buildRclManifest(
      sampleInput({
        oldTargets: {
          cases: sampleInput().oldTargets.cases,
          showcase: sampleInput().oldTargets.showcase,
          tests: [{ rowId: 300, uid: "old-test-1", contentHash: "not-a-sha" }],
        },
      }),
    );
    expect(() => assertManifestContentHashes(bad)).toThrow();
    const ok = buildRclManifest(sampleInput());
    expect(() => assertManifestContentHashes(ok)).not.toThrow();
  });
});
