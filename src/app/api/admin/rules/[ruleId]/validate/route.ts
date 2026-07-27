import { NextRequest, NextResponse } from "next/server";
import { getRule } from "@/lib/db/queries";
import { validateRuleAgainstSchema } from "@/lib/dsl/schema-validator";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ ruleId: string }> },
) {
  try {
    const { ruleId } = await params;
    const rule = await getRule(ruleId);

    if (!rule) {
      return NextResponse.json({ error: "未找到规则" }, { status: 404 });
    }

    const examples = (rule.examples as unknown[]) ?? [];
    // 用 ajv + 完整 DSL JSON-Schema 做结构校验。
    const schemaResult = validateRuleAgainstSchema(rule);

    const checks = [
      {
        name: "schema",
        passed: schemaResult.valid,
        detail: schemaResult.valid
          ? "符合 DSL JSON-Schema"
          : schemaResult.errors.slice(0, 5).join("; ") || "不符合 DSL JSON-Schema",
      },
      {
        name: "examples",
        passed: examples.length > 0,
        detail:
          examples.length > 0
            ? `包含 ${examples.length} 条示例`
            : "至少需要 1 条示例",
      },
    ];

    const valid = checks.every((check) => check.passed);

    return NextResponse.json({
      valid,
      checks,
      errors: valid
        ? []
        : [
            ...(schemaResult.valid ? [] : schemaResult.errors),
            ...checks
              .filter((check) => check.name !== "schema" && !check.passed)
              .map((check) => check.detail),
          ],
    });
  } catch {
    return NextResponse.json(
      { error: "校验规则失败" },
      { status: 500 },
    );
  }
}
