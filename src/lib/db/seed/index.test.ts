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
