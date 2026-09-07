/**
 * 任务3（JRP-FR-004/005）planning 域只读仓储 Drizzle 实现：
 * 地区规划发布记录、活动快照（含成员）与未解决冲突的只读访问。
 * 规划只读取不可变快照与发布记录，不修改任何政策实体。
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  jurisdictionPlanningReleases,
  policyConflicts,
  policySnapshotMembers,
  policySnapshots,
} from "@/lib/db/schema";
import type {
  PlanningReleaseRow,
  SnapshotWithMembers,
} from "../../application/jurisdiction-compute.use-case";

export class DrizzleJurisdictionPlanningReadRepository {
  /** JRP-FR-005：按地区读取唯一活动发布记录。 */
  async getActiveRelease(jurisdictionCode: string): Promise<PlanningReleaseRow | null> {
    const rows = await db
      .select()
      .from(jurisdictionPlanningReleases)
      .where(
        and(
          eq(jurisdictionPlanningReleases.jurisdictionCode, jurisdictionCode),
          eq(jurisdictionPlanningReleases.status, "active"),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      jurisdictionCode: row.jurisdictionCode,
      activeSnapshotId: row.activeSnapshotId,
      status: row.status as PlanningReleaseRow["status"],
      gateResults: row.gateResults as Record<string, unknown>,
      activatedAt: row.activatedAt,
      activatedBy: row.activatedBy,
      updatedAt: row.updatedAt,
    };
  }

  /** JRP-FR-004：读取不可变快照及其完整成员。 */
  async getSnapshot(snapshotId: string): Promise<SnapshotWithMembers | null> {
    const snapshotRows = await db
      .select()
      .from(policySnapshots)
      .where(eq(policySnapshots.id, snapshotId))
      .limit(1);
    const snapshot = snapshotRows[0];
    if (!snapshot) return null;
    const members = await db
      .select()
      .from(policySnapshotMembers)
      .where(eq(policySnapshotMembers.snapshotId, snapshot.id));
    return {
      snapshot: {
        id: snapshot.id,
        jurisdictionCode: snapshot.jurisdictionCode,
        asOfDate: snapshot.asOfDate,
        resolvedPath: snapshot.resolvedPath,
        contentHash: snapshot.contentHash,
        createdBy: snapshot.createdBy,
      },
      members: members.map((m) => ({
        entityType: m.entityType as "rule" | "param" | "rule_set",
        businessKey: m.businessKey,
        payload: m.payload as Record<string, unknown>,
        provenance: m.provenance,
      })),
    };
  }

  /** JRP-AC-007：地区未解决冲突列表。 */
  async listOpenConflicts(jurisdictionCode: string): Promise<unknown[]> {
    return db
      .select()
      .from(policyConflicts)
      .where(
        and(
          eq(policyConflicts.jurisdictionCode, jurisdictionCode),
          eq(policyConflicts.status, "open"),
        ),
      );
  }
}
