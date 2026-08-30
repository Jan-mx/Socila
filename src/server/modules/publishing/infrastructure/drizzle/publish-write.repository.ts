import { db, type DbClient } from "@/lib/db";
import { publishes } from "@/lib/db/schema";
import type { PublishWriteRepository } from "../../application/write-ports";

/** publishing 域写仓储的 Drizzle 实现。 */
export class DrizzlePublishWriteRepository implements PublishWriteRepository {
  async insertPublish(data: typeof publishes.$inferInsert, tx?: DbClient) {
    const rows = await (tx ?? db).insert(publishes).values(data).returning();
    return rows[0];
  }
}
