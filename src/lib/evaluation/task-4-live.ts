import { createOpenAI } from "@ai-sdk/openai";
import type { ModelMessage } from "ai";
import type { ChatContext } from "@/lib/ai/agent";
import { createAgentRuntime } from "@/lib/ai/agent";
import { getOpenAIConfig } from "@/lib/ai/config";
import { computePlanSchema, createAgentTools, updateProfileSchema, validateFieldSchema } from "@/lib/ai/tools";
import { createComputePlanService, createRepositoryOrchestrator, type ComputePlanServiceResult } from "@/lib/engine/plan-service";
import { loadRepositoryEvaluationInputs } from "./policy-evaluator";
import {
  findPolicyNumberOverreach,
  mergeProfile,
  type Task4ConversationCase,
  type Task4SessionResult,
  type Task4ToolCall,
  type Task4TurnRecord,
} from "./task-4-evaluator";

interface StreamPart {
  type: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  text?: string;
  invalid?: boolean;
}

interface EvaluationStream {
  fullStream: AsyncIterable<StreamPart>;
  response: PromiseLike<{ messages: ModelMessage[] }>;
  totalUsage: PromiseLike<unknown>;
}

export interface EvaluationAgentRuntime {
  createChatStream(messages: ModelMessage[], context?: ChatContext): EvaluationStream;
}

export async function createTask4ProductionRuntime(options: {
  asOfDate?: string;
  capturePlanResult?: (result: ComputePlanServiceResult) => void;
} = {}) {
  const repository = await loadRepositoryEvaluationInputs();
  const service = createComputePlanService({
    orchestrate: createRepositoryOrchestrator({
      rules: repository.rules,
      params: repository.params,
      ruleSetId: "RS-SHANGHAI-PLAN-V1",
      policyPackId: "SHANGHAI_BASE",
    }),
    savePlan: async () => { throw new Error("Task 4 evaluator must never persist plans"); },
  });
  const agentTools = createAgentTools(service, {
    asOfDate: options.asOfDate,
    persist: false,
    captureResult: options.capturePlanResult,
  });
  const config = getOpenAIConfig();
  const provider = createOpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
  const runtime = createAgentRuntime({ model: provider(config.model), tools: agentTools });
  return { runtime: runtime as EvaluationAgentRuntime, config, repository };
}

export async function executeTask4Session(
  item: Task4ConversationCase,
  repetition: number,
  runtime: EvaluationAgentRuntime,
  clock: () => number = () => Date.now(),
): Promise<Omit<Task4SessionResult, "attempts">> {
  const history: ModelMessage[] = [];
  let profile = structuredClone(item.initialProfile ?? {}) as Record<string, unknown>;
  let questions = structuredClone(item.initialQuestions ?? []);
  const turns: Task4TurnRecord[] = [];
  const toolCalls: Task4ToolCall[] = [];
  const allToolOutputs: unknown[] = [];
  const seenUserTurns: string[] = [];
  const overreach = [] as Task4SessionResult["policyOverreachSpans"];
  let taskCompleted = false;

  for (const userText of item.turns) {
    seenUserTurns.push(userText);
    history.push({ role: "user", content: userText });
    const started = clock();
    const stream = runtime.createChatStream(history, {
      userProfile: profile as ChatContext["userProfile"],
      questions,
      sessionId: `${item.id}#${repetition}`,
    });
    const turnCalls: Task4ToolCall[] = [];
    const callsById = new Map<string, Task4ToolCall>();
    let assistantText = "";
    for await (const part of stream.fullStream) {
      if (part.type === "text-delta") assistantText += part.text ?? "";
      if (part.type === "error") throw normalizeStreamError(part.error);
      if (part.type === "tool-call") {
        const validation = validateToolInput(part.toolName ?? "", part.input);
        const call: Task4ToolCall = {
          name: part.toolName ?? "unknown",
          input: structuredClone(part.input),
          valid: !part.invalid && validation.valid,
          ...(!validation.valid ? { validationError: validation.error } : {}),
        };
        turnCalls.push(call);
        toolCalls.push(call);
        if (part.toolCallId) callsById.set(part.toolCallId, call);
      }
      if (part.type === "tool-result") {
        const call = part.toolCallId ? callsById.get(part.toolCallId) : undefined;
        if (call) call.output = structuredClone(part.output);
        allToolOutputs.push(part.output);
        if (part.toolName === "updateProfile" && isRecord(part.output) && isRecord(part.output.profile)) {
          profile = mergeProfile(profile, part.output.profile);
        }
        if (part.toolName === "computePlan" && isRecord(part.output)) {
          if (part.output.success === true && part.output.needs_agent === false) taskCompleted = true;
          if (Array.isArray(part.output.questions)) questions = structuredClone(part.output.questions) as typeof questions;
        }
      }
      if (part.type === "tool-error") {
        const call = part.toolCallId ? callsById.get(part.toolCallId) : undefined;
        if (call) {
          call.valid = false;
          call.validationError = errorMessage(part.error);
        }
      }
    }
    const [response, usage] = await Promise.all([stream.response, stream.totalUsage]);
    history.push(...response.messages);
    const spans = findPolicyNumberOverreach(assistantText, {
      userAndContextValues: [seenUserTurns, item.initialProfile, item.initialQuestions],
      toolResultValues: allToolOutputs,
    });
    overreach.push(...spans);
    turns.push({ userText, assistantText, toolCalls: turnCalls, usage, latencyMs: clock() - started });
  }

  return {
    sessionId: `${item.id}#${repetition}`,
    caseId: item.id,
    repetition,
    category: item.category,
    status: "completed",
    expectedProfile: structuredClone(item.expectedProfile),
    forbiddenProfileFields: [...item.forbiddenProfileFields],
    finalProfile: profile,
    allowedTools: [...item.allowedTools],
    requiredToolSequence: [...item.requiredToolSequence],
    toolCalls,
    completionExpected: item.completionExpected,
    taskCompleted,
    policyOverreachSpans: overreach,
    turns,
  };
}

function validateToolInput(name: string, input: unknown): { valid: boolean; error?: string } {
  const schema = name === "computePlan" ? computePlanSchema : name === "updateProfile" ? updateProfileSchema : name === "validateField" ? validateFieldSchema : undefined;
  if (!schema) return { valid: false, error: `unknown tool ${name}` };
  const result = schema.safeParse(input);
  return result.success ? { valid: true } : { valid: false, error: result.error.message };
}

function normalizeStreamError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(errorMessage(error));
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
