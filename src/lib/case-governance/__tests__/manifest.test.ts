/**
 * RCL-FR-006/015、RCL-AC-003/011 精确manifest测试：
 * - 绑定旧目标行（删除集合）行ID与内容hash；任一漂移→manifest失效（RCL-AC-003）；
 * - 绑定新行hash、快照、评分与来源映射（RCL-FR-006）；
 * - 计数 N/36/N+42，N 来自覆盖manifest，禁止硬编码452/500（RCL-FR-015/AC-011）；
 * - 相同输入 manifestHash 确定性（RCL-NFR-002）。
 */
import { describe, it, expect } from "vitest";
import {
  buildRclManifest,
  assertRclCounts,
  computeManifestHash,
  type RclManifestInput,
} from "../manifest";

function sampleInput(overrides: Partial<RclManifestInput> = {}): RclManifestInput {
  return {
    algorithmVersion: "RCL-MANIFEST-1.0",
    generatorVersion: "RCL-GEN-1.0",
    newCases: [
      { rowId: 1, uid: "RPC-310000-SH-A-V1", contentHash: "h-case-1", jurisdictionCode: "310000", scenarioKey: "SH-A", asOfDate: "2026-09-01", input: { basic: { gender: "male" } }, expected: { retirement: {} }, assertions: [{ path: "calc.retirement.legal_retire_age_years", operator: "eq", value: 60 }], coverageObligations: ["capability:retirement"], evidence: [{ documentId: "DOC", locator: "正文" }], qualityScore: 80, qualityBreakdown: { input: 40 }, multiLabels: ["male"], snapshotId: "snap-1", snapshotHash: "snap-h-1", sourceTestUid: "RPCT-310000-SH-A-V1" },
      { rowId: 2, uid: "RPC-440000-GD-A-V1", contentHash: "h-case-2", jurisdictionCode: "440000", scenarioKey: "GD-A", asOfDate: "2026-09-01", input: { basic: { gender: "female" } }, expected: { retirement: {} }, assertions: [{ path: "calc.retirement.legal_retire_age_years", operator: "eq", value: 55 }], coverageObligations: ["capability:retirement"], evidence: [{ documentId: "DOC", locator: "正文" }], qualityScore: 85, qualityBreakdown: { input: 40 }, multiLabels: ["female"], snapshotId: "snap-2", snapshotHash: "snap-h-2", sourceTestUid: "RPCT-440000-GD-A-V1" },
    ],
    newShowcase: Array.from({ length: 36 }, (_, i) => ({
      rowId: 1000 + i,
      uid: `RPC-${i % 2 === 0 ? "310000" : "440000"}-SHOW-${i}-V1`,
      contentHash: `h-show-${i}`,
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
      { rowId: 21, uid: "RPCT-310000-SH-A-V1", contentHash: "h-test-1", jurisdictionCode: "310000", sourceCaseUid: "RPC-310000-SH-A-V1", input: { user: { basic: { gender: "male" } } }, expected: { retirement: {} } },
      { rowId: 22, uid: "RPCT-440000-GD-A-V1", contentHash: "h-test-2", jurisdictionCode: "440000", sourceCaseUid: "RPC-440000-GD-A-V1", input: { user: { basic: { gender: "female" } } }, expected: { retirement: {} } },
    ],
    exampleTests: Array.from({ length: 42 }, (_, i) => ({
      rowId: 2000 + i,
      uid: `示例${i}`,
      contentHash: `h-ex-${i}`,
      jurisdictionCode: i % 2 === 0 ? "CN" : "310000",
    })),
    oldTargets: {
      cases: [
        { rowId: 100, uid: "old-case-1", contentHash: "old-h-1" },
        { rowId: 101, uid: "old-case-2", contentHash: "old-h-2" },
      ],
      showcase: [{ rowId: 200, uid: "old-show-1", contentHash: "old-sh-1" }],
      tests: [{ rowId: 300, uid: "old-test-1", contentHash: "old-t-1" }],
    },
    snapshot: { id: "snap-1", contentHash: "snap-h-1" },
    ...overrides,
  };
}

describe("RCL-FR-006 精确manifest绑定", () => {
  it("绑定旧目标行ID与内容hash、新行hash、快照、评分与来源映射", () => {
    const manifest = buildRclManifest(sampleInput());
    expect(manifest.oldTargets.cases).toEqual([
      { rowId: 100, uid: "old-case-1", contentHash: "old-h-1" },
      { rowId: 101, uid: "old-case-2", contentHash: "old-h-2" },
    ]);
    expect(manifest.oldTargets.showcase[0].contentHash).toBe("old-sh-1");
    expect(manifest.newCases[0]).toMatchObject({
      contentHash: "h-case-1",
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
            { rowId: 100, uid: "old-case-1", contentHash: "CHANGED" },
            { rowId: 101, uid: "old-case-2", contentHash: "old-h-2" },
          ],
          showcase: [{ rowId: 200, uid: "old-show-1", contentHash: "old-sh-1" }],
          tests: [{ rowId: 300, uid: "old-test-1", contentHash: "old-t-1" }],
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

describe("RCL-FR-015/AC-011 计数 N/36/N+42", () => {
  it("N = 覆盖manifest唯一case数；不硬编码452/500", () => {
    const manifest = buildRclManifest(sampleInput());
    expect(manifest.caseCount).toBe(2);
    expect(manifest.counts).toEqual({ cases: 2, showcase: 36, tests: 44 });
    expect(() => assertRclCounts(manifest)).not.toThrow();
  });

  it("showcase≠36 或 tests≠N+42 → 断言失败（RCL-AC-011）", () => {
    const bad = buildRclManifest(sampleInput());
    bad.counts.showcase = 35;
    expect(() => assertRclCounts(bad)).toThrow(/36/);

    const bad2 = buildRclManifest(sampleInput());
    bad2.counts.tests = 999;
    expect(() => assertRclCounts(bad2)).toThrow(/N\+42/);
  });

  it("manifest不含452/500硬编码计数", () => {
    const manifest = buildRclManifest(sampleInput());
    expect(JSON.stringify(manifest)).not.toContain("452");
    expect(JSON.stringify(manifest)).not.toContain("500");
  });
});
