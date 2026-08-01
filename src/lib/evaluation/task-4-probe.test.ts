import { describe, expect, it } from "vitest";
import { TASK_4_PROBE_CASE_IDS, type Task4ConversationCase } from "./task-4-evaluator";
import { runTask4Probe } from "./task-4-probe";

describe("runTask4Probe", () => {
  it("executes real multi-turn handler boundaries and propagates profile context", async () => {
    const callsBySession = new Map<string, number>();
    const secondTurnProfiles: unknown[] = [];
    let planningInvocations = 0;
    const runtime = {
      createChatStream(_messages: unknown[], context?: { sessionId?: string; userProfile?: unknown }) {
        const sessionId = context?.sessionId ?? "unknown";
        const turn = (callsBySession.get(sessionId) ?? 0) + 1;
        callsBySession.set(sessionId, turn);
        if (turn === 2) secondTurnProfiles.push(structuredClone(context?.userProfile));
        const assistantMessage = turn === 1
          ? {
              id: `assistant-${sessionId}-1`,
              role: "assistant",
              parts: [{
                type: "tool-updateProfile",
                toolCallId: `profile-${sessionId}-1`,
                state: "output-available",
                input: { basic: { gender: "male" } },
                output: { updated: true, profile: { basic: { gender: "male" } } },
              }],
            }
          : {
              id: `assistant-${sessionId}-2`,
              role: "assistant",
              parts: [
                {
                  type: "tool-updateProfile",
                  toolCallId: `profile-${sessionId}-2`,
                  state: "output-available",
                  input: { basic: { birth_year: 1973 } },
                  output: { updated: true, profile: { basic: { birth_year: 1973 } } },
                },
                {
                  type: "tool-computePlan",
                  toolCallId: `plan-${sessionId}`,
                  state: "output-available",
                  input: { basic: { gender: "male", birth_year: 1973 } },
                  output: { success: true, needs_agent: false, questions: [] },
                },
              ],
            };
        if (turn === 2) planningInvocations += 1;
        return {
          totalUsage: Promise.resolve({ totalTokens: 1 }),
          steps: Promise.resolve([]),
          toUIMessageStreamResponse(options: {
            originalMessages: unknown[];
            onFinish: (event: { messages: unknown[] }) => Promise<void>;
          }) {
            void options.onFinish({ messages: [...options.originalMessages, assistantMessage] });
            return new Response("stream");
          },
        };
      },
    };
    const cases = TASK_4_PROBE_CASE_IDS.map((id): Task4ConversationCase => ({
      id,
      category: "multi_turn_incremental",
      turns: ["我是男的。", "1973年出生。"],
      expectedProfile: { basic: { gender: "male", birth_year: 1973 } },
      forbiddenProfileFields: [],
      allowedTools: ["updateProfile", "computePlan"],
      requiredToolSequence: ["updateProfile", "computePlan"],
      completionExpected: true,
      policyCalculationAllowed: true,
    }));

    const result = await runTask4Probe({
      cases,
      runtime: runtime as never,
      getPlanningInvocationCount: () => planningInvocations,
    });

    expect([...callsBySession.values()]).toEqual(Array(20).fill(2));
    expect(secondTurnProfiles).toEqual(Array(20).fill({ basic: { gender: "male" } }));
    expect(result.cases.every((item) => item.status === "passed")).toBe(true);
    expect(result.cases.every((item) => item.planningAdapterInvoked)).toBe(true);
  });
});
