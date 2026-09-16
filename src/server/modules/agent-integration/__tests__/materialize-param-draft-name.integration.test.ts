/**
 * 修复轮I4（集成面）：Agent新参数草案必须携带正式名称（APR-FR-017）。
 * 编号回退只允许用于0020迁移旧行——草案缺/空白/HTML非法name时整个DraftBundle
 * 物化失败且规则/参数/测试/幂等台账零写入；修正后同键请求能够正常执行。
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { Client } from "pg";
import {
  MaterializationRejected,
  materializeDraftBundle,
  parseAndReject,
} from "../application/materialize";

const DRILL = process.env.SOCILA_TEST_DATABASE_URL;
type Suffix =
  | "missing"
  | "blank"
  | "html"
  | "desc"
  | "direct"
  | "ok"
  | "retry";
const ruleIdFor = (s: string) => `R-APR-FIX-${s.toUpperCase()}`;
const paramIdFor = (s: string) => `P-APR-FIX-${s.toUpperCase()}`;

function bundle(over: {
  key: string;
  suffix: Suffix;
  param: Record<string, unknown> | null;
}): Record<string, unknown> {
  return {
    proposal_id: `prop-i4-${over.suffix}`,
    run_id: "run-i4",
    idempotency_key: `mat-i4-${over.key}`,
    base_snapshot_id: null,
    jurisdiction_code: "310000",
    effective_from: "2026-01-01",
    status: "draft",
    rule_drafts: [
      {
        temp_id: "t1",
        rule_id: ruleIdFor(over.suffix),
        name: "APR修复轮草案规则",
        decision_table: { hit_policy: "first", rows: [] },
        effective_from: "2026-01-01",
        citations: [{ document_version_id: "dv-i4", path: "/doc/article" }],
        parameter_refs: [],
      },
    ],
    param_drafts:
      over.param === null
        ? []
        : [
            {
              temp_id: "p1",
              param_id: paramIdFor(over.suffix),
              type: "number",
              value: 100,
              effective_from: "2026-01-01",
              citations: [
                { document_version_id: "dv-i4", path: "/doc/article" },
              ],
              ...over.param,
            },
          ],
    test_drafts: [],
    citations: [],
  };
}

/** 指定后缀的四表计数（拒绝路径应全0；成功路径rules/ledger=1）。 */
async function counts(suffix: Suffix) {
  const c = new Client({ connectionString: DRILL });
  await c.connect();
  try {
    const rules = await c.query(
      "select count(*)::int as n from rules where rule_id=$1",
      [ruleIdFor(suffix)],
    );
    const params = await c.query(
      "select count(*)::int as n from params where param_id=$1",
      [paramIdFor(suffix)],
    );
    const ledger = await c.query(
      "select count(*)::int as n from agent_materializations where proposal_id=$1",
      [`prop-i4-${suffix}`],
    );
    return {
      rules: Number(rules.rows[0].n),
      params: Number(params.rows[0].n),
      ledger: Number(ledger.rows[0].n),
    };
  } finally {
    await c.end();
  }
}

async function expectRejected422(raw: Record<string, unknown>) {
  try {
    await materializeDraftBundle(parseAndReject(raw), "agent-runtime");
    expect.unreachable("缺名/非法名称的草案必须被拒绝");
  } catch (e) {
    // 复审A-Minor：判别力钉到422状态与拒绝类，而非任意异常。
    expect(e).toBeInstanceOf(MaterializationRejected);
    expect((e as MaterializationRejected).status).toBe(422);
  }
}

