/** policy 模块端口：只读（02.2）+ 冲突与快照（03.4/03.5）。 */
import type { policyConflicts, policyPackVersions, policySnapshotMembers, policySnapshots } from "@/lib/db/schema";
import type { DbClient } from "@/lib/db";

export type PolicyPackVersionRow = typeof policyPackVersions.$inferSelect;

export interface PolicyReadRepository {
  getLatestPolicyPackVersion(policyPackId: string): Promise<PolicyPackVersionRow | null>;
}

export type PolicyConflictRow = typeof policyConflicts.$inferSelect;
export type PolicyConflictInsert = typeof policyConflicts.$inferInsert;
export type PolicySnapshotRow = typeof policySnapshots.$inferSelect;
export type PolicySnapshotMemberRow = typeof policySnapshotMembers.$inferSelect;

export interface PolicyConflictRepository {
  insertConflicts(rows: PolicyConflictInsert[], tx?: DbClient): Promise<PolicyConflictRow[]>;
  listConflicts(filters?: { status?: string; jurisdictionCode?: string }): Promise<PolicyConflictRow[]>;
  resolveConflict(
    id: number,
    decision: { status: "resolved" | "dismissed"; resolvedBy: string; resolution: unknown },
    tx?: DbClient,
  ): Promise<PolicyConflictRow | null>;
}

export interface PolicySnapshotRepository {
  insertSnapshot(
    snapshot: { jurisdictionCode: string; asOfDate: string; resolvedPath: string; contentHash: string; createdBy: string },
    members: Array<{ entityType: "rule" | "param" | "rule_set"; businessKey: string; payload: unknown; provenance: unknown }>,
    tx?: DbClient,
  ): Promise<PolicySnapshotRow>;
  getSnapshot(id: string): Promise<{ snapshot: PolicySnapshotRow; members: PolicySnapshotMemberRow[] } | null>;
  findLatest(jurisdictionCode: string, asOfDate: string): Promise<PolicySnapshotRow | null>;
  /** 影响查询（POL-FR-011）：成员包含指定业务键的快照。 */
  listSnapshotsContainingKey(businessKey: string): Promise<PolicySnapshotRow[]>;
}
