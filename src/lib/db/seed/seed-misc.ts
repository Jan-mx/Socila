import fs from "fs";
import { db } from "@/lib/db";
import { ruleSets, tests } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import type { DiscoveredRegion } from "@/lib/dsl/region-manifest";

interface RuleSetFile {
  rule_set_id: string;
  description?: string;
  status: string;
  effective_from: string;
  rules: string[];
  conflict_resolution?: unknown;
}

interface TestEntry {
  rule_id: string;
  example_name: string;
  input: unknown;
  params_override?: unknown;
  expected: unknown;
}

interface TestsFile {
  tests: TestEntry[];
}

/**
 * 装载地区规则集与示例测试（SDL-FR-004：路径与地区来自地区Manifest）。
 * 复审纠正：存在检查与更新条件包含jurisdictionCode——同一rule_set_id/测试名称
 * 在不同地区各自成行，绝不跨地区更新覆盖；tests行写入jurisdictionCode。
 * 协议级发布工作流与本职责分离（见seed-workflow.ts，只装载一次）。
 */
export async function seedMisc(region: DiscoveredRegion) {
  const jurisdictionCode = region.manifest.jurisdiction_code;

  // Seed rule set（地区作用域：jurisdictionCode + ruleSetId + version）
  const ruleSetRaw = fs.readFileSync(region.ruleSetPath, "utf-8");
  const ruleSet: RuleSetFile = JSON.parse(ruleSetRaw);

  console.log(`Seeding rule set: ${ruleSet.rule_set_id}...`);

  const existingRuleSet = await db
    .select({ id: ruleSets.id })
    .from(ruleSets)
    .where(
      and(
        eq(ruleSets.jurisdictionCode, jurisdictionCode),
        eq(ruleSets.ruleSetId, ruleSet.rule_set_id),
        eq(ruleSets.version, 1),
      ),
    )
    .limit(1);

  const ruleSetData = {
    jurisdictionCode,
    ruleSetId: ruleSet.rule_set_id,
    description: ruleSet.description ?? null,
    status: ruleSet.status,
    effectiveFrom: ruleSet.effective_from,
    rules: ruleSet.rules,
    conflictResolution: ruleSet.conflict_resolution ?? null,
    version: 1,
  };

  if (existingRuleSet.length > 0) {
    await db
      .update(ruleSets)
      .set({ ...ruleSetData, updatedAt: new Date() })
      .where(
        and(
          eq(ruleSets.jurisdictionCode, jurisdictionCode),
          eq(ruleSets.ruleSetId, ruleSet.rule_set_id),
          eq(ruleSets.version, 1),
        ),
      );
    console.log(`  Updated rule set: ${ruleSet.rule_set_id}`);
  } else {
    await db.insert(ruleSets).values(ruleSetData);
    console.log(`  Inserted rule set: ${ruleSet.rule_set_id}`);
  }

  // Seed tests from rule examples（地区作用域：jurisdictionCode + name）
  const testsRaw = fs.readFileSync(region.testsPath, "utf-8");
  const testsFile: TestsFile = JSON.parse(testsRaw);

  console.log(`Seeding ${testsFile.tests.length} example tests...`);

  for (const t of testsFile.tests) {
    const testName = `${t.rule_id}: ${t.example_name}`;

    const existingTest = await db
      .select({ id: tests.id })
      .from(tests)
      .where(and(eq(tests.jurisdictionCode, jurisdictionCode), eq(tests.name, testName)))
      .limit(1);

    const testData = {
      name: testName,
      jurisdictionCode,
      ruleId: t.rule_id,
      input: t.input as Record<string, unknown>,
      paramsOverride: t.params_override ?? null,
      expected: t.expected as Record<string, unknown>,
      source: "example",
    };

    if (existingTest.length > 0) {
      await db
        .update(tests)
        .set({ ...testData, updatedAt: new Date() })
        .where(and(eq(tests.jurisdictionCode, jurisdictionCode), eq(tests.name, testName)));
      console.log(`  Updated test: ${testName}`);
    } else {
      await db.insert(tests).values(testData);
      console.log(`  Inserted test: ${testName}`);
    }
  }

  console.log("Misc seeded.");
}
