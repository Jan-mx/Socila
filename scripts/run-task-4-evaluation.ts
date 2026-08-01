import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import dotenv from "dotenv";
import { formatEvaluationGitCommit } from "@/lib/evaluation/run-metadata";
import {
  buildTask4FormalReport,
  createTask4Dataset,
  runCheckpointedSessions,
  TASK_4_DATASET_VERSION,
  validateTask4Dataset,
  type Task4Checkpoint,
} from "@/lib/evaluation/task-4-evaluator";
import { createTask4ProductionRuntime, executeTask4Session } from "@/lib/evaluation/task-4-live";
import { runTask4Probe } from "@/lib/evaluation/task-4-probe";

const root = process.cwd();
dotenv.config({ path: resolve(root, ".env.local"), quiet: true });
if (!process.argv.includes("--run")) {
  throw new Error("Task 4 makes 240 real-provider sessions. Run explicitly with: npm run evaluation:task4 -- --run");
}

const outputDirectory = resolve(root, ".superpowers", "sdd", "evaluation");
const checkpointPath = join(outputDirectory, "task-4-checkpoint.json");
await mkdir(outputDirectory, { recursive: true });
const cases = createTask4Dataset();
validateTask4Dataset(cases);
const startedAt = new Date().toISOString();
let planningInvocations = 0;
const production = await createTask4ProductionRuntime({ capturePlanResult: () => { planningInvocations += 1; } });
const promptSource = await readFile(resolve(root, "src", "lib", "ai", "prompts.ts"), "utf8");
const promptHash = sha256(promptSource);
const dslVersion = [...new Set(production.repository.rules.map((rule) => rule.dsl_version))].sort().join(",");
const evaluationSourcePaths = [
  "src/lib/ai/agent.ts",
  "src/lib/ai/tools.ts",
  "src/lib/engine/orchestrator.ts",
  "src/lib/engine/plan-service.ts",
  "src/lib/evaluation/task-4-dataset.v1.ts",
  "src/lib/evaluation/task-4-evaluator.ts",
  "src/lib/evaluation/task-4-live.ts",
  "src/lib/evaluation/task-4-probe.ts",
];
const evaluationSources = await Promise.all(
  evaluationSourcePaths.map((path) => readFile(resolve(root, path), "utf8")),
);
const runFingerprint = sha256(JSON.stringify({
  model: production.config.model,
  baseURL: production.config.baseURL,
  promptHash,
  dslVersion,
  parameterVersion: "SHANGHAI_BASE@2026-02-26",
  rules: production.repository.rules,
  params: production.repository.params,
  cases,
  evaluationSourceHash: sha256(evaluationSources.join("\n---FILE---\n")),
  temperature: 0.1,
  stepLimit: 8,
}));
const checkpoint = await loadCheckpoint(checkpointPath);
if (checkpoint.runFingerprint === undefined) {
  const hasCompletedSessions = Object.values(checkpoint.sessions).some((session) => session.status === "completed");
  if (hasCompletedSessions) {
    throw new Error("legacy checkpoint contains completed sessions but has no run fingerprint; start a new checkpoint to avoid mixed-run metrics");
  }
  checkpoint.runFingerprint = runFingerprint;
  await writeFile(checkpointPath, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
}
const run = await runCheckpointedSessions({
  cases,
  repetitions: 3,
  checkpoint,
  runFingerprint,
  execute: (item, repetition) => executeTask4Session(item, repetition, production.runtime),
  saveCheckpoint: (value) => writeFile(checkpointPath, `${JSON.stringify(value, null, 2)}\n`, "utf8"),
});
const probe = run.abortedReason
  ? {
      scope: "skipped because the configured provider reported exhausted daily quota; no HTTP network and no Neon persistence",
      cases: [],
      skippedReason: run.abortedReason,
    }
  : await runTask4Probe({ cases, runtime: production.runtime, getPlanningInvocationCount: () => planningInvocations });
const finishedAt = new Date().toISOString();
const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const porcelain = execFileSync("git", ["status", "--porcelain=v1"], { cwd: root, encoding: "utf8" });
const formal = buildTask4FormalReport({
  model: production.config.model,
  promptHash,
  promptVersion: `production-prompts.ts@${promptHash}`,
  runFingerprint,
  dslVersion,
  parameterVersion: "SHANGHAI_BASE@2026-02-26",
  gitCommit: formatEvaluationGitCommit(head, porcelain),
  gitStatus: porcelain.split(/\r?\n/).filter(Boolean),
  startedAt,
  finishedAt,
  sessions: Object.values(run.sessions).sort((left, right) => left.sessionId.localeCompare(right.sessionId)),
  expectedSessions: run.expectedSessions,
  metrics: run.finalMetrics,
  abortedReason: run.abortedReason,
  probe,
});
await Promise.all([
  writeFile(join(outputDirectory, "task-4-evaluation-report.json"), `${JSON.stringify(formal.json, null, 2)}\n`, "utf8"),
  writeFile(join(outputDirectory, "task-4-evaluation-report.md"), formal.markdown, "utf8"),
]);
process.stdout.write(`${formal.json.status}: ${run.completedSessions}/${run.expectedSessions} completed sessions\n`);

async function loadCheckpoint(path: string): Promise<Task4Checkpoint> {
  try {
    const source = await readFile(path, "utf8");
    return JSON.parse(source) as Task4Checkpoint;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { version: 1, datasetVersion: TASK_4_DATASET_VERSION, repetitions: 3, sessions: {} };
  }
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}
