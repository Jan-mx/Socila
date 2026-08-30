import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations } from "@/lib/db/schema";
import type { ConversationReadRepository } from "../../application/ports";

/** conversation 域只读仓储的 Drizzle 实现。 */
export class DrizzleConversationReadRepository
  implements ConversationReadRepository
{
  async getConversation(conversationId: string) {
    const rows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    return rows[0] ?? null;
  }

  async listConversations(sessionId?: string) {
    const conditions = sessionId
      ? [eq(conversations.sessionId, sessionId)]
      : [];
    return db
      .select()
      .from(conversations)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(conversations.updatedAt))
      .limit(50);
  }
}
