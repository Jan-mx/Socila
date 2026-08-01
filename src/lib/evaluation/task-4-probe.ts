import { createChatRequestHandler, type ConversationRecord } from "@/lib/ai/chat-handler";
import type { EvaluationAgentRuntime } from "./task-4-live";
import { mergeProfile, TASK_4_PROBE_CASE_IDS, type Task4ConversationCase } from "./task-4-evaluator";

export interface Task4ProbeCaseResult {
  caseId: string;
  status: "passed" | "failed";
  streamCompleted: boolean;
  snapshotPersisted: boolean;
  finalPersisted: boolean;
  profileUpdatePropagated: boolean;
  profileMatchesLabel: boolean;
  planningAdapterInvoked: boolean;
  error?: string;
}

export async function runTask4Probe(options: {
  cases: Task4ConversationCase[];
  runtime: EvaluationAgentRuntime;
  getPlanningInvocationCount: () => number;
}): Promise<{ scope: string; cases: Task4ProbeCaseResult[] }> {
  const byId = new Map(options.cases.map((item) => [item.id, item]));
  const results: Task4ProbeCaseResult[] = [];
  for (const caseId of TASK_4_PROBE_CASE_IDS) {
    const item = byId.get(caseId);
    if (!item) throw new Error(`probe case not found: ${caseId}`);
    const records = new Map<string, ConversationRecord>();
    const updateKinds: Array<"snapshot" | "final"> = [];
    const receivedContexts: Array<Record<string, unknown>> = [];
    let updateInTurn = 0;
    const handler = createChatRequestHandler({
      conversationStore: {
        async get(id) { return records.get(id) ?? null; },
        async create(data) {
          const record: ConversationRecord = { id: data.id ?? `probe-${caseId}`, sessionId: data.sessionId, messages: [], userProfile: {} };
          records.set(record.id, record);
          return record;
        },
        async update(id, data) {
          const record = records.get(id);
          if (!record) return null;
          updateKinds.push(updateInTurn % 2 === 0 ? "snapshot" : "final");
          updateInTurn += 1;
          if (data.messages !== undefined) record.messages = structuredClone(data.messages);
          if (data.userProfile !== undefined) record.userProfile = structuredClone(data.userProfile);
          return record;
        },
      },
      streamFactory: (messages, context) => {
        receivedContexts.push(structuredClone(context) as Record<string, unknown>);
        return options.runtime.createChatStream(messages, context) as never;
      },
    });
    const planningBefore = options.getPlanningInvocationCount();
    let messages: unknown[] = [];
    let profile = structuredClone(item.initialProfile ?? {}) as Record<string, unknown>;
    let questions = structuredClone(item.initialQuestions ?? []);
    let streamCompleted = true;
    let profileUpdatePropagated = true;
    try {
      for (const [turnIndex, userText] of item.turns.entries()) {
        const expectedContextProfile = structuredClone(profile);
        messages.push({ id: `user-${caseId}-${turnIndex + 1}`, role: "user", parts: [{ type: "text", text: userText }] });
        updateInTurn = 0;
        const handled = await handler.handle({
          rawMessages: messages,
          requestedConversationId: `probe-${caseId}`,
          sessionId: `probe-session-${caseId}`,
          userProfile: profile,
          questions,
        });
        if (handled.status !== 200) throw new Error(handled.error);
        await handled.response.text();
        await handled.finished;
        const received = receivedContexts[receivedContexts.length - 1]?.userProfile;
        profileUpdatePropagated = profileUpdatePropagated && deepEqual(received, expectedContextProfile);
        const current = records.get(handled.conversationId);
        messages = structuredClone(current?.messages ?? []);
        const extracted = extractConversationState(
          messages,
          structuredClone(item.initialProfile ?? {}) as Record<string, unknown>,
        );
        profile = extracted.profile;
        questions = extracted.questions;
      }
      const finalRecord = records.get(`probe-${caseId}`);
      if (!finalRecord) throw new Error("probe conversation was not persisted");
      const snapshotPersisted = updateKinds.includes("snapshot");
      const finalPersisted = updateKinds.includes("final");
      const planningAdapterInvoked = options.getPlanningInvocationCount() > planningBefore;
      const profileMatchesLabel = matchesProfileLabel(profile, item.expectedProfile, item.forbiddenProfileFields);
      const planningInvocationMatched = planningAdapterInvoked === item.policyCalculationAllowed;
      const passed = streamCompleted && snapshotPersisted && finalPersisted && profileUpdatePropagated && profileMatchesLabel && planningInvocationMatched;
      results.push({ caseId, status: passed ? "passed" : "failed", streamCompleted, snapshotPersisted, finalPersisted, profileUpdatePropagated, profileMatchesLabel, planningAdapterInvoked });
    } catch (error) {
      streamCompleted = false;
      results.push({ caseId, status: "failed", streamCompleted, snapshotPersisted: updateKinds.includes("snapshot"), finalPersisted: updateKinds.includes("final"), profileUpdatePropagated: false, profileMatchesLabel: false, planningAdapterInvoked: options.getPlanningInvocationCount() > planningBefore, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { scope: "in-process reusable production chat request/SSE handler with in-memory conversation storage and persistence-disabled repository planning tools; no real HTTP network and no Neon persistence", cases: results };
}

function extractConversationState(messages: unknown[], initialProfile: Record<string, unknown>) {
  let profile = structuredClone(initialProfile);
  let questions: NonNullable<Task4ConversationCase["initialQuestions"]> = [];
  for (const message of messages) {
    if (!isRecord(message) || !Array.isArray(message.parts)) continue;
    for (const part of message.parts) {
      if (!isRecord(part) || part.state !== "output-available" || !isRecord(part.output)) continue;
      const toolName = typeof part.toolName === "string"
        ? part.toolName
        : typeof part.type === "string" && part.type.startsWith("tool-")
          ? part.type.slice("tool-".length)
          : "";
      if (toolName === "updateProfile" && isRecord(part.output.profile)) {
        profile = mergeProfile(profile, part.output.profile);
      }
      if (toolName === "computePlan" && Array.isArray(part.output.questions)) {
        questions = structuredClone(part.output.questions) as NonNullable<Task4ConversationCase["initialQuestions"]>;
      }
    }
  }
  return { profile, questions };
}

function matchesProfileLabel(profile: Record<string, unknown>, expected: Record<string, unknown>, forbidden: string[]): boolean {
  return leaves(expected).every(([path, value]) => deepEqual(getPath(profile, path), value))
    && forbidden.every((path) => getPath(profile, path) === undefined);
}

function leaves(value: unknown, prefix = ""): Array<[string, unknown]> {
  if (!isRecord(value)) return prefix ? [[prefix, value]] : [];
  return Object.entries(value).flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key));
}

function getPath(value: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => isRecord(current) ? current[key] : undefined, value);
}

function deepEqual(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
