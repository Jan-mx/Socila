/**
 * 步骤03.8 区域示例与隔离测试（09-05 SDL-AC-006，原POL-AC-002）：
 * 粤/川示例夹具显式安装后互不串入、沪不含粤川实体；测试结束夹具零残留。
 * 生产Seed不再写入粤川示例（SDL-FR-012）——夹具由本测试安装与清理。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { params, policyPackVersions } from "@/lib/db/schema";
import { createPolicySnapshotService } from "@/server/modules/policy/application/snapshot-service";
import { createJurisdictionTreeService } from "@/server/modules/jurisdiction/application/tree-service";
import { DrizzleJurisdictionReadRepository } from "@/server/modules/jurisdiction/infrastructure/drizzle/jurisdiction-read.repository";
import {
  installRegionalExampleFixtures,
  cleanupRegionalExampleFixtures,
  FIXTURE_PACK_IDS,
  FIXTURE_PARAM_IDS,
} from "./fixtures/regional-examples";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;

describe("regional overlay isolation (drill DB)", () => {
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
    if (!DRILL_URL) {
      throw new Error(
        "SOCILA_TEST_DATABASE_URL 未设置：数据库集成测试需要已迁移的全新 PostgreSQL 17 库（CI database-gates 自动提供）",
      );
    }
    process.env.DATABASE_URL = DRILL_URL;
  });

  // SDL-AC-006：夹具显式安装；生产Seed不写入（SDL-FR-012）。
  beforeAll(async () => {
    await installRegionalExampleFixtures();
  });

  afterAll(async () => {
    await cleanupRegionalExampleFixtures();
    const residualPacks = await db
      .select({ id: policyPackVersions.id })
      .from(policyPackVersions)
      .where(inArray(policyPackVersions.policyPackId, FIXTURE_PACK_IDS));
    const residualParams = await db
      .select({ id: params.id })
      .from(params)
      .where(inArray(params.paramId, FIXTURE_PARAM_IDS));
    expect(residualPacks).toHaveLength(0);
    expect(residualParams).toHaveLength(0);
  });

  async function keysOf(code: string): Promise<Set<string>> {
    const { merged } = await service.resolvePolicyContext(code, "2026-01-01");
    return new Set(merged.entities.map((e) => e.businessKey));
  }

  it("Guangdong resolution contains GD fixtures and provenance at province level", async () => {
    const keys = await keysOf("440000");
    expect(keys.has("P-GD-MIN-WAGE-BASE")).toBe(true);
    expect(keys.has("P-GD-MEDICAL-CAP")).toBe(true);
    const { merged, chain } = await service.resolvePolicyContext("440000", "2026-01-01");
    expect(chain.map((c) => c.code)).toEqual(["CN", "440000"]);
    const gd = merged.entities.find((e) => e.businessKey === "P-GD-MIN-WAGE-BASE");
    expect(gd?.provenance[0]).toMatchObject({ jurisdictionCode: "440000", operation: "add" });
  });

  it("Sichuan resolution contains SC fixtures but no GD entities", async () => {
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
