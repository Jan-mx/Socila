import { describe, expect, it } from "vitest";

import { formatEvaluationGitCommit } from "./run-metadata";

describe("evaluation run metadata", () => {
  it("marks a dirty worktree instead of attributing evaluation code to clean HEAD", () => {
    expect(formatEvaluationGitCommit("abc123", " M src/lib/evaluation/task-3-evaluator.ts\n")).toBe("abc123-dirty");
    expect(formatEvaluationGitCommit("abc123", "")).toBe("abc123");
  });
});
