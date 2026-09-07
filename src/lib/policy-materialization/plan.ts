/**
 * NRP-FR-018 / NRP-AC-013 物化计划器（纯函数）：
 * - 仓库资产一律强制draft，不信任文件中的published声明；
 * - CN/粤/川首次业务键v1；上海已有业务键v2（按既有最大版本+1），新业务键v1；
 * - 既有published行永不原地更新（计划只产生INSERT）；
 * - 目标版本与既有行冲突（同地区同键同版本已存在）时拒绝。
 */
import type { PolicyMaterializationManifest, ManifestRegion } from "./manifest";
import { entityContentHash } from "./manifest";
import type { ExistingState } from "./target";

export interface PlannedEntity {
  entityType: "rule" | "param" | "rule_set" | "policy_pack_version";
  jurisdictionCode: string;
  businessKey: string;
  version: number;
  status: "draft";
  operation: string;
  targetBusinessKey: string | null;
  contentHash: string;
  payload: unknown;
}

export interface PlannedRegion {
  jurisdictionCode: string;
  readiness: ManifestRegion["readiness"];
  blockingReasons: string[];
  entities: PlannedEntity[];
  counts: { rules: number; params: number; ruleSets: number; packs: number };
}

export interface MaterializationPlan {
  regions: PlannedRegion[];
  counts: { rules: number; params: number; ruleSets: number; packs: number };
  /** 计划为完全no-op（同manifest已applied）时不构建实体。 */
  existingBatches: Array<{
    jurisdictionCode: string;
    manifestHash: string;
    status: string;
  }>;
}

export class PlanConflictError extends Error {}

/** 版本解析：既有键→最大版本+1；同manifest内重复业务键（多生效窗口条目）→
 * 按出现顺序递增（v1、v2…），避免同键同版本冲突（WI任务2：同param_id多窗口）。 */
function resolveVersion(
  state: ExistingState,
  planned: Map<string, number>,
  jurisdictionCode: string,
  entityType: "rule" | "param" | "rule_set",
  businessKey: string,
): number {
  const key = `${jurisdictionCode}|${businessKey}`;
  const base = state.maxVersions.get(key) ?? 0;
  const next = Math.max(base, planned.get(key) ?? 0) + 1;
  planned.set(key, next);
  return next;
}

function buildEntity(
  entityType: "rule" | "param" | "rule_set",
  jurisdictionCode: string,
  businessKey: string,
  version: number,
  operation: string,
  targetBusinessKey: string | null,
  payload: unknown,
): PlannedEntity {
  return {
    entityType,
    jurisdictionCode,
    businessKey,
    version,
    status: "draft",
    operation,
    targetBusinessKey,
    contentHash: entityContentHash(
      entityType,
      jurisdictionCode,
      businessKey,
      version,
      payload,
    ),
    payload,
  };
}

function planRule(
  region: ManifestRegion,
  rule: ManifestRegion["rules"][number],
  state: ExistingState,
  planned: Map<string, number>,
): PlannedEntity {
  const version = resolveVersion(state, planned, region.jurisdictionCode, "rule", rule.businessKey);
  const payload = rule.payload as {
    operation?: unknown;
    target_business_key?: unknown;
    decision_table?: unknown;
  };
  const operation =
    typeof payload.operation === "string" ? payload.operation : "add";
  const targetBusinessKey =
    typeof payload.target_business_key === "string"
      ? payload.target_business_key
      : null;
  return buildEntity(
    "rule",
    region.jurisdictionCode,
    rule.businessKey,
    version,
    operation,
    targetBusinessKey,
    payload,
  );
}

function planParam(
  region: ManifestRegion,
  param: ManifestRegion["params"][number],
  state: ExistingState,
  planned: Map<string, number>,
): PlannedEntity {
  const version = resolveVersion(state, planned, region.jurisdictionCode, "param", param.businessKey);
  const payload = param.payload as {
    operation?: unknown;
    target_business_key?: unknown;
  };
  const operation =
    typeof payload.operation === "string" ? payload.operation : "add";
  const targetBusinessKey =
    typeof payload.target_business_key === "string"
      ? payload.target_business_key
      : null;
  return buildEntity(
    "param",
    region.jurisdictionCode,
    param.businessKey,
    version,
    operation,
    targetBusinessKey,
    payload,
  );
}

function planRuleSet(
  region: ManifestRegion,
  ruleSetPayload: Record<string, unknown> | null,
  state: ExistingState,
  planned: Map<string, number>,
): PlannedEntity | null {
  if (!ruleSetPayload) return null;
  const ruleSetId = ruleSetPayload.rule_set_id as string;
  const version = resolveVersion(state, planned, region.jurisdictionCode, "rule_set", ruleSetId);
  const operation =
    typeof ruleSetPayload.operation === "string" ? ruleSetPayload.operation : "add";
  const targetBusinessKey =
    typeof ruleSetPayload.target_business_key === "string"
      ? ruleSetPayload.target_business_key
      : null;
  return buildEntity(
    "rule_set",
    region.jurisdictionCode,
    ruleSetId,
    version,
    operation,
    targetBusinessKey,
    ruleSetPayload,
  );
}

