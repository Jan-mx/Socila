import { describe, expect, it } from "vitest";
import { executeTask4Session } from "./task-4-live";
import type { Task4ConversationCase } from "./task-4-evaluator";

describe("executeTask4Session", () => {
  it("preserves model history and merges updateProfile results before the next turn", async () => {
    const contexts: Array<Record<string, unknown> | undefined> = [];
    let call = 0;
    const runtime = {
      createChatStream(messages: unknown[], context?: Record<string, unknown>) {
        contexts.push(structuredClone(context));
        call += 1;
        const events = call === 1
          ? [
              { type: "tool-call", toolCallId: "p1", toolName: "updateProfile", input: { basic: { gender: "male" } } },
              { type: "tool-result", toolCallId: "p1", toolName: "updateProfile", input: { basic: { gender: "male" } }, output: { updated: true, profile: { basic: { gender: "male" } } } },
              { type: "text-delta", id: "t1", text: "请补充出生年份。" },
            ]
          : [
              { type: "tool-call", toolCallId: "p2", toolName: "updateProfile", input: { basic: { birth_year: 1973 } } },
              { type: "tool-result", toolCallId: "p2", toolName: "updateProfile", input: { basic: { birth_year: 1973 } }, output: { updated: true, profile: { basic: { birth_year: 1973 } } } },
              { type: "tool-call", toolCallId: "c1", toolName: "computePlan", input: { basic: { gender: "male", birth_year: 1973 } } },
              { type: "tool-result", toolCallId: "c1", toolName: "computePlan", input: { basic: { gender: "male", birth_year: 1973 } }, output: { success: true, needs_agent: false, calc: { retirement: { age: 61 } } } },
              { type: "text-delta", id: "t2", text: "工具结果显示退休年龄61岁。" },
            ];
        return {
          fullStream: { async *[Symbol.asyncIterator]() { yield* events; } },
          response: Promise.resolve({ messages: [{ role: "assistant", content: `answer-${call}` }] }),
          totalUsage: Promise.resolve({ totalTokens: 10 }),
        };
      },
    };
    const item: Task4ConversationCase = {
      id: "test-case",
      category: "multi_turn_incremental",
      turns: ["我是男的。", "1973年出生。"],
      expectedProfile: { basic: { gender: "male", birth_year: 1973 } },
      forbiddenProfileFields: [],
      allowedTools: ["updateProfile", "computePlan"],
      requiredToolSequence: ["updateProfile", "computePlan"],
      completionExpected: true,
      policyCalculationAllowed: true,
    };

    const result = await executeTask4Session(item, 1, runtime as never, () => 100);

    expect(contexts[1]?.userProfile).toEqual({ basic: { gender: "male" } });
    expect(result.finalProfile).toEqual(item.expectedProfile);
    expect(result.toolCalls).toHaveLength(3);
    expect(result.taskCompleted).toBe(true);
    expect(result.turns[1].assistantText).toContain("61岁");
    expect(result.policyOverreachSpans).toEqual([]);
  });

  it("does not whitelist policy numbers that appear only in a future user turn", async () => {
    let call = 0;
    const runtime = {
      createChatStream() {
        call += 1;
        const events = call === 1
          ? [{ type: "text-delta", text: "退休年龄是1973岁。" }]
          : [{ type: "text-delta", text: "已收到出生年份。" }];
        return {
          fullStream: { async *[Symbol.asyncIterator]() { yield* events; } },
          response: Promise.resolve({ messages: [{ role: "assistant", content: `answer-${call}` }] }),
          totalUsage: Promise.resolve({ totalTokens: 1 }),
        };
      },
    };
    const item: Task4ConversationCase = {
      id: "future-number-case",
      category: "multi_turn_incremental",
      turns: ["先说说退休年龄。", "我是1973年出生。"],
      expectedProfile: {},
      forbiddenProfileFields: [],
      allowedTools: [],
      requiredToolSequence: [],
      completionExpected: false,
      policyCalculationAllowed: false,
    };

    const result = await executeTask4Session(item, 1, runtime as never, () => 100);

    expect(result.policyOverreachSpans.map((span) => span.text)).toEqual(["1973岁"]);
  });
});
