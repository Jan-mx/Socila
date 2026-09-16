/**
 * 修复轮I3（集成面）：政策快照contentHash必须剥离显示元数据
 * （参数name/description、规则集name），使0020迁移前后同一政策内容哈希稳定
 * （APR-NFR-004）；而真实政策内容（参数值、规则集顺序、规则决策）变化时哈希
 * 必须改变；创建哈希与release-gates重算共享同一投影；历史快照不可变。
 * 直接改DB行制造场景，finally恢复种子原值（fileParallelism:false串行安全）。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import {
  createPolicySnapshotService,
} from "@/server/modules/policy/application/snapshot-service";
import { canonicalMemberHash } from "@/server/modules/publishing/application/release-gates";
import { createJurisdictionTreeService } from "@/server/modules/jurisdiction/application/tree-service";
import { DrizzleJurisdictionReadRepository } from "@/server/modules/jurisdiction/infrastructure/drizzle/jurisdiction-read.repository";

const DRILL = process.env.SOCILA_TEST_DATABASE_URL;
const AS_OF = "2026-01-01";
const JUR = "310000";

async function client(): Promise<Client> {
  const c = new Client({ connectionString: DRILL });
  await c.connect();
  return c;
}

describe("政策快照内容哈希剥离显示元数据（修复轮I3，真实DB）", () => {
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

  // 目标行（运行期动态选取，恢复用）。
  let paramTarget: { id: number; name: string; description: string | null } | null =
    null;
  let valueTarget: { id: number; value: unknown } | null = null;
  let ruleSetTarget: { id: number; name: string; rules: unknown } | null = null;
  const baselineHash = { current: "" };

  beforeAll(async () => {
    if (!DRILL) {
      throw new Error("SOCILA_TEST_DATABASE_URL 未设置（CI database-gates 自动提供）");
    }
    process.env.DATABASE_URL = DRILL;
    const c = await client();
    try {
      const p = await c.query(
        `select id, name, description, value from params
          where status='published' and jurisdiction_code in ('CN', $1)
            and effective_from<=$2
            and (effective_to is null or effective_to>=$2)
          order by id limit 1`,
        [JUR, AS_OF],
      );
      paramTarget = {
        id: Number(p.rows[0].id),
        name: p.rows[0].name,
        description: p.rows[0].description,
      };
      valueTarget = { id: Number(p.rows[0].id), value: p.rows[0].value };
      const rs = await c.query(
        `select id, name, rules from rule_sets
          where jurisdiction_code=$1 and status='published' order by id limit 1`,
        [JUR],
      );
      if (rs.rowCount && rs.rowCount > 0) {
        ruleSetTarget = {
          id: Number(rs.rows[0].id),
          name: rs.rows[0].name,
          rules: rs.rows[0].rules,
        };
      }
    } finally {
      await c.end();
    }
  });

  afterAll(async () => {
    const c = await client();
    try {
      if (paramTarget) {
        await c.query(
          `update params set name=$2, description=$3, value=$4 where id=$1`,
          [paramTarget.id, paramTarget.name, paramTarget.description, JSON.stringify(valueTarget?.value)],
        );
      }
      if (ruleSetTarget) {
        await c.query(`update rule_sets set name=$2, rules=$3 where id=$1`, [
          ruleSetTarget.id,
          ruleSetTarget.name,
          JSON.stringify(ruleSetTarget.rules),
        ]);
      }
    } finally {
      await c.end();
    }
  });

  async function snapshot(): Promise<string> {
    const created = await service.createPolicySnapshot({
      jurisdictionCode: JUR,
      asOfDate: AS_OF,
      actor: "apr-i3",
    });
    baselineHash.current ||= created.contentHash;
    return created.contentHash;
  }

  it("仅修改参数name/description与规则集name：contentHash不变（0020前后稳定）", async () => {
    expect(paramTarget).not.toBeNull();
    const before = await snapshot();
    const c = await client();
    try {
      await c.query(
        `update params set name=$2, description=$3 where id=$1`,
        [paramTarget!.id, "APR显示名改名", "APR显示说明改写"],
      );
      if (ruleSetTarget) {
        await c.query(`update rule_sets set name=$2 where id=$1`, [
          ruleSetTarget.id,
          "APR规则集显示名改名",
        ]);
      }
      const after = await snapshot();
      // 显示元数据不得进入政策内容哈希。
      expect(after).toBe(before);
    } finally {
      await c.query(
        `update params set name=$2, description=$3 where id=$1`,
        [paramTarget!.id, paramTarget!.name, paramTarget!.description],
      );
      if (ruleSetTarget) {
        await c.query(`update rule_sets set name=$2 where id=$1`, [
          ruleSetTarget.id,
          ruleSetTarget.name,
        ]);
      }
      await c.end();
    }
  });

  it("修改参数业务值：contentHash必须变化（不得降低哈希覆盖）", async () => {
    const base = await snapshot();
    const c = await client();
    try {
      await c.query(`update params set value=$2::jsonb where id=$1`, [
        valueTarget!.id,
        JSON.stringify(Number(valueTarget!.value ?? 0) + 12345),
      ]);
      const changed = await snapshot();
      expect(changed).not.toBe(base);
    } finally {
      await c.query(`update params set value=$2::jsonb where id=$1`, [
        valueTarget!.id,
        JSON.stringify(valueTarget!.value),
      ]);
      await c.end();
    }
  });

  it("修改规则集成员顺序：contentHash必须变化", async () => {
    expect(ruleSetTarget, "种子应含至少一个规则集").not.toBeNull();
    const base = await snapshot();
    const c = await client();
    try {
      const reversed = [...(ruleSetTarget!.rules as string[])].reverse();
      expect(reversed).not.toEqual(ruleSetTarget!.rules);
      await c.query(`update rule_sets set rules=$2::jsonb where id=$1`, [
        ruleSetTarget!.id,
        JSON.stringify(reversed),
      ]);
      const changed = await snapshot();
      expect(changed).not.toBe(base);
    } finally {
      await c.query(`update rule_sets set rules=$2::jsonb where id=$1`, [
        ruleSetTarget!.id,
        JSON.stringify(ruleSetTarget!.rules),
      ]);
      await c.end();
    }
  });

  it("快照创建哈希与release-gates对已存成员的重算完全一致", async () => {
    const created = await service.createPolicySnapshot({
      jurisdictionCode: JUR,
      asOfDate: AS_OF,
      actor: "apr-i3",
    });
    const got = await service.getSnapshot(created.snapshotId);
    expect(got).not.toBeNull();
    // 与执行期重算端（jurisdiction-compute/replay-plan）同一成员形状。
    const normalized = got!.members.map((m) => ({
      entityType: m.entityType,
      businessKey: m.businessKey,
      payload: m.payload,
      provenance: m.provenance,
    }));
    // 执行期重算端复用同一投影语义（JRP-FR-026）。
    expect(canonicalMemberHash(normalized)).toBe(created.contentHash);
  });
});
