/**
 * Next.js instrumentation钩子（稳定API，Next自动发现src/instrumentation.ts）。
 *
 * SJWT-FR-001/AC-010（09-03复审缺漏二，2026-09-04 Edge运行时隔离复查）：
 * Next.js会把instrumentation同时构建为Node与Edge运行时bundle，因此本文件
 * 不得直接或静态引用进程退出终止或任何仅Node可用的模块，否则Edge构建报告
 * Node.js API在Edge Runtime不受支持的警告（违反AC-018无未解释warning）。
 * 启动期校验与进程终止逻辑位于Node专用模块
 * src/lib/security/service-jwt-startup-node.ts，仅在NEXT_RUNTIME=nodejs分支
 * 经动态import加载；Edge运行时不执行任何启动校验、不接触Node专用模块。
 *
 * 语义与09-03一致：本文件是Node运行时启动入口（next dev/start与standalone
 * server.js均在此执行）；Secret无效时Node专用模块输出不含Secret的稳定错误
 * 并以退出码1终止进程（fail-fast，Next 16 standalone中register仅抛错只触发
 * unhandledRejection且进程继续存活）；/api/health不构成绕过启动校验的路径。
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { runServiceJwtStartupCheck } = await import("@/lib/security/service-jwt-startup-node");
  runServiceJwtStartupCheck();
}
