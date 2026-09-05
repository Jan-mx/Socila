import fs from "fs";
import { db } from "@/lib/db";
import { rules } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { CANONICAL_DSL_VERSION, type DiscoveredRegion } from "@/lib/dsl/region-manifest";

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

/**
 * 按地区Manifest装载规则（SDL-FR-004）：规则文件、地区代码全部来自
 * DiscoveredRegion，装载器不硬编码地区目录或行政区划。
 */
export async function seedRules(region: DiscoveredRegion) {
  const jurisdictionCode = region.manifest.jurisdiction_code;

  console.log(
    `Seeding ${region.ruleFiles.length} rules for ${region.manifest.region_slug} (${jurisdictionCode})...`,
  );

  for (const ruleFile of region.ruleFiles) {
    const rule = JSON.parse(fs.readFileSync(ruleFile.absolutePath, "utf-8")) as RuleFile;
    if (rule.rule_id !== ruleFile.ruleId) {
      throw new Error(
        `规则文件 ${ruleFile.fileName} 的 rule_id 与 Manifest 不一致（${rule.rule_id} != ${ruleFile.ruleId}）`,
      );
    }
    if (rule.dsl_version !== CANONICAL_DSL_VERSION) {
      throw new Error(
        `规则 ${rule.rule_id} 的 dsl_version 不是规范值 ${CANONICAL_DSL_VERSION}`,
      );
    }

    const existing = await db
      .select({ id: rules.id })
      .from(rules)
      .where(and(eq(rules.ruleId, rule.rule_id), eq(rules.version, 1)))
      .limit(1);

    const data = {
      ruleId: rule.rule_id,
      jurisdictionCode,
      businessKey: rule.rule_id,
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
