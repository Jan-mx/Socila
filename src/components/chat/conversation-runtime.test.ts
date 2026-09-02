import { test, expect } from "vitest";

import {
  createConversationTrackingFetch,
  getConversationRestoreErrorMessage,
  shouldRestoreConversationFromUrl,
} from "./conversation-runtime";

test("只在服务端成功确认后才上报 conversationId", async () => {
  const acknowledged: string[] = [];
  const trackedFetch = createConversationTrackingFetch(
    (conversationId) => acknowledged.push(conversationId),
    async () =>
      new Response("ok", {
        status: 200,
        headers: {
          "x-conversation-id": "conv-success",
        },
      }),
  );

  await trackedFetch("https://example.com/api/chat", {
    method: "POST",
  });

  expect(acknowledged).toEqual(["conv-success"]);
});

test("失败响应不应该把不存在的 conversationId 写回客户端", async () => {
  const acknowledged: string[] = [];
  const trackedFetch = createConversationTrackingFetch(
    (conversationId) => acknowledged.push(conversationId),
    async () =>
      new Response(JSON.stringify({ error: "服务器内部错误" }), {
        status: 500,
        headers: {
          "x-conversation-id": "conv-failed",
        },
      }),
  );

  await trackedFetch("https://example.com/api/chat", {
    method: "POST",
  });

  expect(acknowledged).toEqual([]);
});

test("恢复失败提示区分无权限和会话不存在", () => {
  expect(getConversationRestoreErrorMessage(403)).toBe(
    "这个对话不属于当前账号，已为你打开新对话。",
  );
  expect(getConversationRestoreErrorMessage(404)).toBe(
    "这个对话链接已经失效，已为你打开新对话。",
  );
});

test("当前面板已经是同一个会话时，不应再从 URL 重新恢复", () => {
  expect(
    shouldRestoreConversationFromUrl({
      conversationIdFromUrl: "conv-1",
      panelConversationId: "conv-1",
    }),
  ).toBe(false);
});

test("URL 指向其他会话时，仍然应该触发恢复", () => {
  expect(
    shouldRestoreConversationFromUrl({
      conversationIdFromUrl: "conv-2",
      panelConversationId: "conv-1",
    }),
  ).toBe(true);
});
