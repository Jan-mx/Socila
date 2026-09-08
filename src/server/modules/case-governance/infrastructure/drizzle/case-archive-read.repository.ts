import { desc, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { caseArchiveBatches, caseArchiveEntries } from "@/lib/db/schema";
import type {
  ArchiveBatchRow,
  ArchiveEntryRow,
  CaseArchiveReadPort,
} from "../../application/ports";

/** CLG-AC-012：归档读取仓储——只返回批次与条目元数据，无正文/下载URL。 */
export class DrizzleCaseArchiveReadRepository implements CaseArchiveReadPort {
  async listBatches(): Promise<ArchiveBatchRow[]> {
    const rows = await db
      .select()
      .from(caseArchiveBatches)
      .orderBy(desc(caseArchiveBatches.createdAt));
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      sourceCounts: r.sourceCounts as Record<string, unknown>,
      retainedCounts: r.retainedCounts as Record<string, unknown>,
      deletedCounts: r.deletedCounts as Record<string, unknown>,
      tableHashes: r.tableHashes as Record<string, unknown>,
      manifestHash: r.manifestHash,
      storagePath: r.storagePath,
      createdAt: r.createdAt,
      createdBy: r.createdBy,
    }));
  }

  async listBatchEntries(batchId: string): Promise<ArchiveEntryRow[]> {
    const rows = await db
      .select({
        entityType: caseArchiveEntries.entityType,
        entityId: caseArchiveEntries.entityId,
        caseUid: caseArchiveEntries.caseUid,
        contentHash: caseArchiveEntries.contentHash,
        archiveReason: caseArchiveEntries.archiveReason,
      })
      .from(caseArchiveEntries)
      .where(sql`archive_batch_id = ${batchId}`)
      .orderBy(caseArchiveEntries.id);
    return rows.map((r) => ({
      entityType: r.entityType,
      entityId: r.entityId,
      caseUid: r.caseUid,
      contentHash: r.contentHash,
      archiveReason: r.archiveReason,
    }));
  }
}
