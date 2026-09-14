import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { publishes } from "@/lib/db/schema";
import type { PublishReadRepository } from "../../application/ports";

/** publishing 域只读仓储的 Drizzle 实现。 */
export class DrizzlePublishReadRepository implements PublishReadRepository {
  async listPublishes(limit = 50) {
    return db
      .select()
      .from(publishes)
      .orderBy(desc(publishes.createdAt))
      .limit(limit);
  }
}
