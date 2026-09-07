/**
 * CLG-FR-004/CLG-AC-002/003/010 来源链回填（seed库只读断言）：
 * - 500条回归测试source_case_uid全部回填且归一化后解析到cases中的保留案例；
 * - 28条规则示例source_case_uid允许为空；
 * - 117条showcase全部有归一化来源且唯一解析；
 * - 全部cases为310000地区（统一按权威来源归属，无GD/SC正文猜测）。
 *
 * Red：0016未实现/excel-import未回填时，source_case_uid列为空或数量不符而失败。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { seedShowcaseCases } from "@/lib/showcase/seed-showcase";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;

beforeAll(async () => {
  if (!DRILL_URL) {
    throw new Error("SOCILA_TEST_DATABASE_URL 未设置");
  }
  process.env.DATABASE_URL = DRILL_URL;
  // seed不写showcase_cases：本测试自备117条展示（与持久库同源的离线确定性生成）
  const count = await seedShowcaseCases(db);
  if (count !== 117) {
    throw new Error(`seedShowcaseCases应生成117条，实际${count}`);
  }
});

async function count(text: string): Promise<number> {
  const result = await db.execute(sql.raw(text));
  return Number(result.rows[0].count);
}

describe("CLG-AC-002 回归测试来源链", () => {
  it("500条回归source_case_uid全部回填；示例测试允许为空", async () => {
    // 全新seed自然态：500回归 + DSL示例（CN/GD/SC/SH，数量随DSL资产演进）；
    // 持久库基线为528=500回归+28上海示例（治理对象）。治理不删除任何测试。
    const withSource = await count(
      `SELECT count(*) FROM tests WHERE source = 'regression' AND source_case_uid IS NOT NULL AND source_case_uid <> ''`,
    );
    expect(withSource).toBe(500);
    const regressionTotal = await count(
      `SELECT count(*) FROM tests WHERE source = 'regression'`,
    );
    expect(regressionTotal).toBe(500);
    // 示例测试全部允许source_case_uid为空
    const examplesWithSource = await count(
      `SELECT count(*) FROM tests WHERE source <> 'regression' AND source_case_uid IS NOT NULL AND source_case_uid <> ''`,
    );
    expect(examplesWithSource).toBe(0);
  });

  it("500条回归来源归一化后全部解析到cases.case_uid", async () => {
    const unresolved = await db.execute(sql`
      SELECT count(*)::int AS cnt FROM tests t
      WHERE t.source = 'regression' AND t.source_case_uid IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM cases c
          WHERE c.case_uid = regexp_replace(t.source_case_uid, '-[0-9]{2}$', '')
        )`);
    expect(Number(unresolved.rows[0].cnt)).toBe(0);
  });
});

describe("CLG-AC-003 展示案例来源链", () => {
  it("117条showcase全部有归一化来源案例UID且解析到cases", async () => {
    const total = await count(`SELECT count(*) FROM showcase_cases`);
    expect(total).toBe(117);
    const bad = await db.execute(sql`
      SELECT count(*)::int AS cnt FROM showcase_cases s
      WHERE s.source_case_uid IS NULL OR s.source_case_uid = ''
         OR NOT EXISTS (SELECT 1 FROM cases c WHERE c.case_uid = s.source_case_uid)`);
    expect(Number(bad.rows[0].cnt)).toBe(0);
  });

  it("117条showcase归一化来源对应116个不同原始案例", async () => {
    const unique = await count(`SELECT count(DISTINCT source_case_uid) FROM showcase_cases`);
    expect(unique).toBe(116);
  });
});

describe("CLG-FR-002 现有案例地区归属（权威来源）", () => {
  it("851条cases全部归属310000", async () => {
    const total = await count(`SELECT count(*) FROM cases`);
    expect(total).toBe(851);
    const not310000 = await count(
      `SELECT count(*) FROM cases WHERE jurisdiction_code IS NULL OR jurisdiction_code <> '310000'`,
    );
    expect(not310000).toBe(0);
  });

  it("117条showcase全部归属310000", async () => {
    const not310000 = await count(
      `SELECT count(*) FROM showcase_cases WHERE jurisdiction_code IS NULL OR jurisdiction_code <> '310000'`,
    );
    expect(not310000).toBe(0);
  });

  it("没有任何cases或showcase被标记为440000/510000（不从正文猜测）", async () => {
    const gd = await count(`SELECT count(*) FROM cases WHERE jurisdiction_code IN ('440000','510000')`);
    const sg = await count(`SELECT count(*) FROM showcase_cases WHERE jurisdiction_code IN ('440000','510000')`);
    expect(gd).toBe(0);
    expect(sg).toBe(0);
  });
});