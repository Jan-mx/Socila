/**
 * identity 审计事件仓储的 Drizzle 实现（09-02 §8.3，AUTH-FR-011）。
 * metadata 只保存脱敏枚举与变更前后状态；任何凭据/IP 不得进入。
 */
import { db, type DbClient } from "@/lib/db";
import { authAuditEvents } from "@/lib/db/schema";
import type {
  AuditEventInput,
  AuditEventRepository,
} from "../../application/ports";

export function createDrizzleAuditEventRepository(
  executor: DbClient = db,
): AuditEventRepository {
  const client = () => executor;
  return {
    async append(event: AuditEventInput) {
      await client().insert(authAuditEvents).values({
        actorUserId: event.actorUserId ?? null,
        targetUserId: event.targetUserId ?? null,
        eventType: event.eventType,
        requestId: event.requestId ?? null,
        metadata: event.metadata ?? {},
      });
    },
  };
}
