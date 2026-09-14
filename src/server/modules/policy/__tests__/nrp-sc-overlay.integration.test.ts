/**
 * NRP-AC-004/009/010（落库面）：四川510000权威overlay集成验证——
 * Seed显式add参数落库（含有效期窗口）、SC候选快照创建与重放、
 * SC解析不含上海/广东实体、SH快照不受影响。
 *
 * 前提：SOCILA_TEST_DATABASE_URL 指向已执行全部migration且已 seed（含sichuan
 * 地区DSL）的全新 PostgreSQL 17 库；未设置时直接失败（不允许skip）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { params } from "@/lib/db/schema";
import {
  createPolicySnapshotService,
} from "@/server/modules/policy/application/snapshot-service";
import { createJurisdictionTreeService } from "@/server/modules/jurisdiction/application/tree-service";
import { DrizzleJurisdictionReadRepository } from "@/server/modules/jurisdiction/infrastructure/drizzle/jurisdiction-read.repository";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;

function makeService() {
  return createPolicySnapshotService({
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
}

describe("四川overlay落库（NRP-AC-004/009/010）", () => {
  beforeAll(() => {
    if (!DRILL_URL) {
      throw new Error(
        "SOCILA_TEST_DATABASE_URL 未设置：数据库集成测试需要已迁移且已 seed 的全新 PostgreSQL 17 库（CI database-gates 自动提供）",
      );
    }
    process.env.DATABASE_URL = DRILL_URL;
  });

  it("SC Seed显式add参数落库且带有效期窗口", async () => {
    const rows = await db
      .select()
      .from(params)
      .where(
        and(
          eq(params.jurisdictionCode, "510000"),
          eq(params.paramId, "P-SC-CONTRIB-BASE-UPPER"),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].operation).toBe("add");
    expect(rows[0].targetBusinessKey).toBeNull();
    expect(rows[0].value).toBe(22938);
    expect(rows[0].effectiveFrom).toBe("2025-01-01");
    expect(rows[0].effectiveTo).toBe("2025-12-31");
  });

  it("SC解析：继承CN基线、不含上海/广东实体（NRP-AC-004）", async () => {
    const service = makeService();
    const { merged, chain } = await service.resolvePolicyContext("510000", "2026-01-01");
    expect(chain.map((c) => c.code)).toEqual(["CN", "510000"]);
    expect(merged.conflicts).toEqual([]);

    const keys = merged.entities.map((e) => e.businessKey);
    // 国家规则继承。
    expect(keys).toContain("R-110-LOOKUP-LEGAL-RETIRE-AGE");
    // 上海/广东实体不出现。
    expect(keys).not.toContain("R-500-4050-ELIGIBILITY");
    expect(keys).not.toContain("R-GD-MI-RETIRE-RESTRICT");
    // 广东参数不出现。
    expect(keys).not.toContain("P-MI-LIFETIME-MALE-YEARS");
  });

  it("SC候选快照：创建、可重放、哈希一致；SH不受影响（NRP-AC-009/010）", async () => {
    const service = makeService();
    const created = await service.createPolicySnapshot({
      jurisdictionCode: "510000",
      asOfDate: "2026-01-01",
      actor: "nrp-sc-acceptance",
    });
    expect(created.resolvedPath).toBe("/CN/510000/");

    const again = await service.createPolicySnapshot({
      jurisdictionCode: "510000",
      asOfDate: "2026-01-01",
      actor: "nrp-sc-acceptance",
    });
    expect(again.contentHash).toBe(created.contentHash);

    const sh = await service.createPolicySnapshot({
      jurisdictionCode: "310000",
      asOfDate: "2026-01-01",
      actor: "nrp-sc-acceptance",
    });
    const got = await service.getSnapshot(sh.snapshotId);
    const keys = got!.members.map((m) => m.businessKey);
    expect(keys).not.toContain("P-SC-CONTRIB-BASE-UPPER");
    expect(keys).toContain("R-500-4050-ELIGIBILITY");
  });
});
