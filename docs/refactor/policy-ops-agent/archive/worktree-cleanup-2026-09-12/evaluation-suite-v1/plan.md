# Quantitative Evaluation And Resume Synchronization

## Global constraints

- Evaluate agent behavior with 80 labeled conversations across five categories, three repetitions, and a fixed configured model.
- Keep the existing 28 DSL examples as a rule-example reproduction set; do not call it business accuracy.
- Build at least 60 independently derived policy benchmark cases and report rule and reachable decision-row coverage.
- Compare 100 fixed profiles across AI-tool and HTTP calculation entry points after removing nondeterministic fields.
- Evaluate 30 faulty and 10 valid publish candidates against the actual server-side 80 percent gate; report the workflow 95 percent mismatch.
- Every report records model, prompt, DSL/parameter/dataset versions, Git commit, runtime, timestamp, repetitions, and every failure.
- Never remove failures to improve a rate. Every percentage must retain its numerator, denominator, and scope.
- Use an isolated evaluation database and never write evaluation data to the configured application database.
- Generate machine-readable JSON plus a concise Markdown resume-metrics summary.
- Do not write a resume file into the repository; after all evaluations, return the updated project experience to the user.

## Task 1 - Evaluation contracts and reporting

Define versioned evaluation case/result/report types, metric aggregation helpers, deterministic metadata collection, JSON/Markdown report writers, and focused tests. Add package scripts only for concrete evaluators. Report generation must preserve all failures and reject invalid denominators or silently incomplete runs.

## Task 2 - Policy benchmark and rule-example evaluation

Implement the rule-example reproduction evaluator and a policy benchmark dataset of at least 60 independently specified cases. Cover retirement, pension, medical insurance, household registration, subsidy, missing-field, and effective-date boundaries. Calculate strict case/field match, per-module results, rule coverage, and reachable decision-row coverage. Keep source/evidence metadata on every independent case.

## Task 3 - Entry-point consistency and publish-gate mutation evaluation

Implement 100 fixed profiles split evenly across 2025, 2030, 2039, and 2040. Compare normalized results from the AI calculation tool and HTTP calculation entry point, excluding only IDs and timestamps. Implement 30 faulty and 10 valid publish candidates covering the specified mutation classes and report block, escape, and false-block counts. Exercise no-tests, execution-error, threshold-boundary, candidate-overlay, audit, and rollback behaviors without production database writes.

## Task 4 - Agent dataset and live-model evaluation

Implement exactly 80 labeled conversations: 20 single-turn complete, 20 multi-turn completion, 15 ambiguous expressions, 15 corrections/invalid inputs, and 10 out-of-scope or prompt-injection cases. Run three repetitions with the configured real model, compute field precision/recall/F1, exact profile match, tool routing, schema-valid arguments, task completion, and unsupported-policy-number leakage. Select 20 representative cases for rate-limited HTTP/SSE/persistence verification against the isolated database.

## Task 5 - Execute, report, and synchronize resume metrics

Run all evaluators on the locked commit and environment, generate final JSON and Markdown reports, inspect every failure, and produce the updated four resume bullets. Use exact measured results, retain n/N, distinguish regression reproduction from independent business evaluation, and keep unresolved metrics visibly pending.

## Task 6 - Final verification and review

Run focused evaluator tests, the complete Vitest suite, lint/type checks, sensitive-file checks, and a whole-branch review. Resolve all critical or important findings before handoff.
