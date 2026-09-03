/**
 * JTI重放事务消费（SJWT-FR-008 / PRD §6.4/§7.3）— drizzle 实现。
 *
 * 接收方顺序：解析Bearer→验证签名/Header/claims→开始事务→删除过期重放记录
 * →插入JTI（主键唯一，冲突即重放）→业务写入→提交。冲突时整体回滚，路由统一401。
 * 仅保存UUID与claims元数据，不保存令牌或签名（§7.3）；过期记录机会式清理。
 */
import { lt, sql } from "drizzle-orm";
import type { DbClient } from "@/lib/db";
import { serviceJwtReplays } from "@/lib/db/schema";
import type { ServiceJwtClaims } from "@/lib/security/service-jwt";

/** JTI重复消费：视为重放，回滚整个事务并统一401（FR-008/AC-012）。 */
export class JtiReplayConflictError extends Error {
  constructor(public readonly jti: string) {
    super("jti-replay");
    this.name = "JtiReplayConflictError";
  }
}

/** 重放存储不可用：失败关闭，503 SERVICE_AUTH_STORE_UNAVAILABLE（§8.3/AC-014）。 */
export class ServiceAuthStoreUnavailableError extends Error {
  public readonly publicCode = "SERVICE_AUTH_STORE_UNAVAILABLE";
  constructor(public readonly category: string) {
    super("SERVICE_AUTH_STORE_UNAVAILABLE");
    this.name = "ServiceAuthStoreUnavailableError";
  }
}

/**
 * 在与业务写相同的事务内消费JTI（必须在 withTransaction 内调用）。
 * @returns true=本JTI首次消费；false=重放（调用方抛JtiReplayConflictError回滚并401）
 * @throws ServiceAuthStoreUnavailableError 存储不可用（绝不回退Header信任，NFR-004）
 */
export async function consumeServiceJwtJti(
  tx: DbClient,
  claims: ServiceJwtClaims,
): Promise<boolean> {
  try {
    // 机会式删除过期记录（§7.3）：以数据库时钟为准；失败会中止本事务并按
    // 存储不可用处理，绝不绕过下方当前JTI的唯一插入。
    await tx
      .delete(serviceJwtReplays)
      .where(lt(serviceJwtReplays.expiresAt, sql`now()`));
    const inserted = await tx
      .insert(serviceJwtReplays)
      .values({
        jti: claims.jti,
        issuer: claims.iss,
        subject: claims.sub,
        audience: claims.aud,
        expiresAt: new Date(claims.exp * 1000),
      })
      .onConflictDoNothing({ target: serviceJwtReplays.jti })
      .returning({ jti: serviceJwtReplays.jti });
    return inserted.length > 0;
  } catch (err) {
    if (err instanceof ServiceAuthStoreUnavailableError) throw err;
    throw new ServiceAuthStoreUnavailableError("store-error");
  }
}
