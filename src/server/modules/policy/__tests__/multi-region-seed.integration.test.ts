/**
 * 09-05复审纠正：多地区Seed数据库隔离测试（SDL-FR-004、SDL-AC-002的落库面）。
 *
 * 两个地区（上海310000/广东440000，行政区划来自migration 0003种子）使用：
 * - 相同rule_id + version；
 * - 相同policy_pack_id + param_id（不同参数值）；
 * - 相同rule_set_id；
 * - 相同测试名称；
 * 断言两地记录同时存在、互不覆盖、重复Seed幂等、tests行携带jurisdictionCode。
 * 使用临时DSL目录（合成测试数据，非真实政策）；不触碰持久policyops库。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { params, ruleSets, rules, tests } from "@/lib/db/schema";
import { discoverRegionDsl } from "@/lib/dsl/region-manifest";
import { seedRules } from "@/lib/db/seed/seed-rules";
import { seedParams } from "@/lib/db/seed/seed-params";
import { seedMisc } from "@/lib/db/seed/seed-misc";

const DRILL_URL = process.env.SOCILA_TEST_DATABASE_URL;

// 两地共享的业务键（合成测试数据，非真实政策）。
const SHARED_RULE_ID = "R-SDL-MR-SHARED";
const SHARED_PACK_ID = "SDL-MR-SHARED-PACK";
const SHARED_PARAM_ID = "P-SDL-MR-SHARED-PARAM";
const SHARED_RULE_SET_ID = "RS-SDL-MR-SHARED";
const SHARED_EXAMPLE_NAME = "共享多地区示例";
const SHARED_TEST_NAME = `${SHARED_RULE_ID}: ${SHARED_EXAMPLE_NAME}`;
const REGIONS = [
  { slug: "shanghai", jurisdiction: "310000", paramValue: 111 },
  { slug: "guangdong", jurisdiction: "440000", paramValue: 222 },
] as const;

let tmpRoot: string;

function writeRegionAssets(
  root: string,
  slug: string,
  jurisdiction: string,
  paramValue: number,
): void {
  const dir = path.join(root, "regions", `${slug}_dsl_v1`);
  for (const sub of ["rules", "params", "rule_sets", "tests"]) {
    mkdirSync(path.join(dir, sub), { recursive: true });
  }
  writeFileSync(
    path.join(dir, "rules", `${SHARED_RULE_ID}.json`),
    JSON.stringify({
      dsl_version: "SOCILA-DSL-1.0",
      rule_id: SHARED_RULE_ID,
      name: `多地区共享规则（${slug}）`,
      module: "test",
      status: "published",
      priority: 990,
      effective_from: "2024-01-01",
      inputs: [],
      parameter_refs: [],
      decision_table: { hit_policy: "first", rows: [] },
      outputs: [],
      examples: [],
    }),
  );
  writeFileSync(
    path.join(dir, "params", "params.json"),
    JSON.stringify({
      policy_pack_id: SHARED_PACK_ID,
      as_of: "2025-01-01",
      params: [
        {
          param_id: SHARED_PARAM_ID,
          type: "number",
          value: paramValue,
          effective_from: "2025-01-01",
          note: `${slug}地区参数值`,
        },
      ],
      tables: [],
    }),
  );
  writeFileSync(
    path.join(dir, "rule_sets", "rs.json"),
    JSON.stringify({
      rule_set_id: SHARED_RULE_SET_ID,
      description: `多地区共享规则集（${slug}）`,
      status: "published",
      effective_from: "2024-01-01",
      rules: [SHARED_RULE_ID],
    }),
  );
  writeFileSync(
    path.join(dir, "tests", "tests.json"),
    JSON.stringify({
      tests: [
        {
          rule_id: SHARED_RULE_ID,
          example_name: SHARED_EXAMPLE_NAME,
          input: { user: { basic: { birth_year: 1990 } } },
          params_override: null,
          expected: { calc: {} },
        },
      ],
    }),
  );
  writeFileSync(
    path.join(dir, "rules_manifest.json"),
    JSON.stringify({
      dsl_version: "SOCILA-DSL-1.0",
      region_slug: slug,
      jurisdiction_code: jurisdiction,
      bundle_version: 1,
      params_file: "params/params.json",
      rule_set_file: "rule_sets/rs.json",
      tests_file: "tests/tests.json",
      rules: [{ rule_id: SHARED_RULE_ID, file: `${SHARED_RULE_ID}.json` }],
    }),
  );
}

async function seedAllRegions(): Promise<void> {
  const regions = discoverRegionDsl({
    regionsRoot: path.join(tmpRoot, "regions"),
    protocolRoot: path.join(tmpRoot, "protocol"),
  });
  expect(regions).toHaveLength(2);
  for (const region of regions) {
    await seedRules(region);
    await seedParams(region);
    await seedMisc(region);
  }
}

async function countRows(table: "rules" | "params" | "rule_sets" | "tests"): Promise<number> {
  if (table === "rules") {
    const rows = await db.select().from(rules).where(eq(rules.ruleId, SHARED_RULE_ID));
    return rows.length;
  }
  if (table === "params") {
    const rows = await db.select().from(params).where(eq(params.paramId, SHARED_PARAM_ID));
    return rows.length;
  }
  if (table === "rule_sets") {
    const rows = await db
      .select()
      .from(ruleSets)
      .where(eq(ruleSets.ruleSetId, SHARED_RULE_SET_ID));
    return rows.length;
  }
  const rows = await db.select().from(tests).where(eq(tests.name, SHARED_TEST_NAME));
  return rows.length;
}

async function cleanup(): Promise<void> {
  await db.delete(tests).where(eq(tests.name, SHARED_TEST_NAME));
  await db.delete(ruleSets).where(eq(ruleSets.ruleSetId, SHARED_RULE_SET_ID));
  await db.delete(params).where(eq(params.paramId, SHARED_PARAM_ID));
  await db.delete(rules).where(eq(rules.ruleId, SHARED_RULE_ID));
}

describe("多地区Seed隔离（drill DB，复审纠正）", () => {
  beforeAll(() => {
    if (!DRILL_URL) {
      throw new Error(
        "SOCILA_TEST_DATABASE_URL 未设置：数据库集成测试需要已迁移的全新 PostgreSQL 17 库（CI database-gates 自动提供）",
      );
    }
    process.env.DATABASE_URL = DRILL_URL;

    tmpRoot = mkdtempSync(path.join(tmpdir(), "socila-multi-region-seed-"));
    mkdirSync(path.join(tmpRoot, "protocol"), { recursive: true });
    for (const r of REGIONS) {
      writeRegionAssets(tmpRoot, r.slug, r.jurisdiction, r.paramValue);
    }
  });

  afterAll(async () => {
    await cleanup();
    if (tmpRoot) {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("两个地区的同rule_id记录同时存在且地区正确", async () => {
    await seedAllRegions();

    const rows = await db.select().from(rules).where(eq(rules.ruleId, SHARED_RULE_ID));
    expect(rows).toHaveLength(2);
    const byJurisdiction = new Map(rows.map((r) => [r.jurisdictionCode, r]));
    expect(byJurisdiction.get("310000")?.name).toContain("shanghai");
    expect(byJurisdiction.get("440000")?.name).toContain("guangdong");
    for (const row of rows) {
      expect(row.dslVersion).toBe("SOCILA-DSL-1.0");
      expect(row.businessKey).toBe(SHARED_RULE_ID);
    }
  });

  it("同param_id两地参数并存、值互不覆盖", async () => {
    const rows = await db.select().from(params).where(eq(params.paramId, SHARED_PARAM_ID));
    expect(rows).toHaveLength(2);
    const byJurisdiction = new Map(rows.map((r) => [r.jurisdictionCode, r]));
    expect(byJurisdiction.get("310000")?.value).toBe(111);
    expect(byJurisdiction.get("440000")?.value).toBe(222);
    expect(byJurisdiction.get("310000")?.policyPackId).toBe(SHARED_PACK_ID);
    expect(byJurisdiction.get("440000")?.policyPackId).toBe(SHARED_PACK_ID);
  });

  it("同rule_set_id两地规则集并存且成员正确", async () => {
    const rows = await db
      .select()
      .from(ruleSets)
      .where(eq(ruleSets.ruleSetId, SHARED_RULE_SET_ID));
    expect(rows).toHaveLength(2);
    const byJurisdiction = new Map(rows.map((r) => [r.jurisdictionCode, r]));
    expect(byJurisdiction.get("310000")?.rules).toEqual([SHARED_RULE_ID]);
    expect(byJurisdiction.get("440000")?.rules).toEqual([SHARED_RULE_ID]);
  });

  it("同测试名称两地并存且tests行保存jurisdictionCode", async () => {
    const rows = await db.select().from(tests).where(eq(tests.name, SHARED_TEST_NAME));
    expect(rows).toHaveLength(2);
    const jurisdictions = rows.map((r) => r.jurisdictionCode).sort();
    expect(jurisdictions).toEqual(["310000", "440000"]);
    for (const row of rows) {
      expect(row.ruleId).toBe(SHARED_RULE_ID);
      expect(row.source).toBe("example");
    }
  });

  it("重复Seed幂等且不产生跨地区覆盖", async () => {
    await seedAllRegions();
    const rulesBefore = await countRows("rules");
    const paramsBefore = await countRows("params");
    const ruleSetsBefore = await countRows("rule_sets");
    const testsBefore = await countRows("tests");

    await seedAllRegions();

    expect(await countRows("rules")).toBe(rulesBefore);
    expect(await countRows("params")).toBe(paramsBefore);
    expect(await countRows("rule_sets")).toBe(ruleSetsBefore);
    expect(await countRows("tests")).toBe(testsBefore);

    const shParam = await db
      .select()
      .from(params)
      .where(and(eq(params.paramId, SHARED_PARAM_ID), eq(params.jurisdictionCode, "310000")));
    expect(shParam).toHaveLength(1);
    expect(shParam[0].value).toBe(111);
  });
});
