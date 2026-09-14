import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { jurisdictions } from "@/lib/db/schema";
import type { JurisdictionReadRepository } from "../../application/ports";

/** jurisdiction 域只读仓储的 Drizzle 实现。 */
export class DrizzleJurisdictionReadRepository
  implements JurisdictionReadRepository
{
  async getByCode(code: string) {
    const rows = await db
      .select()
      .from(jurisdictions)
      .where(eq(jurisdictions.code, code))
      .limit(1);
    return rows[0] ?? null;
  }

  async listEnabled() {
    return db.select().from(jurisdictions).where(eq(jurisdictions.enabled, true));
  }
}
