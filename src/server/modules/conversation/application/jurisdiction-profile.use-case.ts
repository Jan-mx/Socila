/**
 * 任务3（JRP-FR-015～019、JRP-AC-013/014/016）：会话级地区画像用例。
 *
 * - `confirmConversationJurisdiction`：只有用户明确确认（地区选择器或对话确认）
 *   后，服务端校验稳定代码并写入已确认画像；name/level/confirmedAt/source 由
 *   服务端规范化，客户端与模型提供的同名字段不可信（JRP-FR-015）；
 * - `applyJurisdictionCandidate`：模型识别出的地区只能作为瞬时候选，不得升级
 *   为已确认画像（JRP-FR-016/AC-014）；
 * - 切换地区：保留历史消息（只更新画像），清除旧地区派生状态
 *   （待处理问题/计算缓存/plan引用/snapshot引用）（JRP-FR-019/AC-016）；
 * - `getConfirmedJurisdiction`：恢复会话时返回已确认地区；无画像地区返回 null，
 *   首次新计算前必须重新确认（JRP-FR-017）。
 */
import {
  decideOwnership,
  resolveOwnerKey,
  type OwnerIdentity,
} from "@/server/modules/identity/domain/owner";
import type { ConversationRow } from "./ports";

/** 画像中旧地区派生状态键：切换时整体清除（JRP-FR-019）。 */
export const JURISDICTION_DERIVED_STATE_KEY = "derived_state";

export interface UserProfileJurisdiction {
  code: string;
  name: string;
  level: "national" | "province" | "city" | "district";
  confirmed: true;
  confirmedAt: string;
  source: "selector" | "conversation-confirmation";
}

export interface JurisdictionProfileDeps {
  /** 地区树查询（服务端权威名称/层级/启用状态）。 */
  findJurisdiction: (
    code: string,
  ) => Promise<{ code: string; name: string; level: string; enabled: boolean } | null>;
  getConversation: (conversationId: string) => Promise<ConversationRow | null>;
  updateConversation: (
    conversationId: string,
    data: { userProfile?: Record<string, unknown> },
  ) => Promise<ConversationRow | null>;
  /** 服务端时钟（可注入，测试确定性）。 */
  nowIso?: () => string;
}

export interface ConfirmJurisdictionResult {
  ok: boolean;
  reason?: string;
  jurisdiction?: UserProfileJurisdiction;
}

/** 读取会话画像（无画像返回空对象）。 */
export function readProfile(
  conversation: ConversationRow,
): Record<string, unknown> {
  const profile = conversation.userProfile;
  return profile && typeof profile === "object"
    ? (profile as Record<string, unknown>)
    : {};
}

/** 读取已确认地区；画像缺失或未确认返回 null（必须重新确认，JRP-FR-017）。 */
export function extractConfirmedJurisdiction(
  profile: Record<string, unknown>,
): UserProfileJurisdiction | null {
  const j = profile.jurisdiction;
  if (!j || typeof j !== "object") return null;
  const jr = j as Record<string, unknown>;
  if (jr.confirmed !== true || typeof jr.code !== "string") return null;
  return {
    code: jr.code,
    name: typeof jr.name === "string" ? jr.name : "",
    level: jr.level as UserProfileJurisdiction["level"],
    confirmed: true,
    confirmedAt: typeof jr.confirmedAt === "string" ? jr.confirmedAt : "",
    source: jr.source as UserProfileJurisdiction["source"],
  };
}

/**
 * 用户明确确认/切换地区（JRP-FR-015/019）。
 * 切换时历史消息保留（不更新 messages），旧地区派生状态整体清除。
 */
