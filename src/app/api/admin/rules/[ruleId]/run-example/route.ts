import { rulesReads } from "@/server/modules/rules/application";
import { NextRequest, NextResponse } from "next/server";
import { runTestCase } from "@/lib/engine/test-runner";
import type { RuleDefinition } from "@/types/engine";

export const dynamic = "force-dynamic";

interface ExampleInput {
  name: string;
  input: Record<string, unknown>;
  params?: Record<string, unknown>;
  expected: Record<string, unknown>;
}

function normalizeRuleStatus(status: string): RuleDefinition["status"] | null {
  if (status === "published") return "published";
  if (status === "retired") return "retired";
  if (status === "draft") return "draft";
  return null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  try {
    const { ruleId } = await params;
    const body = (await req.json()) as { example?: ExampleInput };

    if (!body.example) {
      return NextResponse.json(
        { error: "缺少示例数据" },
        { status: 400 },
      );
    }

    const rule = await rulesReads.getRule(ruleId);
    if (!rule) {
      return NextResponse.json({ error: "未找到规则" }, { status: 404 });
    }
    const normalizedStatus = normalizeRuleStatus(rule.status);
    if (!normalizedStatus) {
      return NextResponse.json(
        { error: `不支持的规则状态：${rule.status}` },
        { status: 400 },
      );
    }

    const asOfDate = new Date().toISOString().slice(0, 10);
    const paramsRows = await rulesReads.getEffectiveParams("SHANGHAI_BASE", asOfDate);
    const baseParams: Record<string, unknown> = {};

    for (const p of paramsRows) {
      if (p.type === "scalar") {
        baseParams[p.paramId] = p.value;
      } else if (p.type === "table" || p.type === "timeline") {
        baseParams[p.paramId] = p.rows;
      }
    }

    const ruleDef: RuleDefinition = {
      dsl_version: rule.dslVersion,
      rule_id: rule.ruleId,
      name: rule.name,
      module: rule.module,
      status: normalizedStatus,
      priority: rule.priority,
      effective_from: rule.effectiveFrom,
      effective_to: rule.effectiveTo,
      supersedes: (rule.supersedes as string[]) ?? [],
      notes: rule.notes ?? undefined,
      inputs: (rule.inputs as RuleDefinition["inputs"]) ?? [],
      parameter_refs:
        (rule.parameterRefs as RuleDefinition["parameter_refs"]) ?? [],
      decision_table:
        (rule.decisionTable as RuleDefinition["decision_table"]) ?? {
          hit_policy: "first",
          rows: [],
        },
      outputs: (rule.outputs as RuleDefinition["outputs"]) ?? [],
      examples: (rule.examples as RuleDefinition["examples"]) ?? [],
      evidence: (rule.evidence as RuleDefinition["evidence"]) ?? [],
    };

    const example = body.example;
    const result = runTestCase(
      {
        rule_id: rule.ruleId,
        name: example.name,
        input: example.input,
        params_override: example.params ?? null,
        expected: example.expected,
      },
      [ruleDef],
      baseParams,
    );

    return NextResponse.json({
      name: example.name,
      passed: result.pass,
      actual: result.actual,
      diff: result.diff,
      error: result.pass ? undefined : "示例断言失败",
    });
  } catch {
    return NextResponse.json(
      { error: "运行示例失败" },
      { status: 500 },
    );
  }
}
