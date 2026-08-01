import { describe, expect, it } from "vitest";
import {
  buildTask4FormalReport,
  buildTask4Metrics,
  createTask4Dataset,
  findPolicyNumberOverreach,
  isRetryableProviderFailure,
  runCheckpointedSessions,
  validateTask4Dataset,
} from "./task-4-evaluator";

describe("Task 4 dataset", () => {
  it("contains exactly 80 unique manually labeled cases in the required category counts", () => {
    const dataset = createTask4Dataset();
    expect(() => validateTask4Dataset(dataset)).not.toThrow();
    expect(dataset).toHaveLength(80);
    expect(Object.fromEntries([...new Set(dataset.map((item) => item.category))].map((category) => [category, dataset.filter((item) => item.category === category).length]))).toEqual({
      single_turn_complete: 20,
      multi_turn_incremental: 20,
      ambiguous_expression: 15,
      correction_or_invalid: 15,
      out_of_scope_or_injection: 10,
    });
    expect(new Set(dataset.map((item) => item.id)).size).toBe(80);
    for (const item of dataset) {
      expect(item.turns.length).toBeGreaterThan(0);
      expect(item.expectedProfile).toBeDefined();
      expect(Array.isArray(item.allowedTools)).toBe(true);
      expect(typeof item.completionExpected).toBe("boolean");
      expect(typeof item.policyCalculationAllowed).toBe("boolean");
      if (!item.policyCalculationAllowed) {
        expect(item.allowedTools).not.toContain("computePlan");
      }
      if (Object.keys(item.expectedProfile).length > 0) {
        expect(item.allowedTools).toContain("updateProfile");
      }
    }
    expect(dataset.filter((item) => item.allowedTools.length === 0).length).toBeGreaterThan(0);
  });
});

