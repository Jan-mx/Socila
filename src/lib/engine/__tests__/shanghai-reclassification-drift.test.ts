/**
 * 上海政策冻结基线对账（NRP-AC-002 → SHV2 WI-20260911-01 延续）。
 *
 * 历史：2026-09-05 重分类零漂移对账使用 `evidence/shanghai-reclassification/
 * pre-reclass-baseline.json`（44例）证明参数改名不改变行为；该文件作为验收证据
 * 永久保留、不再改写。SHV2 按官方原文有意纠正上海政策事实并新增两条规则，
 * 上海规划输出合法变化，因此本测试改为冻结 SHV2 状态：
 * `evidence/shanghai-policy-v2/shv2-frozen-baseline.json`（46例 = 30示例
 * + 10延迟退休 + 6全编排）。任何后续 DSL 改动导致 user/calc/plan 或 trace
 * 漂移都会在此失败，必须经人工复核后以 `WRITE_SHV2_DRIFT_BASELINE=1` 重新冻结
 * 并在验收报告记录原因。
 *
 * 全编排 6 例的输入沿用 pre-reclass 基线（输入不变，输出按 SHV2 重算）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  executeSingleRuleInMemory,
  orchestrateInMemory,
} from "@/lib/engine/orchestrator";
import type { RuleDefinition } from "@/types/engine";

const REPO = process.cwd();
const CN_DIR = path.join(REPO, "dsl/regions/cn_dsl_v1");
const SH_DIR = path.join(REPO, "dsl/regions/shanghai_dsl_v1");
const EVIDENCE_ROOT = path.join(
  REPO,
  "docs/refactor/policy-ops-agent/reports/stage-09-05-national-baseline-overlays/evidence",
);
const LEGACY_BASELINE_PATH = path.join(
  EVIDENCE_ROOT,
  "shanghai-reclassification/pre-reclass-baseline.json",
);
const BASELINE_PATH = path.join(EVIDENCE_ROOT, "shanghai-policy-v2/shv2-frozen-baseline.json");
const FULL_PLAN_AS_OF = "2026-01-01";
const EXPECTED_COUNTS = { example: 30, delayed: 10, fullPlan: 6, total: 46 };

interface FrozenCase {
  kind: "example" | "delayed-retirement" | "full-plan";
  rule_id?: string;
  test_id?: string;
  name: string;
  input?: Record<string, unknown>;
  params_override?: Record<string, unknown> | null;
  actual: Record<string, unknown>;
  trace: Array<Record<string, unknown>>;
}

function loadChainRules(): RuleDefinition[] {
  const rules: RuleDefinition[] = [];
  for (const dir of [CN_DIR, SH_DIR]) {
    const manifest = JSON.parse(
      readFileSync(path.join(dir, "rules_manifest.json"), "utf8"),
    ) as { rules: Array<{ file: string }> };
    for (const r of manifest.rules) {
      rules.push(
        JSON.parse(readFileSync(path.join(dir, "rules", r.file), "utf8")) as RuleDefinition,
      );
    }
  }
  // 全编排场景按上海规则集声明顺序执行（与 loadEffectiveEngine 相同）。
  const ruleSet = JSON.parse(
    readFileSync(path.join(SH_DIR, "rule_sets/rule_set_shanghai_plan_v1.json"), "utf8"),
  ) as { rules: string[] };
  const pos = new Map(ruleSet.rules.map((id, i) => [id, i] as const));
  return [...rules].sort(
    (a, b) =>
      (pos.get(a.rule_id!) ?? Number.MAX_SAFE_INTEGER) -
      (pos.get(b.rule_id!) ?? Number.MAX_SAFE_INTEGER),
  );
}

/** 参数包扁平化：多窗口条目按文件顺序 last-write-wins（当前窗口列在最后）。 */
function loadChainParams(): Record<string, unknown> {
  const base: Record<string, unknown> = {};
  for (const dir of [CN_DIR, SH_DIR]) {
    const packPath =
      dir === CN_DIR
        ? path.join(dir, "params/policy_params_cn_baseline.json")
        : path.join(dir, "params/policy_params_shanghai_base.json");
    const pack = JSON.parse(readFileSync(packPath, "utf8")) as {
      params: Array<{ param_id: string; type: string; value?: unknown; rows?: unknown[] }>;
      tables: Array<{ param_id: string; type: string; value?: unknown; rows?: unknown[] }>;
    };
    for (const p of [...(pack.params ?? []), ...(pack.tables ?? [])]) {
      base[p.param_id] =
        p.type === "table" || p.type === "timeline" ? (p.rows ?? []) : p.value;
    }
  }
  return base;
}

