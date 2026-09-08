/**
 * CLG-FR-013/014/015 治理manifest：
 * - audit输出确定性manifest：sourceCounts/retainedCounts/deletedCounts/tableHashes/manifestHash；
 * - 最终保留452/36/528（CLG-AC-010），删除399/81（CLG-AC-009）；
 * - manifestHash由固定算法版本+核心对象计算，相同输入一致（CLG-NFR-002）；
 * - 归档批次状态机 prepared → restore_verified → applied（CLG-FR-011/012/015）。
 *
 * Red：实现前模块 `src/lib/case-governance/manifest` 不存在。
 */
import { describe, it, expect } from "vitest";
import {
  buildGovernanceManifest,
  computeManifestHash,
  assertFixedTargetCounts,
  ARCHIVE_BATCH_STATUSES,
} from "../manifest";

describe("CLG-FR-013 manifest结构与固定计数", () => {
  it("audit输入851/451/117/116/528 → 保留452、删除399、展示删除81", () => {
    // UID命名避免末尾两位数字（防止被normalizeCaseUid误截）
    const caseUids = Array.from({ length: 851 }, (_, i) => `cse${String(i).padStart(4, "0")}`);
    const manifest = buildGovernanceManifest({
      algorithmVersion: "CLG-1.0",
      caseUids,
      regressionCaseUids: new Set(caseUids.slice(0, 451)),
      showcaseRows: Array.from({ length: 117 }, (_, i) => ({
        caseUid: `shw${String(i).padStart(4, "0")}-01`,
        // 116个不同来源：前115条落在回归集合内，第116条（i=115）取自回归集合外
        sourceCaseUid: i < 115 ? `cse${String(i).padStart(4, "0")}` : `cse0451`,
      })),
      curatedShowcaseUids: Array.from({ length: 36 }, (_, i) => `shw${String(i).padStart(4, "0")}-01`),
      testCount: 528,
      regressionTestCount: 500,
      exampleTestCount: 28,
    });
    expect(manifest.sourceCounts.cases).toBe(851);
    expect(manifest.sourceCounts.showcaseCases).toBe(117);
    expect(manifest.sourceCounts.tests).toBe(528);
    expect(manifest.retainedCounts.cases).toBe(452);
    expect(manifest.deletedCounts.cases).toBe(399);
    expect(manifest.deletedCounts.showcaseCases).toBe(81);
    expect(
      manifest.deletedCaseUids.length + manifest.retainedCaseUids.length,
    ).toBe(851);
  });

  it("manifestHash为64位hex且确定性", () => {
    const build = () =>
      buildGovernanceManifest({
        algorithmVersion: "CLG-1.0",
        caseUids: [`cseA`, `cseB`],
        regressionCaseUids: new Set([`cseA`]),
        showcaseRows: [{ caseUid: `shwA-01`, sourceCaseUid: `cseA` }],
        curatedShowcaseUids: [`shwA-01`],
        testCount: 528,
        regressionTestCount: 500,
        exampleTestCount: 28,
      });
    const m1 = build();
    const m2 = build();
    expect(m1.manifestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(m1.manifestHash).toBe(m2.manifestHash);
  });
});

describe("CLG-FR-015 固定目标计数断言", () => {
  it("452/36/528 → 通过", () => {
    expect(() => assertFixedTargetCounts(452, 36, 528)).not.toThrow();
  });

  it("任何偏离452/36/528 → 抛错（范围变化必须停止，CLG-NFR-005）", () => {
    expect(() => assertFixedTargetCounts(451, 36, 528)).toThrow();
    expect(() => assertFixedTargetCounts(452, 35, 528)).toThrow();
    expect(() => assertFixedTargetCounts(452, 36, 527)).toThrow();
  });
});

describe("CLG-FR-013 归档批次状态机", () => {
  it("未发生意外状态转换：枚举固定", () => {
    // 防止实现引入未知状态（CLG-FR-011：prepared/restore_verified/applied/rolled_back）
    expect([...ARCHIVE_BATCH_STATUSES].sort()).toEqual(
      ["prepared", "restore_verified", "applied", "rolled_back"].sort(),
    );
  });
});

describe("computeManifestHash 直接契约", () => {
  it("相同对象相同哈希，不同对象不同哈希", () => {
    const obj = { a: 1, b: [2, 3] };
    expect(computeManifestHash(obj)).toBe(computeManifestHash(structuredClone(obj)));
    expect(computeManifestHash(obj)).not.toBe(computeManifestHash({ ...obj, a: 2 }));
  });
});