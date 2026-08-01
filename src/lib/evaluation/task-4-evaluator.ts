import { createEvaluationMetadata, type EvaluationMetric } from "./contracts";
import {
  createTask4Dataset,
  TASK_4_DATASET_VERSION,
  TASK_4_PROBE_CASE_IDS,
  type Task4Category,
  type Task4ConversationCase,
} from "./task-4-dataset.v1";

export { createTask4Dataset, TASK_4_DATASET_VERSION, TASK_4_PROBE_CASE_IDS };
export type { Task4ConversationCase };

export interface Task4Attempt {
  attempt: number;
  startedAt: string;
  endedAt: string;
  status: "completed" | "provider_error" | "model_error";
  error?: string;
  retryable: boolean;
}

export interface Task4ToolCall {
  name: string;
  input: unknown;
  output?: unknown;
  valid: boolean;
  validationError?: string;
}

export interface PolicyNumberSpan {
  text: string;
  start: number;
  end: number;
  sentence: string;
}

export interface Task4TurnRecord {
  userText: string;
  assistantText: string;
  toolCalls: Task4ToolCall[];
  providerError?: string;
  usage?: unknown;
  latencyMs?: number;
}

export interface Task4SessionResult {
  sessionId: string;
  caseId: string;
  repetition: number;
  category: Task4Category;
  status: "completed" | "provider_error" | "model_error";
  expectedProfile: Record<string, unknown>;
  forbiddenProfileFields: string[];
  finalProfile: Record<string, unknown>;
  allowedTools: string[];
  requiredToolSequence: string[];
  toolCalls: Task4ToolCall[];
  completionExpected: boolean;
  taskCompleted: boolean;
  policyOverreachSpans: PolicyNumberSpan[];
  turns: Task4TurnRecord[];
  attempts: Task4Attempt[];
  error?: string;
}

export interface Task4Checkpoint {
  version: 1;
  datasetVersion: string;
  repetitions: 3;
  runFingerprint?: string;
  sessions: Record<string, Task4SessionResult>;
}

const EXPECTED_CATEGORY_COUNTS: Record<Task4Category, number> = {
  single_turn_complete: 20,
  multi_turn_incremental: 20,
  ambiguous_expression: 15,
  correction_or_invalid: 15,
  out_of_scope_or_injection: 10,
};

export function validateTask4Dataset(cases: Task4ConversationCase[]): void {
  if (cases.length !== 80) throw new Error(`Task 4 dataset must contain exactly 80 cases; found ${cases.length}`);
  if (new Set(cases.map((item) => item.id)).size !== cases.length) throw new Error("Task 4 case IDs must be unique");
  const transcripts = new Set<string>();
  for (const item of cases) {
    if (!(item.category in EXPECTED_CATEGORY_COUNTS)) throw new Error(`unknown Task 4 category: ${item.category}`);
    if (!Array.isArray(item.turns) || item.turns.length === 0 || item.turns.some((turn) => !turn.trim())) throw new Error(`${item.id} requires authored user turns`);
    const transcript = item.turns.join("\n").trim();
    if (transcripts.has(transcript)) throw new Error(`${item.id} duplicates another case transcript`);
    transcripts.add(transcript);
    if (!isRecord(item.expectedProfile)) throw new Error(`${item.id} requires an expected profile label`);
    if (!Array.isArray(item.forbiddenProfileFields)) throw new Error(`${item.id} requires forbidden field labels`);
    if (!Array.isArray(item.allowedTools)) throw new Error(`${item.id} requires allowed tool labels`);
    if (item.requiredToolSequence.some((name) => !item.allowedTools.includes(name))) throw new Error(`${item.id} requires a tool outside its allowed route`);
    if (typeof item.completionExpected !== "boolean" || typeof item.policyCalculationAllowed !== "boolean") throw new Error(`${item.id} requires completion and policy labels`);
    if (!item.policyCalculationAllowed && item.requiredToolSequence.includes("computePlan")) throw new Error(`${item.id} forbids policy calculation but requires computePlan`);
    if (!item.policyCalculationAllowed && item.allowedTools.includes("computePlan")) throw new Error(`${item.id} forbids policy calculation but allows computePlan`);
    if (leaves(item.expectedProfile).length > 0 && !item.allowedTools.includes("updateProfile")) throw new Error(`${item.id} labels profile fields but does not allow updateProfile`);
  }
  for (const [category, expected] of Object.entries(EXPECTED_CATEGORY_COUNTS)) {
    const actual = cases.filter((item) => item.category === category).length;
    if (actual !== expected) throw new Error(`${category} must contain ${expected} cases; found ${actual}`);
  }
  if (TASK_4_PROBE_CASE_IDS.length !== 20 || new Set(TASK_4_PROBE_CASE_IDS).size !== 20) throw new Error("Task 4 probe subset must contain exactly 20 fixed unique case IDs");
  const ids = new Set(cases.map((item) => item.id));
  if (TASK_4_PROBE_CASE_IDS.some((id) => !ids.has(id))) throw new Error("Task 4 probe subset references an unknown case");
}

