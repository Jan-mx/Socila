/**
 * 任务3（JRP-FR-005/006/007/024/027、JRP-NFR-006/010、JRP-AC-008/010/011）：
 * 地区规划发布记录激活/切换/停用用例。
 *
 * 不变量：
 * - 激活、切换和停用只允许经本用例（publishing application 用例）与新鲜
 *   管理员身份执行（JRP-FR-006/AC-010），禁止直接 SQL 改状态；
 * - 激活必须真实运行七道门禁（引用/Schema/参数依赖/冲突/黄金测试/双重重放/
 *   规范化内容哈希，JRP-FR-007/AC-007）——全部通过后才写入 active；
 *   gateResults 记录真实逐项结果，伪造 pass 不能绕过；
 * - 激活必须绑定与发布地区相同的已存在快照（JRP-FR-007）；
 * - 激活区间必须闭合定义且同地区不重叠（0017 EXCLUDE 约束兜底，JRP-FR-024）；
 * - 停用只改状态，不删除快照或历史 plan（JRP-FR-027）；
 * - 激活新快照不修改或删除旧快照（JRP-NFR-006）：本用例只更新发布记录。
 */
import type { DbClient } from "@/lib/db";
import { runReleaseGates, type ReleaseGateDeps } from "./release-gates";
export interface ReleaseActor {
  id: string;
  role: string;
  status: string;
}

export interface ReleaseRow {
  id: number;
  jurisdictionCode: string;
  activeSnapshotId: string | null;
  status: "inactive" | "active";
  gateResults: Record<string, unknown>;
  activatedAt: Date | null;
  activatedBy: string | null;
  effectiveFrom?: string | Date | null;
  effectiveTo?: string | Date | null;
  updatedAt: Date;
}

export interface ReleaseSnapshotInfo {
  snapshot: {
    id: string;
    jurisdictionCode: string;
    contentHash: string;
    asOfDate?: string | null;
  };
  members: Array<{
    entityType: "rule" | "param" | "rule_set";
    businessKey: string;
    payload: Record<string, unknown>;
    provenance: unknown;
  }>;
}

export interface JurisdictionReleaseWriteRepository {
  upsertActiveRelease(
    data: {
      jurisdictionCode: string;
      activeSnapshotId: string;
      status: "active";
      gateResults: Record<string, unknown>;
      activatedAt: Date;
      activatedBy: string;
      effectiveFrom: string;
      effectiveTo?: string | null;
    },
    tx?: DbClient,
  ): Promise<ReleaseRow>;
  getById?(id: number): Promise<ReleaseRow | null>;
  deactivateById?(id: number, tx?: DbClient): Promise<ReleaseRow | null>;
}

export interface JurisdictionReleaseDeps {
  /** 新鲜管理员校验（AUTH-FR-010 语义）：role=admin 且 status=active。 */
  requireAdmin: (actor: ReleaseActor) => Promise<
    { ok: true } | { ok: false; reason: string }
  >;
  /** 目标快照读取（含成员，用于完整性门禁）。 */
  getSnapshot: (snapshotId: string) => Promise<ReleaseSnapshotInfo | null>;
  /** 地区未解决冲突列表（JRP-FR-007 冲突门禁）。 */
  listOpenConflicts: (jurisdictionCode: string) => Promise<unknown[]>;
  /** 黄金测试加载（按地区继承链，JRP-FR-007 黄金门禁）。 */
  loadTests: (jurisdictionCodes: string[]) => Promise<unknown[]>;
  /** 已发布参数全集业务键（JRP-FR-007 参数依赖门禁：窗口外参数仍有效）。 */
  listParamKeys?: (jurisdictionCodes: string[]) => Promise<string[]>;
  upsert: JurisdictionReleaseWriteRepository["upsertActiveRelease"];
  getById?: JurisdictionReleaseWriteRepository["getById"];
  deactivateById?: JurisdictionReleaseWriteRepository["deactivateById"];
  /** 服务端时钟（可注入，测试确定性）。 */
  now?: () => Date;
  /** 引用校验（默认读取仓库原件；测试可注入假实现）。 */
  verifyEvidence?: ReleaseGateDeps["verifyEvidence"];
}

export class ReleaseAuthorizationError extends Error {
  constructor(message = "地区激活需要新鲜管理员身份") {
    super(message);
    this.name = "ReleaseAuthorizationError";
  }
}

export class ReleaseSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReleaseSnapshotError";
  }
}

export class ReleaseConflictError extends Error {
  constructor() {
    super("地区存在未解决政策冲突，禁止激活规划发布记录");
    this.name = "ReleaseConflictError";
  }
}

export class ReleaseGateError extends Error {
  readonly gateResults: Record<string, unknown>;
  constructor(gateResults: Record<string, unknown>, message: string) {
    super(message);
    this.name = "ReleaseGateError";
    this.gateResults = gateResults;
  }
}

export class ReleaseNotFoundError extends Error {
  constructor() {
    super("发布区间不存在");
    this.name = "ReleaseNotFoundError";
  }
}

/**
 * JRP-FR-027/AC-009：URL 路径地区代码与 release 记录地区不一致时拒绝停用
 * （例如用广东 URL 传上海 releaseId），被拒绝时不得修改任何 release。
 */
