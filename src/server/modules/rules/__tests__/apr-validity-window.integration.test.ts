/**
 * 修复轮I1（集成面）：listRuleCandidates有限有效期窗口方向。
 * 目标：effective_from <= as_of AND (effective_to IS NULL OR effective_to >= as_of)。
 * 旧缺陷（上界反写为as_of>=effective_to）会：窗口中间日期漏选、终止日之后误选、
 * 同编号多窗口漏掉当前有效版本。用真实DB行+直接调仓储方法证明。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;

async function client(): Promise<Client> {
  const c = new Client({ connectionString: DRILL_URL });
  await c.connect();
  return c;
}

async function insertWindowedRule(
  c: Client,
  over: {
    ruleId: string;
    version: number;
    from: string;
    to: string | null;
  },
) {
  await c.query(
    `insert into rules (rule_id, jurisdiction_code, business_key, name, module,
       dsl_version, priority, status, version, effective_from, effective_to,
       operation, decision_table)
     values ($1, '310000', $1, $2, 'test', 'SOCILA-DSL-1.0', 1, 'published', $3, $4, $5, 'add',
       '{"hit_policy":"first","rows":[]}'::jsonb)`,
    [over.ruleId, `有效期窗口规则${over.ruleId}v${over.version}`, over.version, over.from, over.to],
  );
}

const WINDOW_RULE = "R-APR-FIX-WINDOW";
const MULTI_RULE = "R-APR-FIX-MULTI";
const CHAIN = ["CN", "310000"];

describe("成员候选有效期窗口解析（修复轮I1，真实DB）", () => {
  let c: Client;

  beforeAll(async () => {
    if (!DRILL_URL) {
      throw new Error(
        "SOCILA_TEST_DATABASE_URL 未设置（CI database-gates 自动提供）",
      );
    }
    process.env.DATABASE_URL = DRILL_URL;
    c = await client();
    // 预清理（同文件重跑/上次异常残留卫生）。
    await c.query("delete from rules where rule_id like 'R-APR-FIX-%'");
    await insertWindowedRule(c, {
      ruleId: WINDOW_RULE,
      version: 1,
      from: "2025-01-01",
      to: "2025-06-30",
    });
    await insertWindowedRule(c, {
      ruleId: MULTI_RULE,
      version: 1,
      from: "2024-01-01",
      to: "2024-12-31",
    });
    await insertWindowedRule(c, {
      ruleId: MULTI_RULE,
      version: 2,
      from: "2025-01-01",
      to: null,
    });
  });

  afterAll(async () => {
    try {
      await c.query("delete from rules where rule_id like 'R-APR-FIX-%'");
    } finally {
      await c.end();
    }
  });

  async function candidatesAsOf(asOf: string, ruleIds: string[] | null = null) {
    const { DrizzleRulesReadRepository } = await import(
      "../infrastructure/drizzle/rules-read.repository"
    );
    const repo = new DrizzleRulesReadRepository();
    return repo.listRuleCandidates({
      ruleIds,
      jurisdictionCodes: CHAIN,
      asOfDate: asOf,
    });
  }

  it("生效日当天包含", async () => {
    const rows = await candidatesAsOf("2025-01-01", [WINDOW_RULE]);
    expect(rows.map((r) => `${r.ruleId}@v${r.version}`)).toContain(
      `${WINDOW_RULE}@v1`,
    );
  });

  it("有限窗口中间日期包含（旧上界方向在此漏选）", async () => {
    const rows = await candidatesAsOf("2025-03-15", [WINDOW_RULE]);
    expect(rows.map((r) => `${r.ruleId}@v${r.version}`)).toContain(
      `${WINDOW_RULE}@v1`,
    );
  });

  it("终止日当天包含", async () => {
    const rows = await candidatesAsOf("2025-06-30", [WINDOW_RULE]);
    expect(rows.map((r) => `${r.ruleId}@v${r.version}`)).toContain(
      `${WINDOW_RULE}@v1`,
    );
  });

  it("终止日之后排除（旧上界方向在此误选过期行）", async () => {
    const rows = await candidatesAsOf("2025-07-01", [WINDOW_RULE]);
    expect(rows).toHaveLength(0);
  });

  it("尚未生效排除", async () => {
    const rows = await candidatesAsOf("2024-12-31", [WINDOW_RULE]);
    expect(rows).toHaveLength(0);
  });

  it("同编号多窗口只解析目标日期有效版本", async () => {
    const { resolveRuleSetMembers } = await import(
      "../domain/rule-set-members"
    );
    // 目标日期落在v1窗口内：装载与解析都必须命中v1（而非v2或未过期误判）。
    const inV1 = await candidatesAsOf("2024-06-01", [MULTI_RULE]);
    expect(inV1.map((r) => r.version)).toEqual([1]);
    const [m1] = resolveRuleSetMembers(
      [MULTI_RULE],
      inV1,
      CHAIN,
      "2024-06-01",
    );
    expect(m1.missing).toBe(false);
    expect(m1.version).toBe(1);
    expect(m1.name).toBe(`有效期窗口规则${MULTI_RULE}v1`);
    // 目标日期落在v2长期窗口内：v1已过期不得参与。
    const inV2 = await candidatesAsOf("2025-06-01", [MULTI_RULE]);
    expect(inV2.map((r) => r.version)).toEqual([2]);
    const [m2] = resolveRuleSetMembers(
      [MULTI_RULE],
      inV2,
      CHAIN,
      "2025-06-01",
    );
    expect(m2.version).toBe(2);
    expect(m2.name).toBe(`有效期窗口规则${MULTI_RULE}v2`);
  });
});
