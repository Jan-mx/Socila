import type { conversations } from "@/lib/db/schema";
import type { DbClient } from "@/lib/db";

export interface ConversationWriteRepository {
  createConversation(
    data?: {
      id?: string;
      sessionId?: string;
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
