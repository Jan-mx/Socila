import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { policyPackVersions } from "@/lib/db/schema";
import type { PolicyReadRepository } from "../../application/ports";

/** policy 域只读仓储的 Drizzle 实现。 */
export class DrizzlePolicyReadRepository implements PolicyReadRepository {
  async getLatestPolicyPackVersion(policyPackId: string) {
    const rows = await db
      .select()
      .from(policyPackVersions)
      .where(
        and(
          eq(policyPackVersions.policyPackId, policyPackId),
          eq(policyPackVersions.status, "published"),
        ),
      )
      .orderBy(desc(policyPackVersions.version))
      .limit(1);

    return rows[0] ?? null;
  }
}
