/**
 * 任务3（JRP-FR-021/JRP-AC-001）：认证受控会话预创建用例专用测试。
 *
 * - 只有认证用户（ownerUserId）可创建归属自己的会话；
 * - 创建成功后返回真实会话 ID 与归属，地区选择器据此确认不再 404；
 * - 拒绝：匿名身份、仓储创建失败（零写入）。
 */
import { describe, it, expect, vi } from "vitest";
import {
  createOwnedConversation,
  type CreateOwnedConversationDeps,
} from "../create-conversation.use-case";

type CreateConversationInput = {
  id?: string;
  sessionId?: string;
  ownerUserId?: string;
  messages?: unknown[];
  userProfile?: Record<string, unknown>;
};

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "conv-created-1",
    sessionId: null,
    ownerUserId: "user-1",
    messages: [],
    userProfile: {},
    createdAt: new Date("2026-09-07T09:00:00Z"),
    updatedAt: new Date("2026-09-07T09:00:00Z"),
    ...overrides,
  };
}

function makeDeps(
  create: (data?: CreateConversationInput) => Promise<unknown>,
): CreateOwnedConversationDeps {
  return {
    write: {
      createConversation: create as CreateOwnedConversationDeps["write"]["createConversation"],
    },
  };
}

describe("认证受控会话预创建（JRP-FR-021/AC-001）", () => {
  it("认证用户创建会话：落库 ownerUserId 并返回真实会话 ID（JRP-AC-001）", async () => {
    const create = vi.fn(async () => makeRow());
    const result = await createOwnedConversation(
      makeDeps(create),
      { userId: "user-1" },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(create).toHaveBeenCalledWith({ ownerUserId: "user-1" });
    expect(result.conversation.id).toBe("conv-created-1");
    expect(result.conversation.ownerUserId).toBe("user-1");
  });

  it("匿名身份：拒绝且零创建调用（09-02 AUTH-FR-005）", async () => {
    const create = vi.fn(async () => makeRow());
    const result = await createOwnedConversation(makeDeps(create), {
      sessionId: "anon-session",
    });
    expect(result).toEqual({ ok: false, reason: "auth-required" });
    expect(create).not.toHaveBeenCalled();
  });

  it("仓储创建失败：返回稳定错误且不返回伪造会话", async () => {
    const create = vi.fn(async () => null);
    const result = await createOwnedConversation(
      makeDeps(create),
      { userId: "user-1" },
    );
    expect(result).toEqual({ ok: false, reason: "create-failed" });
  });

  it("服务端防御：返回行归属不符（无 ownerUserId）时拒绝（JRP-FR-021 防御）", async () => {
    const create = vi.fn(async () => makeRow({ ownerUserId: null }));
    const result = await createOwnedConversation(
      makeDeps(create),
      { userId: "user-1" },
    );
    expect(result).toEqual({ ok: false, reason: "create-failed" });
  });
});