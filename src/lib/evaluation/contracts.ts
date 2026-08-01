import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const EVALUATION_REPORT_VERSION = "1.0";

export type EvaluationStatus = "passed" | "failed" | "error";

export interface EvaluationCase<Input = unknown, Expected = unknown> {
  id: string;
  category?: string;
  input: Input;
  expected: Expected;
}

export interface EvaluationFailure {
  message: string;
  expected?: unknown;
  actual?: unknown;
}

export interface EvaluationResult<Output = unknown> {
  caseId: string;
  status: EvaluationStatus;
  output?: Output;
  failure?: EvaluationFailure;
}

export interface EvaluationMetadata {
  model: string;
  promptVersion: string;
  dslVersion: string;
  parameterVersion: string;
  datasetVersion: string;
  gitCommit: string;
  runtime: string;
  timestamp: string;
  repetitions: number;
}

export interface EvaluationMetric {
  name: string;
  numerator: number;
  denominator: number;
  scope: string;
  rate: number;
}

export interface EvaluationSummary {
  totalCases: number;
  passed: number;
  failed: number;
  errors: number;
  failures: number;
  passRate: EvaluationMetric;
}

export interface EvaluationReport {
  version: typeof EVALUATION_REPORT_VERSION;
  evaluator: string;
  metadata: EvaluationMetadata;
  cases: EvaluationCase[];
  results: EvaluationResult[];
  metrics: EvaluationMetric[];
  summary: EvaluationSummary;
  failures: EvaluationResult[];
}

export interface EvaluationReportInput {
  evaluator: string;
  metadata: EvaluationMetadata;
  cases: EvaluationCase[];
  results: EvaluationResult[];
  metrics?: EvaluationMetric[];
}

export interface EvaluationMetadataDependencies {
  now?: () => Date;
  runtime?: string;
}

export function createEvaluationMetadata(
  input: Omit<EvaluationMetadata, "runtime" | "timestamp">,
  dependencies: EvaluationMetadataDependencies = {},
): EvaluationMetadata {
  if (!Number.isInteger(input.repetitions) || input.repetitions < 1) {
    throw new Error("repetitions must be a positive integer");
  }

  const timestamp = (dependencies.now ?? (() => new Date()))().toISOString();

  return {
    ...input,
    runtime: dependencies.runtime ?? `node-${process.version}`,
    timestamp,
  };
}

export function createMetric(input: Omit<EvaluationMetric, "rate">): EvaluationMetric {
  if (!Number.isInteger(input.denominator) || input.denominator < 1) {
    throw new Error("metric denominator must be a positive integer");
  }
  if (!Number.isInteger(input.numerator) || input.numerator < 0 || input.numerator > input.denominator) {
    throw new Error("metric numerator must be an integer between zero and the denominator");
  }
  if (!input.scope.trim()) {
    throw new Error("metric scope is required");
  }

  return {
    ...input,
    rate: input.numerator / input.denominator,
  };
}

export function summarizeEvaluationResults(results: EvaluationResult[], totalCases: number): EvaluationSummary {
  const passed = results.filter((result) => result.status === "passed").length;
  const failed = results.filter((result) => result.status === "failed").length;
  const errors = results.filter((result) => result.status === "error").length;

  return {
    totalCases,
    passed,
    failed,
    errors,
    failures: failed + errors,
    passRate: createMetric({
      name: "pass rate",
      numerator: passed,
      denominator: totalCases,
      scope: "all evaluated cases",
    }),
  };
}

export function buildEvaluationReport(input: EvaluationReportInput): EvaluationReport {
  assertValidMetadata(input.metadata);
  assertCompleteRun(input.cases, input.results);

  const failures = input.results.filter((result) => result.status !== "passed");
  for (const result of failures) {
    if (!result.failure?.message) {
      throw new Error(`failure detail is required for ${result.caseId}`);
    }
  }

  return {
    version: EVALUATION_REPORT_VERSION,
    evaluator: input.evaluator,
    metadata: input.metadata,
    cases: input.cases,
    results: input.results,
    metrics: (input.metrics ?? []).map((metric) =>
      createMetric({
        name: metric.name,
        numerator: metric.numerator,
        denominator: metric.denominator,
        scope: metric.scope,
      }),
    ),
    summary: summarizeEvaluationResults(input.results, input.cases.length),
    failures,
  };
}

