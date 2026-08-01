import { strict as assert } from "node:assert";
import { buildTask4Metrics, createTask4Dataset, findPolicyNumberOverreach, TASK_4_PROBE_CASE_IDS, validateTask4Dataset } from "@/lib/evaluation/task-4-evaluator";

const dataset = createTask4Dataset();
validateTask4Dataset(dataset);
assert.equal(dataset.length, 80);
assert.equal(TASK_4_PROBE_CASE_IDS.length, 20);
const spans = findPolicyNumberOverreach("1. 拨打12333，养老需15年，工具返回24个月。", { userAndContextValues: [], toolResultValues: [24] });
assert.deepEqual(spans.map((span) => span.text), ["15年"]);
const emptyMetrics = buildTask4Metrics([]);
assert.equal(emptyMetrics.find((metric) => metric.name === "policy-number overreach count")?.numerator, 0);
process.stdout.write("Task 4 direct Node verification passed (80 cases; fixed 20-case probe; scoring primitives).\n");