export function buildTask4Metrics(sessions: Task4SessionResult[]): EvaluationMetric[] {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let exactMatches = 0;
  let routeMatches = 0;
  let validToolCalls = 0;
  let totalToolCalls = 0;

  for (const session of sessions) {
    const expected = new Map(leaves(session.expectedProfile));
    const actual = new Map(leaves(session.finalProfile));
    for (const [path, expectedValue] of expected) {
      if (actual.has(path) && deepEqual(actual.get(path), expectedValue)) truePositive += 1;
      else falseNegative += 1;
    }
    for (const [path, actualValue] of actual) {
      if (!expected.has(path) || !deepEqual(expected.get(path), actualValue)) falsePositive += 1;
    }
    const forbiddenPresent = session.forbiddenProfileFields.some((path) => getPath(session.finalProfile, path) !== undefined);
    if (!forbiddenPresent && [...expected].every(([path, value]) => deepEqual(getPath(session.finalProfile, path), value))) exactMatches += 1;
    const route = session.toolCalls.map((call) => call.name);
    if (route.every((name) => session.allowedTools.includes(name)) && isSubsequence(session.requiredToolSequence, route)) routeMatches += 1;
    totalToolCalls += session.toolCalls.length;
    validToolCalls += session.toolCalls.filter((call) => call.valid).length;
  }

  const multiTurn = sessions.filter((session) => session.category === "multi_turn_incremental");
  const completionMatches = multiTurn.filter((session) => session.taskCompleted === session.completionExpected).length;
  const overreachCount = sessions.reduce((sum, session) => sum + session.policyOverreachSpans.length, 0);
  const overreachFree = sessions.filter((session) => session.policyOverreachSpans.length === 0).length;
  return [
    metric("micro field precision", truePositive, truePositive + falsePositive, "all predicted final-profile leaf fields across completed sessions"),
    metric("micro field recall", truePositive, truePositive + falseNegative, "all manually labeled expected final-profile leaf fields across completed sessions"),
    metric("micro field F1", 2 * truePositive, 2 * truePositive + falsePositive + falseNegative, "micro field precision/recall harmonic score"),
    metric("exact final-profile match", exactMatches, sessions.length, "expected labeled fields plus absence of contradicted/forbidden fields"),
    metric("tool-routing accuracy", routeMatches, sessions.length, "allowed tools and required tool sequence per case label"),
    metric("Zod tool-argument validity", validToolCalls, totalToolCalls, "all emitted production-schema tool calls"),
    metric("multi-turn task completion", completionMatches, multiTurn.length, "multi-turn cases compared with manually labeled completion expectation"),
    metric("policy-number overreach count", overreachCount, sessions.length, "flagged unsupported policy-related numeric spans per completed session; lower is better"),
    metric("policy-number overreach-free sessions", overreachFree, sessions.length, "completed sessions with zero unsupported policy-related numeric text spans"),
  ];
}

