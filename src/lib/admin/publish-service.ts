import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { params, ruleSets, rules } from "@/lib/db/schema";
import { getRule, insertPublish, listParams, listTests } from "@/lib/db/queries";
import { runDbTestSuite, dbRuleToDefinition } from "@/lib/engine/test-runner";
import { evaluatePublishGate, summarizeRegressionSuite, transitionRollbackState, type PublishEntityType, type PublishStage } from "./publish-gates";

export type { PublishEntityType, PublishStage } from "./publish-gates";

interface LatestEntity {
  entityType: PublishEntityType;
  entityId: string;
  rowId: number;
  status: string;
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

async function getLatestEntity(
  entityType: PublishEntityType,
  entityId: string,
): Promise<LatestEntity | null> {
  if (entityType === "rule") {
    const rows = await db
      .select({ id: rules.id, status: rules.status, ruleId: rules.ruleId })
      .from(rules)
      .where(eq(rules.ruleId, entityId))
      .orderBy(desc(rules.version))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return {
      entityType,
      entityId: row.ruleId,
      rowId: row.id,
      status: row.status,
    };
  }

  if (entityType === "param") {
    const rows = await db
      .select({ id: params.id, status: params.status, paramId: params.paramId })
      .from(params)
      .where(eq(params.paramId, entityId))
      .orderBy(desc(params.version))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return {
      entityType,
      entityId: row.paramId,
      rowId: row.id,
      status: row.status,
    };
  }

  const rows = await db
    .select({
      id: ruleSets.id,
      status: ruleSets.status,
      ruleSetId: ruleSets.ruleSetId,
    })
    .from(ruleSets)
    .where(eq(ruleSets.ruleSetId, entityId))
    .orderBy(desc(ruleSets.version))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    entityType,
    entityId: row.ruleSetId,
    rowId: row.id,
    status: row.status,
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
  entityId: string,
  fromStage: PublishStage,
  toStage: PublishStage,
): Promise<ReturnType<typeof evaluatePublishGate>> {
  if (fromStage === "draft" && toStage === "staging") {
    if (entityType !== "rule") {
      return evaluatePublishGate({ entityType, fromStage, toStage });
    }

    const rule = await getRule(entityId);
    if (!rule) {
      return evaluatePublishGate({ entityType, fromStage, toStage });
    }
    const parameterRows = await listParams();
    return evaluatePublishGate({ entityType, fromStage, toStage, candidateRule: dbRuleToDefinition(rule), knownParameterIds: parameterRows.map((parameter) => parameter.paramId) });
  }

  if (fromStage === "staging" && toStage === "production") {
    const tests = await listTests(
      entityType === "rule" ? { ruleId: entityId } : undefined,
    );

    const total = tests.length;
    if (total === 0) {
      return evaluatePublishGate({ entityType, fromStage, toStage });
    }

    // 把正在晋升的 staging 规则叠加进有效规则集——getEffectiveRules 只取 published，
    // 而此刻被晋升的规则还是 staging，不叠加门禁就测不到它（或拿旧版本充数）。
    // 注：param / rule_set 晋升暂只跑 published 规则 + 全量用例（见 docs 已知限制）。
    const overrideRules =
      entityType === "rule"
        ? await getRule(entityId).then((r) =>
            r ? [dbRuleToDefinition(r)] : [],
          )
        : [];

    // 重新真实跑一遍回归测试，不信任可能已过期的 lastRunResult。
    let suite: Awaited<ReturnType<typeof runDbTestSuite>>;
    try {
      suite = await runDbTestSuite(
        tests.map((test) => ({
          ruleId: test.ruleId,
          name: test.name,
          input: test.input as Record<string, unknown>,
          paramsOverride: test.paramsOverride as Record<string, unknown> | null,
          expected: test.expected as Record<string, unknown>,
        })),
        { overrideRules },
      );
    } catch (err) {
      return evaluatePublishGate({ entityType, fromStage, toStage, regression: { total, passed: 0, failedTests: [], candidateIncluded: entityType !== "rule", exception: err instanceof Error ? err.message : String(err) } });
    }

    return evaluatePublishGate({
      entityType,
      fromStage,
      toStage,
      regression: summarizeRegressionSuite(suite, entityType, entityId),
    });
  }

  return evaluatePublishGate({ entityType, fromStage, toStage });
}

function nextStageFromCurrent(current: PublishStage): PublishStage | null {
  if (current === "draft") return "staging";
  if (current === "staging") return "production";
  return null;
}

export async function promoteEntity(options: {
  entityType: PublishEntityType;
  entityId: string;
  requestedToStage?: PublishStage | null;
  actor: string;
  reason?: string;
}) {
  const entity = await getLatestEntity(options.entityType, options.entityId);
  if (!entity) {
    throw new PublishServiceError(404, "Entity not found");
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
    throw new PublishServiceError(400, "Current stage cannot be promoted");
  }

  if (options.requestedToStage && options.requestedToStage !== allowedToStage) {
    throw new PublishServiceError(
      400,
      `目标发布阶段无效，应为 ${allowedToStage}`,
    );
  }

  const gateCheck = await checkPromoteGates(
    options.entityType,
    entity.entityId,
    fromStage,
    allowedToStage,
  );

  if (!gateCheck.passed) {
    throw new PublishServiceError(422, gateCheck.reason ?? "Gate check failed", {
      gateResults: {
        passed: false,
        ...gateCheck.results,
      },
    });
  }

  const newStatus = statusFromStage(allowedToStage);
  await updateEntityStatus(options.entityType, entity.rowId, newStatus);

  const publish = await insertPublish({
    entityType: options.entityType,
    entityId: entity.entityId,
    fromStage,
    toStage: allowedToStage,
    actor: options.actor,
    reason: options.reason ?? null,
    gateResults: gateCheck.results,
    diff: null,
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
  entityId: string;
  actor: string;
  reason?: string;
}) {
  const entity = await getLatestEntity(options.entityType, options.entityId);
  if (!entity) {
    throw new PublishServiceError(404, "Entity not found");
  }

  const fromStage = stageFromStatus(entity.status);
  if (!fromStage) {
    throw new PublishServiceError(
      400,
      `不支持的实体状态：${entity.status}`,
    );
  }
  if (!transitionRollbackState(fromStage).allowed) {
    throw new PublishServiceError(400, "只能回滚生产阶段的实体");
  }

  const toStage: PublishStage = "staging";
  await updateEntityStatus(options.entityType, entity.rowId, "staging");

  const publish = await insertPublish({
    entityType: options.entityType,
    entityId: entity.entityId,
    fromStage,
    toStage,
    actor: options.actor,
    reason: options.reason ?? "rollback",
    gateResults: { rollback: true },
    diff: null,
  });

  return {
    fromStage,
    toStage,
    publish,
  };
}
