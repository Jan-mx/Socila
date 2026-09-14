import type { policyPackVersions } from "@/lib/db/schema";
import type { DbClient } from "@/lib/db";

export interface PolicyWriteRepository {
  insertPolicyPackVersion(
    data: typeof policyPackVersions.$inferInsert,
    tx?: DbClient,
  ): Promise<typeof policyPackVersions.$inferSelect>;
}