export function buildTask4FormalReport(input: {
  model: string;
  promptHash: string;
  promptVersion: string;
  runFingerprint?: string;
  dslVersion: string;
  parameterVersion: string;
  gitCommit: string;
  gitStatus: string[];
  startedAt: string;
  finishedAt: string;
  sessions: Task4SessionResult[];
  expectedSessions: number;
  metrics?: EvaluationMetric[];
  abortedReason?: string;
  probe: { scope: string; cases: unknown[] };
}) {
  const completedSessions = input.sessions.filter((session) => session.status === "completed").length;
  const final = completedSessions === 240 && input.expectedSessions === 240 && input.metrics !== undefined;
  const metadata = createEvaluationMetadata({
    model: input.model,
    promptVersion: input.promptVersion,
    dslVersion: input.dslVersion,
    parameterVersion: input.parameterVersion,
    datasetVersion: TASK_4_DATASET_VERSION,
    gitCommit: input.gitCommit,
    repetitions: 3,
  }, {
    now: () => new Date(input.finishedAt),
    runtime: `node-${process.version}; ${process.platform}-${process.arch}; in-process AI SDK stream`,
  });
  const failures = input.sessions.flatMap(sessionFailures);
  const json = {
    schemaVersion: "task-4-evaluation-report-v1",
    evaluator: "labeled production-prompt Agent conversation evaluation",
    status: final ? "final" as const : "incomplete" as const,
    scope: "real configured provider through in-process Vercel AI SDK stream; persistence-disabled repository policy service; no Neon writes",
    metadata: {
      ...metadata,
      promptHash: input.promptHash,
      gitStatus: input.gitStatus,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      durationMs: new Date(input.finishedAt).getTime() - new Date(input.startedAt).getTime(),
      temperature: 0.1,
      stepLimit: 8,
      ...(input.runFingerprint ? { runFingerprint: input.runFingerprint } : {}),
    },
    execution: {
      completedSessions,
      expectedSessions: input.expectedSessions,
      repetitions: 3,
      ...(input.abortedReason ? { abortedReason: input.abortedReason } : {}),
    },
    dataset: { version: TASK_4_DATASET_VERSION, cases: createTask4Dataset(), fixedProbeCaseIds: TASK_4_PROBE_CASE_IDS },
    sessions: input.sessions,
    ...(final ? { metrics: input.metrics } : {}),
    failures,
    probe: input.probe,
  };
  const lines = [
    "# Task 4 Agent Evaluation Report",
    "",
    final ? `FINAL: ${completedSessions}/${input.expectedSessions} completed sessions` : `INCOMPLETE: ${completedSessions}/${input.expectedSessions} completed sessions`,
    "",
    `- Model: ${input.model}`,
    `- Prompt version: ${input.promptVersion}`,
    `- Prompt hash: ${input.promptHash}`,
    ...(input.runFingerprint ? [`- Run fingerprint: ${input.runFingerprint}`] : []),
    `- DSL version: ${input.dslVersion}`,
    `- Parameter version: ${input.parameterVersion}`,
    `- Dataset version: ${TASK_4_DATASET_VERSION}`,
    `- Git: ${input.gitCommit}`,
    `- Runtime: ${metadata.runtime}`,
    `- Started: ${input.startedAt}`,
    `- Finished: ${input.finishedAt}`,
    `- Repetitions: 3`,
    ...(input.abortedReason ? [`- Aborted: ${input.abortedReason}`] : []),
    `- Probe scope: ${input.probe.scope}`,
    "",
  ];
  if (final) {
    lines.push("## Metrics", "", "| Metric | n/N | Rate | Scope |", "| --- | ---: | ---: | --- |", ...input.metrics!.map((item) => `| ${item.name} | ${item.numerator}/${item.denominator} | ${(item.rate * 100).toFixed(2)}% | ${item.scope} |`), "");
  } else {
    lines.push("Final percentages are intentionally withheld until all 240 sessions complete.", "");
  }
  lines.push("## Complete Failures", "");
  if (failures.length === 0) lines.push("None.", "");
  else for (const failure of failures) lines.push(`- ${failure.sessionId}: ${failure.issues.join("; ")}`);
  lines.push("", "## 20-case Chat API Probe", "", `Scope: ${input.probe.scope}`, "", `Cases recorded: ${input.probe.cases.length}`, "");
  return { json, markdown: `${lines.join("\n")}\n` };
}

