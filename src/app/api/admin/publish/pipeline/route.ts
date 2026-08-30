import { rulesReads } from "@/server/modules/rules/application";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface PipelineEntity {
  entityType: string;
  entityId: string;
  status: string;
  version: number;
  updatedAt: string;
}

interface Pipeline {
  draft: PipelineEntity[];
  staging: PipelineEntity[];
  prod: PipelineEntity[];
}

function toStage(status: string): keyof Pipeline | null {
  if (status === "published") return "prod";
  if (status === "staging") return "staging";
  if (status === "draft") return "draft";
  return null;
}

function dedupeLatest<T extends { version: number }>(
  rows: T[],
  keySelector: (row: T) => string,
): T[] {
  const map = new Map<string, T>();

  for (const row of rows) {
    const key = keySelector(row);
    const existing = map.get(key);
    if (!existing || row.version >= existing.version) {
      map.set(key, row);
    }
  }

  return Array.from(map.values());
}

export async function GET() {
  try {
    const [rules, params, ruleSets] = await Promise.all([
      rulesReads.listRules(),
      rulesReads.listParams(),
      rulesReads.listRuleSets(),
    ]);

    const pipeline: Pipeline = {
      draft: [],
      staging: [],
      prod: [],
    };

    for (const rule of dedupeLatest(rules, (row) => row.ruleId)) {
      const stage = toStage(rule.status);
      if (!stage) continue;
      pipeline[stage].push({
        entityType: "rule",
        entityId: rule.ruleId,
        status: rule.status,
        version: rule.version,
        updatedAt: rule.updatedAt.toISOString(),
      });
    }

    for (const param of dedupeLatest(params, (row) => row.paramId)) {
      const stage = toStage(param.status);
      if (!stage) continue;
      pipeline[stage].push({
        entityType: "param",
        entityId: param.paramId,
        status: param.status,
        version: param.version,
        updatedAt: param.updatedAt.toISOString(),
      });
    }

    for (const ruleSet of dedupeLatest(ruleSets, (row) => row.ruleSetId)) {
      const stage = toStage(ruleSet.status);
      if (!stage) continue;
      pipeline[stage].push({
        entityType: "rule_set",
        entityId: ruleSet.ruleSetId,
        status: ruleSet.status,
        version: ruleSet.version,
        updatedAt: ruleSet.updatedAt.toISOString(),
      });
    }

    pipeline.draft.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    pipeline.staging.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    pipeline.prod.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return NextResponse.json(pipeline);
  } catch {
    return NextResponse.json(
      { error: "加载发布流水线失败" },
      { status: 500 },
    );
  }
}
