import type { publishes } from "@/lib/db/schema";
import type { DbClient } from "@/lib/db";

export interface PublishWriteRepository {
  insertPublish(
    data: typeof publishes.$inferInsert,
    tx?: DbClient,
  ): Promise<typeof publishes.$inferSelect>;
}
