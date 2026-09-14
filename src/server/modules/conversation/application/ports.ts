/**
 * conversation 模块只读端口（CORE-FR-004）。
 * 覆盖 queries.ts 中归属 conversation 域的只读调用（conversations）。
 */
import type { conversations } from "@/lib/db/schema";

export type ConversationRow = typeof conversations.$inferSelect;

export interface ConversationReadRepository {
  getConversation(conversationId: string): Promise<ConversationRow | null>;
  listConversations(sessionId?: string): Promise<ConversationRow[]>;
}
