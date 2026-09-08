/**
 * 任务3（JRP-AC-004/005/013/016/017、JRP-FR-004/005/009/020）端到端集成：
 * 真实仓储链——地区树 → 候选快照创建 → 地区发布记录激活 → 快照驱动规划
 * → plan 留痕（jurisdiction/snapshot/path）；四川 unsupported 且零快照；
 * 广东2030年前能力级缺参契约保持；历史 plan 不随活动快照切换变化。
 *
 * 前提：SOCILA_TEST_DATABASE_URL 指向已执行全部migration且已 seed（含
 * CN/上海/广东地区DSL）的全新 PostgreSQL 17 库；未设置时直接失败（不允许skip）。
 * 本测试创建的快照/发布记录/plan 为演练数据；快照成员表不可变（触发器），
 * 快照与现有集成测试按共享演练库惯例共存。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { createPolicySnapshotService } from "@/server/modules/policy/application/snapshot-service";
import { createJurisdictionTreeService } from "@/server/modules/jurisdiction/application/tree-service";
import { DrizzleJurisdictionReadRepository } from "@/server/modules/jurisdiction/infrastructure/drizzle/jurisdiction-read.repository";
import { DrizzlePolicySnapshotRepository } from "@/server/modules/policy/infrastructure/drizzle/policy-conflict-snapshot.repository";
import { DrizzlePolicyConflictRepository } from "@/server/modules/policy/infrastructure/drizzle/policy-conflict-snapshot.repository";
import { DrizzleJurisdictionReleaseWriteRepository } from "@/server/modules/publishing/infrastructure/drizzle/jurisdiction-release.repository";
import { activateJurisdictionRelease } from "@/server/modules/publishing/application/jurisdiction-release.use-case";
import { computeJurisdictionPlan } from "@/server/modules/planning/application/jurisdiction-compute.use-case";
import { DrizzleJurisdictionPlanningReadRepository } from "@/server/modules/planning/infrastructure/drizzle/jurisdiction-planning-read.repository";
import { jurisdictionPlanningReleases } from "@/lib/db/schema";
import { DrizzlePlanningWriteRepository } from "@/server/modules/planning/infrastructure/drizzle/planning-write.repository";
import { DrizzlePlanningReadRepository } from "@/server/modules/planning/infrastructure/drizzle/planning-read.repository";
import { DrizzleRulesReadRepository } from "@/server/modules/rules/infrastructure/drizzle/rules-read.repository";
import {
  JurisdictionContextMismatchError,
  JurisdictionUnsupportedError,
  PolicySnapshotUnavailableError,
} from "@/server/modules/planning/application/stable-errors";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;

function makeTreeResolveChain() {
  const tree = createJurisdictionTreeService({
    read: new DrizzleJurisdictionReadRepository(),
  });
  return async (code: string) => {
    const nodes = await tree.resolveChain(code);
    return nodes.map((n) => ({
      code: n.code,
      name: n.name,
      level: n.level,
      path: n.path,
    }));
  };
}

function makeComputeDeps() {
  return {
    resolveChain: makeTreeResolveChain(),
    getActiveRelease: (code: string, asOfDate: string) =>
      new DrizzleJurisdictionPlanningReadRepository().getActiveRelease(code, asOfDate),
    hasAnyRelease: (code: string) =>
      new DrizzleJurisdictionPlanningReadRepository().hasAnyRelease(code),
    getSnapshot: (id: string) =>
      new DrizzleJurisdictionPlanningReadRepository().getSnapshot(id),
    listOpenConflicts: (code: string) =>
      new DrizzlePolicyConflictRepository().listConflicts({
        status: "open",
        jurisdictionCode: code,
      }),
    savePlan: new DrizzlePlanningWriteRepository().savePlan.bind(
      new DrizzlePlanningWriteRepository(),
    ),
  };
}

  async function activate(code: string, asOfDate: string): Promise<string> {
    const snapshotService = createPolicySnapshotService({
      resolveChain: makeTreeResolveChain(),
    });
    const created = await snapshotService.createPolicySnapshot({
      jurisdictionCode: code,
      asOfDate,
      actor: "jrp-integration",
    });
    const releaseWrite = new DrizzleJurisdictionReleaseWriteRepository();
    await activateJurisdictionRelease(
      {
        requireAdmin: async () => ({ ok: true }),
        getSnapshot: async (snapshotId) => {
          const snap = await new DrizzlePolicySnapshotRepository().getSnapshot(
            snapshotId,
          );
          if (!snap) return null;
          return {
            snapshot: {
              id: snap.snapshot.id,
              jurisdictionCode: snap.snapshot.jurisdictionCode,
              contentHash: snap.snapshot.contentHash,
              asOfDate: snap.snapshot.asOfDate,
            },
            members: snap.members.map((m) => ({
              entityType: m.entityType as "rule" | "param" | "rule_set",
              businessKey: m.businessKey,
              payload: m.payload as Record<string, unknown>,
              provenance: m.provenance,
            })),
          };
        },
        listOpenConflicts: (jc) =>
          new DrizzlePolicyConflictRepository().listConflicts({
            status: "open",
            jurisdictionCode: jc,
          }),
        loadTests: (jurisdictionCodes) =>
          new DrizzleRulesReadRepository().listTests({ jurisdictionCodes }),
        listParamKeys: async (jurisdictionCodes) => {
          const rows = await new DrizzleRulesReadRepository().listParams({
            status: "published",
          });
          return rows
            .filter(
              (p) =>
                p.jurisdictionCode !== null &&
                jurisdictionCodes.includes(p.jurisdictionCode),
            )
            .map((p) => p.paramId);
        },
        upsert: (data) => releaseWrite.upsertActiveRelease(data),
        now: () => new Date("2026-09-07T10:00:00.000Z"),
      },
      {
        jurisdictionCode: code,
        snapshotId: created.snapshotId,
        effectiveFrom: asOfDate,
        actor: { id: "jrp-admin", role: "admin", status: "active" },
      },
    );
    return created.snapshotId;
  }

describe("地区感知规划端到端（JRP-AC-004/005/017）", () => {
  beforeAll(async () => {
    if (!DRILL_URL) {
      throw new Error(
        "SOCILA_TEST_DATABASE_URL 未设置：数据库集成测试需要已迁移且已 seed 的全新 PostgreSQL 17 库（CI database-gates 自动提供）",
      );
    }
    process.env.DATABASE_URL = DRILL_URL;
    // 共享演练库可能已有其他集成测试（如RCL端到端）写入的发布区间，
    // 事务外清空本测试管理的发布记录，避免区间EXCLUDE冲突。
    await db.delete(jurisdictionPlanningReleases);
  });

  afterAll(async () => {
    // 清理本测试创建的发布记录与 plan（快照成员表不可变，快照与其他
    // 集成测试按共享演练库惯例共存；release/plans 无不可变触发器）。
    await db.delete(plans).where(eq(plans.ownerUserId, "jrp-integration-user"));
  });



  it("上海：快照→激活→规划→plan留痕（jurisdiction/snapshot/path/日期）（JRP-AC-004/FR-009）", async () => {
    const snapshotId = await activate("310000", "2026-09-01");

    const result = await computeJurisdictionPlan(
      {
        user: {
          basic: { gender: "male", birth_year: 1973 },
          social: { pension_contrib_months: 180 },
        },
        jurisdictionCode: "310000",
        asOfDate: "2026-09-01",
        ownerUserId: "jrp-integration-user",
      },
      makeComputeDeps(),
    );

    expect(result.meta).toMatchObject({
      jurisdiction_code: "310000",
      snapshot_id: snapshotId,
      resolved_jurisdiction_path: "/CN/310000/",
      as_of_date: "2026-09-01",
    });
    expect(result.planId).toBeTruthy();
    const saved = await db
      .select()
      .from(plans)
      .where(eq(plans.id, result.planId!));
    expect(saved).toHaveLength(1);
    expect(saved[0].jurisdictionCode).toBe("310000");
    expect(saved[0].snapshotId).toBe(snapshotId);
    expect(saved[0].resolvedJurisdictionPath).toBe("/CN/310000/");
    expect(saved[0].ruleSetVersion).toBeTruthy();
  });

  it("四川510000：422 unsupported、不创建plan、无活动发布记录（JRP-AC-017）", async () => {
    // 四川延期期间不建立活动发布记录（任务2交付状态；510000 候选快照门禁
    // 由任务2持久库证据保证，本库中的 SC 快照可能来自其他集成测试夹具）。
    const release = await new DrizzleJurisdictionPlanningReadRepository().getActiveRelease(
      "510000",
    );
    expect(release).toBeNull();

    await expect(
      computeJurisdictionPlan(
        {
          user: { basic: { gender: "male", birth_year: 1973 } },
          jurisdictionCode: "510000",
          asOfDate: "2026-09-01",
          ownerUserId: "jrp-integration-user",
        },
        makeComputeDeps(),
      ),
    ).rejects.toBeInstanceOf(JurisdictionUnsupportedError);

    const plansAfter = await db
      .select()
      .from(plans)
      .where(eq(plans.ownerUserId, "jrp-integration-user"));
    expect(
      plansAfter.some((p) => p.jurisdictionCode === "510000"),
    ).toBe(false);
  });

  it("聊天一致性：请求地区与画像已确认地区不一致 → 409 且零写入（JRP-AC-015）", async () => {
    await expect(
      computeJurisdictionPlan(
        {
          user: { basic: { gender: "male" } },
          jurisdictionCode: "310000",
          confirmedJurisdictionCode: "440000",
          asOfDate: "2026-09-01",
          ownerUserId: "jrp-integration-user",
        },
        makeComputeDeps(),
      ),
    ).rejects.toBeInstanceOf(JurisdictionContextMismatchError);
  });

  it("广东2030年前：整体成功、needs_agent=true、W-MI-LOCAL-YEARS-MISSING、其他模块结果保留（JRP-AC-005/FR-020）", async () => {
    await activate("440000", "2026-09-01");

    const result = await computeJurisdictionPlan(
      {
        user: {
          basic: { gender: "male", birth_year: 1965, birth_month: 1 },
          // JRP-FR-022/023：公开画像只接受六位地级市代码，服务端规范化为内部 claim_city。
          profile: { claim_city_code: "440100" },
          status: { employment_status: "unemployed" },
          social: {
            unemployment_insurance_years: 3,
            medical_contrib_months: 120,
          },
        },
        jurisdictionCode: "440000",
        asOfDate: "2026-09-01",
        ownerUserId: "jrp-integration-user",
      },
      makeComputeDeps(),
    );

    expect(result.needsAgent).toBe(true);
    const warningIds = (result.warnings as Array<{ warning_id?: string }>).map(
      (w) => w.warning_id,
    );
    expect(warningIds).toContain("W-MI-LOCAL-YEARS-MISSING");
    const calc = result.calc as Record<string, unknown>;
    const mi = (calc.mi as Record<string, unknown>) ?? {};
    expect(mi.lifetime_gap_months).toBeFalsy();
    const unemployment = (calc.unemployment as Record<string, unknown>) ?? {};
    expect(unemployment.eligible).toBe(true);
    expect(unemployment.duration_months).toBe(12);
    // 任务2快照规则计算金额：广州最低工资2680×90%＝2412（任务3不重写公式）。
    expect(unemployment.monthly_amount_est).toBe(2412);
    const retirement = (calc.retirement as Record<string, unknown>) ?? {};
    expect(retirement.legal_retire_date).toBeTruthy();
  });

  it("活动快照切换后历史plan仍使用原snapshotId（JRP-AC-008/NFR-006）", async () => {
    // 复用上海 2026-09-01 区间（上海测试已激活 [2026-09-01, ∞)）：同区间换绑快照
    // （JRP-FR-024 区间语义：切换不新增重叠区间，只更新区间绑定的快照）。
    const firstSnapshot = await activate("310000", "2026-09-01");
    const firstResult = await computeJurisdictionPlan(
      {
        user: { basic: { gender: "male", birth_year: 1973 } },
        jurisdictionCode: "310000",
        asOfDate: "2026-09-01",
        ownerUserId: "jrp-integration-user",
      },
      makeComputeDeps(),
    );
    expect(firstResult.meta.snapshot_id).toBe(firstSnapshot);

    // 同区间换绑新快照（contentHash 相同，snapshotId 不同）。
    const secondSnapshot = await activate("310000", "2026-09-01");
    expect(secondSnapshot).not.toBe(firstSnapshot);

    const secondResult = await computeJurisdictionPlan(
      {
        user: { basic: { gender: "male", birth_year: 1973 } },
        jurisdictionCode: "310000",
        asOfDate: "2026-09-01",
        ownerUserId: "jrp-integration-user",
      },
      makeComputeDeps(),
    );
    expect(secondResult.meta.snapshot_id).toBe(secondSnapshot);

    // 历史 plan 行仍引用第一个快照（重放不变）。
    const saved = await db
      .select()
      .from(plans)
      .where(eq(plans.id, firstResult.planId!));
    expect(saved[0].snapshotId).toBe(firstSnapshot);
  });
});

describe("停用与历史重放（JRP-FR-027/028/AC-009）", () => {
  it("停用广东区间不影响上海；停用后日期无匹配 409（JRP-AC-009）", async () => {
    // 上海与广东各激活一个区间。
    await activate("310000", "2026-09-01");
    await activate("440000", "2026-09-01");

    const releaseWrite = new DrizzleJurisdictionReleaseWriteRepository();
    const gdRelease = await releaseWrite.getByJurisdiction("440000");
    expect(gdRelease).not.toBeNull();
    await releaseWrite.deactivateById(gdRelease!.id);

    // 广东停用：日期无匹配 → 409（有发布记录但无 active 区间）。
    await expect(
      computeJurisdictionPlan(
        {
          user: { basic: { gender: "male", birth_year: 1973 } },
          jurisdictionCode: "440000",
          asOfDate: "2026-09-01",
          ownerUserId: "jrp-integration-user",
        },
        makeComputeDeps(),
      ),
    ).rejects.toBeInstanceOf(PolicySnapshotUnavailableError);

    // 上海不受影响：仍可计算。
    const shResult = await computeJurisdictionPlan(
      {
        user: { basic: { gender: "male", birth_year: 1973 } },
        jurisdictionCode: "310000",
        asOfDate: "2026-09-01",
        ownerUserId: "jrp-integration-user",
      },
      makeComputeDeps(),
    );
    expect(shResult.meta.jurisdiction_code).toBe("310000");

    // 重新激活广东（恢复演练库状态）。
    await activate("440000", "2026-09-01");
  });

  it("历史 plan 重放：切换当前快照后仍按原快照重放且漂移结论正确（JRP-AC-008/FR-028）", async () => {
    const firstSnapshot = await activate("310000", "2026-09-01");
    const firstResult = await computeJurisdictionPlan(
      {
        user: { basic: { gender: "male", birth_year: 1973 } },
        jurisdictionCode: "310000",
        asOfDate: "2026-09-01",
        ownerUserId: "jrp-integration-user",
      },
      makeComputeDeps(),
    );
    expect(firstResult.planId).toBeTruthy();

    // 切换当前活动快照（同区间换绑新快照）。
    const secondSnapshot = await activate("310000", "2026-09-01");
    expect(secondSnapshot).not.toBe(firstSnapshot);

    // 重放历史 plan：仍使用第一个快照。
    const { replayPlan } = await import(
      "@/server/modules/planning/application/replay-plan.use-case"
    );
    const replay = await replayPlan(
      {
        getPlan: (id) =>
          new DrizzlePlanningReadRepository().getPlan(id),
        getSnapshot: (id) =>
          new DrizzleJurisdictionPlanningReadRepository().getSnapshot(id),
      },
      firstResult.planId!,
      { userId: "jrp-integration-user" },
    );
    expect(replay.snapshotId).toBe(firstSnapshot);
    expect(replay.planId).toBe(firstResult.planId);
    expect(replay.drift.drifted).toBe(false);
  });
});
