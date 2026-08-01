import assert from "node:assert/strict";

import { createEntryProfiles, runTask3Evaluation, TASK_3_FIXED_TIMESTAMP } from "../src/lib/evaluation/task-3-evaluator";

const profiles = createEntryProfiles();
assert.equal(profiles.length, 100);
assert.deepEqual(new Set(profiles.map((profile) => profile.asOfDate.slice(0, 4))), new Set(["2025", "2030", "2039", "2040"]));
const result = await runTask3Evaluation({ gitCommit: "direct-verification", now: () => new Date(TASK_3_FIXED_TIMESTAMP) });
assert.deepEqual(result.entry.metrics.find((metric) => metric.name === "consistent cases")?.numerator, 100);
assert.deepEqual(result.publish.metrics.find((metric) => metric.name === "faulty candidates blocked")?.numerator, 30);
assert.deepEqual(result.publish.metrics.find((metric) => metric.name === "valid candidates accepted")?.numerator, 10);
assert.equal(result.entry.failures.length, 0);
assert.equal(result.publish.failures.length, 0);
console.log("Task 3 direct Node type-strip verification passed");