export function findPolicyNumberOverreach(
  text: string,
  sources: { userAndContextValues: unknown[]; toolResultValues: unknown[] },
): PolicyNumberSpan[] {
  const allowed = new Set([...numericValues(sources.userAndContextValues), ...numericValues(sources.toolResultValues)].map(normalizeNumber));
  const spans: PolicyNumberSpan[] = [];
  const pattern = /\d+(?:\.\d+)?(?:\s*(?:岁|年|个月|月|元|%|％))?/g;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const numeric = Number(match[0].match(/\d+(?:\.\d+)?/)?.[0]);
    if (numeric === 12333 || numeric === 12329 || allowed.has(normalizeNumber(numeric))) continue;
    const lineStart = Math.max(text.lastIndexOf("\n", start - 1) + 1, 0);
    const prefix = text.slice(lineStart, start);
    if (/^\s*(?:[-*]\s*)?$/.test(prefix) && /^[1-9]\d*$/.test(match[0]) && /^[.、)]/.test(text.slice(end))) continue;
    const sentenceStart = Math.max(0, Math.max(text.lastIndexOf("。", start - 1), text.lastIndexOf("\n", start - 1)) + 1);
    const punctuationEnds = [text.indexOf("。", end), text.indexOf("\n", end)].filter((index) => index >= 0);
    const sentenceEnd = punctuationEnds.length > 0 ? Math.min(...punctuationEnds) + 1 : text.length;
    const sentence = text.slice(sentenceStart, sentenceEnd);
    const hasPolicyContext = /(退休|养老|医保|社保|缴费|失业金|补贴|政策|费率|基数|待遇|缺口|年龄)/.test(sentence);
    const hasPolicyUnit = /(岁|年|个月|月|元|%|％)/.test(match[0]);
    if (hasPolicyContext && hasPolicyUnit) spans.push({ text: match[0], start, end, sentence });
  }
  return spans;
}

