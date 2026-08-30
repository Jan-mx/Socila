/**
 * 步骤02.6 用例层单元测试（CORE-FR-005/009/010）：无 Next、无数据库。
 * Fake 端口验证：规划用例的落库与归属绑定、会话用例的归属矩阵、发布用例留痕。
 */
import { describe, it, expect, vi } from "vitest";
import { computePlan } from "@/server/modules/planning/application/compute-plan.use-case";
import {
  getOwnedConversation,
  deleteOwnedConversation,
  listOwnConversations,
} from "@/server/modules/conversation/application/conversation.use-case";
import { createPublishingUseCase } from "@/server/modules/publishing/application/publish-use-case";
import type { OrchestratorResult } from "@/lib/engine/orchestrator";
import type { ConversationRow } from "@/server/modules/conversation/application/ports";

const fakeEngineResult: OrchestratorResult = {
  plan: { conclusion: "ok" },
  calc: { _today: "2026-01-01" },
  user: {},
  trace: [],
  meta: {
    rule_set_id: "RS-SHANGHAI-PLAN-V1",
    policy_pack_id: "SHANGHAI_BASE",
    as_of_date: "2026-01-01",
    rules_executed: 0,
  },
  effectiveRules: [],
  flatParams: {},
};

describe("ComputePlanUseCase (fake ports)", () => {
  it("persists with owner binding and returns planId", async () => {
    const savePlan = vi.fn(async (data) => ({
      id: "plan-1",
      createdAt: new Date(),
      ...data,
    })) as unknown as ReturnType<typeof vi.fn> & {
      mock: { calls: unknown[][] };
    };
    const result = await computePlan(
      {
        user: { basic: { gender: "male" } },
        sessionId: "sess-1",
        ownerUserId: "user-9",
      },
      {
        runEngine: async () => fakeEngineResult,
        savePlan: savePlan as never,
      },
    );
    expect(result.planId).toBe("plan-1");
    expect(result.needsAgent).toBe(false);
    const saved = savePlan.mock.calls[0][0] as Record<string, unknown>;
    expect(saved.ownerUserId).toBe("user-9");
    expect(saved.sessionId).toBe("sess-1");
  });

  it("persist:false skips saving and planId stays null", async () => {
    const savePlan = vi.fn();
    const result = await computePlan(
      { user: {}, persist: false },
      { runEngine: async () => fakeEngineResult, savePlan: savePlan as never },
    );
    expect(result.planId).toBeNull();
    expect(savePlan).not.toHaveBeenCalled();
  });
});

function makeConversation(partial: Partial<ConversationRow>): ConversationRow {
  return {
    id: "c-1",
    sessionId: null,
    ownerUserId: null,
    messages: [],
    userProfile: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as ConversationRow;
}

describe("ConversationUseCase ownership matrix (fake ports)", () => {
  const makeDeps = (row: ConversationRow | null) => {
    const read = {
      getConversation: vi.fn(async () => row),
      listConversations: vi.fn(async (sessionId?: string) =>
        sessionId ? [row].filter((r): r is ConversationRow => !!r && r.sessionId === sessionId) : [],
      ),
    };
    const write = {
      createConversation: vi.fn(),
      updateConversation: vi.fn(async () => row),
      deleteConversation: vi.fn(async () => row),
    };
    return { deps: { read, write }, read, write };
  };

  it("grants owner session and denies another session", async () => {
    const owned = makeDeps(makeConversation({ sessionId: "sess-A" }));
    const a = await getOwnedConversation(owned.deps, "c-1", { sessionId: "sess-A" });
    const b = await getOwnedConversation(owned.deps, "c-1", { sessionId: "sess-B" });
    expect(a.access).toBe("granted");
    expect(b.access).toBe("forbidden");
  });

  it("denies legacy-unowned rows (matches current 403 semantics)", async () => {
    const legacy = makeDeps(makeConversation({ sessionId: null }));
    const out = await getOwnedConversation(legacy.deps, "c-1", { sessionId: "sess-A" });
    expect(out.access).toBe("forbidden");
  });

  it("delete: forbidden session never reaches the write port", async () => {
    const owned = makeDeps(makeConversation({ sessionId: "sess-A" }));
    const result = await deleteOwnedConversation(owned.deps, "c-1", { sessionId: "sess-B" });
    expect(result).toBe("forbidden");
    expect(owned.write.deleteConversation).not.toHaveBeenCalled();
  });

  it("delete: owner removes and port is called", async () => {
    const owned = makeDeps(makeConversation({ sessionId: "sess-A" }));
    const result = await deleteOwnedConversation(owned.deps, "c-1", { sessionId: "sess-A" });
    expect(result).toBe("deleted");
    expect(owned.write.deleteConversation).toHaveBeenCalledWith("c-1");
  });

  it("user identity filters own conversations by ownerUserId", async () => {
    const mine = makeConversation({ ownerUserId: "user-9" });
    const other = makeConversation({ ownerUserId: "user-8", id: "c-2" });
    const deps = {
      read: {
        getConversation: vi.fn(async () => mine),
        listConversations: vi.fn(async () => [mine, other]),
      },
      write: {
        createConversation: vi.fn(),
        updateConversation: vi.fn(),
        deleteConversation: vi.fn(),
      },
    };
    const rows = await listOwnConversations(deps, { userId: "user-9" });
    expect(rows).toHaveLength(1);
    expect(rows[0].ownerUserId).toBe("user-9");
  });
});

describe("PublishingUseCase (fake ports)", () => {
  it("records publish with mandatory actor and lists history", async () => {
    const savedRow = { id: 7, entityType: "rule" };
    const write = { insertPublish: vi.fn(async () => savedRow) };
    const read = { listPublishes: vi.fn(async () => [savedRow]) };
    const useCase = createPublishingUseCase({
      write: write as never,
      read: read as never,
    });
    const row = await useCase.recordPublish({
      entityType: "rule",
      entityId: "R-010",
      fromStage: "staging",
      toStage: "production",
      actor: "admin-1",
    });
    expect(row).toEqual(savedRow);
    expect(write.insertPublish).toHaveBeenCalledWith(
      expect.objectContaining({ actor: "admin-1", toStage: "production" }),
    );
    expect(await useCase.listHistory(5)).toEqual([savedRow]);
  });
});
