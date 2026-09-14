/**
 * 09-05 SDL-FR-012/SDL-AC-005：全新库执行生产Seed后，粤川示例包与参数不存在。
 * 前提：SOCILA_TEST_DATABASE_URL 指向已migration+bootstrap+seed的全新 PostgreSQL 17 库。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { params, policyPackVersions } from "@/lib/db/schema";
import { FIXTURE_PACK_IDS, FIXTURE_PARAM_IDS } from "./fixtures/regional-examples";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;

describe("production seed excludes GD/SC examples (drill DB)", () => {
  beforeAll(() => {
    if (!DRILL_URL) {
      throw new Error(
        "SOCILA_TEST_DATABASE_URL 未设置：数据库集成测试需要已迁移且已 seed 的全新 PostgreSQL 17 库（CI database-gates 自动提供）",
      );
    }
    process.env.DATABASE_URL = DRILL_URL;
  });

  it("policy_pack_versions不含GD-EXAMPLE-BASE/SC-EXAMPLE-BASE", async () => {
    const rows = await db
      .select({ id: policyPackVersions.id })
      .from(policyPackVersions)
      .where(inArray(policyPackVersions.policyPackId, FIXTURE_PACK_IDS));
    expect(rows).toHaveLength(0);
  });

  it("params不含四个粤川示例参数", async () => {
    const rows = await db
      .select({ id: params.id })
      .from(params)
      .where(inArray(params.paramId, FIXTURE_PARAM_IDS));
    expect(rows).toHaveLength(0);
  });

  it("上海正式资产仍在（SHANGHAI_BASE与P-SH-*不受影响）", async () => {
    const shParam = await db
      .select({ id: params.id })
      .from(params)
      .where(inArray(params.paramId, ["P-SH-CONTRIB-BASE-LOWER"]));
    expect(shParam.length).toBeGreaterThanOrEqual(1);
  });
});