export async function runCheckpointedSessions(options: {
  cases: Task4ConversationCase[];
  repetitions: 3;
  checkpoint: Task4Checkpoint;
  runFingerprint?: string;
  execute: (item: Task4ConversationCase, repetition: number) => Promise<Omit<Task4SessionResult, "attempts">>;
  saveCheckpoint: (checkpoint: Task4Checkpoint) => Promise<void>;
  maxProviderAttempts?: number;
  now?: () => Date;
}) {
  if (options.checkpoint.datasetVersion !== TASK_4_DATASET_VERSION) throw new Error(`checkpoint dataset version mismatch: expected ${TASK_4_DATASET_VERSION}, found ${options.checkpoint.datasetVersion}`);
  if (options.checkpoint.repetitions !== options.repetitions || options.repetitions !== 3) throw new Error("checkpoint repetitions mismatch: Task 4 requires exactly 3");
  if (options.runFingerprint !== undefined && options.checkpoint.runFingerprint !== options.runFingerprint) throw new Error(`checkpoint run fingerprint mismatch: expected ${options.runFingerprint}, found ${options.checkpoint.runFingerprint ?? "missing"}`);
  const allowedSessionIds = new Set(options.cases.flatMap((item) => [1, 2, 3].map((repetition) => `${item.id}#${repetition}`)));
  for (const sessionId of Object.keys(options.checkpoint.sessions)) {
    if (!allowedSessionIds.has(sessionId)) throw new Error(`checkpoint contains stale session ${sessionId}`);
  }
  const maxProviderAttempts = options.maxProviderAttempts ?? 3;
  const now = options.now ?? (() => new Date());
  let abortedReason: string | undefined;
  evaluation: for (const item of options.cases) {
    for (let repetition = 1; repetition <= options.repetitions; repetition += 1) {
      const sessionId = `${item.id}#${repetition}`;
      if (options.checkpoint.sessions[sessionId]?.status === "completed") continue;
      if (options.checkpoint.sessions[sessionId]?.status === "model_error") continue;
      const retainedAttempts = options.checkpoint.sessions[sessionId]?.attempts ?? [];
      for (let attemptOffset = 0; attemptOffset < maxProviderAttempts; attemptOffset += 1) {
        const attemptNumber = retainedAttempts.length + 1;
        const startedAt = now().toISOString();
        try {
          const result = await options.execute(item, repetition);
          const attempt: Task4Attempt = { attempt: attemptNumber, startedAt, endedAt: now().toISOString(), status: "completed", retryable: false };
          options.checkpoint.sessions[sessionId] = { ...result, sessionId, attempts: [...retainedAttempts, attempt] };
          await options.saveCheckpoint(options.checkpoint);
          break;
        } catch (error) {
          const retryable = isRetryableProviderFailure(error);
          const failureStatus: "provider_error" | "model_error" = retryable ? "provider_error" : "model_error";
          const attempt: Task4Attempt = { attempt: attemptNumber, startedAt, endedAt: now().toISOString(), status: failureStatus, error: errorMessage(error), retryable };
          retainedAttempts.push(attempt);
          options.checkpoint.sessions[sessionId] = failedSession(item, repetition, retainedAttempts, failureStatus, attempt.error!);
          await options.saveCheckpoint(options.checkpoint);
          if (isTerminalProviderQuotaFailure(error)) {
            abortedReason = "daily provider quota exhausted; resume from checkpoint after the quota resets";
            break evaluation;
          }
          if (!retryable || attemptNumber === maxProviderAttempts) break;
        }
      }
    }
  }
  const sessions = Object.values(options.checkpoint.sessions);
  const completedSessions = sessions.filter((session) => session.status === "completed").length;
  const expectedSessions = options.cases.length * options.repetitions;
  return {
    checkpoint: options.checkpoint,
    sessions: options.checkpoint.sessions,
    completedSessions,
    expectedSessions,
    abortedReason,
    finalMetrics: completedSessions === 240 && expectedSessions === 240 ? buildTask4Metrics(sessions) : undefined,
  };
}

export function isRetryableProviderFailure(error: unknown): boolean {
  const chain = providerErrorChain(error);
  if (chain.some((item) => isRecord(item) && item.retryableProviderFailure === true)) return true;
  const statuses = chain.flatMap((item) => {
    if (!isRecord(item)) return [];
    if (typeof item.statusCode === "number") return [item.statusCode];
    if (typeof item.status === "number") return [item.status];
    return [];
  });
  if (statuses.some((status) => status === 408 || status === 409 || status === 429 || status >= 500)) return true;
  return /(fetch failed|network|timeout|timed out|ECONNRESET|ECONNREFUSED|ENOTFOUND|socket|rate limit|too many requests|temporarily unavailable)/i.test(providerErrorText(chain));
}

function isTerminalProviderQuotaFailure(error: unknown): boolean {
  return /(DAILY_LIMIT_EXCEEDED|daily usage limit exceeded)/i.test(providerErrorText(providerErrorChain(error)));
}

function providerErrorChain(error: unknown): unknown[] {
  const values: unknown[] = [];
  const pending: unknown[] = [error];
  const seen = new Set<unknown>();
  while (pending.length > 0) {
    const current = pending.shift();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    values.push(current);
    if (!isRecord(current)) continue;
    if (current.lastError !== undefined) pending.push(current.lastError);
    if (current.cause !== undefined) pending.push(current.cause);
    if (Array.isArray(current.errors)) pending.push(...current.errors);
  }
  return values;
}

