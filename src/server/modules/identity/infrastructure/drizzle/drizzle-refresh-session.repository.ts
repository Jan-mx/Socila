/**
 * identity 刷新会话仓储的 Drizzle 实现（09-02 §8.2，ADR-0007）。
 * 只存 SHA-256 哈希；并发轮换经 SELECT ... FOR UPDATE 行锁串行化。
 */
import { and, eq, isNull } from "drizzle-orm";

import { db, type DbClient } from "@/lib/db";
import { authRefreshSessions } from "@/lib/db/schema";
import type {
  RefreshRevokeReason,
  RefreshSessionRecord,
  RefreshSessionRepository,
} from "../../application/ports";

type SessionRow = typeof authRefreshSessions.$inferSelect;

function toRecord(row: SessionRow): RefreshSessionRecord {
  return {
    id: row.id,
    userId: row.userId,
    currentTokenHash: row.currentTokenHash,
    previousTokenHash: row.previousTokenHash,
    previousValidUntil: row.previousValidUntil,
    rotationCounter: row.rotationCounter,
    authVersion: row.authVersion,
    idleExpiresAt: row.idleExpiresAt,
    absoluteExpiresAt: row.absoluteExpiresAt,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    revokedAt: row.revokedAt,
    revokedReason: row.revokedReason,
  };
}

export function createDrizzleRefreshSessionRepository(
  executor: DbClient = db,
): RefreshSessionRepository {
  const client = () => executor;

  return {
    async create(data) {
      const rows = await client()
        .insert(authRefreshSessions)
        .values({
          userId: data.userId,
          currentTokenHash: data.tokenHash,
          authVersion: data.authVersion,
          idleExpiresAt: data.idleExpiresAt,
          absoluteExpiresAt: data.absoluteExpiresAt,
        })
        .returning();
      return toRecord(rows[0]);
    },

    async findById(id) {
      const rows = await client()
        .select()
        .from(authRefreshSessions)
        .where(eq(authRefreshSessions.id, id))
        .limit(1);
      return rows[0] ? toRecord(rows[0]) : null;
    },

    async lockById(id) {
      const rows = await client()
        .select()
        .from(authRefreshSessions)
        .where(eq(authRefreshSessions.id, id))
        .for("update")
        .limit(1);
      return rows[0] ? toRecord(rows[0]) : null;
    },

    async applyRotation(id, patch) {
      await client()
        .update(authRefreshSessions)
        .set({
          currentTokenHash: patch.currentTokenHash,
          previousTokenHash: patch.previousTokenHash,
          previousValidUntil: patch.previousValidUntil,
          rotationCounter: patch.rotationCounter,
          authVersion: patch.authVersion,
          idleExpiresAt: patch.idleExpiresAt,
          lastUsedAt: patch.lastUsedAt,
        })
        .where(eq(authRefreshSessions.id, id));
    },

    async touch(id, lastUsedAt) {
      await client()
        .update(authRefreshSessions)
        .set({ lastUsedAt })
        .where(eq(authRefreshSessions.id, id));
    },

    async revoke(id, reason: RefreshRevokeReason, at) {
      await client()
        .update(authRefreshSessions)
        .set({ revokedAt: at, revokedReason: reason })
        .where(
          and(eq(authRefreshSessions.id, id), isNull(authRefreshSessions.revokedAt)),
        );
    },

    async revokeAllForUser(userId, reason: RefreshRevokeReason, at) {
      const rows = await client()
        .update(authRefreshSessions)
        .set({ revokedAt: at, revokedReason: reason })
        .where(
          and(
            eq(authRefreshSessions.userId, userId),
            isNull(authRefreshSessions.revokedAt),
          ),
        )
        .returning({ id: authRefreshSessions.id });
      return rows.length;
    },
  };
}
