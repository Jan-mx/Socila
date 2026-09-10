/**
 * RCL-FR-017 多标签分类测试：地区、性别、年龄、就业、险种、政策能力和
 * needs-agent 标签同时保留（不提前返回单分类）。
 */
import { describe, it, expect } from "vitest";
import { classifyScenario, birthYearBand } from "../multi-label";
import { generateShowcaseScenarios } from "../generator";

describe("RCL-FR-017 多标签分类", () => {
  it("场景分类同时包含地区/性别/年龄/就业/险种/能力标签", async () => {
    const scenarios = await generateShowcaseScenarios(
      // 为每条断言提供值，使needs-agent标签可判定。
      (t) => ({
        snapshotId: "snap-1",
        snapshotContentHash: "hash-1",
        values: t.assertionSpecs.map((s) => ({
          path: s.path,
          value: s.path.endsWith("needs_agent") ? true : 1,
        })),
      }),
    );
    const sh = scenarios.find((s) => s.jurisdictionCode === "310000")!;
    const tags = classifyScenario(sh);
    expect(tags).toContain("上海");
    expect(tags).toContain("310000");
    expect(tags).toContain("male");
    expect(tags.some((t) => t.startsWith("band:") || ["before_1970", "1970_1979", "from_1980"].includes(t))).toBe(true);
    expect(tags).toContain("employed");
    expect(tags.some((t) => t.startsWith("capability:"))).toBe(true);
    expect(tags.some((t) => t.startsWith("险种:"))).toBe(true);
  });

  it("needs-agent 场景带 needs-agent 标签；正常场景不带", async () => {
    const scenarios = await generateShowcaseScenarios((t) => ({
      snapshotId: "snap-1",
      snapshotContentHash: "hash-1",
      values: t.assertionSpecs.map((s) => ({
        path: s.path,
        value: s.path.endsWith("needs_agent") ? true : 1,
      })),
    }));
    const withNa = scenarios.find((s) =>
      s.assertions.some((a) => a.path.endsWith("needs_agent")),
    )!;
    expect(classifyScenario(withNa)).toContain("needs-agent");
    const normal = scenarios.find((s) =>
      !s.assertions.some((a) => a.path.endsWith("needs_agent")),
    )!;
    expect(classifyScenario(normal)).not.toContain("needs-agent");
  });

  it("birthYearBand 年龄段映射", () => {
    expect(birthYearBand(1965)).toBe("before_1970");
    expect(birthYearBand(1975)).toBe("1970_1979");
    expect(birthYearBand(1985)).toBe("from_1980");
  });
});
