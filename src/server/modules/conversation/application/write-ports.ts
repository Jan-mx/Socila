import type { conversations } from "@/lib/db/schema";
import type { DbClient } from "@/lib/db";

export interface ConversationWriteRepository {
  createConversation(
    data?: {
      id?: string;
      /** 旧数据兼容字段：新流程不传，由 ownerUserId 承担归属（09-02 AUTH-FR-005）。 */
      sessionId?: string;
      /** 归属用户 id（09-02）：认证用户创建会话时必填。 */
      ownerUserId?: string;
      messages?: unknown[];
      userProfile?: Record<string, unknown>;
    },
    tx?: DbClient,
  ): Promise<typeof conversations.$inferSelect | null>;
  updateConversation(
    conversationId: string,
    data: { messages?: unknown[]; userProfile?: Record<string, unknown> },
    tx?: DbClient,
  ): Promise<typeof conversations.$inferSelect | null>;
  deleteConversation(
    conversationId: string,
    tx?: DbClient,
  ): Promise<typeof conversations.$inferSelect | null>;
}
