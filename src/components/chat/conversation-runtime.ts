export const CONVERSATION_ID_RESPONSE_HEADER = "x-conversation-id";

export function createConversationTrackingFetch(
  onConversationReady: (conversationId: string) => void,
  baseFetch: typeof fetch = globalThis.fetch,
): typeof fetch {
  return async (input, init) => {
    const response = await baseFetch(input, init);
    if (response.ok) {
      const conversationId = response.headers.get(
        CONVERSATION_ID_RESPONSE_HEADER,
      );
      if (conversationId) {
        onConversationReady(conversationId);
      }
    }
    return response;
  };
}

export function getConversationRestoreErrorMessage(status: number): string {
  if (status === 403) {
    return "这个对话不属于当前浏览器会话，已为你打开新对话。";
  }

  if (status === 404) {
    return "这个对话链接已经失效，已为你打开新对话。";
  }

  return "聊天记录恢复失败，已为你打开新对话。";
}

export function shouldRestoreConversationFromUrl(params: {
  sessionId: string;
  conversationIdFromUrl: string | null;
  panelConversationId: string | null;
}): boolean {
  const { sessionId, conversationIdFromUrl, panelConversationId } = params;

  if (!sessionId || !conversationIdFromUrl) {
    return false;
  }

  if (conversationIdFromUrl === panelConversationId) {
    return false;
  }

  return true;
}
