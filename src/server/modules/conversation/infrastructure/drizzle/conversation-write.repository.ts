import { eq } from "drizzle-orm";
import { db, type DbClient } from "@/lib/db";
import { conversations } from "@/lib/db/schema";
import type { ConversationWriteRepository } from "../../application/write-ports";
import type { ConversationRow } from "../../application/ports";

/** conversation 域写仓储的 Drizzle 实现（含 create 冲突回读的归属校验语义）。 */
export class DrizzleConversationWriteRepository
  implements ConversationWriteRepository
{
  async createConversation(
    data?: {
      id?: string;
      sessionId?: string;
      messages?: unknown[];
      userProfile?: Record<string, unknown>;
    },
    tx?: DbClient,
  ): Promise<ConversationRow | null> {
    const executor = tx ?? db;
    const values: typeof conversations.$inferInsert = {
      messages: (data?.messages ??
        []) as typeof conversations.$inferInsert.messages,
      userProfile: (data?.userProfile ??
        {}) as typeof conversations.$inferInsert.userProfile,
    };
    if (data?.id) values.id = data.id;
    if (data?.sessionId) values.sessionId = data.sessionId;

    const rows = await executor
      .insert(conversations)
      .values(values)
      .onConflictDoNothing()
      .returning();

    // 冲突（已存在）且回读：只有属于同一 session 的既有会话才可返回，
    // 否则攻击者可用他人的 conversation id 走到写路径（归属读校验被绕过）。
    if (rows.length === 0 && data?.id) {
      const existingRows = await executor
        .select()
        .from(conversations)
        .where(eq(conversations.id, data.id))
        .limit(1);
      const existing = existingRows[0] ?? null;
      if (existing) {
        if (!data.sessionId || existing.sessionId === data.sessionId) {
          return existing;
        }
        return null;
      }
    }

    return rows[0] ?? null;
  }

  async updateConversation(
    conversationId: string,
    data: { messages?: unknown[]; userProfile?: Record<string, unknown> },
    tx?: DbClient,
  ) {
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (data.messages !== undefined) updateData.messages = data.messages;
    if (data.userProfile !== undefined)
      updateData.userProfile = data.userProfile;

    const rows = await (tx ?? db)
      .update(conversations)
      .set(updateData as typeof conversations.$inferInsert)
      .where(eq(conversations.id, conversationId))
      .returning();
    return rows[0] ?? null;
  }

  async deleteConversation(conversationId: string, tx?: DbClient) {
    const rows = await (tx ?? db)
      .delete(conversations)
      .where(eq(conversations.id, conversationId))
      .returning();
    return rows[0] ?? null;
  }
}
