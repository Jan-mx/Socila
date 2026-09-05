/**
 * NRP-FR-007/FR-006/FR-011、NRP-AC-003/004/005/006（落库面）：
 * 显式overlay操作持久化——operation与target_business_key来自数据行而非地区推断；
 * CHECK约束强制PRD §7不变量；显式replace在解析结果中生效且provenance完整；
 * 地区隔离（CN/SH/GD互不污染）。
 *
 * 前提：SOCILA_TEST_DATABASE_URL 指向已执行全部migration（含0012）且已 seed 的
 * 全新 PostgreSQL 17 库；未设置时直接失败（不允许skip，PMG-FR-018）。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { params, ruleSets, rules } from "@/lib/db/schema";
import { rulesWrites } from "@/server/modules/rules/application";
import {
  createPolicySnapshotService,
  SnapshotBlockedError,
} from "@/server/modules/policy/application/snapshot-service";
import { createJurisdictionTreeService } from "@/server/modules/jurisdiction/application/tree-service";
import { DrizzleJurisdictionReadRepository } from "@/server/modules/jurisdiction/infrastructure/drizzle/jurisdiction-read.repository";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;

const TEST_RULE_IDS = [
  "R-NRP-TEST-BASE",
  "R-NRP-TEST-LOCAL",
  "R-NRP-TEST-REPLACER",
];
const TEST_PARAM_IDS = ["P-NRP-TEST-BASE", "P-NRP-TEST-REPLACER"];
const TEST_RULE_SET_IDS = ["RS-NRP-TEST"];

async function expectInsertRejected(run: () => Promise<unknown>, match: RegExp) {
  try {
    await run();
    expect.fail(`应被CHECK约束拒绝：${match.source}`);
  } catch (e) {
    // Drizzle把PG错误包在cause里（约束名在cause.message），与POL-AC-004取法一致。
    const cause = (e as { cause?: { message?: string } }).cause;
    const text = `${e instanceof Error ? e.message : String(e)} ${cause?.message ?? ""}`;
    expect(text).toMatch(match);
  }
}

describe("explicit overlay operations (drill DB, NRP-FR-007)", () => {
  beforeAll(() => {
    if (!DRILL_URL) {
      throw new Error(
        "SOCILA_TEST_DATABASE_URL 未设置：数据库集成测试需要已迁移且已 seed 的全新 PostgreSQL 17 库（CI database-gates 自动提供）",
      );
    }
    process.env.DATABASE_URL = DRILL_URL;
  });

  afterAll(async () => {
    // 测试实体清理（快照成员不可变触发器只约束快照表，业务表可清理）。
    await db.delete(rules).where(inArray(rules.ruleId, TEST_RULE_IDS));
    await db.delete(params).where(inArray(params.paramId, TEST_PARAM_IDS));
    await db.delete(ruleSets).where(inArray(ruleSets.ruleSetId, TEST_RULE_SET_IDS));
  });

  it("CN baseline + regional add/replace persist explicit operation and target", async () => {
    // CN baseline 规则 + 参数。
    await rulesWrites.insertRule({
      ruleId: "R-NRP-TEST-BASE",
      jurisdictionCode: "CN",
      businessKey: "R-NRP-TEST-BASE",
      name: "NRP测试国家基线规则",
      module: "test",
      dslVersion: "SOCILA-DSL-1.0",
      priority: 1,
      status: "published",
      effectiveFrom: "2024-01-01",
      decisionTable: { hit_policy: "first", rows: [] },
      operation: "baseline",
      targetBusinessKey: null,
      version: 1,
    });
    await rulesWrites.insertParam({
      policyPackId: "CN-BASELINE",
      jurisdictionCode: "CN",
      businessKey: "P-NRP-TEST-BASE",
      paramId: "P-NRP-TEST-BASE",
      type: "number",
      value: 100,
      status: "published",
      effectiveFrom: "2024-01-01",
      operation: "baseline",
      targetBusinessKey: null,
      version: 1,
    });
    // 上海 add 规则 + replace 参数（目标=CN基线参数键）。
    await rulesWrites.insertRule({
      ruleId: "R-NRP-TEST-LOCAL",
      jurisdictionCode: "310000",
      businessKey: "R-NRP-TEST-LOCAL",
      name: "NRP测试上海地方规则",
      module: "test",
      dslVersion: "SOCILA-DSL-1.0",
      priority: 2,
      status: "published",
      effectiveFrom: "2024-01-01",
      decisionTable: { hit_policy: "first", rows: [] },
      operation: "add",
      targetBusinessKey: null,
      version: 1,
    });
    await rulesWrites.insertParam({
      policyPackId: "SH-NRP-TEST",
      jurisdictionCode: "310000",
      businessKey: "P-NRP-TEST-BASE",
      paramId: "P-NRP-TEST-BASE",
      type: "number",
      value: 80,
      status: "published",
      effectiveFrom: "2024-01-01",
      operation: "replace",
      targetBusinessKey: "P-NRP-TEST-BASE",
      version: 1,
    });

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

    // 上海解析：replace生效，provenance含 baseline→replace 与目标键（NRP-AC-005）。
    const sh = await service.resolvePolicyContext("310000", "2026-01-01");
    expect(sh.merged.conflicts).toEqual([]);
    const replacedParam = sh.merged.entities.find(
      (e) => e.businessKey === "P-NRP-TEST-BASE",
    );
    expect(replacedParam).toBeTruthy();
    expect((replacedParam!.payload as { value: number }).value).toBe(80);
    expect(replacedParam!.provenance.map((p) => p.operation)).toEqual([
      "baseline",
      "replace",
    ]);
    expect(replacedParam!.provenance[1].targetBusinessKey).toBe("P-NRP-TEST-BASE");
    expect(replacedParam!.provenance[1].jurisdictionCode).toBe("310000");

    // 上海解析包含上海add规则与CN基线规则（继承链）。
    const ruleKeys = sh.merged.entities
      .filter((e) => e.businessKey.startsWith("R-NRP"))
      .map((e) => e.businessKey);
    expect(ruleKeys).toContain("R-NRP-TEST-BASE");
    expect(ruleKeys).toContain("R-NRP-TEST-LOCAL");

    // CN解析：只有CN实体，无上海地方实体（地区隔离）。
    const cn = await service.resolvePolicyContext("CN", "2026-01-01");
    expect(cn.merged.conflicts).toEqual([]);
    const cnRuleKeys = cn.merged.entities
      .filter((e) => e.businessKey.startsWith("R-NRP"))
      .map((e) => e.businessKey);
    expect(cnRuleKeys).toContain("R-NRP-TEST-BASE");
    expect(cnRuleKeys).not.toContain("R-NRP-TEST-LOCAL");
    const cnParam = cn.merged.entities.find(
      (e) => e.businessKey === "P-NRP-TEST-BASE",
    );
    expect((cnParam!.payload as { value: number }).value).toBe(100);

    // 广东解析：无上海实体、无SH replace生效（NRP-AC-003/004隔离语义）。
    const gd = await service.resolvePolicyContext("440000", "2026-01-01");
    expect(gd.merged.conflicts).toEqual([]);
    const gdParam = gd.merged.entities.find(
      (e) => e.businessKey === "P-NRP-TEST-BASE",
    );
    expect((gdParam!.payload as { value: number }).value).toBe(100);
  });

  it("CHECK constraints enforce PRD §7 invariants on rules", async () => {
    const base = {
      ruleId: "R-NRP-REJECT",
      jurisdictionCode: "CN",
      businessKey: "R-NRP-REJECT",
      name: "NRP约束测试",
      module: "test",
      dslVersion: "SOCILA-DSL-1.0",
      priority: 1,
      status: "published",
      effectiveFrom: "2024-01-01",
      decisionTable: { hit_policy: "first", rows: [] },
      version: 1,
    };
    // CN + add → 拒绝。
    await expectInsertRejected(
      () => rulesWrites.insertRule({ ...base, operation: "add" }),
      /rules_jurisdiction_operation_check/,
    );
    // CN + replace → 拒绝（非baseline + 目标键可空则target约束也拒绝）。
    await expectInsertRejected(
      () =>
        rulesWrites.insertRule({
          ...base,
          operation: "replace",
          targetBusinessKey: "R-X",
        }),
      /rules_jurisdiction_operation_check/,
    );
    // 地区 + baseline → 拒绝。
    await expectInsertRejected(
      () =>
        rulesWrites.insertRule({
          ...base,
          jurisdictionCode: "310000",
          operation: "baseline",
        }),
      /rules_jurisdiction_operation_check/,
    );
    // 地区 replace 无目标键 → 拒绝。
    await expectInsertRejected(
      () =>
        rulesWrites.insertRule({
          ...base,
          jurisdictionCode: "310000",
          operation: "replace",
          targetBusinessKey: null,
        }),
      /rules_overlay_target_check/,
    );
    // add 携带目标键 → 拒绝。
    await expectInsertRejected(
      () =>
        rulesWrites.insertRule({
          ...base,
          jurisdictionCode: "310000",
          operation: "add",
          targetBusinessKey: "R-X",
        }),
      /rules_overlay_target_check/,
    );
    // 非法操作枚举 → 拒绝。
    await expectInsertRejected(
      () =>
        rulesWrites.insertRule({
          ...base,
          jurisdictionCode: "310000",
          operation: "override",
          targetBusinessKey: null,
        }),
      /rules_operation_check/,
    );
  });

  it("CHECK constraints enforce invariants on params and rule_sets", async () => {
    await expectInsertRejected(
      () =>
        rulesWrites.insertParam({
          policyPackId: "NRP-REJECT",
          jurisdictionCode: "CN",
          businessKey: "P-NRP-REJECT",
          paramId: "P-NRP-REJECT",
          type: "number",
          value: 1,
          status: "published",
          effectiveFrom: "2024-01-01",
          operation: "add",
          version: 1,
        }),
      /params_jurisdiction_operation_check/,
    );
    await expectInsertRejected(
      () =>
        rulesWrites.insertParam({
          policyPackId: "NRP-REJECT",
          jurisdictionCode: "310000",
          businessKey: "P-NRP-REJECT",
          paramId: "P-NRP-REJECT",
          type: "number",
          value: 1,
          status: "published",
          effectiveFrom: "2024-01-01",
          operation: "exempt",
          targetBusinessKey: null,
          version: 1,
        }),
      /params_overlay_target_check/,
    );
    await expectInsertRejected(
      () =>
        rulesWrites.insertRuleSet({
          ruleSetId: "RS-NRP-REJECT",
          jurisdictionCode: "310000",
          status: "published",
          effectiveFrom: "2024-01-01",
          rules: [],
          operation: "baseline",
          version: 1,
        }),
      /rule_sets_jurisdiction_operation_check/,
    );
  });

  it("explicit replace targeting a missing key blocks snapshot with conflict (NRP-AC-006)", async () => {
    await rulesWrites.insertParam({
      policyPackId: "SH-NRP-TEST",
      jurisdictionCode: "310000",
      businessKey: "P-NRP-TEST-REPLACER",
      paramId: "P-NRP-TEST-REPLACER",
      type: "number",
      value: 1,
      status: "published",
      effectiveFrom: "2024-01-01",
      operation: "replace",
      targetBusinessKey: "P-NRP-TEST-MISSING-TARGET",
      version: 1,
    });

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
    await expect(
      service.createPolicySnapshot({
        jurisdictionCode: "310000",
        asOfDate: "2026-01-01",
        actor: "nrp-test",
      }),
    ).rejects.toBeInstanceOf(SnapshotBlockedError);

    const open = await service.listConflicts({ status: "open" });
    const conflict = open.find((c) => c.businessKey === "P-NRP-TEST-REPLACER");
    expect(conflict).toBeTruthy();
    expect(conflict!.kind).toBe("unknown-key");

    await service.resolveConflict(conflict!.id, {
      resolvedBy: "nrp-test-admin",
      resolution: { action: "fix-draft-target" },
    });
  });
});
