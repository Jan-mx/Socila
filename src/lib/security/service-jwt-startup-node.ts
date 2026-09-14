/**
 * 服务JWT启动期校验的Node专用模块（SJWT-FR-001/AC-010，09-03复审缺漏二，
 * 2026-09-04 Edge运行时隔离复查）。
 *
 * 本模块只允许在Node运行时经动态import加载（src/instrumentation.ts 的
 * register在NEXT_RUNTIME==="nodejs"分支内import）。instrumentation会被
 * Next.js同时构建为Node与Edge运行时bundle；校验与进程终止逻辑若静态留在
 * instrumentation，Edge bundle会引用process.exit并产生构建警告
 * （Turbopack: Node.js API not supported in the Edge Runtime）。
 *
 * 语义与09-03一致：配置无效（current缺失、少于32 UTF-8字节或previous与
 * current相同）时输出不含Secret的稳定错误并以退出码1终止进程（fail-fast；
 * Next 16 standalone中register抛错只触发unhandledRejection且进程存活，故
 * 必须显式退出）；/api/health不构成绕过启动校验的路径。配置有效时不退出。
 */
import { assertServiceJwtStartupConfig } from "./service-jwt-provider";

/** 执行启动期Secret校验；无效时输出稳定错误（不含Secret，NFR-006）并以退出码1终止进程。 */
export function runServiceJwtStartupCheck(): void {
  try {
    assertServiceJwtStartupConfig();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[service-jwt] startup validation failed, refusing to start:", message);
    process.exit(1);
  }
}
