import { describe, expect, it } from "vitest";
import {
  assertLegacyRegressionCandidates,
  migrateLegacyRegressionExpected,
} from "../../../scripts/migrate-regression-test-expectations";

describe("regression expectation migration", () => {
  it("moves a root needs_agent boolean into the calc namespace", () => {
    expect(migrateLegacyRegressionExpected({ needs_agent: true })).toEqual({
      calc: { needs_agent: true },
    });
  });

  it("ignores expectations that do not use the legacy root field", () => {
    expect(
      migrateLegacyRegressionExpected({ calc: { needs_agent: true } }),
    ).toBeNull();
  });

  it("rejects mixed or non-boolean legacy expectations", () => {
    expect(() =>
      migrateLegacyRegressionExpected({ needs_agent: true, plan: {} }),
    ).toThrow(/only needs_agent/i);
    expect(() =>
      migrateLegacyRegressionExpected({ needs_agent: "true" }),
    ).toThrow(/boolean/i);
  });

  it("rejects any invalid database candidate before updates begin", () => {
    expect(() =>
      assertLegacyRegressionCandidates([
        { id: 1, expected: { needs_agent: true } },
        { id: 2, expected: ["needs_agent"] },
      ]),
    ).toThrow(/test 2.*valid legacy expectation/i);
  });
});
