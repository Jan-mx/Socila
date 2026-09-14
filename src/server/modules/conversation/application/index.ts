/** conversation 模块仓储访问器（进程级单例）。 */
import { DrizzleConversationReadRepository } from "../infrastructure/drizzle/conversation-read.repository";
import { DrizzleConversationWriteRepository } from "../infrastructure/drizzle/conversation-write.repository";

export const conversationReads = new DrizzleConversationReadRepository();
export const conversationWrites = new DrizzleConversationWriteRepository();
