/**
 * 任务3（JRP-FR-004/005）planning 域只读仓储 Drizzle 实现：
 * 地区规划发布记录、活动快照（含成员）与未解决冲突的只读访问。
 * 规划只读取不可变快照与发布记录，不修改任何政策实体。
 */
import { and, eq, gte, lte, isNull, or } from "drizzle-orm";
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
  /**
   * JRP-FR-004/024：按地区和 `as_of_date` 读取唯一 active 快照区间。
   * - 恰好一个 active 区间覆盖该日期 → 返回该区间；
   * - 无匹配（未发布/日期在区间外）→ null（应用层 409 POLICY_SNAPSHOT_UNAVAILABLE）；
   * - 多个 active 区间覆盖（DB EXCLUDE 约束应杜绝，防御性兜底）→ 抛错 fail-closed。
   */
  async getActiveRelease(
    jurisdictionCode: string,
    asOfDate?: string,
  ): Promise<PlanningReleaseRow | null> {
    const rows = await db
      .select()
      .from(jurisdictionPlanningReleases)
      .where(
        and(
          eq(jurisdictionPlanningReleases.jurisdictionCode, jurisdictionCode),
          eq(jurisdictionPlanningReleases.status, "active"),
          ...(asOfDate
            ? [
                lte(jurisdictionPlanningReleases.effectiveFrom, asOfDate),
                or(
                  isNull(jurisdictionPlanningReleases.effectiveTo),
                  gte(jurisdictionPlanningReleases.effectiveTo, asOfDate),
                )!,
              ]
            : []),
        ),
      )
      .limit(2);
    if (rows.length === 0) return null;
    if (rows.length > 1) {
      // JRP-NFR-003 fail-closed：重叠active区间（数据库EXCLUDE应拒绝，这里是防御）。
      throw new Error("POLICY_SNAPSHOT_UNAVAILABLE: overlapping active releases");
    }
    const row = rows[0];
    return {
      id: row.id,
      jurisdictionCode: row.jurisdictionCode,
      activeSnapshotId: row.activeSnapshotId,
      status: row.status as PlanningReleaseRow["status"],
      gateResults: row.gateResults as Record<string, unknown>,
      activatedAt: row.activatedAt,
      activatedBy: row.activatedBy,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      updatedAt: row.updatedAt,
    };
  }

  /** JRP-FR-013：地区是否存在任何发布记录（区分 unsupported 与日期无匹配）。 */
  async hasAnyRelease(jurisdictionCode: string): Promise<boolean> {
    const rows = await db
      .select({ id: jurisdictionPlanningReleases.id })
      .from(jurisdictionPlanningReleases)
      .where(eq(jurisdictionPlanningReleases.jurisdictionCode, jurisdictionCode))
      .limit(1);
    return rows.length > 0;
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
