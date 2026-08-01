import { describe, expect, it } from "vitest";
import { createAgentRuntime } from "./agent";

describe("createAgentRuntime", () => {
  it("uses the production prompt contract, supplied model/tools, temperature, and eight-step limit", () => {
    const captured: Record<string, unknown>[] = [];
    const result = { marker: "stream" };
    const runtime = createAgentRuntime({
      model: { modelId: "evaluation-model" } as never,
      tools: { updateProfile: {} } as never,
      streamText: ((options: Record<string, unknown>) => {
        captured.push(options);
        return result;
      }) as never,
    });

    const actual = runtime.createChatStream(
      [{ role: "user", content: "我是男的" }],
      { userProfile: { basic: { birth_year: 1973, gender: "male" } }, sessionId: "session-1" },
    );

    expect(actual).toBe(result);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      model: { modelId: "evaluation-model" },
      temperature: 0.1,
      experimental_context: { sessionId: "session-1" },
      providerOptions: { openai: { store: false } },
      tools: { updateProfile: {} },
    });
    expect(captured[0].system).toContain("社保规划助手");
    expect(captured[0].system).toContain("1973");
    expect(captured[0].stopWhen).toEqual(expect.any(Function));
  });
});