function stripTimestamps(trace: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return trace.map((e) => {
    const { timestamp, ...rest } = e;
    void timestamp;
    return rest;
  });
}

function execute(
  fc: Pick<FrozenCase, "kind" | "rule_id" | "input" | "params_override">,
  rulesTemplate: RuleDefinition[],
  paramsTemplate: Record<string, unknown>,
): { actual: Record<string, unknown>; trace: Array<Record<string, unknown>> } | { error: string } {
  const chainRules = structuredClone(rulesTemplate);
  const params = structuredClone(paramsTemplate);
  const input = structuredClone(fc.input ?? {}) as Record<string, unknown>;
  if (input.params && typeof input.params === "object") {
    Object.assign(params, input.params as Record<string, unknown>);
  }
  if (fc.params_override && typeof fc.params_override === "object") {
    Object.assign(params, fc.params_override);
  }
  if (fc.kind === "full-plan") {
    const result = orchestrateInMemory(
      chainRules,
      params,
      (input.user ?? {}) as Record<string, unknown>,
      FULL_PLAN_AS_OF,
    );
    return {
      actual: { user: result.user ?? {}, calc: result.calc ?? {}, plan: result.plan ?? {} },
      trace: stripTimestamps(result.trace as unknown as Array<Record<string, unknown>>),
    };
  }
  const rule = chainRules.find((r) => r.rule_id === fc.rule_id);
  if (!rule) return { error: `${fc.rule_id}: 规则不在链上` };
  const ctx: Record<string, unknown> = {
    user: (input.user as Record<string, unknown>) ?? {},
    params,
    calc: (input.calc as Record<string, unknown>) ?? {},
    plan: (input.plan as Record<string, unknown>) ?? {},
  };
  const result = executeSingleRuleInMemory(rule, ctx);
  return {
    actual: { user: result.ctx.user ?? {}, calc: result.ctx.calc ?? {}, plan: result.ctx.plan ?? {} },
    trace: stripTimestamps(result.trace as unknown as Array<Record<string, unknown>>),
  };
}

/** 重新冻结：示例来自 CN+SH tests 文件、延迟退休来自上海专项文件、全编排输入沿用旧基线。 */
function buildFrozenCases(
  rulesTemplate: RuleDefinition[],
  paramsTemplate: Record<string, unknown>,
): FrozenCase[] {
  const out: FrozenCase[] = [];
  for (const dir of [CN_DIR, SH_DIR]) {
    const tests = JSON.parse(
      readFileSync(path.join(dir, "tests/rule_examples_as_tests.json"), "utf8"),
    ) as { tests: Array<{ rule_id: string; example_name: string; input: Record<string, unknown>; params_override?: Record<string, unknown> | null }> };
    for (const t of tests.tests) {
      const spec = { kind: "example" as const, rule_id: t.rule_id, input: t.input, params_override: t.params_override ?? null };
      const r = execute(spec, rulesTemplate, paramsTemplate);
      if ("error" in r) throw new Error(r.error);
      out.push({ ...spec, name: t.example_name, actual: r.actual, trace: r.trace });
    }
  }
  const legacy = JSON.parse(readFileSync(LEGACY_BASELINE_PATH, "utf8")) as FrozenCase[];
  // 延迟退休用例为单规则执行（rule_id与输入沿用旧基线映射）。
  for (const dr of legacy.filter((c) => c.kind === "delayed-retirement")) {
    const spec = { kind: "example" as const, rule_id: dr.rule_id, input: dr.input, params_override: dr.params_override ?? null };
    const r = execute(spec, rulesTemplate, paramsTemplate);
    if ("error" in r) throw new Error(r.error);
    out.push({ kind: "delayed-retirement", rule_id: dr.rule_id, test_id: dr.test_id, name: dr.name, input: dr.input, params_override: dr.params_override ?? null, actual: r.actual, trace: r.trace });
  }
  for (const fp of legacy.filter((c) => c.kind === "full-plan")) {
    const spec = { kind: "full-plan" as const, input: fp.input, params_override: fp.params_override ?? null };
    const r = execute(spec, rulesTemplate, paramsTemplate);
    if ("error" in r) throw new Error(r.error);
    out.push({ kind: "full-plan", name: fp.name, input: fp.input, params_override: fp.params_override ?? null, actual: r.actual, trace: r.trace });
  }
  return out;
}