describe("Agent参数草案强制正式名称（修复轮I4，真实DB）", () => {
  beforeAll(async () => {
    if (!DRILL) {
      throw new Error(
        "SOCILA_TEST_DATABASE_URL 未设置（CI database-gates 自动提供）",
      );
    }
    process.env.DATABASE_URL = DRILL;
    // 预清理（上次异常中断残留卫生）。
    await db.execute(
      sql`DELETE FROM agent_materializations WHERE proposal_id LIKE 'prop-i4-%'`,
    );
    await db.execute(
      sql`DELETE FROM params WHERE param_id LIKE 'P-APR-FIX-%' AND source = 'agent-draft'`,
    );
    await db.execute(sql`DELETE FROM rules WHERE rule_id LIKE 'R-APR-FIX-%'`);
  });

  afterAll(async () => {
    await db.execute(
      sql`DELETE FROM agent_materializations WHERE proposal_id LIKE 'prop-i4-%'`,
    );
    await db.execute(
      sql`DELETE FROM params WHERE param_id LIKE 'P-APR-FIX-%' AND source = 'agent-draft'`,
    );
    await db.execute(sql`DELETE FROM rules WHERE rule_id LIKE 'R-APR-FIX-%'`);
  });

  it("缺name：422拒绝且规则/参数/台账零写入", async () => {
    await expectRejected422(
      bundle({ key: "missing", suffix: "missing", param: {} }),
    );
    expect(await counts("missing")).toEqual({ rules: 0, params: 0, ledger: 0 });
  });

  it("空白name：422拒绝且零写入", async () => {
    await expectRejected422(
      bundle({ key: "blank", suffix: "blank", param: { name: "   " } }),
    );
    expect(await counts("blank")).toEqual({ rules: 0, params: 0, ledger: 0 });
  });

  it("HTML尖括号name：422拒绝且零写入", async () => {
    await expectRejected422(
      bundle({
        key: "html",
        suffix: "html",
        param: { name: "<b>参数名</b>" },
      }),
    );
    expect(await counts("html")).toEqual({ rules: 0, params: 0, ledger: 0 });
  });

  it("description携带HTML尖括号：422拒绝且零写入（description仍可选但必须安全）", async () => {
    await expectRejected422(
      bundle({
        key: "desc",
        suffix: "desc",
        param: {
          name: "APR修复轮参数名称",
          description: "<script>x</script>",
        },
      }),
    );
    expect(await counts("desc")).toEqual({ rules: 0, params: 0, ledger: 0 });
  });

  it("直连服务（绕过路由解析）同样强制name——不得写入编号回退新草案", async () => {
    const raw = bundle({ key: "direct", suffix: "direct", param: {} });
    // 不经parseAndReject，直接以原始对象调用服务（模拟内部调用面）。
    await expect(
      materializeDraftBundle(
        raw as unknown as Parameters<typeof materializeDraftBundle>[0],
        "agent-runtime",
      ),
    ).rejects.toThrow(MaterializationRejected);
    expect(await counts("direct")).toEqual({ rules: 0, params: 0, ledger: 0 });
  });

  it("合法中文name成功：落库名称为草案trim值（非编号回退）", async () => {
    const result = await materializeDraftBundle(
      parseAndReject(
        bundle({
          key: "ok",
          suffix: "ok",
          param: {
            name: "  APR修复轮参数正式名称  ",
            description: "修复轮验证用的合法说明",
          },
        }),
      ),
      "agent-runtime",
    );
    expect(result.draft_ids.params).toHaveLength(1);
    const c = new Client({ connectionString: DRILL });
    await c.connect();
    try {
      const rows = await c.query(
        `select name, description from params where param_id=$1 and source='agent-draft'`,
        [paramIdFor("ok")],
      );
      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0].name).toBe("APR修复轮参数正式名称");
      expect(rows.rows[0].description).toBe("修复轮验证用的合法说明");
    } finally {
      await c.end();
    }
    expect(await counts("ok")).toMatchObject({ rules: 1, params: 1, ledger: 1 });
  });

  it("失败后修正相同业务请求可正常执行，不留下脏幂等台账", async () => {
    await expectRejected422(
      bundle({ key: "retry-1", suffix: "retry", param: {} }),
    );
    expect((await counts("retry")).ledger).toBe(0);

    const result = await materializeDraftBundle(
      parseAndReject(
        bundle({
          key: "retry-1",
          suffix: "retry",
          param: { name: "APR修复轮重试成功参数" },
        }),
      ),
      "agent-runtime",
    );
    expect(result.idempotent).toBe(false);
    expect(await counts("retry")).toMatchObject({ ledger: 1, params: 1 });
    const c = new Client({ connectionString: DRILL });
    await c.connect();
    try {
      const rows = await c.query(
        `select name from params where param_id=$1 and source='agent-draft'`,
        [paramIdFor("retry")],
      );
      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0].name).toBe("APR修复轮重试成功参数");
    } finally {
      await c.end();
    }
  });
});
