import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { renderEvaluationMarkdown } from "../src/lib/evaluation/contracts";
import { formatEvaluationGitCommit } from "../src/lib/evaluation/run-metadata";
import { TASK_3_FIXED_TIMESTAMP, runTask3Evaluation } from "../src/lib/evaluation/task-3-evaluator";

const outputDirectory = join(process.cwd(), ".superpowers", "sdd", "evaluation");
const gitCommit = formatEvaluationGitCommit(
  execFileSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8" }),
  execFileSync("git", ["status", "--porcelain"], { cwd: process.cwd(), encoding: "utf8" }),
);
const run = await runTask3Evaluation({ gitCommit, now: () => new Date(TASK_3_FIXED_TIMESTAMP) });
const entryMetric = run.entry.metrics.find((metric) => metric.name === "consistent cases")!;
const publishMetric = run.publish.metrics.find((metric) => metric.name === "faulty candidates blocked")!;
if (entryMetric.denominator !== 100 || publishMetric.denominator !== 30) throw new Error("Task 3 denominator guard failed");

await mkdir(outputDirectory, { recursive: true });
const jsonPath = join(outputDirectory, "task-3-evaluation-report.json");
const markdownPath = join(outputDirectory, "task-3-evaluation-report.md");
await writeFile(jsonPath, `${JSON.stringify({ version: "task-3-v1", scope: "in-process production-logic parity; not end-to-end HTTP/DB or persistence integration", governance: run.governance, entry: run.entry, publish: run.publish }, null, 2)}\n`, "utf8");
await writeFile(markdownPath, [
  "# Task 3 Evaluation Report",
  "",
  "Scope: in-process production-logic parity using the live tool/request-handler adapters and shared plan-service factory. This is not end-to-end HTTP/DB or persistence integration.",
  "",
  "Known issue: workflow/documentation specifies a 95% regression threshold while the server publish service enforces 80%; this evaluation executes and reports the production 80% threshold without harmonizing the discrepancy.",
  "",
  "## Entry Consistency",
  "",
  "Exactly 100 deterministic profiles across 2025, 2030, 2039, and 2040 (including complete and incomplete inputs). Strict comparison includes needs_agent, questions, warnings, caveats, calculation and planning results, rule/policy metadata, and trace; only plan identity and trace timestamps are normalized.",
  "",
  renderEvaluationMarkdown(run.entry),
  "## Publish-Gate Mutation Evaluation",
  "",
  "Exactly 30 faulty and 10 valid candidates. The shared pure gate executes Ajv/schema, examples, parameter references, effective-date checks, the production 80% threshold, no-test and exception decisions, candidate-regression inclusion, and rollback transition state. Database audit persistence is not evaluated.",
  "",
  renderEvaluationMarkdown(run.publish),
  "## Governance Audit",
  "",
  `- Workflow/documentation threshold: ${(run.governance.workflowRegressionThreshold * 100).toFixed(0)}%`,
  `- Server threshold exercised: ${(run.governance.serviceRegressionThreshold * 100).toFixed(0)}%`,
  "- Known discrepancy preserved: yes",
  `- Rollback transition fixture: production -> ${run.governance.rollback.toStage} (allowed: ${run.governance.rollback.allowed})`,
  `- Explicit special gate cases: ${run.governance.specialCaseIds.join(", ")}`,
  "- Database audit persistence was not tested.",
].join("\n"), "utf8");
console.log(JSON.stringify({ entry: `${entryMetric.numerator}/${entryMetric.denominator}`, publish: `${publishMetric.numerator}/${publishMetric.denominator}`, jsonPath, markdownPath }));
