import { db, type DbClient } from "@/lib/db";
import { policyPackVersions } from "@/lib/db/schema";
import type { PolicyWriteRepository } from "../../application/write-ports";

/** policy 域写仓储的 Drizzle 实现。 */
export class DrizzlePolicyWriteRepository implements PolicyWriteRepository {
  async insertPolicyPackVersion(
    data: typeof policyPackVersions.$inferInsert,
    tx?: DbClient,
  ) {
    const rows = await (tx ?? db)
      .insert(policyPackVersions)
      .values(data)
      .returning();
    return rows[0];
  }
}
