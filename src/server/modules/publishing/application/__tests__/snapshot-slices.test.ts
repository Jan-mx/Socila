/**
 * 任务3（JRP-FR-025/AC-004）：快照时间片确定性生成测试。
 *
 * - 2026 与 2030 广东窗口：医保退休年限参数（P-MI-LIFETIME-*）2030-01-01 起
 *   → 派生两个不重叠时间片，2030 片承载男 30 年/女 25 年；
 * - 相同输入逐字节一致（JRP-NFR-002 确定性）；
 * - 边界合并、去重与开放上界语义。
 */
import { describe, it, expect } from "vitest";
import { deriveSnapshotSlices } from "../snapshot-slices";

const GD_BOUNDS_INPUT = {
  jurisdictionCode: "440000",
  lowerBound: "2026-01-01",
  sources: [
    {
      businessKey: "P-MI-LIFETIME-MALE-YEARS",
      effectiveFrom: "2030-01-01",
      effectiveTo: null,
    },
    {
      businessKey: "P-MI-LIFETIME-FEMALE-YEARS",
      effectiveFrom: "2030-01-01",
      effectiveTo: null,
    },
  ],
};

describe("快照时间片派生（JRP-FR-025/AC-004）", () => {
  it("广东 2026/2030 窗口：两个不重叠时间片（2030 片开放上界）", () => {
    const slices = deriveSnapshotSlices(GD_BOUNDS_INPUT);
    expect(slices).toEqual([
      { effectiveFrom: "2026-01-01", effectiveTo: "2030-01-01" },
      { effectiveFrom: "2030-01-01", effectiveTo: null },
    ]);
    // 不重叠：前片上界 === 后片下界。
    expect(slices[0].effectiveTo).toBe(slices[1].effectiveFrom);
    expect(slices[1].effectiveTo).toBeNull();
  });

  it("相同输入确定性：两次调用逐字节一致（JRP-NFR-002）", () => {
    const a = deriveSnapshotSlices(GD_BOUNDS_INPUT);
    const b = deriveSnapshotSlices(GD_BOUNDS_INPUT);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("无边界时输出下界起的开放时间片", () => {
    const slices = deriveSnapshotSlices({
      jurisdictionCode: "310000",
      lowerBound: "2026-01-01",
      sources: [],
    });
    expect(slices).toEqual([{ effectiveFrom: "2026-01-01", effectiveTo: null }]);
  });

  it("有效期终点终止时间片（闭合窗口）", () => {
    const slices = deriveSnapshotSlices({
      jurisdictionCode: "310000",
      lowerBound: "2025-01-01",
      sources: [
        {
          businessKey: "P-SH-MIN-BASE",
          effectiveFrom: "2025-07-01",
          effectiveTo: "2026-06-30",
        },
      ],
    });
    expect(slices).toEqual([
      { effectiveFrom: "2025-01-01", effectiveTo: "2025-07-01" },
      { effectiveFrom: "2025-07-01", effectiveTo: "2026-06-30" },
      { effectiveFrom: "2026-06-30", effectiveTo: null },
    ]);
  });
});