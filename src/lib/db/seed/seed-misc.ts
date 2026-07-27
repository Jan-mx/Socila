import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { ruleSets, workflows, tests } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const DSL_DIR = path.join(process.cwd(), "dsl/ssp_dsl_v1");

interface RuleSetFile {
  rule_set_id: string;
  description?: string;
  status: string;
  effective_from: string;
  rules: string[];
  conflict_resolution?: unknown;
}

interface WorkflowFile {
  workflow_id: string;
  name: string;
  version: string;
  stages: unknown[];
  rollback_policy?: unknown;
  canary?: unknown;
  audit?: unknown;
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

export async function seedMisc() {
  // Seed rule set
  const ruleSetPath = path.join(
    DSL_DIR,
    "rule_sets/rule_set_shanghai_plan_v1.json",
  );
  const ruleSetRaw = fs.readFileSync(ruleSetPath, "utf-8");
  const ruleSet: RuleSetFile = JSON.parse(ruleSetRaw);

  console.log(`Seeding rule set: ${ruleSet.rule_set_id}...`);

  const existingRuleSet = await db
    .select({ id: ruleSets.id })
    .from(ruleSets)
    .where(eq(ruleSets.ruleSetId, ruleSet.rule_set_id))
    .limit(1);

  const ruleSetData = {
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
      .where(eq(ruleSets.ruleSetId, ruleSet.rule_set_id));
    console.log(`  Updated rule set: ${ruleSet.rule_set_id}`);
  } else {
    await db.insert(ruleSets).values(ruleSetData);
    console.log(`  Inserted rule set: ${ruleSet.rule_set_id}`);
  }

  // Seed workflow
  const workflowPath = path.join(
    DSL_DIR,
    "workflows/publish_workflow_default.json",
  );
  const workflowRaw = fs.readFileSync(workflowPath, "utf-8");
  const workflow: WorkflowFile = JSON.parse(workflowRaw);

  console.log(`Seeding workflow: ${workflow.workflow_id}...`);

  const existingWorkflow = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(eq(workflows.workflowId, workflow.workflow_id))
    .limit(1);

  const workflowData = {
    workflowId: workflow.workflow_id,
    name: workflow.name,
    versionStr: workflow.version,
    stages: workflow.stages,
    rollbackPolicy: workflow.rollback_policy ?? null,
    canary: workflow.canary ?? null,
    auditConfig: workflow.audit ?? null,
  };

  if (existingWorkflow.length > 0) {
    await db
      .update(workflows)
      .set({ ...workflowData, updatedAt: new Date() })
      .where(eq(workflows.workflowId, workflow.workflow_id));
    console.log(`  Updated workflow: ${workflow.workflow_id}`);
  } else {
    await db.insert(workflows).values(workflowData);
    console.log(`  Inserted workflow: ${workflow.workflow_id}`);
  }

  // Seed tests from rule examples
  const testsPath = path.join(DSL_DIR, "tests/rule_examples_as_tests.json");
  const testsRaw = fs.readFileSync(testsPath, "utf-8");
  const testsFile: TestsFile = JSON.parse(testsRaw);

  console.log(`Seeding ${testsFile.tests.length} example tests...`);

  for (const t of testsFile.tests) {
    const testName = `${t.rule_id}: ${t.example_name}`;

    const existingTest = await db
      .select({ id: tests.id })
      .from(tests)
      .where(eq(tests.name, testName))
      .limit(1);

    const testData = {
      name: testName,
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
        .where(eq(tests.name, testName));
      console.log(`  Updated test: ${testName}`);
    } else {
      await db.insert(tests).values(testData);
      console.log(`  Inserted test: ${testName}`);
    }
  }

  console.log("Misc seeded.");
}
