/**
 * conversation 模块用例（CORE-FR-005/009，步骤02.6）。
 * 归属校验在用例层完成；仓储经端口注入——单元测试无需框架与数据库。
 * 语义保持：legacy（无归属列）会话对读/改/删一律拒绝（与现有 403 行为一致）。
 */
// identity 模块可被其他模块读取（PRD §6）：归属判定使用其领域模型。
import {
  decideOwnership,
  resolveOwnerKey,
  type OwnerIdentity,
} from "@/server/modules/identity/domain/owner";
import type { ConversationReadRepository, ConversationRow } from "./ports";
import type { ConversationWriteRepository } from "./write-ports";

export interface ConversationDeps {
  read: ConversationReadRepository;
  write: ConversationWriteRepository;
}

export type ConversationAccess =
  | { access: "granted"; conversation: ConversationRow }
  | { access: "forbidden" }
  | { access: "not-found" };

/** 归属受控读取：他人会话返回 forbidden（路由映射 403），不存在返回 not-found（404）。 */
export async function getOwnedConversation(
  deps: ConversationDeps,
  conversationId: string,
  identity: OwnerIdentity,
): Promise<ConversationAccess> {
  const conversation = await deps.read.getConversation(conversationId);
  if (!conversation) return { access: "not-found" };
  const decision = decideOwnership(
    conversation,
    resolveOwnerKey(identity),
  );
  if (decision.decision === "granted") {
    return { access: "granted", conversation };
  }
  // legacy-unowned 与 forbidden 同样拒绝：沿用现有"无权限"语义。
  return { access: "forbidden" };
}

/** 归属受控追加消息/画像（原 updateConversation 语义，含存在性校验）。 */
export async function appendConversationTurn(
  deps: ConversationDeps,
  conversationId: string,
  identity: OwnerIdentity,
  data: { messages?: unknown[]; userProfile?: Record<string, unknown> },
): Promise<ConversationRow | null> {
  const access = await getOwnedConversation(deps, conversationId, identity);
  if (access.access !== "granted") return null;
  return deps.write.updateConversation(conversationId, data);
}

/** 删除：归属受控，返回是否真的删除了行。 */
export async function deleteOwnedConversation(
  deps: ConversationDeps,
  conversationId: string,
  identity: OwnerIdentity,
): Promise<"deleted" | "forbidden" | "not-found"> {
  const access = await getOwnedConversation(deps, conversationId, identity);
  if (access.access === "not-found") return "not-found";
  if (access.access === "forbidden") return "forbidden";
  const removed = await deps.write.deleteConversation(conversationId);
  return removed ? "deleted" : "not-found";
}

/** 列出本人会话：匿名按 session 过滤；认证用户按 ownerUserId 过滤（经仓储端口）。 */
export async function listOwnConversations(
  deps: ConversationDeps,
  identity: OwnerIdentity,
): Promise<ConversationRow[]> {
  const owner = resolveOwnerKey(identity);
  if (owner?.kind === "user") {
    const all = await deps.read.listConversations();
    return all.filter((c) => c.ownerUserId === owner.id);
  }
  return deps.read.listConversations(identity.sessionId ?? undefined);
}