export class ReleaseJurisdictionMismatchError extends Error {
  constructor(
    readonly urlCode: string,
    readonly recordCode: string,
  ) {
    super(`发布区间地区（${recordCode}）与URL地区（${urlCode}）不一致`);
    this.name = "ReleaseJurisdictionMismatchError";
  }
}

export interface ActivateReleaseInput {
  jurisdictionCode: string;
  snapshotId: string;
  /** JRP-FR-024：区间起点（闭合定义，必填）。 */
  effectiveFrom: string;
  /** 区间终点（null=开放上界，如2030窗口）。 */
  effectiveTo?: string | null;
  actor: ReleaseActor;
}

export interface DeactivateReleaseInput {
  releaseId: number;
  /** JRP-FR-027/AC-009：必须等于 release 记录地区（来自URL路径），不一致拒绝。 */
  jurisdictionCode: string;
  actor: ReleaseActor;
}

/** 激活（或切换到新快照区间）：七道真实门禁全部通过后 upsert active 发布记录。 */
export async function activateJurisdictionRelease(
  deps: JurisdictionReleaseDeps,
  input: ActivateReleaseInput,
): Promise<ReleaseRow> {
  // JRP-FR-006/AC-010：普通用户或非新鲜管理员一律拒绝，且零数据库变化。
  const admin = await deps.requireAdmin(input.actor);
  if (!admin.ok) {
    throw new ReleaseAuthorizationError(admin.reason);
  }

  // JRP-FR-024：区间必须闭合定义（起点非空、终点不早于起点）。
  if (!input.effectiveFrom || input.effectiveFrom.trim().length === 0) {
    throw new ReleaseSnapshotError("激活必须提供闭合定义的 effective_from");
  }
  if (
    input.effectiveTo !== undefined &&
    input.effectiveTo !== null &&
    input.effectiveTo < input.effectiveFrom
  ) {
    throw new ReleaseSnapshotError("effective_to 不得早于 effective_from");
  }

  // JRP-FR-007 快照门禁：目标快照必须存在且地区与发布地区一致。
  const snapshot = await deps.getSnapshot(input.snapshotId);
  if (!snapshot || snapshot.members.length === 0) {
    throw new ReleaseSnapshotError("目标快照不存在或没有成员，无法激活规划发布记录");
  }
  if (snapshot.snapshot.jurisdictionCode !== input.jurisdictionCode) {
    throw new ReleaseSnapshotError(
      `快照地区（${snapshot.snapshot.jurisdictionCode}）与发布地区（${input.jurisdictionCode}）不一致`,
    );
  }

  // JRP-FR-007/AC-007：真实执行全部七道门禁；任一失败零写入。
  const gates = await runReleaseGates({
    snapshot: {
      snapshot: snapshot.snapshot,
      members: snapshot.members,
    },
    jurisdictionCode: input.jurisdictionCode,
    listOpenConflicts: deps.listOpenConflicts,
    loadTests: deps.loadTests as ReleaseGateDeps["loadTests"],
    listParamKeys: deps.listParamKeys,
    verifyEvidence: deps.verifyEvidence,
  });
  if (!gates.ok) {
    throw new ReleaseGateError(
      gates.gateResults,
      `激活门禁未通过：${gates.errors.join("；")}`,
    );
  }

  // JRP-NFR-006：只更新发布记录，不修改/删除旧快照（旧快照保留可回退）。
  const now = deps.now?.() ?? new Date();
  return deps.upsert({
    jurisdictionCode: input.jurisdictionCode,
    activeSnapshotId: input.snapshotId,
    status: "active",
    gateResults: gates.gateResults,
    activatedAt: now,
    activatedBy: input.actor.id,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo ?? null,
  });
}

/**
 * 停用单一发布区间（JRP-FR-027/AC-009）：只改状态为 inactive，
 * 不删除快照或历史 plan；新鲜管理员身份校验。
 * 停用前必须核对 URL 地区代码与 release 记录地区一致（JRP-FR-027）：
 * 用广东 URL 传上海 releaseId 必须拒绝，且不得修改任何 release（零写入）。
 */
export async function deactivateJurisdictionRelease(
  deps: JurisdictionReleaseDeps,
  input: DeactivateReleaseInput,
): Promise<ReleaseRow> {
  const admin = await deps.requireAdmin(input.actor);
  if (!admin.ok) {
    throw new ReleaseAuthorizationError(admin.reason);
  }
  if (!deps.getById || !deps.deactivateById) {
    throw new ReleaseSnapshotError("停用能力未装配");
  }
  const existing = await deps.getById(input.releaseId);
  if (!existing) {
    throw new ReleaseNotFoundError();
  }
  // JRP-FR-027/AC-009：地区绑定校验先于任何写入。
  if (existing.jurisdictionCode !== input.jurisdictionCode) {
    throw new ReleaseJurisdictionMismatchError(
      input.jurisdictionCode,
      existing.jurisdictionCode,
    );
  }
  const deactivated = await deps.deactivateById(input.releaseId);
  if (!deactivated) {
    // 已被停用/状态竞态：视为目标不存在（幂等语义）。
    throw new ReleaseNotFoundError();
  }
  return deactivated;
}

/** 供路由层复用的新鲜管理员校验（源码契约：激活必须经本函数）。 */
export async function requireFreshAdminForRelease(
  deps: Pick<JurisdictionReleaseDeps, "requireAdmin">,
  actor: ReleaseActor,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  return deps.requireAdmin(actor);
}