/**
 * 任务3（JRP-FR-005/006）地区规划发布记录写仓储 Drizzle 实现。
 * 状态只能经 publishing 用例写入；本仓储不提供任意 UPDATE 入口。
 */
import { eq } from "drizzle-orm";
import { db, type DbClient } from "@/lib/db";
import { jurisdictionPlanningReleases } from "@/lib/db/schema";
import type {
  JurisdictionReleaseWriteRepository,
  ReleaseRow,
} from "../../application/jurisdiction-release.use-case";

export class DrizzleJurisdictionReleaseWriteRepository
  implements JurisdictionReleaseWriteRepository
{
  /** upsert：每个地区最多一条当前发布记录（schema 唯一索引裁决）。 */
  async upsertActiveRelease(
    data: {
      jurisdictionCode: string;
      activeSnapshotId: string;
      status: "active";
      gateResults: Record<string, unknown>;
      activatedAt: Date;
      activatedBy: string;
    },
    tx?: DbClient,
  ): Promise<ReleaseRow> {
    const executor = tx ?? db;
    const rows = await executor
      .insert(jurisdictionPlanningReleases)
      .values({
        jurisdictionCode: data.jurisdictionCode,
        activeSnapshotId: data.activeSnapshotId,
        status: data.status,
        gateResults: data.gateResults,
        activatedAt: data.activatedAt,
        activatedBy: data.activatedBy,
        updatedAt: data.activatedAt,
      })
      .onConflictDoUpdate({
        target: jurisdictionPlanningReleases.jurisdictionCode,
        set: {
          activeSnapshotId: data.activeSnapshotId,
          status: data.status,
          gateResults: data.gateResults,
          activatedAt: data.activatedAt,
          activatedBy: data.activatedBy,
          updatedAt: data.activatedAt,
        },
      })
      .returning();
    const row = rows[0];
    return {
      id: row.id,
      jurisdictionCode: row.jurisdictionCode,
      activeSnapshotId: row.activeSnapshotId,
      status: row.status as ReleaseRow["status"],
      gateResults: row.gateResults as Record<string, unknown>,
      activatedAt: row.activatedAt,
      activatedBy: row.activatedBy,
      updatedAt: row.updatedAt,
    };
  }

  /** 查询当前发布记录（激活前校验既有状态）。 */
  async getByJurisdiction(jurisdictionCode: string): Promise<ReleaseRow | null> {
    const rows = await db
      .select()
      .from(jurisdictionPlanningReleases)
      .where(eq(jurisdictionPlanningReleases.jurisdictionCode, jurisdictionCode))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      jurisdictionCode: row.jurisdictionCode,
      activeSnapshotId: row.activeSnapshotId,
      status: row.status as ReleaseRow["status"],
      gateResults: row.gateResults as Record<string, unknown>,
      activatedAt: row.activatedAt,
      activatedBy: row.activatedBy,
      updatedAt: row.updatedAt,
    };
  }

  /** 停用地区规划（JRP-FR-006 停用语义）：保留历史快照引用，仅改状态。 */
  async deactivate(jurisdictionCode: string, tx?: DbClient): Promise<ReleaseRow | null> {
    const executor = tx ?? db;
    const rows = await executor
      .update(jurisdictionPlanningReleases)
      .set({ status: "inactive", updatedAt: new Date() })
      .where(eq(jurisdictionPlanningReleases.jurisdictionCode, jurisdictionCode))
      .returning();
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      jurisdictionCode: row.jurisdictionCode,
      activeSnapshotId: row.activeSnapshotId,
      status: row.status as ReleaseRow["status"],
      gateResults: row.gateResults as Record<string, unknown>,
      activatedAt: row.activatedAt,
      activatedBy: row.activatedBy,
      updatedAt: row.updatedAt,
    };
  }
}
