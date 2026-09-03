/**
 * 步骤03.1 地区树真库集成测试（POL-AC-002 基础）。
 * 前提：SSP_TEST_DATABASE_URL 指向已迁移且已 seed 的全新 PostgreSQL 17 库；
 * 未设置时直接失败（不允许以 skip 关闭，PMG-FR-018）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createJurisdictionTreeService } from "@/server/modules/jurisdiction/application/tree-service";
import { DrizzleJurisdictionReadRepository } from "@/server/modules/jurisdiction/infrastructure/drizzle/jurisdiction-read.repository";

const DRILL_URL = process.env.SSP_TEST_DATABASE_URL;

describe("jurisdiction tree (drill DB)", () => {
  beforeAll(() => {
    if (!DRILL_URL) {
      throw new Error(
        "SSP_TEST_DATABASE_URL 未设置：数据库集成测试需要已迁移且已 seed 的全新 PostgreSQL 17 库（CI database-gates 自动提供）",
      );
    }
    process.env.DATABASE_URL = DRILL_URL;
  });

  it("seeded migration rows resolve via repository service", async () => {
    const service = createJurisdictionTreeService({
      read: new DrizzleJurisdictionReadRepository(),
    });
    const chain = await service.resolveChain("310000");
    expect(chain.map((n) => n.code)).toEqual(["CN", "310000"]);
    expect(chain[0].name).toBe("中国");
    await expect(service.resolveChain("999999")).rejects.toMatchObject({
      reason: "not-found",
    });
  });
});
