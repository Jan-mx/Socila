import { assertServiceJwtStartupConfig } from "@/lib/security/service-jwt-provider";

/**
 * Next.js instrumentation钩子（稳定API，Next自动发现src/instrumentation.ts）。
 *
 * SJWT-FR-001/AC-010（09-03复审缺漏二）：Node运行时启动入口（next dev/start
 * 与standalone server.js均在此执行）。AGENT_SERVICE_JWT_CURRENT缺失、少于32
 * UTF-8字节或与previous相同 → 立即以退出码1终止进程，使进程拒绝启动；
 * /api/health不得成为绕过启动校验的路径。Next 16 standalone中register抛错
 * 只触发unhandledRejection且进程继续存活，故必须显式process.exit(1)保证
 * 失败快速终止。只在Node运行时执行，不影响Edge运行时与纯类型导入；
 * 错误输出不含Secret内容（SJWT-NFR-006）。
 */
export function register(): void {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    assertServiceJwtStartupConfig();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[service-jwt] startup validation failed, refusing to start:", message);
    process.exit(1);
  }
}
