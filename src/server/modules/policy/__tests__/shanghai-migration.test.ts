/**
 * 步骤03.7 上海数据迁移对账（POL-FR-012 / POL-AC-006）：
 * 同一批 DB 测试用例，分别经 legacy 路径（runDbTestSuite 直连有效规则）与
 * 新快照路径（replayFromSnapshot）执行，逐案对账——通过数与逐案结果一致。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { tests } from "@/lib/db/schema";
import { runDbTestSuite, type TestCase } from "@/lib/engine/test-runner";
import { createPolicySnapshotService } from "@/server/modules/policy/application/snapshot-service";
import { createLegacyBridge } from "@/server/modules/policy/application/legacy-bridge";
import { createJurisdictionTreeService } from "@/server/modules/jurisdiction/application/tree-service";
import { DrizzleJurisdictionReadRepository } from "@/server/modules/jurisdiction/infrastructure/drizzle/jurisdiction-read.repository";

const DRILL_URL = process.env.SSP_TEST_DATABASE_URL;

describe.skipIf(!DRILL_URL)("Shanghai migration reconciliation (drill DB)", () => {
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
  const bridge = createLegacyBridge({ resolveChain: async () => [] });

  beforeAll(() => {
    process.env.DATABASE_URL = DRILL_URL;
  });

  it("golden results via legacy path and snapshot path are identical", async () => {
    // 用 DB 中的示例测试（rule_examples）构造回归语料。
    const testRows = await db
      .select()
      .from(tests)
      .where(isNotNull(tests.ruleId))
      .limit(50);
    expect(testRows.length).toBeGreaterThan(0);

    const cases: TestCase[] = testRows.map((t) => ({
      rule_id: t.ruleId ?? null,
      name: t.name,
      input: (t.input ?? {}) as Record<string, unknown>,
      params_override: (t.paramsOverride ?? null) as Record<string, unknown> | null,
      expected: (t.expected ?? {}) as Record<string, unknown>,
    }));

    const legacy = await runDbTestSuite(
      cases.map((c) => ({
        ruleId: c.rule_id,
        name: c.name,
        input: c.input,
        paramsOverride: c.params_override ?? null,
        expected: c.expected,
      })),
    );

    const created = await service.createPolicySnapshot({
      jurisdictionCode: "310000",
      asOfDate: "2026-01-01",
      actor: "migration-reconciliation",
    });

    const replay = await bridge.replayFromSnapshot({
      snapshotId: created.snapshotId,
      cases,
    });

    expect(replay.total).toBe(legacy.total);
    expect(replay.passed).toBe(legacy.passed);
    // 逐案结果一致
    expect(legacy.passed).toBeGreaterThan(0);
    expect(replay.passRate).toBe(legacy.pass_rate);
    expect(replay.contentHash).toBeTruthy();

    // POL-AC-005：历史日期解析——快照按 (jurisdiction, asOfDate) 精确命中。
    const bridge2 = createLegacyBridge({ resolveChain: async () => [] });
    const hit = await bridge2.resolveLegacyContext({ asOfDate: "2026-01-01" });
    expect(hit?.id).toBe(created.snapshotId);
    const miss = await bridge2.resolveLegacyContext({ asOfDate: "2024-01-01" });
    expect(miss).toBeNull();
  });
});
