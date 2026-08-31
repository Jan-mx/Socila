/**
 * 系统健康探测（REL-FR-009）：数据库连通性用例。
 * Route Handler 不得直接导入 @/lib/db（CORE-AC-001），探测逻辑收敛于此。
 */
import { getPool } from "@/lib/db";

export type HealthReport = {
  status: "ok" | "degraded";
  database: "ok" | "unreachable" | "unexpected";
};

export async function checkDatabaseHealth(): Promise<HealthReport> {
  try {
    const result = await getPool().query<{ ok: number }>("SELECT 1 AS ok");
    if (result.rows[0]?.ok !== 1) {
      return { status: "degraded", database: "unexpected" };
    }
    return { status: "ok", database: "ok" };
  } catch (error) {
    // 健康端点不泄露内部错误细节，只报依赖不可达
    console.error("[health] database check failed:", error instanceof Error ? error.message : error);
    return { status: "degraded", database: "unreachable" };
  }
}
