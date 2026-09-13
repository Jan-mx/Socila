/**
 * DeepSeek Chat Completions 兼容适配器单元测试。
 *
 * 背景（2026-09-14生产探测矩阵，脱敏）：
 * - deepseek-v4.1-flash：/models与真实请求均400（账号无此模型），禁止使用；
 * - deepseek-flash与deepseek-v4-flash（当前别名）行为一致：
 *   默认thinking下强制tool_choice→400 "Thinking mode does not support this tool_choice"；
 *   显式thinking={type:"disabled"}后强制工具调用→200并正确返回searchPolicy调用。
 *
 * 契约（SHV2/UAT修复）：适配器仅匹配DeepSeek模型+/chat/completions、仅修改JSON请求体、
 * 仅在显式tool_choice（对象形式）存在时注入thinking={type:"disabled"}；
 * 其他Provider、普通请求、非JSON body原样转发；不记录Authorization或完整请求正文。
 */
import { describe, it, expect, vi, afterEach } from "vitest";

import {
  withDeepSeekCompat,
  isExplicitToolChoice,
} from "../deepseek-compat";

const CHAT_URL = "https://api.deepseek.com/v1/chat/completions";
const SEARCH_POLICY_TOOL = {
  type: "function",
  function: {
    name: "searchPolicy",
    description: "检索官方政策原文库（RAG）。",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
};
const FORCED_TOOL_CHOICE = { type: "function", function: { name: "searchPolicy" } };

/** 模拟探测实证的DeepSeek上游行为：默认thinking+强制tool_choice→400；否则200。 */
function deepseekLikeUpstream() {
  const bodies: Array<Record<string, unknown>> = [];
  const upstream = vi.fn(async (_input: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    bodies.push(body);
    const forced = body.tool_choice != null && typeof body.tool_choice === "object";
    const thinkingOff =
      (body.thinking as { type?: string } | undefined)?.type === "disabled";
    if (forced && !thinkingOff) {
      return new Response(
        JSON.stringify({
          error: {
            code: "invalid_request_error",
            message: "Thinking mode does not support this tool_choice",
          },
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        id: "chatcmpl-test",
        choices: [
          {
            index: 0,
            finish_reason: forced ? "tool_calls" : "stop",
            message: {
              role: "assistant",
              content: forced ? null : "OK",
              ...(forced
                ? {
                    tool_calls: [
                      {
                        id: "call_1",
                        type: "function",
                        function: { name: "searchPolicy", arguments: '{"query":"Q"}' },
                      },
                    ],
                  }
                : {}),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  return { upstream, bodies };
}

function jsonInit(body: unknown, extraHeaders: Record<string, string> = {}): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer test-key",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("withDeepSeekCompat（DeepSeek强制工具调用兼容）", () => {
  it("RED复现：默认thinking下强制tool_choice被上游400拒绝（探测矩阵实证的生产错误）", async () => {
    const { upstream } = deepseekLikeUpstream();
    const resp = await upstream(CHAT_URL, jsonInit({
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "上海失业保险金标准是多少？" }],
      tools: [SEARCH_POLICY_TOOL],
      tool_choice: FORCED_TOOL_CHOICE,
    }));
    expect(resp.status).toBe(400);
    const err = await (resp as Response).json();
    expect(err.error.message).toBe("Thinking mode does not support this tool_choice");
  });

  it("GREEN：显式tool_choice+DeepSeek模型+/chat/completions时注入thinking disabled并成功返回工具调用", async () => {
    const { upstream, bodies } = deepseekLikeUpstream();
    const fetchWithCompat = withDeepSeekCompat(upstream as unknown as typeof fetch);
    const resp = await fetchWithCompat(CHAT_URL, jsonInit({
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "上海失业保险金标准是多少？" }],
      tools: [SEARCH_POLICY_TOOL],
      tool_choice: FORCED_TOOL_CHOICE,
    }));
    expect(resp.status).toBe(200);
    const payload = await resp.json();
    expect(payload.choices[0].message.tool_calls[0].function.name).toBe("searchPolicy");
    expect(bodies).toHaveLength(1);
    expect(bodies[0].thinking).toEqual({ type: "disabled" });
    // 注入只增不改：其余字段原样保留
    expect(bodies[0].model).toBe("deepseek-v4-flash");
    expect(bodies[0].tool_choice).toEqual(FORCED_TOOL_CHOICE);
  });

  it("tool_choice=auto不注入thinking（默认thinking保持）", async () => {
    const { upstream, bodies } = deepseekLikeUpstream();
    const fetchWithCompat = withDeepSeekCompat(upstream as unknown as typeof fetch);
    const resp = await fetchWithCompat(CHAT_URL, jsonInit({
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "你好" }],
      tools: [SEARCH_POLICY_TOOL],
      tool_choice: "auto",
    }));
    expect(resp.status).toBe(200);
    expect(bodies[0].thinking).toBeUndefined();
  });

  it("无tool_choice的普通对话不注入thinking", async () => {
    const { upstream, bodies } = deepseekLikeUpstream();
    const fetchWithCompat = withDeepSeekCompat(upstream as unknown as typeof fetch);
    await fetchWithCompat(CHAT_URL, jsonInit({
      model: "deepseek-flash",
      messages: [{ role: "user", content: "你好" }],
    }));
    expect(bodies[0].thinking).toBeUndefined();
  });

  it("非DeepSeek模型的强制tool_choice不修改请求", async () => {
    const { upstream, bodies } = deepseekLikeUpstream();
    const fetchWithCompat = withDeepSeekCompat(upstream as unknown as typeof fetch);
    await fetchWithCompat("https://api.openai.com/v1/chat/completions", jsonInit({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }],
      tools: [SEARCH_POLICY_TOOL],
      tool_choice: FORCED_TOOL_CHOICE,
    }));
    expect(bodies[0].thinking).toBeUndefined();
  });

  it("DeepSeek模型但非/chat/completions端点不修改请求", async () => {
    const { upstream, bodies } = deepseekLikeUpstream();
    const fetchWithCompat = withDeepSeekCompat(upstream as unknown as typeof fetch);
    await fetchWithCompat("https://api.deepseek.com/v1/embeddings", jsonInit({
      model: "deepseek-v4-flash",
      input: ["x"],
    }));
    expect(bodies[0].thinking).toBeUndefined();
  });

  it("已显式携带thinking={type:\"disabled\"}的请求保持幂等", async () => {
    const { upstream, bodies } = deepseekLikeUpstream();
    const fetchWithCompat = withDeepSeekCompat(upstream as unknown as typeof fetch);
    await fetchWithCompat(CHAT_URL, jsonInit({
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "q" }],
      tools: [SEARCH_POLICY_TOOL],
      tool_choice: FORCED_TOOL_CHOICE,
      thinking: { type: "disabled" },
    }));
    expect(bodies[0].thinking).toEqual({ type: "disabled" });
    expect(bodies).toHaveLength(1);
  });

  it("非JSON body原样转发（不解析不修改）", async () => {
    const upstream = vi.fn(
      async (_input: unknown, init?: RequestInit) =>
        new Response(String(init?.method ?? "GET"), { status: 200 }),
    );
    const fetchWithCompat = withDeepSeekCompat(upstream as unknown as typeof fetch);
    const rawBody = "not-json-body";
    await fetchWithCompat(CHAT_URL, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: rawBody,
    });
    expect(upstream).toHaveBeenCalledTimes(1);
    expect((upstream.mock.calls[0][1] as RequestInit).body).toBe(rawBody);
  });

  it("Authorization头原样透传且适配器不记录任何日志", async () => {
    const { upstream } = deepseekLikeUpstream();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const fetchWithCompat = withDeepSeekCompat(upstream as unknown as typeof fetch);
    await fetchWithCompat(CHAT_URL, jsonInit({
      model: "deepseek-v4-flash",
      messages: [{ role: "user", content: "q" }],
      tools: [SEARCH_POLICY_TOOL],
      tool_choice: FORCED_TOOL_CHOICE,
    }));
    const init = upstream.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-key");
    expect(logSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it("isExplicitToolChoice：对象形式为显式，字符串/缺失不是", () => {
    expect(isExplicitToolChoice(FORCED_TOOL_CHOICE)).toBe(true);
    expect(isExplicitToolChoice({ type: "tool", toolName: "searchPolicy" })).toBe(true);
    expect(isExplicitToolChoice("auto")).toBe(false);
    expect(isExplicitToolChoice("none")).toBe(false);
    expect(isExplicitToolChoice(undefined)).toBe(false);
    expect(isExplicitToolChoice(null)).toBe(false);
  });
});
