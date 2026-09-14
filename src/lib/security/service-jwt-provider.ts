/**
 * 服务JWT实例提供器（Web侧，SJWT-FR-001/AC-010）。
 *
 * 与Agent侧同名环境变量：AGENT_SERVICE_JWT_CURRENT（必填）/
 * AGENT_SERVICE_JWT_PREVIOUS（轮换期可选）。配置无效 → 抛错（失败关闭，
 * 绝不回退内网Header信任，NFR-004）；错误消息不含Secret内容。
 * 惰性单例：首次路由调用时装配，测试可经 resetServiceJwtInstance 重置。
 * 启动期校验：Node运行时启动入口（src/instrumentation.ts register）调用
 * assertServiceJwtStartupConfig，Secret缺失/无效时进程拒绝启动（09-03复审
 * 缺漏二）；/api/health不得成为绕过启动校验的路径。
 */
import { ServiceJwt, validateServiceJwtSecrets } from "./service-jwt";

let instance: ServiceJwt | null = null;

/**
 * SJWT-FR-001/NFR-003/AC-010启动期校验：current缺失、少于32 UTF-8字节或
 * previous与current相同 → 抛错（失败关闭）。消息不含Secret内容（NFR-006）。
 * env参数可注入以便单元测试；默认读取进程环境。
 */
export function assertServiceJwtStartupConfig(env: Record<string, string | undefined> = process.env): void {
  validateServiceJwtSecrets(env.AGENT_SERVICE_JWT_CURRENT, env.AGENT_SERVICE_JWT_PREVIOUS);
}

/** 获取生产服务JWT实例（Next↔Agent双向共用：签发Next令牌/验证Agent令牌）。 */
export function getServiceJwt(): ServiceJwt {
  if (!instance) {
    // SJWT-FR-001/AC-010：current缺失/过短、previous与current相同 → 抛错。
    assertServiceJwtStartupConfig();
    const current = process.env.AGENT_SERVICE_JWT_CURRENT;
    const previous = process.env.AGENT_SERVICE_JWT_PREVIOUS;
    instance = new ServiceJwt({
      current: current as string,
      previous: previous && previous !== "" ? previous : undefined,
    });
  }
  return instance;
}

/** 测试接缝：重置惰性单例（测试间隔离环境变量装配）。 */
export function resetServiceJwtInstance(): void {
  instance = null;
}
