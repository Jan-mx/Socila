import { readFileSync } from "node:fs";
import { LEGACY_DSL_DIR_ID_FRAGMENT } from "@/lib/naming/socila-naming-contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const seedMocks = vi.hoisted(() => ({
  seedRules: vi.fn(),
  seedParams: vi.fn(),
  seedMisc: vi.fn(),
  importCases: vi.fn(),
  importRegressionTests: vi.fn(),
}));

vi.mock("./seed-rules", () => ({ seedRules: seedMocks.seedRules }));
vi.mock("./seed-params", () => ({ seedParams: seedMocks.seedParams }));
vi.mock("./seed-misc", () => ({ seedMisc: seedMocks.seedMisc }));
vi.mock("@/lib/import/excel-import", () => ({
  importCases: seedMocks.importCases,
  importRegressionTests: seedMocks.importRegressionTests,
}));

// PMG-FR-007：seed 动态导入只在自身设置 15 秒上限，不提高全项目默认 timeout。
describe("seed runner", { timeout: 15_000 }, () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    seedMocks.seedRules.mockResolvedValue(undefined);
    seedMocks.seedParams.mockResolvedValue(undefined);
    seedMocks.seedMisc.mockResolvedValue(undefined);
    seedMocks.importCases.mockResolvedValue(undefined);
    seedMocks.importRegressionTests.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exits unsuccessfully without continuing when case import fails", async () => {
    seedMocks.importCases.mockRejectedValueOnce(new Error("case import failed"));

    await import("./index");

    await vi.waitFor(() => {
      expect(process.exit).toHaveBeenCalledWith(1);
    });
    expect(seedMocks.importRegressionTests).not.toHaveBeenCalled();
  });

  it("exits unsuccessfully when regression test import fails", async () => {
    seedMocks.importRegressionTests.mockRejectedValueOnce(new Error("regression import failed"));

    await import("./index");

    await vi.waitFor(() => {
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });
});

// 09-05 SDL-FR-004/012：生产Seed经地区Manifest发现资产（不硬编码上海目录/310000），
// 且不再写入粤川示例（GD-EXAMPLE-BASE/SC-EXAMPLE-BASE移入测试夹具）。
describe("seed runner structure contract (SDL-FR-004/012)", () => {
  const source = readFileSync("src/lib/db/seed/index.ts", "utf8");

  it("经地区Manifest发现装载资产，不硬编码上海目录或310000", () => {
    expect(source).toContain("discoverRegionDsl");
    expect(source).not.toMatch(
      new RegExp(`\\bdsl\\/${LEGACY_DSL_DIR_ID_FRAGMENT}\\b`),
    );
    expect(source).not.toMatch(/\b310000\b/);
  });

  it("生产Seed不再包含粤川区域示例写入", () => {
    expect(source).not.toContain("seed-regional");
    expect(source).not.toContain("seedRegionalExamples");
  });
});
