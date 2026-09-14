/**
 * 任务3（JRP-FR-001～004/009/011/018、JRP-NFR-001/003/008/009）：
 * 地区感知规划核心用例 `computeJurisdictionPlan`。
 *
 * 唯一规划入口语义：
 *   用户选择/确认地区 → 服务端校验地区树 → 校验会话画像一致性（聊天场景）
 *   → 查询地区规划发布记录 → 验证 active 与门禁 → 读取不可变 PolicySnapshot
 *   → 从快照成员还原有序规则与参数 → 快照驱动确定性执行 → 保存 plan 及
 *   地区/继承链/快照留痕 → 返回结果与可复核 meta。
 *
 * 依赖全部经端口注入：单元测试零数据库依赖（JRP-NFR-007）。
 * 广东能力级缺参（2030年前医保退休地市年限）不是本用例错误：沿用现有
 * needs_agent/questions/warnings 契约（JRP-FR-020/NFR-009）。
 */
import {
  orchestrateSnapshot,
  type OrchestratorResult,
  type SnapshotParamRow,
  type SnapshotRuleRow,
  type SnapshotRuleSetRow,
} from "@/lib/engine/orchestrator";
import { extractNeedsAgent } from "@/lib/engine/calc-extractors";
import { normalizeClaimCityCode } from "./claim-city";
import {
  canonicalMemberHash,
  RELEASE_GATE_KEYS,
} from "@/server/modules/publishing/application/release-gates";
import type { PlanningWriteRepository } from "./write-ports";
import {
  JurisdictionContextMismatchError,
  JurisdictionInvalidError,
  JurisdictionRequiredError,
  JurisdictionUnsupportedError,
  PolicyConflictError,
  PolicySnapshotUnavailableError,
  PolicyStoreUnavailableError,
} from "./stable-errors";

export {
  JurisdictionContextMismatchError,
  JurisdictionInvalidError,
  JurisdictionRequiredError,
  JurisdictionUnsupportedError,
  PolicyConflictError,
  PolicySnapshotUnavailableError,
  PolicyStoreUnavailableError,
};

/** 快照成员形状（policy_snapshot_members 行）。 */
export interface SnapshotMemberRow {
  entityType: "rule" | "param" | "rule_set";
  businessKey: string;
  payload: Record<string, unknown>;
  provenance: unknown;
}

export interface SnapshotWithMembers {
  snapshot: {
    id: string;
    jurisdictionCode: string;
    asOfDate: string;
    resolvedPath: string;
    contentHash: string;
    createdBy: string;
  };
  members: SnapshotMemberRow[];
}

export interface PlanningReleaseRow {
  id: number;
  jurisdictionCode: string;
  activeSnapshotId: string | null;
  status: "inactive" | "active";
  gateResults: Record<string, unknown>;
  activatedAt: Date | null;
  activatedBy: string | null;
  /** JRP-FR-024：区间列（0017）；null 兼容历史行（未迁移/未启用区间语义）。 */
  effectiveFrom?: string | Date | null;
  effectiveTo?: string | Date | null;
  updatedAt: Date;
}

export interface ComputeJurisdictionPlanInput {
  user: Record<string, unknown>;
  /** 必填地区代码（JRP-FR-001）。 */
  jurisdictionCode: string;
  asOfDate?: string;
  /** 是否落库（默认 true）。 */
  persist?: boolean;
  /** 归属用户 id（09-02）：持久化时必须提供。 */
  ownerUserId?: string;
  /**
   * 聊天场景：会话画像中的已确认地区代码（JRP-FR-018）。
   * 提供时必须与请求地区一致；缺失或不一致均拒绝计算（JRP-NFR-008）。
   * 直接规划入口不传本字段。
   */
  confirmedJurisdictionCode?: string;
}

export interface ComputeJurisdictionPlanDeps {
  /** 地区树链解析：未知/禁用/树损坏 → 抛 JurisdictionInvalidError 或等价错误。 */
  resolveChain: (
    code: string,
  ) => Promise<Array<{ code: string; name: string; level: string; path: string }>>;
  /**
   * 地区规划发布记录查询（JRP-FR-005/024）：按地区和 as_of_date 唯一匹配
   * 覆盖该日期的 active 区间；恰好一个返回，多匹配必须抛错（fail-closed）。
   */
  getActiveRelease: (
    code: string,
    asOfDate: string,
  ) => Promise<PlanningReleaseRow | null>;
  /** 地区是否存在任何发布记录（区分 unsupported 与日期无匹配，JRP-FR-004）。 */
  hasAnyRelease: (code: string) => Promise<boolean>;
  /** 活动快照读取（含成员，JRP-FR-004）。 */
  getSnapshot: (snapshotId: string) => Promise<SnapshotWithMembers | null>;
  /** 地区未解决冲突列表（JRP-AC-007）。 */
  listOpenConflicts: (code: string) => Promise<unknown[]>;
  /** 引擎执行（默认快照驱动编排器；允许同步或异步实现）。 */
  runEngine?: (
    input: Parameters<typeof orchestrateSnapshot>[0],
  ) => OrchestratorResult | Promise<OrchestratorResult>;
  savePlan?: PlanningWriteRepository["savePlan"];
}

function defaultAsOfDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 统一 format：Date 或 'YYYY-MM-DD' → 'YYYY-MM-DD'（区间比较用）。 */
function formatDateValue(value: string | Date): string {
  if (value instanceof Date) {
    const iso = value.toISOString().slice(0, 10);
    return iso;
  }
  return String(value).slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * 执行地区感知规划（JRP 唯一入口）。
 */
export async function computeJurisdictionPlan(
  input: ComputeJurisdictionPlanInput,
  deps: ComputeJurisdictionPlanDeps,
): Promise<{
  planId: string | null;
  needsAgent: boolean;
  questions: unknown[];
  warnings: string[];
  caveats: unknown[];
  plan: Record<string, unknown>;
  calc: Record<string, unknown>;
  meta: Record<string, unknown>;
}> {
  const runEngine = deps.runEngine ?? orchestrateSnapshot;

  // JRP-FR-001：必填地区代码。
  if (!input.jurisdictionCode || input.jurisdictionCode.trim().length === 0) {
    throw new JurisdictionRequiredError();
  }
  const jurisdictionCode = input.jurisdictionCode.trim();

  // JRP-FR-018/NFR-008：聊天场景请求地区必须与会话画像已确认地区一致。
  if (input.confirmedJurisdictionCode !== undefined) {
    if (!input.confirmedJurisdictionCode) {
      // 缺少已确认画像：拒绝计算，不得覆盖画像或回退上海。
      throw new JurisdictionContextMismatchError();
    }
    if (input.confirmedJurisdictionCode !== jurisdictionCode) {
      throw new JurisdictionContextMismatchError();
    }
  }

  // JRP-FR-002：服务端解析地区树（不可信输入重新校验，忽略客户端名称/候选）。
  let chain: Array<{ code: string; name: string; level: string; path: string }>;
  try {
    chain = await deps.resolveChain(jurisdictionCode);
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes("not-found") ||
        err.message.includes("不存在") ||
        err.message.includes("地区树校验失败"))
    ) {
      throw new JurisdictionInvalidError();
    }
    throw err;
  }
  if (chain.length === 0 || !chain.some((n) => n.code === jurisdictionCode)) {
    throw new JurisdictionInvalidError();
  }

  // JRP-FR-004/024：as_of_date 在发布记录查询前确定（默认今天）；按地区和日期
  // 读取恰好一个 active 区间。缺失（无任何发布）→ unsupported；有发布但日期
  // 无匹配区间、或多匹配 → 409 POLICY_SNAPSHOT_UNAVAILABLE（fail-closed）。
  const asOfDate = input.asOfDate ?? defaultAsOfDate();

  const release = await deps.getActiveRelease(jurisdictionCode, asOfDate);
  if (!release || release.status !== "active") {
    const hasAny = await deps.hasAnyRelease(jurisdictionCode);
    if (!hasAny) {
      // 四川延期期间无任何发布记录 → unsupported（JRP-FR-013/AC-003/017）。
      throw new JurisdictionUnsupportedError();
    }
    // 有发布记录但 as_of_date 不在任何 active 区间内 → 409（JRP-FR-004/AC-005）。
    throw new PolicySnapshotUnavailableError();
  }

  // 防御：即使仓储返回了行，也复核日期落在区间内（不存在"用最新快照隐式替代"）。
  if (
    release.effectiveFrom !== undefined &&
    release.effectiveFrom !== null
  ) {
    const from = formatDateValue(release.effectiveFrom);
    if (from > asOfDate) {
      throw new PolicySnapshotUnavailableError();
    }
    const to = release.effectiveTo
      ? formatDateValue(release.effectiveTo)
      : null;
    if (to !== null && to < asOfDate) {
      throw new PolicySnapshotUnavailableError();
    }
  }

  // JRP-FR-004：活动快照（不使用"最新创建快照"隐式替换）。
  if (!release.activeSnapshotId) {
    throw new PolicySnapshotUnavailableError();
  }
  const snapshot = await deps.getSnapshot(release.activeSnapshotId);
  if (!snapshot) {
    throw new PolicySnapshotUnavailableError();
  }

  // JRP-NFR-003 fail-closed：活动快照地区必须与发布记录/请求地区一致。
  if (snapshot.snapshot.jurisdictionCode !== jurisdictionCode) {
    throw new PolicyStoreUnavailableError();
  }

  // JRP-FR-026/AC-005：执行期完整性——重算成员规范化哈希并与快照 contentHash
  // 核对（防成员被篡改/漂移），同时确认发布记录的 gateResults 包含七道激活门禁
  // 且全部为 pass（缺项或非 pass 一律拒绝计算，伪造 pass 不能绕过）。
  const recomputedHash = canonicalMemberHash(snapshot.members);
  if (recomputedHash !== snapshot.snapshot.contentHash) {
    throw new PolicySnapshotUnavailableError();
  }
  for (const gateKey of RELEASE_GATE_KEYS) {
    if (release.gateResults[gateKey] !== "pass") {
      throw new PolicySnapshotUnavailableError();
    }
  }

  // JRP-AC-007：地区存在未解决冲突时阻止计算。
  const openConflicts = await deps.listOpenConflicts(jurisdictionCode);
  if (openConflicts.length > 0) {
    throw new PolicyConflictError();
  }

  // JRP-FR-008：从快照成员还原有序规则与参数（规则集 payload 提供顺序）。
  const ruleRows: SnapshotRuleRow[] = [];
  const paramRows: SnapshotParamRow[] = [];
  let ruleSetRow: SnapshotRuleSetRow | null = null;
  for (const member of snapshot.members) {
    if (member.entityType === "rule") {
      ruleRows.push(member.payload as unknown as SnapshotRuleRow);
    } else if (member.entityType === "param") {
      paramRows.push(member.payload as unknown as SnapshotParamRow);
    } else if (member.entityType === "rule_set") {
      const rs = member.payload as Record<string, unknown>;
      ruleSetRow = {
        ruleSetId: String(rs.ruleSetId ?? rs.rule_set_id ?? "snapshot"),
        rules: Array.isArray(rs.rules) ? (rs.rules as string[]) : [],
        version: typeof rs.version === "number" ? rs.version : 1,
      };
    }
  }

  // JRP-FR-022/023：领取地市代码服务端规范化——有效广东地级市代码转换为规则
  // 内部 claim_city 规范名称；未知、跨省、未确认代码一律不注入（规则按缺失
  // 领取地市处理，needs_agent + 问题，不估算失业金额，JRP-AC-006）。自由文本
  // 名称由公开 Schema 拒绝，此处只消费六位代码。
  const rawProfile = isRecord(input.user.profile) ? input.user.profile : undefined;
  const claimCityCode =
    rawProfile && typeof rawProfile.claim_city_code === "string"
      ? rawProfile.claim_city_code
      : undefined;
  const claimCity = normalizeClaimCityCode({
    jurisdictionCode,
    claimCityCode,
  });

  const userInput: Record<string, unknown> = structuredClone(input.user);
  const profile = isRecord(userInput.profile) ? userInput.profile : undefined;
  if (profile) {
    delete profile.claim_city_code;
    if (claimCity.claimCity !== null) {
      profile.claim_city = claimCity.claimCity;
    } else {
      delete profile.claim_city;
    }
  }

  const result = await runEngine({
    user: userInput,
    asOfDate,
    ruleSet: ruleSetRow,
    rules: ruleRows,
    params: paramRows,
  });

  // 沿用现有 needs_agent/questions/warnings/caveats 契约（JRP-FR-020/NFR-009）。
  const calc = result.calc as Record<string, unknown>;
  const needsAgent = extractNeedsAgent(calc);
  const questions = Array.isArray(calc.agent_questions)
    ? (calc.agent_questions as unknown[])
    : [];
  const warnings = Array.isArray(calc.warnings)
    ? (calc.warnings as string[])
    : [];
  const caveats = Array.isArray(calc.caveats) ? (calc.caveats as unknown[]) : [];

  // JRP-FR-009：保存 plan 时记录实际使用的地区、快照与执行元数据。
  let planId: string | null = null;
  if (input.persist ?? true) {
    if (!input.ownerUserId) {
      throw new Error("owner_user_id is required to persist a plan");
    }
    const saved = await deps.savePlan?.({
      userInput: userInput,
      calcResult: calc as Record<string, unknown>,
      planOutput: (result.plan ?? {}) as Record<string, unknown>,
      trace: result.trace as unknown[],
      ruleSetVersion: result.meta.rule_set_id,
      policyPackVersion: result.meta.policy_pack_id,
      asOfDate,
      jurisdictionCode,
      resolvedJurisdictionPath: snapshot.snapshot.resolvedPath,
      snapshotId: snapshot.snapshot.id,
      // JRP-FR-009/FR-028：plan 保存快照内容 hash，供历史重放三方一致性校验。
      snapshotContentHash: snapshot.snapshot.contentHash,
      ownerUserId: input.ownerUserId,
    });
    planId = saved?.id ?? null;
  }

  return {
    planId,
    needsAgent,
    questions,
    warnings,
    caveats,
    plan: (result.plan ?? {}) as Record<string, unknown>,
    calc,
    meta: {
      jurisdiction_code: jurisdictionCode,
      resolved_jurisdiction_path: snapshot.snapshot.resolvedPath,
      snapshot_id: snapshot.snapshot.id,
      as_of_date: asOfDate,
      // JRP-FR-024：实际命中的发布区间。
      release_effective_from:
        release.effectiveFrom != null
          ? formatDateValue(release.effectiveFrom)
          : null,
      release_effective_to:
        release.effectiveTo != null
          ? formatDateValue(release.effectiveTo)
          : null,
      rules_executed: result.meta.rules_executed,
      rule_set_id: result.meta.rule_set_id,
      policy_pack_id: result.meta.policy_pack_id,
    },
  };
}