/** NRP-FR-020（审查缺陷4）：参数快照载荷——全部参数的实际内容：
 * paramId/businessKey、原始type、value或rows、key_fields、value_fields、
 * unit、effective窗口、operation、目标业务键、evidence与内容哈希。 */
export function buildPackSnapshotPayload(
  region: ManifestRegion,
): Array<Record<string, unknown>> {
  return region.params.map((p) => {
    const payload = p.payload as Record<string, unknown>;
    return {
      paramId: p.businessKey,
      businessKey: p.businessKey,
      type: payload.type ?? (p.kind === "table" ? "table" : "number"),
      // 标量保存value；table/timeline保存rows；array保存value（同为数组）。
      value: payload.value ?? null,
      rows: payload.rows ?? null,
      key_fields: payload.key_fields ?? null,
      value_fields: payload.value_fields ?? null,
      unit: payload.unit ?? null,
      effective_from: payload.effective_from ?? null,
      effective_to: payload.effective_to ?? null,
      operation:
        typeof payload.operation === "string" ? payload.operation : "add",
      target_business_key:
        typeof payload.target_business_key === "string"
          ? payload.target_business_key
          : null,
      evidence: payload.evidence ?? [],
      contentHash: p.contentHash,
    };
  });
}

function planPack(
  region: ManifestRegion,
  state: ExistingState,
): PlannedEntity {
  const packKey = `${region.jurisdictionCode}|${region.packId}`;
  const existing = state.packVersions.get(packKey);
  const version = existing === undefined ? 1 : existing + 1;
  const paramSnapshot = buildPackSnapshotPayload(region);
  return {
    entityType: "policy_pack_version",
    jurisdictionCode: region.jurisdictionCode,
    businessKey: region.packId,
    version,
    status: "draft",
    operation: region.jurisdictionCode === "CN" ? "baseline" : "add",
    targetBusinessKey: null,
    contentHash: entityContentHash(
      "policy_pack_version",
      region.jurisdictionCode,
      region.packId,
      version,
      paramSnapshot,
    ),
    payload: paramSnapshot,
  };
}

/**
 * 构建四地区物化计划。existingBatches非空时调用方应视为幂等no-op。
 */
export function buildPlan(
  manifest: PolicyMaterializationManifest,
  state: ExistingState,
  existingBatches: MaterializationPlan["existingBatches"],
): MaterializationPlan {
  const regions: PlannedRegion[] = manifest.regions.map((region) => {
    const entities: PlannedEntity[] = [];
    // 本manifest内已分配版本（同键多窗口条目顺序递增）。
    const plannedVersions = new Map<string, number>();

    for (const rule of region.rules) {
      entities.push(planRule(region, rule, state, plannedVersions));
    }
    for (const param of region.params) {
      entities.push(planParam(region, param, state, plannedVersions));
    }
    if (region.ruleSetFile !== null && region.ruleSetPayload) {
      const entity = planRuleSet(region, region.ruleSetPayload, state, plannedVersions);
      if (entity) entities.push(entity);
    }
    entities.push(planPack(region, state));

    // 目标版本冲突防护：同地区同键同版本不允许重复物化。
    const seen = new Set<string>();
    for (const e of entities) {
      const key = `${e.entityType}|${e.jurisdictionCode}|${e.businessKey}|${e.version}`;
      if (seen.has(key)) {
        throw new PlanConflictError(`[plan] 目标版本冲突：${key}`);
      }
      seen.add(key);
    }

    return {
      jurisdictionCode: region.jurisdictionCode,
      readiness: region.readiness,
      blockingReasons: region.blockingReasons,
      entities,
      counts: {
        rules: entities.filter((e) => e.entityType === "rule").length,
        params: entities.filter((e) => e.entityType === "param").length,
        ruleSets: entities.filter((e) => e.entityType === "rule_set").length,
        packs: entities.filter((e) => e.entityType === "policy_pack_version").length,
      },
    };
  });

  return {
    regions,
    counts: {
      rules: regions.reduce((n, r) => n + r.counts.rules, 0),
      params: regions.reduce((n, r) => n + r.counts.params, 0),
      ruleSets: regions.reduce((n, r) => n + r.counts.ruleSets, 0),
      packs: regions.reduce((n, r) => n + r.counts.packs, 0),
    },
    existingBatches,
  };
}
