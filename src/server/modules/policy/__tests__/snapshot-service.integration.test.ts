/**
 * 步骤03.4/03.5 集成测试（POL-AC-001/003/004/005）：
 * 冲突阻止快照、冲突任务落库、快照不可变性（DB 触发器）、影响查询回指快照。
 * 前提：SOCILA_TEST_DATABASE_URL 指向已迁移且已 seed 的全新 PostgreSQL 17 库；
 * 未设置时直接失败（不允许以 skip 关闭，PMG-FR-018）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { sql, isNotNull, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { params, policyPackVersions } from "@/lib/db/schema";
import { rulesWrites } from "@/server/modules/rules/application";
import { DrizzlePolicyWriteRepository } from "@/server/modules/policy/infrastructure/drizzle/policy-write.repository";
import {
  createPolicySnapshotService,
  SnapshotBlockedError,
} from "@/server/modules/policy/application/snapshot-service";
import { createJurisdictionTreeService } from "@/server/modules/jurisdiction/application/tree-service";
import { DrizzleJurisdictionReadRepository } from "@/server/modules/jurisdiction/infrastructure/drizzle/jurisdiction-read.repository";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;

describe("policy snapshot service (drill DB)", () => {
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
        "SOCILA_TEST_DATABASE_URL 未设置：数据库集成测试需要已迁移且已 seed 的全新 PostgreSQL 17 库（CI database-gates 自动提供）",
      );
    }
    process.env.DATABASE_URL = DRILL_URL;
  });

  const AS_OF = "2026-01-01";
  let snapshotId = "";

  it("POL-AC-001: resolve returns merged Shanghai context with per-entity provenance", async () => {
    const { merged, chain } = await service.resolvePolicyContext("310000", AS_OF);
    expect(chain.map((c) => c.code)).toEqual(["CN", "310000"]);
    expect(merged.conflicts).toEqual([]);
    const ruleEntities = merged.entities.filter((e) =>
      e.businessKey.startsWith("R-"),
    );
    expect(ruleEntities.length).toBeGreaterThanOrEqual(20);
    // NRP重分类后：R-010为国家baseline继承（CN/baseline），上海地方规则为310000/add。
    const national = ruleEntities.find((e) => e.businessKey === "R-010-PARSE-BIRTH-YEAR");
    expect(national?.provenance[0]).toMatchObject({
      jurisdictionCode: "CN",
      operation: "baseline",
    });
    const local = ruleEntities.find((e) => e.businessKey === "R-500-4050-ELIGIBILITY");
    expect(local?.provenance[0]).toMatchObject({
      jurisdictionCode: "310000",
      operation: "add",
    });
  });

  it("POL-AC-003: cross-pack same-key overlap blocks snapshot and records PolicyConflict", async () => {
    // 制造同级冲突：第二个overlay包发布与既有上海参数相同业务键的有效版本。
    // 目标键显式选取上海地方参数（P-SH-MIN-WAGE），保证确定性（NRP重分类后
    // 参数首行可能是CN baseline实体）。
    const policyWrites = new DrizzlePolicyWriteRepository();
    // 幂等前置清理：清除此前运行残留的冲突行（含draft状态行），避免唯一键冲突。
    await db.delete(params).where(eq(params.paramId, "P-SH-MIN-WAGE"));
    await db
      .delete(policyPackVersions)
      .where(eq(policyPackVersions.policyPackId, "SH-CONFLICT-PACK"));
    // 重新seed该参数（P-SH-MIN-WAGE为上海基础包正式行）。
    await rulesWrites.insertParam({
      policyPackId: "SHANGHAI_BASE",
      jurisdictionCode: "310000",
      businessKey: "P-SH-MIN-WAGE",
      paramId: "P-SH-MIN-WAGE",
      type: "number",
      value: 2690,
      status: "published",
      effectiveFrom: "2024-07-01",
      operation: "add",
      targetBusinessKey: null,
      version: 1,
    });
    const [target] = await db
      .select()
      .from(params)
      .where(eq(params.paramId, "P-SH-MIN-WAGE"))
      .limit(1);
    expect(target?.businessKey).toBeTruthy();

    await policyWrites.insertPolicyPackVersion({
      policyPackId: "SH-CONFLICT-PACK",
      jurisdictionCode: "310000",
      packKind: "overlay",
      version: 1,
      status: "published",
      effectiveFrom: "2025-01-01",
    });
    const dup = await rulesWrites.insertParam({
      policyPackId: "SH-CONFLICT-PACK",
      jurisdictionCode: "310000",
      businessKey: target.businessKey,
      paramId: target.paramId,
      type: target.type,
      value: { conflict: true },
      effectiveFrom: "2025-06-01",
      version: 2,
      status: "published",
    });

    await expect(
      service.createPolicySnapshot({
        jurisdictionCode: "310000",
        asOfDate: AS_OF,
        actor: "acceptance-test",
      }),
    ).rejects.toBeInstanceOf(SnapshotBlockedError);

    const open = await service.listConflicts({ status: "open" });
    const conflict = open.find((c) => c.businessKey === target.businessKey);
    expect(conflict).toBeTruthy();

    // ResolvePolicyConflict：记录决策人、理由与前后状态。
    await service.resolveConflict(conflict!.id, {
      resolvedBy: "admin-1",
      resolution: { action: "retire-conflicting-param", target: dup.id },
    });
    // 按解决决定退役冲突参数后，快照恢复可生成。
    await rulesWrites.updateParam(dup.id, { status: "draft" });

    const created = await service.createPolicySnapshot({
      jurisdictionCode: "310000",
      asOfDate: AS_OF,
      actor: "acceptance-test",
    });
    expect(created.ruleCount).toBeGreaterThanOrEqual(20);
  });

  it("creates a snapshot atomically with stable hash and members", async () => {
    const created = await service.createPolicySnapshot({
      jurisdictionCode: "310000",
      asOfDate: AS_OF,
      actor: "acceptance-test",
    });
    snapshotId = created.snapshotId;
    expect(created.ruleCount).toBeGreaterThanOrEqual(20);
    // NRP重分类后继承链含两个规则集：RS-CN-PLAN-V1（baseline）+ RS-SHANGHAI-PLAN-V1（add）。
    expect(created.ruleSetCount).toBe(2);

    const got = await service.getSnapshot(created.snapshotId);
    expect(got?.snapshot.contentHash).toBe(created.contentHash);
    expect(got?.snapshot.resolvedPath).toBe("/CN/310000/");
    expect((await service.getSnapshot(created.snapshotId))?.snapshot.contentHash).toBe(
      created.contentHash,
    );
  });

  it("POL-AC-004: snapshot members are immutable (DB trigger)", async () => {
    expect(snapshotId).toBeTruthy();
    const errorText = async (run: () => Promise<unknown>) => {
      try {
        await run();
        return "";
      } catch (e) {
        const cause = (e as { cause?: { message?: string } }).cause;
        return `${e instanceof Error ? e.message : String(e)} ${cause?.message ?? ""}`;
      }
    };
    const updateMsg = await errorText(() =>
      db.execute(
        sql`update policy_snapshot_members set business_key = 'tampered' where snapshot_id = ${snapshotId}`,
      ),
    );
    const deleteMsg = await errorText(() =>
      db.execute(sql`delete from policy_snapshots where id = ${snapshotId}`),
    );
    expect(`${updateMsg} ${deleteMsg}`).toMatch(/immutable/);
  });

  it("POL-FR-011: impacted overlays query points back at containing snapshots", async () => {
    // NRP重分类后R-010为国家baseline（无overlay指向它）；改用存在上海显式replace
    // 的国家基线参数键验证影响查询（NRP-FR-011）。
    const impact = await service.listImpactedOverlays("T-UNEMPLOYMENT-DURATION-BY-YEARS");
    expect(impact.impactedOverlays.length).toBeGreaterThanOrEqual(1);
    expect(impact.impactedOverlays[0].jurisdictionCode).toBe("310000");
    expect(impact.impactedSnapshots.some((s) => s.id === snapshotId)).toBe(true);
  });
});
