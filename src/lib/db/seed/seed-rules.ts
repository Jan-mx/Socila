import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { rules } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const RULES_DIR = path.join(process.cwd(), "dsl/ssp_dsl_v1/rules");

interface RuleFile {
  dsl_version: string;
  rule_id: string;
  name: string;
  module?: string;
  status: string;
  priority: number;
  effective_from: string;
  effective_to?: string | null;
  supersedes?: string[];
  notes?: string;
  inputs: unknown[];
  parameter_refs: unknown[];
  decision_table: unknown;
  outputs: unknown[];
  examples: unknown[];
  evidence?: unknown[];
}

export async function seedRules() {
  const files = fs
    .readdirSync(RULES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();

  console.log(`Seeding ${files.length} rules...`);

  for (const file of files) {
    const filePath = path.join(RULES_DIR, file);
    const raw = fs.readFileSync(filePath, "utf-8");
    const rule: RuleFile = JSON.parse(raw);

    const existing = await db
      .select({ id: rules.id })
      .from(rules)
      .where(and(eq(rules.ruleId, rule.rule_id), eq(rules.version, 1)))
      .limit(1);

    const data = {
      ruleId: rule.rule_id,
      name: rule.name,
      module: rule.module ?? "",
      dslVersion: rule.dsl_version,
      priority: rule.priority,
      status: rule.status,
      effectiveFrom: rule.effective_from,
      effectiveTo: rule.effective_to ?? null,
      supersedes: rule.supersedes ?? [],
      inputs: rule.inputs,
      parameterRefs: rule.parameter_refs,
      decisionTable: rule.decision_table as Record<string, unknown>,
      outputs: rule.outputs,
      examples: rule.examples,
      evidence: rule.evidence ?? [],
      notes: rule.notes ?? null,
      version: 1,
    };

    if (existing.length > 0) {
      await db
        .update(rules)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(rules.ruleId, rule.rule_id), eq(rules.version, 1)));
      console.log(`  Updated rule: ${rule.rule_id}`);
    } else {
      await db.insert(rules).values(data);
      console.log(`  Inserted rule: ${rule.rule_id}`);
    }
  }

  console.log("Rules seeded.");
}
