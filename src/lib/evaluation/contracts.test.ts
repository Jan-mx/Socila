import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

type EvaluationModule = {
  createEvaluationMetadata?: (input: {
    model: string;
    promptVersion: string;
    dslVersion: string;
    parameterVersion: string;
    datasetVersion: string;
    gitCommit: string;
    repetitions: number;
  }, dependencies?: {
    now?: () => Date;
    runtime?: string;
  }) => unknown;
  createMetric?: (input: {
    name: string;
    numerator: number;
    denominator: number;
    scope: string;
  }) => unknown;
  buildEvaluationReport?: (input: unknown) => unknown;
  serializeEvaluationReport?: (report: unknown) => string;
  renderEvaluationMarkdown?: (report: unknown) => string;
  writeEvaluationReport?: (report: unknown, directory: string) => Promise<{
    jsonPath: string;
    markdownPath: string;
  }>;
};

async function evaluation(): Promise<Required<EvaluationModule>> {
  const evaluationModule = await import("./contracts").catch(() => ({} as EvaluationModule));
  expect(evaluationModule.createEvaluationMetadata).toBeTypeOf("function");
  expect(evaluationModule.createMetric).toBeTypeOf("function");
  expect(evaluationModule.buildEvaluationReport).toBeTypeOf("function");
  expect(evaluationModule.serializeEvaluationReport).toBeTypeOf("function");
  expect(evaluationModule.renderEvaluationMarkdown).toBeTypeOf("function");
  expect(evaluationModule.writeEvaluationReport).toBeTypeOf("function");
  return evaluationModule as Required<EvaluationModule>;
}

function metadata(evaluationModule: Required<EvaluationModule>) {
  return evaluationModule.createEvaluationMetadata(
    {
      model: "gpt-5",
      promptVersion: "agent-prompt-v3",
      dslVersion: "dsl-2026-07",
      parameterVersion: "params-42",
      datasetVersion: "policy-benchmark-v1",
      gitCommit: "abc123",
      repetitions: 3,
    },
    {
      now: () => new Date("2026-07-29T10:11:12.000Z"),
      runtime: "node-v20.19.0",
    },
  );
}

function reportInput(evaluationModule: Required<EvaluationModule>) {
  return {
    evaluator: "policy-benchmark",
    metadata: metadata(evaluationModule),
    cases: [
      { id: "case-pass", category: "retirement", input: { age: 60 }, expected: { eligible: true } },
      { id: "case-fail", category: "medical", input: { years: 2 }, expected: { eligible: true } },
      { id: "case-error", category: "subsidy", input: { city: "x" }, expected: { amount: 10 } },
    ],
    results: [
      { caseId: "case-pass", status: "passed" },
      {
        caseId: "case-fail",
        status: "failed",
        failure: { message: "expected eligibility", expected: true, actual: false },
      },
      {
        caseId: "case-error",
        status: "error",
        failure: { message: "rule executor timed out" },
      },
    ],
    metrics: [evaluationModule.createMetric({ name: "strict case match", numerator: 1, denominator: 3, scope: "all cases" })],
  };
}

