import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { writeEvaluationReport } from "../src/lib/evaluation/contracts";
import {
  POLICY_BENCHMARK_CASES,
  POLICY_BENCHMARK_VERSION,
} from "../src/lib/evaluation/policy-benchmark.v1";
import {
  evaluateCases,
  loadRepositoryEvaluationInputs,
  loadRuleExampleReproductionCases,
  validateCaseProvenance,
  type PolicyEvaluationRun,
} from "../src/lib/evaluation/policy-evaluator";

type Mode = "benchmark" | "reproduction" | "all";

interface Arguments {
  mode: Mode;
  check: boolean;
  deterministic: boolean;
  outputDirectory: string;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  validateBenchmarkDataset();

  const repository = await loadRepositoryEvaluationInputs();
  const runs: Array<{ name: string; run: PolicyEvaluationRun }> = [];
  const evaluationOptions = args.deterministic
    ? {
        now: () => new Date("2026-07-29T00:00:00.000Z"),
        normalizeTraceTimestamps: true,
      }
    : {};

  if (args.mode === "benchmark" || args.mode === "all") {
    runs.push({
      name: "policy-benchmark",
      run: evaluateCases(POLICY_BENCHMARK_CASES, repository.rules, repository.params, POLICY_BENCHMARK_VERSION, evaluationOptions),
    });
  }
  if (args.mode === "reproduction" || args.mode === "all") {
    const reproductionCases = await loadRuleExampleReproductionCases();
    if (reproductionCases.length !== 28) {
      throw new Error(`rule-example reproduction count changed: expected 28, found ${reproductionCases.length}`);
    }
    runs.push({
      name: "rule-example-reproduction",
      run: evaluateCases(reproductionCases, repository.rules, repository.params, "rule-examples-reproduction-v1", evaluationOptions),
    });
  }

  let timestampedDirectory: string | undefined;
  if (!args.check) {
    const timestamp = new Date().toISOString().replaceAll(":", "-");
    timestampedDirectory = join(args.outputDirectory, timestamp);
    await mkdir(timestampedDirectory, { recursive: true });
  }

  for (const { name, run } of runs) {
    if (timestampedDirectory) {
      const paths = await writeEvaluationReport(run.report, join(timestampedDirectory, name));
      console.log(`${name} reports: ${paths.jsonPath}; ${paths.markdownPath}`);
    }
    console.log(JSON.stringify(summary(name, run)));
  }
}

function validateBenchmarkDataset(): void {
  const policyDocumentCount = POLICY_BENCHMARK_CASES.filter(
    (testCase) => testCase.evidence.provenanceKind === "policy_document",
  ).length;
  if (policyDocumentCount < 60) {
    throw new Error(`policy benchmark requires at least 60 policy_document cases, found ${policyDocumentCount}`);
  }
  const ids = new Set(POLICY_BENCHMARK_CASES.map((testCase) => testCase.id));
  if (ids.size !== POLICY_BENCHMARK_CASES.length) {
    throw new Error("policy benchmark case IDs must be unique");
  }
  for (const testCase of POLICY_BENCHMARK_CASES) {
    validateCaseProvenance(testCase.evidence);
  }
}

function summary(name: string, run: PolicyEvaluationRun) {
  const reproduction = run.report.metadata.datasetVersion.includes("reproduction");
  const caseMetric = run.metric(reproduction ? "reproduction strict case match" : "full corpus strict regression match");
  const fieldMetric = run.metric(reproduction ? "reproduction strict field match" : "full corpus strict field match");
  const ruleMetric = run.metric("rule coverage");
  const rowMetric = run.metric("decision-row coverage");
  return {
    evaluator: name,
    datasetVersion: run.report.metadata.datasetVersion,
    totalCases: run.report.summary.totalCases,
    passed: run.report.summary.passed,
    failed: run.report.summary.failed,
    errors: run.report.summary.errors,
    strictCaseMatch: `${caseMetric.numerator}/${caseMetric.denominator}`,
    strictFieldMatch: `${fieldMetric.numerator}/${fieldMetric.denominator}`,
    ruleCoverage: `${ruleMetric.numerator}/${ruleMetric.denominator}`,
    decisionRowCoverage: `${rowMetric.numerator}/${rowMetric.denominator}`,
    provenanceSubsets: Object.fromEntries(
      run.report.metrics
        .filter((metric) => metric.name.startsWith("provenance/") && metric.name.endsWith("strict case match"))
        .map((metric) => [metric.name.split("/")[1].split(" ")[0], `${metric.numerator}/${metric.denominator}`]),
    ),
  };
}

function parseArguments(argv: string[]): Arguments {
  let mode: Mode = "all";
  let check = false;
  let deterministic = false;
  let outputDirectory = join(process.cwd(), "evaluation-reports");

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") {
      check = true;
      deterministic = true;
    } else if (argument === "--deterministic") {
      deterministic = true;
    } else if (argument === "--mode") {
      const value = argv[index + 1] as Mode | undefined;
      if (!value || !["benchmark", "reproduction", "all"].includes(value)) {
        throw new Error("--mode must be benchmark, reproduction, or all");
      }
      mode = value;
      index += 1;
    } else if (argument === "--output") {
      const value = argv[index + 1];
      if (!value) throw new Error("--output requires a directory");
      outputDirectory = value;
      index += 1;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }

  return { mode, check, deterministic, outputDirectory };
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
