/**
 * 服务JWT实例提供器（Web侧，SJWT-FR-001/AC-010）。
 *
 * 与Agent侧同名环境变量：AGENT_SERVICE_JWT_CURRENT（必填）/
 * AGENT_SERVICE_JWT_PREVIOUS（轮换期可选）。配置无效 → 抛错（失败关闭，
 * 绝不回退内网Header信任，NFR-004）；错误消息不含Secret内容。
 * 惰性单例：首次路由调用时装配，测试可经 resetServiceJwtInstance 重置。
 */
import { ServiceJwt, validateServiceJwtSecrets } from "./service-jwt";

let instance: ServiceJwt | null = null;

/** 获取生产服务JWT实例（Next↔Agent双向共用：签发Next令牌/验证Agent令牌）。 */
export function getServiceJwt(): ServiceJwt {
  if (!instance) {
    const current = process.env.AGENT_SERVICE_JWT_CURRENT;
    const previous = process.env.AGENT_SERVICE_JWT_PREVIOUS;
    // SJWT-FR-001/AC-010：current缺失/过短、previous与current相同 → 抛错。
    validateServiceJwtSecrets(current, previous);
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
