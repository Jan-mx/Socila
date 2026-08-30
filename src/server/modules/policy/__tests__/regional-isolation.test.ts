/**
 * 步骤03.8 区域示例与隔离测试（POL-AC-002）：解析粤/川互不串入、沪不含粤川实体。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createPolicySnapshotService } from "@/server/modules/policy/application/snapshot-service";
import { createJurisdictionTreeService } from "@/server/modules/jurisdiction/application/tree-service";
import { DrizzleJurisdictionReadRepository } from "@/server/modules/jurisdiction/infrastructure/drizzle/jurisdiction-read.repository";

const DRILL_URL = process.env.SSP_TEST_DATABASE_URL;

describe.skipIf(!DRILL_URL)("regional overlay isolation (drill DB)", () => {
  const service = createPolicySnapshotService({
    resolveChain: async (code) => {
      const tree = createJurisdictionTreeService({
        read: new DrizzleJurisdictionReadRepository(),
      });
      return (await tree.resolveChain(code)).map((n) => ({
        code: n.code,
        name: n.name,
        path: n.path,
      }));
    },
  });

  beforeAll(() => {
    process.env.DATABASE_URL = DRILL_URL;
  });

  async function keysOf(code: string): Promise<Set<string>> {
    const { merged } = await service.resolvePolicyContext(code, "2026-01-01");
    return new Set(merged.entities.map((e) => e.businessKey));
  }

  it("Guangdong resolution contains GD examples and provenance at province level", async () => {
    const keys = await keysOf("440000");
    expect(keys.has("P-GD-MIN-WAGE-BASE")).toBe(true);
    expect(keys.has("P-GD-MEDICAL-CAP")).toBe(true);
    const { merged, chain } = await service.resolvePolicyContext("440000", "2026-01-01");
    expect(chain.map((c) => c.code)).toEqual(["CN", "440000"]);
    const gd = merged.entities.find((e) => e.businessKey === "P-GD-MIN-WAGE-BASE");
    expect(gd?.provenance[0]).toMatchObject({ jurisdictionCode: "440000", operation: "add" });
  });

  it("Sichuan resolution contains SC examples but no GD entities", async () => {
    const keys = await keysOf("510000");
    expect(keys.has("P-SC-MIN-WAGE-BASE")).toBe(true);
    expect(keys.has("P-GD-MIN-WAGE-BASE")).toBe(false);
  });

  it("Shanghai resolution contains neither GD nor SC entities", async () => {
    const keys = await keysOf("310000");
    expect(keys.has("P-GD-MIN-WAGE-BASE")).toBe(false);
    expect(keys.has("P-SC-MIN-WAGE-BASE")).toBe(false);
    expect(keys.has("R-010-PARSE-BIRTH-YEAR")).toBe(true);
  });
});
