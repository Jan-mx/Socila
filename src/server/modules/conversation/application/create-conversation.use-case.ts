/**
 * 任务3（JRP-FR-021/JRP-AC-001）：认证受控会话预创建用例。
 *
 * 新会话必须经 `POST /api/conversations` 由认证 API 持久创建后，地区选择器
 * 才可对已存在且归属当前用户的会话写入地区确认——杜绝"新会话尚未持久化时
 * 地区确认 404"竞态（复审 P1 缺陷一）。
 *
 * - 只有认证用户（ownerUserId）可创建归属自己的会话；
 * - 服务端生成稳定会话 ID 并落库，调用方立即获得可用于确认/计算的真实 ID；
 * - 匿名或会话创建失败时零写入并返回稳定错误。
 */
import {
  decideOwnership,
  resolveOwnerKey,
  type OwnerIdentity,
} from "@/server/modules/identity/domain/owner";
import type { ConversationRow } from "./ports";
import type { ConversationWriteRepository } from "./write-ports";

export interface CreateOwnedConversationDeps {
  write: Pick<ConversationWriteRepository, "createConversation">;
}

export type CreateOwnedConversationResult =
  | { ok: true; conversation: ConversationRow }
  | { ok: false; reason: "auth-required" | "create-failed" };

/** 认证受控创建：只有 ownerUserId 用户可创建归属自己的会话（JRP-FR-021）。 */
export async function createOwnedConversation(
  deps: CreateOwnedConversationDeps,
  identity: OwnerIdentity,
): Promise<CreateOwnedConversationResult> {
  const ownerKey = resolveOwnerKey(identity);
  if (ownerKey?.kind !== "user") {
    // 09-02 AUTH-FR-005：新流程只允许认证用户创建会话。
    return { ok: false, reason: "auth-required" };
  }

  const conversation = await deps.write.createConversation({
    ownerUserId: ownerKey.id,
  });
  if (!conversation) {
    return { ok: false, reason: "create-failed" };
  }

  // 服务端校验归属（防御：拒绝无归属或归属错误行）。
  const decision = decideOwnership(conversation, ownerKey);
  if (decision.decision !== "granted") {
    return { ok: false, reason: "create-failed" };
  }

  return { ok: true, conversation };
}