describe("上海政策SHV2冻结基线对账（NRP-AC-002延续，WI-20260911-01）", () => {
  const chainRulesTemplate = loadChainRules();
  const chainParamsTemplate = loadChainParams();

  if (process.env.WRITE_SHV2_DRIFT_BASELINE === "1") {
    mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
    writeFileSync(
      BASELINE_PATH,
      JSON.stringify(buildFrozenCases(chainRulesTemplate, chainParamsTemplate), null, 2) + "\n",
      "utf8",
    );
  }

  it("历史pre-reclass基线文件保留且未被改写（44例）", () => {
    expect(existsSync(LEGACY_BASELINE_PATH)).toBe(true);
    const legacy = JSON.parse(readFileSync(LEGACY_BASELINE_PATH, "utf8")) as FrozenCase[];
    expect(legacy).toHaveLength(44);
  });

  it("SHV2冻结基线包含46例（30示例+10延迟退休+6全编排）", () => {
    const frozen = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as FrozenCase[];
    expect(frozen).toHaveLength(EXPECTED_COUNTS.total);
    expect(frozen.filter((c) => c.kind === "example")).toHaveLength(EXPECTED_COUNTS.example);
    expect(frozen.filter((c) => c.kind === "delayed-retirement")).toHaveLength(EXPECTED_COUNTS.delayed);
    expect(frozen.filter((c) => c.kind === "full-plan")).toHaveLength(EXPECTED_COUNTS.fullPlan);
  });

  it("逐案执行：user/calc/plan与trace（去时间戳）逐字节一致", () => {
    const frozen = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as FrozenCase[];
    const mismatch: string[] = [];
    let byteIdentical = 0;
    for (const fc of frozen) {
      const specKind = fc.kind === "full-plan" ? "full-plan" : "example";
      const r = execute({ kind: specKind, rule_id: fc.rule_id, input: fc.input, params_override: fc.params_override }, chainRulesTemplate, chainParamsTemplate);
      if ("error" in r) {
        mismatch.push(r.error);
        continue;
      }
      if (JSON.stringify(r.actual) !== JSON.stringify(fc.actual)) {
        mismatch.push(`${fc.kind}:${fc.rule_id ?? fc.test_id ?? ""}:${fc.name} — plan/calc/user漂移`);
        continue;
      }
      if (JSON.stringify(r.trace) !== JSON.stringify(stripTimestamps(fc.trace))) {
        mismatch.push(`${fc.kind}:${fc.rule_id ?? fc.test_id ?? ""}:${fc.name} — trace漂移`);
        continue;
      }
      byteIdentical++;
    }
    expect(mismatch, mismatch.join("\n")).toEqual([]);
    expect(byteIdentical).toBe(EXPECTED_COUNTS.total);
  });

  it("上海SHV2关键结论冻结：医保年限15年、失业期限2个月起步、灵活缴费与失业金额可算", () => {
    const frozen = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as FrozenCase[];
    const flex = frozen.find((c) => c.rule_id === "R-SH-FLEX-CONTRIBUTION");
    expect((flex?.actual.calc as { flex: { total_monthly: number } }).flex.total_monthly).toBe(2263.8);
    const ui = frozen.find((c) => c.rule_id === "R-SH-UI-AMOUNT");
    expect((ui?.actual.calc as { unemployment: { monthly_amount_est: number } }).unemployment.monthly_amount_est).toBe(2340);
    const fullPlans = frozen.filter((c) => c.kind === "full-plan");
    for (const fp of fullPlans) {
      const mi = (fp.actual.calc as { mi?: { lifetime_required_months?: number } }).mi;
      if (mi?.lifetime_required_months !== undefined && mi.lifetime_required_months !== null) {
        expect(mi.lifetime_required_months).toBe(180);
      }
    }
  });
});