describe("Task 4 scoring", () => {
  it("flags only unsupported policy numeric spans and preserves their offsets", () => {
    const text = "1. 建议拨打12333。养老需缴满15年，工具只返回缺口24个月。";
    const spans = findPolicyNumberOverreach(text, {
      userAndContextValues: [],
      toolResultValues: [24],
    });
    expect(spans.map((span) => span.text)).toEqual(["15年"]);
    expect(text.slice(spans[0].start, spans[0].end)).toBe("15年");
  });

  it("calculates labeled-field, exact-profile, route, validity, completion, and overreach metrics", () => {
    const metrics = buildTask4Metrics([{
      sessionId: "case-1#1",
      caseId: "case-1",
      repetition: 1,
      category: "multi_turn_incremental",
      status: "completed",
      expectedProfile: { basic: { gender: "male", birth_year: 1973 } },
      forbiddenProfileFields: ["basic.birth_month"],
      finalProfile: { basic: { gender: "male", birth_year: 1973 } },
      allowedTools: ["updateProfile", "computePlan"],
      requiredToolSequence: ["updateProfile", "computePlan"],
      toolCalls: [
        { name: "updateProfile", input: { basic: { gender: "male" } }, valid: true },
        { name: "computePlan", input: { basic: { gender: "male", birth_year: 1973 } }, valid: true },
      ],
      completionExpected: true,
      taskCompleted: true,
      policyOverreachSpans: [],
      turns: [],
      attempts: [],
    }]);
    expect(Object.fromEntries(metrics.map((metric) => [metric.name, [metric.numerator, metric.denominator]]))).toEqual({
      "micro field precision": [2, 2],
      "micro field recall": [2, 2],
      "micro field F1": [4, 4],
      "exact final-profile match": [1, 1],
      "tool-routing accuracy": [1, 1],
      "Zod tool-argument validity": [2, 2],
      "multi-turn task completion": [1, 1],
      "policy-number overreach count": [0, 1],
      "policy-number overreach-free sessions": [1, 1],
    });
  });

  it("retains retry attempts and withholds final metrics until all 240 sessions complete", async () => {
    let invocations = 0;
    const checkpoint = { version: 1 as const, datasetVersion: "task-4-agent-conversations-v1", repetitions: 3 as const, sessions: {} };
    const result = await runCheckpointedSessions({
      cases: [{ id: "case-1" }] as never,
      repetitions: 3,
      checkpoint,
      execute: async (_item, repetition) => {
        invocations += 1;
        if (invocations === 1) throw Object.assign(new Error("fetch failed"), { retryableProviderFailure: true });
        return { sessionId: `case-1#${repetition}`, status: "completed" } as never;
      },
      saveCheckpoint: async () => undefined,
      maxProviderAttempts: 2,
    });
    expect(result.sessions["case-1#1"].attempts).toHaveLength(2);
    expect(result.completedSessions).toBe(3);
    expect(result.finalMetrics).toBeUndefined();
  });

  it("rejects mismatched or stale checkpoints before executing provider work", async () => {
    const item = { id: "case-1" } as never;
    const execute = async () => { throw new Error("must not execute"); };
    await expect(runCheckpointedSessions({
      cases: [item], repetitions: 3,
      checkpoint: { version: 1, datasetVersion: "old-dataset", repetitions: 3, sessions: {} },
      execute, saveCheckpoint: async () => undefined,
    })).rejects.toThrow("checkpoint dataset version mismatch");
    await expect(runCheckpointedSessions({
      cases: [item], repetitions: 3,
      checkpoint: { version: 1, datasetVersion: "task-4-agent-conversations-v1", repetitions: 3, sessions: { "stale#1": {} as never } },
      execute, saveCheckpoint: async () => undefined,
    })).rejects.toThrow("checkpoint contains stale session stale#1");
    await expect(runCheckpointedSessions({
      cases: [item],
      repetitions: 3,
      checkpoint: { version: 1, datasetVersion: "task-4-agent-conversations-v1", repetitions: 3, runFingerprint: "old", sessions: {} },
      runFingerprint: "current",
      execute,
      saveCheckpoint: async () => undefined,
    } as never)).rejects.toThrow("checkpoint run fingerprint mismatch");
  });

  it("resumes a provider-failed checkpoint without discarding retained attempts", async () => {
    const retainedAttempts = [1, 2, 3].map((attempt) => ({
      attempt,
      startedAt: `2026-07-29T00:00:0${attempt}.000Z`,
      endedAt: `2026-07-29T00:00:0${attempt}.500Z`,
      status: "provider_error" as const,
      error: "rate limit",
      retryable: true,
    }));
    const item = createTask4Dataset()[0];
    const sessionId = `${item.id}#1`;
    const previous = {
      sessionId,
      caseId: item.id,
      repetition: 1,
      category: item.category,
      status: "provider_error" as const,
      expectedProfile: item.expectedProfile,
      forbiddenProfileFields: item.forbiddenProfileFields,
      finalProfile: {},
      allowedTools: item.allowedTools,
      requiredToolSequence: item.requiredToolSequence,
      toolCalls: [],
      completionExpected: item.completionExpected,
      taskCompleted: false,
      policyOverreachSpans: [],
      turns: [],
      attempts: retainedAttempts,
      error: "rate limit",
    };
    let invocations = 0;
    const result = await runCheckpointedSessions({
      cases: [item],
      repetitions: 3,
      checkpoint: {
        version: 1,
        datasetVersion: "task-4-agent-conversations-v1",
        repetitions: 3,
        sessions: { [sessionId]: previous },
      },
      execute: async (caseItem, repetition) => {
        invocations += 1;
        return {
          ...previous,
          sessionId: `${caseItem.id}#${repetition}`,
          repetition,
          status: "completed" as const,
        };
      },
      saveCheckpoint: async () => undefined,
      maxProviderAttempts: 1,
    });

    expect(invocations).toBe(3);
    expect(result.sessions[sessionId].status).toBe("completed");
    expect(result.sessions[sessionId].attempts).toHaveLength(4);
  });

  it("recognizes nested AI SDK 429 errors and stops the run on exhausted daily quota", async () => {
    const quotaError = Object.assign(new Error("Failed after 3 attempts. Last error: Too Many Requests"), {
      lastError: Object.assign(new Error("Too Many Requests"), {
        statusCode: 429,
        responseBody: '{"code":"USAGE_LIMIT_EXCEEDED","message":"DAILY_LIMIT_EXCEEDED: daily usage limit exceeded"}',
      }),
    });
    expect(isRetryableProviderFailure(quotaError)).toBe(true);
    const cases = createTask4Dataset().slice(0, 2);
    let invocations = 0;
    const result = await runCheckpointedSessions({
      cases,
      repetitions: 3,
      checkpoint: {
        version: 1,
        datasetVersion: "task-4-agent-conversations-v1",
        repetitions: 3,
        sessions: {},
      },
      execute: async () => {
        invocations += 1;
        throw quotaError;
      },
      saveCheckpoint: async () => undefined,
      maxProviderAttempts: 3,
    });

    expect(invocations).toBe(1);
    expect(result.abortedReason).toContain("daily provider quota exhausted");
    expect(Object.keys(result.sessions)).toHaveLength(1);
    expect(Object.values(result.sessions)[0].status).toBe("provider_error");
  });

  it("renders an explicitly incomplete formal report without partial final percentages", () => {
    const formal = buildTask4FormalReport({
      model: "configured-model",
      promptHash: "sha256:test",
      promptVersion: "production-system-prompt@sha256:test",
      dslVersion: "ssp_dsl_v1",
      parameterVersion: "SHANGHAI_BASE@2026-02-26",
      gitCommit: "abc-dirty",
      gitStatus: [" M file.ts"],
      startedAt: "2026-07-29T00:00:00.000Z",
      finishedAt: "2026-07-29T00:01:00.000Z",
      sessions: [],
      expectedSessions: 240,
      metrics: undefined,
      probe: { scope: "in-process production handler; no network or Neon", cases: [] },
    });
    expect(formal.json.status).toBe("incomplete");
    expect(formal.json.metrics).toBeUndefined();
    expect(formal.markdown).toContain("INCOMPLETE: 0/240 completed sessions");
    expect(formal.markdown).not.toMatch(/\d+\.\d+%/);
  });
});