function providerErrorText(chain: unknown[]): string {
  return chain.flatMap((item) => {
    if (typeof item === "string") return [item];
    if (!isRecord(item)) return [];
    return [
      item.message,
      item.responseBody,
    ].filter((value): value is string => typeof value === "string");
  }).join("\n");
}

export function mergeProfile(base: Record<string, unknown>, update: Record<string, unknown>): Record<string, unknown> {
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(update)) {
    if (isRecord(value) && isRecord(result[key])) result[key] = mergeProfile(result[key] as Record<string, unknown>, value);
    else result[key] = structuredClone(value);
  }
  return result;
}

function failedSession(item: Task4ConversationCase, repetition: number, attempts: Task4Attempt[], status: "provider_error" | "model_error", error: string): Task4SessionResult {
  return { sessionId: `${item.id}#${repetition}`, caseId: item.id, repetition, category: item.category, status, expectedProfile: item.expectedProfile, forbiddenProfileFields: item.forbiddenProfileFields, finalProfile: structuredClone(item.initialProfile ?? {}) as Record<string, unknown>, allowedTools: item.allowedTools, requiredToolSequence: item.requiredToolSequence, toolCalls: [], completionExpected: item.completionExpected, taskCompleted: false, policyOverreachSpans: [], turns: [], attempts: [...attempts], error };
}

function sessionFailures(session: Task4SessionResult): Array<{ sessionId: string; issues: string[] }> {
  const issues: string[] = [];
  if (session.status !== "completed") issues.push(`${session.status}: ${session.error ?? "unknown error"}`);
  if (session.status === "completed") {
    const expected = leaves(session.expectedProfile);
    if (expected.some(([path, value]) => !deepEqual(getPath(session.finalProfile, path), value))) issues.push("expected final-profile field mismatch");
    if (session.forbiddenProfileFields.some((path) => getPath(session.finalProfile, path) !== undefined)) issues.push("forbidden/contradicted profile field present");
    const route = session.toolCalls.map((call) => call.name);
    if (!route.every((name) => session.allowedTools.includes(name)) || !isSubsequence(session.requiredToolSequence, route)) issues.push("tool route mismatch");
    if (session.toolCalls.some((call) => !call.valid)) issues.push("invalid Zod tool arguments");
    if (session.category === "multi_turn_incremental" && session.taskCompleted !== session.completionExpected) issues.push("multi-turn completion mismatch");
    if (session.policyOverreachSpans.length > 0) issues.push(`${session.policyOverreachSpans.length} policy-number overreach span(s)`);
  }
  return issues.length > 0 ? [{ sessionId: session.sessionId, issues }] : [];
}

function metric(name: string, numerator: number, denominator: number, scope: string): EvaluationMetric {
  return { name, numerator, denominator, scope, rate: denominator === 0 ? 0 : numerator / denominator };
}

function leaves(value: unknown, prefix = ""): Array<[string, unknown]> {
  if (!isRecord(value)) return prefix ? [[prefix, value]] : [];
  return Object.entries(value).flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key));
}

function getPath(value: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => isRecord(current) ? current[key] : undefined, value);
}

function isSubsequence(expected: string[], actual: string[]): boolean {
  let index = 0;
  for (const name of actual) if (name === expected[index]) index += 1;
  return index === expected.length;
}

function numericValues(values: unknown[]): number[] {
  const found: number[] = [];
  const visit = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) found.push(value);
    else if (typeof value === "string") for (const match of value.matchAll(/\d+(?:\.\d+)?/g)) found.push(Number(match[0]));
    else if (Array.isArray(value)) value.forEach(visit);
    else if (isRecord(value)) Object.values(value).forEach(visit);
  };
  values.forEach(visit);
  return found;
}

function normalizeNumber(value: number): string { return Number(value).toString(); }
function deepEqual(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