describe("evaluation contracts and reporting", () => {
  it("captures the required report metadata deterministically", async () => {
    const evaluationModule = await evaluation();

    expect(metadata(evaluationModule)).toEqual({
      model: "gpt-5",
      promptVersion: "agent-prompt-v3",
      dslVersion: "dsl-2026-07",
      parameterVersion: "params-42",
      datasetVersion: "policy-benchmark-v1",
      gitCommit: "abc123",
      runtime: "node-v20.19.0",
      timestamp: "2026-07-29T10:11:12.000Z",
      repetitions: 3,
    });
  });

  it("rejects an invalid metric denominator", async () => {
    const evaluationModule = await evaluation();

    expect(() => evaluationModule.createMetric({ name: "invalid", numerator: 0, denominator: 0, scope: "all cases" })).toThrow(
      "denominator",
    );
  });

  it("rejects blank or malformed metadata supplied directly to report construction", async () => {
    const evaluationModule = await evaluation();
    const input = reportInput(evaluationModule);

    expect(() =>
      evaluationModule.buildEvaluationReport({
        ...input,
        metadata: {
          model: " ",
          promptVersion: "agent-prompt-v3",
          dslVersion: "dsl-2026-07",
          parameterVersion: "params-42",
          datasetVersion: "policy-benchmark-v1",
          gitCommit: "abc123",
          runtime: "node-v20.19.0",
          timestamp: "2026-07-29T10:11:12.000Z",
          repetitions: 3,
        },
      }),
    ).toThrow("metadata model");
    expect(() =>
      evaluationModule.buildEvaluationReport({
        ...input,
        metadata: {
          model: "gpt-5",
          promptVersion: "agent-prompt-v3",
          dslVersion: "dsl-2026-07",
          parameterVersion: "params-42",
          datasetVersion: "policy-benchmark-v1",
          gitCommit: "abc123",
          runtime: "node-v20.19.0",
          timestamp: "not-a-timestamp",
          repetitions: 0,
        },
      }),
    ).toThrow("metadata timestamp");
  });

  it("rejects report inputs without exactly one result for every case", async () => {
    const evaluationModule = await evaluation();

    expect(() =>
      evaluationModule.buildEvaluationReport({
        ...reportInput(evaluationModule),
        results: [{ caseId: "case-pass", status: "passed" }],
      }),
    ).toThrow("incomplete");
  });

  it("preserves each failure in deterministic JSON and Markdown report files", async () => {
    const evaluationModule = await evaluation();
    const report = evaluationModule.buildEvaluationReport(reportInput(evaluationModule));
    const directory = await mkdtemp(join(tmpdir(), "socila-evaluation-"));

    try {
      const serialized = evaluationModule.serializeEvaluationReport(report);
      const markdown = evaluationModule.renderEvaluationMarkdown(report);
      const written = await evaluationModule.writeEvaluationReport(report, directory);

      expect(evaluationModule.serializeEvaluationReport(report)).toBe(serialized);
      expect(evaluationModule.renderEvaluationMarkdown(report)).toBe(markdown);
      expect(JSON.parse(serialized)).toMatchObject({
        summary: { totalCases: 3, passed: 1, failed: 1, errors: 1, failures: 2 },
        failures: [
          { caseId: "case-fail", status: "failed", failure: { message: "expected eligibility" } },
          { caseId: "case-error", status: "error", failure: { message: "rule executor timed out" } },
        ],
      });
      expect(markdown).toContain("1/3");
      expect(markdown).toContain("case\\-fail");
      expect(markdown).toContain("case\\-error");
      expect(markdown).toContain("expected eligibility");
      expect(markdown).toContain("rule executor timed out");
      expect(await readFile(written.jsonPath, "utf8")).toBe(serialized);
      expect(await readFile(written.markdownPath, "utf8")).toBe(markdown);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("escapes Markdown control characters while retaining raw JSON values", async () => {
    const evaluationModule = await evaluation();
    const input = reportInput(evaluationModule);
    const report = evaluationModule.buildEvaluationReport({
      ...input,
      evaluator: "policy\n# injected heading",
      metrics: [evaluationModule.createMetric({ name: "strict | match", numerator: 1, denominator: 3, scope: "all\ncases" })],
      results: [
        { caseId: "case-pass", status: "passed" },
        {
          caseId: "case-fail",
          status: "failed",
          failure: { message: "failure\n| table row", expected: "`yes`", actual: "# no" },
        },
        { caseId: "case-error", status: "error", failure: { message: "rule executor timed out" } },
      ],
    });
    const json = evaluationModule.serializeEvaluationReport(report);
    const markdown = evaluationModule.renderEvaluationMarkdown(report);

    const parsed = JSON.parse(json);

    expect(parsed).toMatchObject({
      evaluator: "policy\n# injected heading",
      metrics: [{ name: "strict | match", scope: "all\ncases" }],
    });
    expect(parsed.failures.find((failure: { caseId: string }) => failure.caseId === "case-fail")).toMatchObject({
      caseId: "case-fail",
      status: "failed",
      failure: { message: "failure\n| table row", expected: "`yes`", actual: "# no" },
    });
    expect(markdown).toContain("policy\\n\\# injected heading");
    expect(markdown).toContain("strict \\| match");
    expect(markdown).toContain("all\\ncases");
    expect(markdown).toContain("failure\\n\\| table row");
    expect(markdown).toContain("\\`yes\\`");
  });
});
