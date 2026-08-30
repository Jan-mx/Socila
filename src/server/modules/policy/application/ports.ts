/**
 * policy 模块只读端口（CORE-FR-004）。
 * 覆盖 queries.ts 中归属 policy 域的只读调用（policy_pack_versions）。
 */
import type { policyPackVersions } from "@/lib/db/schema";

export type PolicyPackVersionRow = typeof policyPackVersions.$inferSelect;

export interface PolicyReadRepository {
  getLatestPolicyPackVersion(policyPackId: string): Promise<PolicyPackVersionRow | null>;
}
