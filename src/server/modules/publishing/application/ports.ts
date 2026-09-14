/**
 * publishing 模块只读端口（CORE-FR-004）。
 * 覆盖 queries.ts 中归属 publishing 域的只读调用（publishes）。
 */
import type { publishes } from "@/lib/db/schema";

export type PublishRow = typeof publishes.$inferSelect;

export interface PublishReadRepository {
  listPublishes(limit?: number): Promise<PublishRow[]>;
}
