import { DrizzleCaseArchiveReadRepository } from "../infrastructure/drizzle/case-archive-read.repository";
import type { CaseArchiveReadPort } from "./ports";

export type { ArchiveBatchRow, ArchiveEntryRow, CaseArchiveReadPort } from "./ports";

/** CLG-FR-016：归档元数据只读用例（无普通用户写入口）。 */
export const caseArchiveReads: CaseArchiveReadPort =
  new DrizzleCaseArchiveReadRepository();