export function serializeEvaluationReport(report: EvaluationReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function renderEvaluationMarkdown(report: EvaluationReport): string {
  const lines = [
    `# Evaluation Report: ${escapeMarkdown(report.evaluator)}`,
    "",
    `Schema version: ${report.version}`,
    "",
    "## Metadata",
    "",
    `- Model: ${escapeMarkdown(report.metadata.model)}`,
    `- Prompt version: ${escapeMarkdown(report.metadata.promptVersion)}`,
    `- DSL version: ${escapeMarkdown(report.metadata.dslVersion)}`,
    `- Parameter version: ${escapeMarkdown(report.metadata.parameterVersion)}`,
    `- Dataset version: ${escapeMarkdown(report.metadata.datasetVersion)}`,
    `- Git commit: ${escapeMarkdown(report.metadata.gitCommit)}`,
    `- Runtime: ${escapeMarkdown(report.metadata.runtime)}`,
    `- Timestamp: ${escapeMarkdown(report.metadata.timestamp)}`,
    `- Repetitions: ${report.metadata.repetitions}`,
    "",
    "## Summary",
    "",
    "| Total cases | Passed | Failed | Errors | Failures | Pass rate |",
    "| ---: | ---: | ---: | ---: | ---: | --- |",
    `| ${report.summary.totalCases} | ${report.summary.passed} | ${report.summary.failed} | ${report.summary.errors} | ${report.summary.failures} | ${formatMetric(report.summary.passRate)} |`,
    "",
    "## Metrics",
    "",
  ];

  if (report.metrics.length === 0) {
    lines.push("No evaluator-specific metrics recorded.", "");
  } else {
    lines.push(
      "| Metric | Result |",
      "| --- | --- |",
      ...report.metrics.map((metric) => `| ${escapeMarkdown(metric.name)} | ${formatMetric(metric)} |`),
      "",
    );
  }

  lines.push("## Failures", "");
  if (report.failures.length === 0) {
    lines.push("No failures recorded.");
  } else {
    for (const result of report.failures) {
      lines.push(`### ${escapeMarkdown(result.caseId)} (${result.status})`, "", escapeMarkdown(result.failure!.message), "");
      if ("expected" in result.failure!) {
        lines.push(`Expected: \`${escapeMarkdown(formatValue(result.failure!.expected))}\``, "");
      }
      if ("actual" in result.failure!) {
        lines.push(`Actual: \`${escapeMarkdown(formatValue(result.failure!.actual))}\``, "");
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

export async function writeEvaluationReport(
  report: EvaluationReport,
  directory: string,
): Promise<{ jsonPath: string; markdownPath: string }> {
  await mkdir(directory, { recursive: true });

  const jsonPath = join(directory, "evaluation-report.json");
  const markdownPath = join(directory, "evaluation-report.md");
  await Promise.all([
    writeFile(jsonPath, serializeEvaluationReport(report), "utf8"),
    writeFile(markdownPath, renderEvaluationMarkdown(report), "utf8"),
  ]);

  return { jsonPath, markdownPath };
}

function assertCompleteRun(cases: EvaluationCase[], results: EvaluationResult[]): void {
  if (cases.length === 0) {
    throw new Error("incomplete evaluation run: at least one case is required");
  }

  const caseIds = new Set(cases.map((evaluationCase) => evaluationCase.id));
  if (caseIds.size !== cases.length) {
    throw new Error("incomplete evaluation run: case IDs must be unique");
  }

  const resultIds = new Set(results.map((result) => result.caseId));
  if (resultIds.size !== results.length || results.length !== cases.length) {
    throw new Error("incomplete evaluation run: each case needs exactly one result");
  }

  for (const caseId of caseIds) {
    if (!resultIds.has(caseId)) {
      throw new Error(`incomplete evaluation run: missing result for ${caseId}`);
    }
  }

  for (const result of results) {
    if (!caseIds.has(result.caseId)) {
      throw new Error(`incomplete evaluation run: unknown result case ${result.caseId}`);
    }
  }
}

function assertValidMetadata(metadata: EvaluationMetadata): void {
  if (!metadata || typeof metadata !== "object") {
    throw new Error("metadata is required");
  }

  const stringFields: Array<[keyof Omit<EvaluationMetadata, "repetitions">, string]> = [
    ["model", "model"],
    ["promptVersion", "prompt version"],
    ["dslVersion", "DSL version"],
    ["parameterVersion", "parameter version"],
    ["datasetVersion", "dataset version"],
    ["gitCommit", "git commit"],
    ["runtime", "runtime"],
    ["timestamp", "timestamp"],
  ];
  for (const [field, label] of stringFields) {
    if (typeof metadata[field] !== "string" || !metadata[field].trim()) {
      throw new Error(`metadata ${label} is required`);
    }
  }
  if (Number.isNaN(Date.parse(metadata.timestamp))) {
    throw new Error("metadata timestamp must be valid");
  }
  if (!Number.isInteger(metadata.repetitions) || metadata.repetitions < 1) {
    throw new Error("metadata repetitions must be a positive integer");
  }
}

function formatMetric(metric: EvaluationMetric): string {
  return `${(metric.rate * 100).toFixed(2)}% (${metric.numerator}/${metric.denominator}; ${escapeMarkdown(metric.scope)})`;
}

function formatValue(value: unknown): string {
  return JSON.stringify(value) ?? String(value);
}

function escapeMarkdown(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/([`*_[\]{}()#+\-.!|<>])/g, "\\$1");
}
