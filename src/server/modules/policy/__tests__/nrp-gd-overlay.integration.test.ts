/**
 * NRP-AC-003/005/008（落库面）：广东440000权威overlay集成验证——
 * Seed显式操作落库（add/restrict）、地区快照创建、GD解析只含CN+GD实体、
 * restrict的provenance完整、快照可重放（NRP-AC-010）。
 *
 * 前提：SOCILA_TEST_DATABASE_URL 指向已执行全部migration且已 seed（含guangdong
 * 地区DSL）的全新 PostgreSQL 17 库；未设置时直接失败（不允许skip）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { params, rules } from "@/lib/db/schema";
import {
  createPolicySnapshotService,
} from "@/server/modules/policy/application/snapshot-service";
import { createJurisdictionTreeService } from "@/server/modules/jurisdiction/application/tree-service";
import { DrizzleJurisdictionReadRepository } from "@/server/modules/jurisdiction/infrastructure/drizzle/jurisdiction-read.repository";
import { createLegacyBridge } from "@/server/modules/policy/application/legacy-bridge";

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

describe("广东overlay落库（NRP-AC-003/005/008）", () => {
  beforeAll(() => {
    if (!DRILL_URL) {
      throw new Error(
        "SOCILA_TEST_DATABASE_URL 未设置：数据库集成测试需要已迁移且已 seed 的全新 PostgreSQL 17 库（CI database-gates 自动提供）",
      );
    }
    process.env.DATABASE_URL = DRILL_URL;
  });

  it("GD Seed显式操作落库：add参数与restrict规则", async () => {
    const male = await db
      .select()
      .from(params)
      .where(
        and(
          eq(params.jurisdictionCode, "440000"),
          eq(params.paramId, "P-MI-LIFETIME-MALE-YEARS"),
        ),
      );
    expect(male).toHaveLength(1);
    expect(male[0].operation).toBe("add");
    expect(male[0].targetBusinessKey).toBeNull();
    expect(male[0].value).toBe(30);
    expect(male[0].effectiveFrom).toBe("2030-01-01");

    const restrict = await db
      .select()
      .from(rules)
      .where(
        and(
          eq(rules.jurisdictionCode, "440000"),
          eq(rules.ruleId, "R-GD-MI-RETIRE-RESTRICT"),
        ),
      );
    expect(restrict).toHaveLength(1);
    expect(restrict[0].operation).toBe("restrict");
    expect(restrict[0].targetBusinessKey).toBe("R-220-MEDICAL-LIFETIME-GAP");
  });

  it("GD解析：restrict挂载到R-220、provenance完整、无上海实体（NRP-AC-003/005）", async () => {
    const service = makeService();
    const { merged, chain } = await service.resolvePolicyContext("440000", "2030-06-01");
    expect(chain.map((c) => c.code)).toEqual(["CN", "440000"]);
    expect(merged.conflicts).toEqual([]);

    const r220 = merged.entities.find(
      (e) => e.businessKey === "R-220-MEDICAL-LIFETIME-GAP",
    );
    expect(r220).toBeTruthy();
    expect(r220!.restrictions).toHaveLength(1);
    expect(
      (r220!.restrictions[0] as { ruleId: string }).ruleId,
    ).toBe("R-GD-MI-RETIRE-RESTRICT");
    expect(r220!.provenance.map((p) => p.operation)).toEqual([
      "baseline",
      "restrict",
    ]);
    expect(r220!.provenance[1].jurisdictionCode).toBe("440000");

    // 无上海实体（上海地方规则不在GD继承链上）。
    const keys = merged.entities.map((e) => e.businessKey);
    expect(keys).not.toContain("R-500-4050-ELIGIBILITY");
    expect(keys).not.toContain("R-310-MI-WAITING-PERIOD");
  });

  it("GD候选快照：创建、可重放、成员含provenance（NRP-AC-008/010）", async () => {
    const service = makeService();
    const created = await service.createPolicySnapshot({
      jurisdictionCode: "440000",
      asOfDate: "2030-06-01",
      actor: "nrp-gd-acceptance",
    });
    expect(created.resolvedPath).toBe("/CN/440000/");
    expect(created.ruleCount).toBeGreaterThanOrEqual(16);

    const got = await service.getSnapshot(created.snapshotId);
    expect(got?.snapshot.contentHash).toBe(created.contentHash);
    const r220Member = got!.members.find(
      (m) => m.businessKey === "R-220-MEDICAL-LIFETIME-GAP",
    );
    expect(r220Member).toBeTruthy();
    const provenance = r220Member!.provenance as Array<{
      operation: string;
      targetBusinessKey: string | null;
      jurisdictionCode: string;
    }>;
    expect(provenance.map((p) => p.operation)).toEqual(["baseline", "restrict"]);
    expect(provenance[1].targetBusinessKey).toBe("R-220-MEDICAL-LIFETIME-GAP");

    // 重放：重复创建相同地区/日期的快照产生相同内容哈希（NRP-AC-010）。
    const again = await service.createPolicySnapshot({
      jurisdictionCode: "440000",
      asOfDate: "2030-06-01",
      actor: "nrp-gd-acceptance",
    });
    expect(again.contentHash).toBe(created.contentHash);
  });

  it("SH候选快照不受GD影响（NRP-AC-009）", async () => {
    const service = makeService();
    const sh = await service.createPolicySnapshot({
      jurisdictionCode: "310000",
      asOfDate: "2026-01-01",
      actor: "nrp-gd-acceptance",
    });
    expect(sh.resolvedPath).toBe("/CN/310000/");
    const got = await service.getSnapshot(sh.snapshotId);
    const keys = got!.members.map((m) => m.businessKey);
    expect(keys).not.toContain("R-GD-MI-RETIRE-RESTRICT");
    expect(keys).toContain("R-500-4050-ELIGIBILITY");
  });

  it("legacy桥按快照重放上海测试语料仍可执行（POL-AC-006回归）", async () => {
    const bridge = createLegacyBridge({ resolveChain: async () => [] });
    const service = makeService();
    const snapshot = await service.createPolicySnapshot({
      jurisdictionCode: "310000",
      asOfDate: "2026-01-01",
      actor: "nrp-gd-acceptance",
    });
    const result = await bridge.replayFromSnapshot({
      snapshotId: snapshot.snapshotId,
      cases: [
        {
          rule_id: "R-010-PARSE-BIRTH-YEAR",
          name: "smoke",
          input: { user: { basic: { birth_year: null, birth_year_text: "73" } } },
          params_override: null,
          expected: { user: { basic: { birth_year: 1973 } } },
        },
      ],
    });
    expect(result.total).toBe(1);
    expect(result.passed).toBe(1);
  });
});
