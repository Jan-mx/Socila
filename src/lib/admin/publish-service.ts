import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { params, policyPackVersions, ruleSets, rules } from "@/lib/db/schema";
import { rulesReads } from "@/server/modules/rules/application";
import type { RuleRow } from "@/server/modules/rules/application/ports";
import { publishWrites } from "@/server/modules/publishing/application";
import { validateRuleAgainstSchema } from "@/lib/dsl/schema-validator";
import { runDbTestSuite, runTestSuite, dbRuleToDefinition } from "@/lib/engine/test-runner";
import { isJurisdictionBlocked } from "@/lib/policy-materialization/materialize";

export type PublishEntityType = "rule" | "param" | "rule_set";
export type PublishStage = "draft" | "staging" | "production";

interface GateCheckResult {
  passed: boolean;
  reason?: string;
  results: Record<string, unknown>;
}

interface ExactEntity {
  entityType: PublishEntityType;
  entityId: string;
  rowId: number;
  status: string;
  jurisdictionCode: string;
  version: number;
}

export class PublishServiceError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function normalizeStageInput(stage: string | undefined): PublishStage | null {
  if (!stage) return null;
  if (stage === "draft") return "draft";
  if (stage === "staging") return "staging";
  if (stage === "prod" || stage === "production") return "production";
  return null;
}

function stageFromStatus(status: string): PublishStage | null {
  if (status === "published") return "production";
  if (status === "staging") return "staging";
  if (status === "draft") return "draft";
  return null;
}

function statusFromStage(stage: PublishStage): string {
  if (stage === "production") return "published";
  return stage;
}

/** DSL examples回归载体（任务2批准）：单规则引擎执行该规则的权威示例，
 * 参数基线=该地区参数包的published有效参数（与golden测试同构）；CN/GD规则
 * 在tests表无归属测试时使用，不落tests表、不改变固定计数。 */
async function runExamplesGate(
  exactRule: RuleRow,
  jurisdictionCode: string,
): Promise<Awaited<ReturnType<typeof runTestSuite>>> {
  const examples = (exactRule.examples as unknown[]) ?? [];
  const packRows = await db
    .select({ packId: policyPackVersions.policyPackId })
    .from(policyPackVersions)
    .where(eq(policyPackVersions.jurisdictionCode, jurisdictionCode))
    .limit(1);
  const packId = packRows[0]?.packId ?? null;
  const regionalParams = packId
    ? await rulesReads.getEffectiveParams(
        packId,
        new Date().toISOString().split("T")[0],
      )
    : [];
  const baseParams: Record<string, unknown> = {};
  for (const p of regionalParams) {
    baseParams[p.paramId] =
      p.type === "table" || p.type === "timeline" ? (p.rows ?? []) : p.value;
  }
  return runTestSuite(
    examples.map((ex) => {
      const entry = ex as {
        name?: string;
        input?: Record<string, unknown>;
        expected?: Record<string, unknown>;
      };
      return {
        rule_id: exactRule.ruleId,
        name: entry.name ?? exactRule.ruleId,
        input: entry.input ?? {},
        params_override: null,
        expected: entry.expected ?? {},
      };
    }),
    [dbRuleToDefinition(exactRule)],
    baseParams,
  );
}

export interface ExactLocator {
  entityType: PublishEntityType;
  jurisdictionCode: string;
  entityId: string;
  version: number;
}

/**
 * NRP-FR-021：以jurisdiction_code+entity_id+version精确定位实体版本，
 * 不按同名rule_id/param_id猜测地区。
 */
