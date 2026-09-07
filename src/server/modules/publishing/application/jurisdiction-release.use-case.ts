/**
 * 任务3（JRP-FR-005/006/007、JRP-NFR-006、JRP-AC-008/010/012）：
 * 地区规划发布记录激活/切换用例。
 *
 * 不变量：
 * - 激活、切换和停用只允许经本用例（publishing application 用例）与新鲜
 *   管理员身份执行（JRP-FR-006/AC-010），禁止直接 SQL 改状态；
 * - 激活必须绑定与发布地区相同的已存在快照，且无未解决冲突（JRP-FR-007）；
 * - 激活新快照不修改或删除旧快照（JRP-NFR-006）：本用例只更新发布记录；
 * - 每个地区最多一条当前发布记录和一个活动快照（schema 唯一约束兜底）。
 */
import type { DbClient } from "@/lib/db";

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
  updatedAt: Date;
}

export interface ReleaseSnapshotInfo {
  snapshot: {
    id: string;
    jurisdictionCode: string;
    contentHash: string;
  };
  members: unknown[];
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
    },
    tx?: DbClient,
  ): Promise<ReleaseRow>;
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
  upsert: JurisdictionReleaseWriteRepository["upsertActiveRelease"];
  /** 服务端时钟（可注入，测试确定性）。 */
  now?: () => Date;
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

export interface ActivateReleaseInput {
  jurisdictionCode: string;
  snapshotId: string;
  actor: ReleaseActor;
}

/** 激活（或切换到新快照）：门禁全部通过后 upsert active 发布记录。 */
export async function activateJurisdictionRelease(
  deps: JurisdictionReleaseDeps,
  input: ActivateReleaseInput,
): Promise<ReleaseRow> {
  // JRP-FR-006/AC-010：普通用户或非新鲜管理员一律拒绝，且零数据库变化。
  const admin = await deps.requireAdmin(input.actor);
  if (!admin.ok) {
    throw new ReleaseAuthorizationError(admin.reason);
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

  // JRP-FR-007 冲突门禁：地区存在未解决冲突时禁止激活。
  const openConflicts = await deps.listOpenConflicts(input.jurisdictionCode);
  if (openConflicts.length > 0) {
    throw new ReleaseConflictError();
  }

  // JRP-NFR-006：只更新发布记录，不修改/删除旧快照（旧快照保留可回退）。
  const now = deps.now?.() ?? new Date();
  return deps.upsert({
    jurisdictionCode: input.jurisdictionCode,
    activeSnapshotId: input.snapshotId,
    status: "active",
    gateResults: {
      snapshot_replay: "pass",
      conflicts: "pass",
      snapshot_content_hash: snapshot.snapshot.contentHash,
      members: snapshot.members.length,
    },
    activatedAt: now,
    activatedBy: input.actor.id,
  });
}

/** 供路由层复用的新鲜管理员校验（源码契约：激活必须经本函数）。 */
export async function requireFreshAdminForRelease(
  deps: Pick<JurisdictionReleaseDeps, "requireAdmin">,
  actor: ReleaseActor,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  return deps.requireAdmin(actor);
}
