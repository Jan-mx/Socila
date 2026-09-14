/**
 * 步骤03.2 政策版本不变量测试（POL-FR-003～006）。
 */
import { describe, it, expect } from "vitest";
import {
  validateInterval,
  intervalsOverlap,
  detectOverlappingVersions,
} from "@/server/modules/policy/domain/invariants";

describe("policy version invariants", () => {
  it("validateInterval rejects inverted ranges and allows open-ended", () => {
    expect(
      validateInterval({
        jurisdictionCode: "310000",
        businessKey: "min-wage",
        status: "published",
        effectiveFrom: "2026-01-01",
        effectiveTo: "2025-12-31",
      }),
    ).toMatchObject({ kind: "inverted-interval" });
    expect(
      validateInterval({
        jurisdictionCode: "310000",
        businessKey: "min-wage",
        status: "published",
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
      }),
    ).toBeNull();
  });

  it("intervalsOverlap treats null end as open-ended", () => {
    expect(
      intervalsOverlap(
        { effectiveFrom: "2026-01-01", effectiveTo: null },
        { effectiveFrom: "2027-01-01", effectiveTo: null },
      ),
    ).toBe(true);
    expect(
      intervalsOverlap(
        { effectiveFrom: "2020-01-01", effectiveTo: "2020-12-31" },
        { effectiveFrom: "2026-01-01", effectiveTo: null },
      ),
    ).toBe(false);
  });

  it("detectOverlappingVersions flags same-jurisdiction same-key overlap only", () => {
    const rows = [
      { jurisdictionCode: "310000", businessKey: "min-wage", status: "published", effectiveFrom: "2026-01-01", effectiveTo: null, version: 1 },
      { jurisdictionCode: "310000", businessKey: "min-wage", status: "published", effectiveFrom: "2026-06-01", effectiveTo: null, version: 2 },
      { jurisdictionCode: "440000", businessKey: "min-wage", status: "published", effectiveFrom: "2026-06-01", effectiveTo: null, version: 1 },
      { jurisdictionCode: "310000", businessKey: "pension-cap", status: "published", effectiveFrom: "2026-01-01", effectiveTo: null, version: 1 },
    ];
    const conflicts = detectOverlappingVersions(rows);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      jurisdictionCode: "310000",
      businessKey: "min-wage",
      status: "published",
    });
    expect(conflicts[0].members).toHaveLength(2);
  });
});
