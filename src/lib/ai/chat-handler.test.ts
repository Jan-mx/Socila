import { describe, expect, it, vi } from "vitest";
import { createChatRequestHandler, type ConversationRecord } from "./chat-handler";

function memoryStore(initial: ConversationRecord[] = []) {
  const records = new Map(initial.map((record) => [record.id, structuredClone(record)]));
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  return {
    records,
    updates,
    store: {
      async get(id: string) { return records.get(id) ?? null; },
      async create(data: { id?: string; sessionId: string }) {
        const record = { id: data.id ?? `conversation-${records.size + 1}`, sessionId: data.sessionId, messages: [], userProfile: {} };
        records.set(record.id, record);
        return record;
      },
      async update(id: string, data: { messages?: unknown[]; userProfile?: Record<string, unknown> }) {
        updates.push({ id, data });
        const record = records.get(id)!;
        Object.assign(record, structuredClone(data));
        return record;
      },
    },
  };
}

describe("createChatRequestHandler", () => {
  it("persists the input snapshot and the completed stream through the same reusable boundary", async () => {
    const memory = memoryStore();
    const finalMessages = [{ id: "a1", role: "assistant", parts: [{ type: "text", text: "完成" }] }];
    const handler = createChatRequestHandler({
      conversationStore: memory.store,
      convertMessages: async () => [{ role: "user", content: "你好" }] as never,
      streamFactory: vi.fn(() => ({
        totalUsage: Promise.resolve({ totalTokens: 3 }),
        steps: Promise.resolve([]),
        toUIMessageStreamResponse(options: { onFinish: (event: { messages: unknown[] }) => Promise<void> }) {
          void options.onFinish({ messages: finalMessages });
          return new Response("stream");
        },
      })) as never,
    });

    const result = await handler.handle({
      rawMessages: [{ id: "u1", role: "user", parts: [{ type: "text", text: "你好" }] }],
      sessionId: "session-1",
      userProfile: { basic: { gender: "male" } },
    });
    await result.finished;

    expect(result.status).toBe(200);
    expect(memory.updates).toEqual([
      { id: "conversation-1", data: { messages: expect.any(Array), userProfile: { basic: { gender: "male" } } } },
      { id: "conversation-1", data: { messages: finalMessages, userProfile: { basic: { gender: "male" } } } },
    ]);
  });

  it("rejects access to a conversation owned by another anonymous session", async () => {
    const memory = memoryStore([{ id: "c1", sessionId: "owner", messages: [], userProfile: {} }]);
    const handler = createChatRequestHandler({
      conversationStore: memory.store,
      convertMessages: async () => [] as never,
      streamFactory: vi.fn() as never,
    });

    const result = await handler.handle({ rawMessages: [], requestedConversationId: "c1", sessionId: "intruder" });

    expect(result).toMatchObject({ status: 403, error: "无权限访问该会话" });
  });
});