async function getExactEntity(
  locator: ExactLocator,
): Promise<ExactEntity | null> {
  if (locator.entityType === "rule") {
    const rows = await db
      .select({
        id: rules.id,
        status: rules.status,
        ruleId: rules.ruleId,
        jurisdictionCode: rules.jurisdictionCode,
        version: rules.version,
      })
      .from(rules)
      .where(
        and(
          eq(rules.ruleId, locator.entityId),
          eq(rules.jurisdictionCode, locator.jurisdictionCode),
          eq(rules.version, locator.version),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      entityType: locator.entityType,
      entityId: row.ruleId,
      rowId: row.id,
      status: row.status,
      jurisdictionCode: row.jurisdictionCode ?? locator.jurisdictionCode,
      version: row.version,
    };
  }

  if (locator.entityType === "param") {
    const rows = await db
      .select({
        id: params.id,
        status: params.status,
        paramId: params.paramId,
        jurisdictionCode: params.jurisdictionCode,
        version: params.version,
      })
      .from(params)
      .where(
        and(
          eq(params.paramId, locator.entityId),
          eq(params.jurisdictionCode, locator.jurisdictionCode),
          eq(params.version, locator.version),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      entityType: locator.entityType,
      entityId: row.paramId,
      rowId: row.id,
      status: row.status,
      jurisdictionCode: row.jurisdictionCode ?? locator.jurisdictionCode,
      version: row.version,
    };
  }

  const rows = await db
    .select({
      id: ruleSets.id,
      status: ruleSets.status,
      ruleSetId: ruleSets.ruleSetId,
      jurisdictionCode: ruleSets.jurisdictionCode,
      version: ruleSets.version,
    })
    .from(ruleSets)
    .where(
      and(
        eq(ruleSets.ruleSetId, locator.entityId),
        eq(ruleSets.jurisdictionCode, locator.jurisdictionCode),
        eq(ruleSets.version, locator.version),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    entityType: locator.entityType,
    entityId: row.ruleSetId,
    rowId: row.id,
    status: row.status,
    jurisdictionCode: row.jurisdictionCode ?? locator.jurisdictionCode,
    version: row.version,
  };
}

async function updateEntityStatus(
  entityType: PublishEntityType,
  rowId: number,
  status: string,
): Promise<void> {
  if (entityType === "rule") {
    await db.update(rules).set({ status }).where(eq(rules.id, rowId));
    return;
  }

  if (entityType === "param") {
    await db.update(params).set({ status }).where(eq(params.id, rowId));
    return;
  }

  await db.update(ruleSets).set({ status }).where(eq(ruleSets.id, rowId));
}

async function checkPromoteGates(
  entityType: PublishEntityType,
  jurisdictionCode: string,
  fromStage: PublishStage,
  toStage: PublishStage,
  exactRule?: RuleRow | null,
): Promise<GateCheckResult> {
  if (fromStage === "draft" && toStage === "staging") {
    if (entityType !== "rule") {
      return {
        passed: true,
        results: {
          checks: [{ name: "draft_to_staging", passed: true }],
        },
      };
    }

    const rule = exactRule ?? null;
    if (!rule) {
      return {
        passed: false,
        reason: "未找到规则",
        results: { checks: [{ name: "rule_exists", passed: false }] },
      };
    }

    const examples = (rule.examples as unknown[]) ?? [];
    // 用 ajv + 完整 DSL JSON-Schema 做结构校验（替代此前仅检查 ruleId/name/rows 的浅检查）。
    const schemaResult = validateRuleAgainstSchema(rule);
    const schemaValid = schemaResult.valid;
    // restrict/exempt overlay元数据规则无决策行为（NRP-FR-007），不要求examples。
    const isOverlayMeta = rule.operation === "restrict" || rule.operation === "exempt";
    const examplesValid = examples.length > 0 || isOverlayMeta;

    if (!schemaValid || !examplesValid) {
      return {
        passed: false,
        reason: schemaValid
          ? "Examples check failed"
          : `Schema validation failed: ${schemaResult.errors.slice(0, 3).join("; ")}`,
        results: {
          checks: [
            {
              name: "schema",
              passed: schemaValid,
              detail: schemaResult.errors.slice(0, 5).join("; ") || undefined,
            },
            { name: "examples", passed: examplesValid },
          ],
          schema_valid: schemaValid,
          schema_errors: schemaResult.errors.slice(0, 10),
          examples_valid: examplesValid,
        },
      };
    }

    return {
      passed: true,
      results: {
        checks: [
          { name: "schema", passed: true },
          { name: "examples", passed: true },
        ],
      },
    };
  }

  if (fromStage === "staging" && toStage === "production") {
    // restrict/exempt overlay元数据规则无决策行为（NRP-FR-007），发布无需回归载体。
    if (
      exactRule &&
      (exactRule.operation === "restrict" || exactRule.operation === "exempt")
    ) {
      return {
        passed: true,
        results: {
          checks: [
            { name: "schema", passed: true },
            { name: "examples", passed: true },
            { name: "regression", passed: true, detail: "overlay元数据规则无决策行为" },
          ],
        },
      };
    }
    // 审查缺陷10（任务2批准）：规则晋级只认本地区（含CN继承链）的归属测试，
    // 不得拿上海测试充数；参数/规则集晋级跑全量回归（发布不影响既有规划，
    // 全量是安全载体）。
    const tests = await rulesReads.listTests(
      entityType === "rule"
        ? {
            ruleId: exactRule?.ruleId,
            jurisdictionCodes: [jurisdictionCode],
          }
        : undefined,
    );

    // CN/GD规则在tests表无归属测试（tests=528为上海载体，固定计数不可变）：
    // 用该规则的DSL examples作为权威回归载体（examples经golden测试验证，
    // 不落tests表、不改变固定计数）。无tests且无examples → 拒绝。
    const examples =
      entityType === "rule" && exactRule
        ? ((exactRule.examples as unknown[]) ?? [])
        : [];

    if (tests.length === 0 && examples.length === 0) {
      return {
        passed: false,
        reason: "未找到回归测试",
        results: {
          checks: [{ name: "regression", passed: false, detail: "没有可运行的测试" }],
          total: 0,
          passed: 0,
          pass_rate: 0,
        },
      };
    }

    // 把正在晋升的 staging 规则叠加进有效规则集——getEffectiveRules 只取 published，
    // 而此刻被晋升的规则还是 staging，不叠加门禁就测不到它（或拿旧版本充数）。
    const overrideRules =
      entityType === "rule" && exactRule ? [dbRuleToDefinition(exactRule)] : [];

    // 重新真实跑一遍回归测试，不信任可能已过期的 lastRunResult。
    let suite: Awaited<ReturnType<typeof runDbTestSuite>>;
    try {
      suite =
        tests.length > 0
          ? await runDbTestSuite(
              tests.map((test) => ({
                ruleId: test.ruleId,
                name: test.name,
                input: test.input as Record<string, unknown>,
                paramsOverride: test.paramsOverride as Record<string, unknown> | null,
                expected: test.expected as Record<string, unknown>,
              })),
              { overrideRules },
            )
          : await runExamplesGate(exactRule!, jurisdictionCode);
    } catch (err) {
      return {
        passed: false,
        reason: `回归测试运行失败：${err instanceof Error ? err.message : String(err)}`,
        results: {
          checks: [{ name: "regression", passed: false, detail: "运行出错" }],
          total: tests.length || examples.length,
          passed: 0,
          pass_rate: 0,
        },
      };
    }

    const total = suite.total;
    const passed = suite.passed;
    const passRate = suite.pass_rate;
    const failedNames = suite.results
      .filter((r) => !r.pass)
      .map((r) => r.name);

    if (passRate < 0.8) {
      return {
        passed: false,
        reason: `Regression pass rate ${(passRate * 100).toFixed(1)}% is below 80% threshold`,
        results: {
          checks: [
            {
              name: "regression",
              passed: false,
              detail: `通过率 ${(passRate * 100).toFixed(1)}%，低于 80%`,
            },
          ],
          total,
          passed,
          pass_rate: passRate,
          failed_tests: failedNames.slice(0, 10),
        },
      };
    }

    return {
      passed: true,
      results: {
        checks: [
          {
            name: "regression",
            passed: true,
            detail: `通过率 ${(passRate * 100).toFixed(1)}%（重新运行 ${total} 个测试）`,
          },
        ],
        total,
        passed,
        pass_rate: passRate,
        failed_tests: failedNames.slice(0, 10),
      },
    };
  }

  return {
    passed: false,
    reason: "不支持此发布阶段转换",
    results: {
      checks: [{ name: "transition", passed: false }],
    },
  };
}

function nextStageFromCurrent(current: PublishStage): PublishStage | null {
  if (current === "draft") return "staging";
  if (current === "staging") return "production";
  return null;
}

function assertExactIdentity(options: {
  jurisdictionCode?: string;
  entityId?: string;
  version?: number;
}): void {
  if (
    !options.jurisdictionCode ||
    !options.entityId ||
    !Number.isInteger(options.version) ||
    (options.version ?? 0) < 1
  ) {
    throw new PublishServiceError(
      400,
      "缺少精确实体身份（entity_type/jurisdiction_code/entity_id/version，NRP-FR-021）",
    );
  }
}

export async function promoteEntity(options: {
  entityType: PublishEntityType;
  jurisdictionCode: string;
  entityId: string;
  version: number;
  requestedToStage?: PublishStage | null;
  actor: string;
  reason?: string;
}) {
  assertExactIdentity(options);

  const entity = await getExactEntity(options);
  if (!entity) {
    throw new PublishServiceError(
      404,
      "未找到该地区与版本的实体（NRP-FR-021精确身份定位）",
    );
  }

  // NRP-FR-022：blocked地区的实体不得晋级或发布。
  if (await isJurisdictionBlocked(entity.jurisdictionCode)) {
    throw new PublishServiceError(
      422,
      "该地区存在政策覆盖缺口（blocked），实体不得晋级或发布",
    );
  }

  const fromStage = stageFromStatus(entity.status);
  if (!fromStage) {
    throw new PublishServiceError(
      400,
      `不支持的实体状态：${entity.status}`,
    );
  }
  const allowedToStage = nextStageFromCurrent(fromStage);

  if (!allowedToStage) {
    throw new PublishServiceError(400, "当前阶段无法晋级");
  }

  if (options.requestedToStage && options.requestedToStage !== allowedToStage) {
    throw new PublishServiceError(
      400,
      `目标发布阶段无效，应为 ${allowedToStage}`,
    );
  }

  const exactRule =
    options.entityType === "rule"
      ? await rulesReads.getRuleExact({
          ruleId: entity.entityId,
          jurisdictionCode: entity.jurisdictionCode,
          version: entity.version,
        })
      : null;

  const gateCheck = await checkPromoteGates(
    options.entityType,
    entity.jurisdictionCode,
    fromStage,
    allowedToStage,
    exactRule,
  );

  if (!gateCheck.passed) {
    throw new PublishServiceError(422, gateCheck.reason ?? "门禁检查未通过", {
      gateResults: {
        passed: false,
        ...gateCheck.results,
      },
    });
  }

  const newStatus = statusFromStage(allowedToStage);
  await updateEntityStatus(options.entityType, entity.rowId, newStatus);

  const publish = await publishWrites.insertPublish({
    entityType: options.entityType,
    entityId: entity.entityId,
    fromStage,
    toStage: allowedToStage,
    actor: options.actor,
    reason: options.reason ?? null,
    gateResults: gateCheck.results,
    diff: null,
    jurisdictionCode: entity.jurisdictionCode,
    entityVersion: entity.version,
  });

  return {
    fromStage,
    toStage: allowedToStage,
    newStatus,
    publish,
    gateResults: {
      passed: true,
      ...gateCheck.results,
    },
  };
}

export async function rollbackEntity(options: {
  entityType: PublishEntityType;
  jurisdictionCode: string;
  entityId: string;
  version: number;
  actor: string;
  reason?: string;
}) {
  assertExactIdentity(options);

  const entity = await getExactEntity(options);
  if (!entity) {
    throw new PublishServiceError(
      404,
      "未找到该地区与版本的实体（NRP-FR-021精确身份定位）",
    );
  }

  const fromStage = stageFromStatus(entity.status);
  if (!fromStage) {
    throw new PublishServiceError(
      400,
      `不支持的实体状态：${entity.status}`,
    );
  }
  if (fromStage !== "production") {
    throw new PublishServiceError(400, "只能回滚生产阶段的实体");
  }

  const toStage: PublishStage = "staging";
  await updateEntityStatus(options.entityType, entity.rowId, "staging");

  const publish = await publishWrites.insertPublish({
    entityType: options.entityType,
    entityId: entity.entityId,
    fromStage,
    toStage,
    actor: options.actor,
    reason: options.reason ?? "rollback",
    gateResults: { rollback: true },
    diff: null,
    jurisdictionCode: entity.jurisdictionCode,
    entityVersion: entity.version,
  });

  return {
    fromStage,
    toStage,
    publish,
  };
}
