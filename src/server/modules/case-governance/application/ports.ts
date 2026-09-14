/**
 * CLG-FR-016/AC-012 归档元数据读取端口（只返回批次与条目元数据，
 * 归档表本身不保存原始转录正文，因此端口也不可能暴露正文）。
 */
export interface ArchiveBatchRow {
  id: string;
  status: string;
  sourceCounts: Record<string, unknown>;
  retainedCounts: Record<string, unknown>;
  deletedCounts: Record<string, unknown>;
  tableHashes: Record<string, unknown>;
  manifestHash: string;
  storagePath: string;
  createdAt: Date;
  createdBy: string;
}

export interface ArchiveEntryRow {
  entityType: string;
  entityId: number;
  caseUid: string | null;
  contentHash: string;
  archiveReason: string;
}

export interface CaseArchiveReadPort {
  listBatches(): Promise<ArchiveBatchRow[]>;
  listBatchEntries(batchId: string): Promise<ArchiveEntryRow[]>;
}
