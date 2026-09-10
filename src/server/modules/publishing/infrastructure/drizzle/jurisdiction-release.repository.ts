/**
 * 任务3（JRP-FR-005/006/024）地区规划发布记录写仓储 Drizzle 实现。
 * 状态只能经 publishing 用例写入；本仓储不提供任意 UPDATE 入口。
 * 0017 起每地区可有多条区间记录，upsert 按 (jurisdiction_code, effective_from)
 * 定位（同起始日同地区仅一行）。
 */
import { and, eq } from "drizzle-orm";
import { db, type DbClient } from "@/lib/db";
import { jurisdictionPlanningReleases } from "@/lib/db/schema";
import type {
  JurisdictionReleaseWriteRepository,
  ReleaseRow,
} from "../../application/jurisdiction-release.use-case";

export class DrizzleJurisdictionReleaseWriteRepository
  implements JurisdictionReleaseWriteRepository
{
  /** upsert：按 (jurisdiction_code, effective_from) 定位区间行（0017 唯一索引）。 */
  async upsertActiveRelease(
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
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo ?? null,
        updatedAt: data.activatedAt,
      })
      .onConflictDoUpdate({
        target: [
          jurisdictionPlanningReleases.jurisdictionCode,
          jurisdictionPlanningReleases.effectiveFrom,
        ],
        set: {
          activeSnapshotId: data.activeSnapshotId,
          status: data.status,
          gateResults: data.gateResults,
          activatedAt: data.activatedAt,
          activatedBy: data.activatedBy,
          effectiveTo: data.effectiveTo ?? null,
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
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
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
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      updatedAt: row.updatedAt,
    };
  }

  /** 按区间定位（停用/查询专用，JRP-FR-027）。 */
  async getById(id: number): Promise<ReleaseRow | null> {
    const rows = await db
      .select()
      .from(jurisdictionPlanningReleases)
      .where(eq(jurisdictionPlanningReleases.id, id))
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
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      updatedAt: row.updatedAt,
    };
  }

  /** 停用地区规划区间（JRP-FR-027 停用语义）：保留历史快照引用，仅改状态。 */
  async deactivateById(
    id: number,
    tx?: DbClient,
  ): Promise<ReleaseRow | null> {
    const executor = tx ?? db;
    const rows = await executor
      .update(jurisdictionPlanningReleases)
      .set({ status: "inactive", updatedAt: new Date() })
      .where(
        and(
          eq(jurisdictionPlanningReleases.id, id),
          eq(jurisdictionPlanningReleases.status, "active"),
        ),
      )
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
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      updatedAt: row.updatedAt,
    };
  }
}