export async function confirmConversationJurisdiction(
  deps: JurisdictionProfileDeps,
  conversationId: string,
  identity: OwnerIdentity,
  code: string,
  source: "selector" | "conversation-confirmation",
  nowIsoOverride?: string,
): Promise<ConfirmJurisdictionResult> {
  const conversation = await deps.getConversation(conversationId);
  if (!conversation) return { ok: false, reason: "not-found" };
  const decision = decideOwnership(conversation, resolveOwnerKey(identity));
  if (decision.decision !== "granted") {
    return { ok: false, reason: "forbidden" };
  }

  // 服务端重新解析地区（客户端代码/名称/层级不可信，JRP-FR-015/NFR-008）。
  const node = await deps.findJurisdiction(code);
  if (!node || !node.enabled) {
    return { ok: false, reason: "JURISDICTION_INVALID" };
  }

  const profile = readProfile(conversation);
  const previous = extractConfirmedJurisdiction(profile);
  const isSwitch = previous !== null && previous.code !== code;

  const nowIso = nowIsoOverride ?? deps.nowIso?.() ?? new Date().toISOString();

  const nextProfile: Record<string, unknown> = { ...profile };
  nextProfile.jurisdiction = {
    code: node.code,
    name: node.name,
    level: node.level,
    confirmed: true,
    confirmedAt: nowIso,
    source,
  };
  if (isSwitch) {
    // JRP-FR-019：清除旧地区派生的待处理问题、计算缓存、plan引用与snapshot引用；
    // 历史消息保存在 messages 列，本用例不更新 messages（消息原样保留）。
    delete nextProfile[JURISDICTION_DERIVED_STATE_KEY];
  }

  await deps.updateConversation(conversationId, { userProfile: nextProfile });

  return {
    ok: true,
    jurisdiction: extractConfirmedJurisdiction(nextProfile) ?? undefined,
  };
}

/** 恢复会话：返回已确认地区；无确认画像返回 null（JRP-FR-017/AC-013）。 */
export async function getConfirmedJurisdiction(
  deps: JurisdictionProfileDeps,
  conversationId: string,
  identity: OwnerIdentity,
): Promise<UserProfileJurisdiction | null> {
  const conversation = await deps.getConversation(conversationId);
  if (!conversation) return null;
  const decision = decideOwnership(conversation, resolveOwnerKey(identity));
  if (decision.decision !== "granted") return null;
  return extractConfirmedJurisdiction(readProfile(conversation));
}

/**
 * AI 提交的地区候选（JRP-FR-016/AC-014）：只返回待确认标记，绝不写入
 * 已确认画像，也不触发任何规划工具调用。候选是瞬时的：不读取、不写入会话画像。
 */
export async function applyJurisdictionCandidate(
  deps: JurisdictionProfileDeps,
  conversationId: string,
  identity: OwnerIdentity,
  candidate: { code?: string; name?: string },
): Promise<{ pendingConfirmation: true }> {
  void deps;
  void conversationId;
  void identity;
  void candidate;
  return { pendingConfirmation: true };
}

/**
 * 自由文本 → 地区候选代码（JRP-FR-012）：按地区树名称（含去"省/市/自治区"
 * 后缀的短名）包含匹配。零个或多个候选时都必须由用户确认，不得静默选择。
 */
export async function deriveJurisdictionCandidate(
  treeRows: Array<{ code: string; name: string; level: string; enabled: boolean }>,
  text: string,
): Promise<Array<{ code: string; name: string; level: string }>> {
  const normalized = String(text ?? "").trim();
  if (!normalized) return [];
  const hits: Array<{ code: string; name: string; level: string }> = [];
  for (const row of treeRows) {
    if (!row.enabled) continue;
    if (row.code === "CN") continue; // 国家层不参与自由文本候选
    // 支持"上海"→"上海市"、"广东"→"广东省"这类日常表述（短名只用于匹配）。
    const shortName = row.name.replace(/省|市|自治区|特别行政区$/u, "");
    if (normalized.includes(row.name) || (shortName && normalized.includes(shortName))) {
      hits.push({ code: row.code, name: row.name, level: row.level });
    }
  }
  return hits;
}
