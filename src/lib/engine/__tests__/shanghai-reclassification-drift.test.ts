/**
 * NRP-AC-002 上海重分类零漂移对账（里程碑B核心交付）：
 * 重分类前捕获的44例冻结基线（evidence/shanghai-reclassification/pre-reclass-baseline.json，
 * 在任何DSL改动前由 tmp 捕获脚本从原上海DSL内存执行产出）与重分类后链式装载
 * （CN baseline + 上海overlay）的执行结果逐案对账——plan/calc/user必须逐字节一致；
 * trace仅允许"已解释的参数键改名"差异（R-220/R-410参数中性化映射见下）。
 *
 * 已解释差异（全部记录于 stage-09-05 验收报告§上海重分类）：
 * 1. R-220/R-410 的上海前缀参数键改为中性国家键（值不变，由地区包提供）；
 * 2. R-220 新增"地区年限参数缺失→needs_agent"守卫行（参数存在时永不触发；
 *    上海包恒提供该参数，对上海解析无行为影响）；
 * 3. 上海失业金期限表由 T-SH-* 改为对国家基线表的显式replace（行内容不变）。
 */
import { readFileSync, readdirSync } from "node:fs";
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
const BASELINE_PATH = path.join(
  REPO,
  "docs/refactor/policy-ops-agent/reports/stage-09-05-national-baseline-overlays/evidence/shanghai-reclassification/pre-reclass-baseline.json",
);

/** 已解释的参数键改名映射（NRP-FR-007 重分类；值不变）。 */
const PARAM_RENAMES: Record<string, string> = {
  "P-SH-MEDICAL-LIFETIME-MALE-YEARS": "P-MI-LIFETIME-MALE-YEARS",
  "P-SH-MEDICAL-LIFETIME-FEMALE-YEARS": "P-MI-LIFETIME-FEMALE-YEARS",
  "P-SH-MEDICAL-LIFETIME-REQUIRED-YEARS": "P-MI-LIFETIME-REQUIRED-YEARS",
  "P-SH-UNEMPLOYMENT-MAX-MONTHS": "P-UNEMPLOYMENT-MAX-MONTHS",
  "T-SH-UNEMPLOYMENT-DURATION-BY-YEARS": "T-UNEMPLOYMENT-DURATION-BY-YEARS",
};

function renameKeys(value: unknown): unknown {
  let json = JSON.stringify(value);
  for (const [from, to] of Object.entries(PARAM_RENAMES)) {
    json = json.split(from).join(to);
  }
  return JSON.parse(json);
}

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
    for (const f of readdirSync(path.join(dir, "rules"))
      .filter((f) => f.endsWith(".json"))
      .sort()) {
      rules.push(
        JSON.parse(readFileSync(path.join(dir, "rules", f), "utf8")) as RuleDefinition,
      );
    }
  }
  // 全编排场景的执行顺序必须与冻结基线一致：按上海规则集声明顺序排序
  // （与 loadEffectiveEngine 相同的排序规则；规则输出喂给后续规则，顺序有意义）。
  const ruleSet = JSON.parse(
    readFileSync(
      path.join(SH_DIR, "rule_sets/rule_set_shanghai_plan_v1.json"),
      "utf8",
    ),
  ) as { rules: string[] };
  const pos = new Map(ruleSet.rules.map((id, i) => [id, i] as const));
  return [...rules].sort(
    (a, b) =>
      (pos.get(a.rule_id!) ?? Number.MAX_SAFE_INTEGER) -
      (pos.get(b.rule_id!) ?? Number.MAX_SAFE_INTEGER),
  );
}

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

describe("上海重分类零漂移对账（NRP-AC-002）", () => {
  const frozen = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as FrozenCase[];
  const chainRulesTemplate = loadChainRules();
  const chainParamsTemplate = loadChainParams();

  it("冻结基线包含44例（28示例+10延迟退休+6全编排）", () => {
    expect(frozen).toHaveLength(44);
    expect(frozen.filter((c) => c.kind === "example")).toHaveLength(28);
    expect(frozen.filter((c) => c.kind === "delayed-retirement")).toHaveLength(10);
    expect(frozen.filter((c) => c.kind === "full-plan")).toHaveLength(6);
  });

  it("重分类后逐案执行：user/calc/plan逐字节一致，trace仅含已解释参数改名", () => {
    const mismatch: string[] = [];
    let traceRenameOnly = 0;
    let byteIdentical = 0;

    for (const fc of frozen) {
      // 每例全新克隆（等价生产每次从磁盘/DB全新装载）——引擎对复用对象存在就地修改，
      // 共享对象会让逐案结果依赖执行顺序（见golden.test.ts注释）。
      const chainRules = structuredClone(chainRulesTemplate);
      const params = structuredClone(chainParamsTemplate);
      const input = structuredClone(fc.input ?? {});
      // 用例内联参数同样按改名映射归一（重分类的已解释差异）。
      const renamedInput = renameKeys(input) as Record<string, unknown>;
      if (
        renamedInput.params &&
        typeof renamedInput.params === "object"
      ) {
        Object.assign(params, renamedInput.params);
      }
      if (
        fc.params_override &&
        typeof fc.params_override === "object"
      ) {
        Object.assign(
          params,
          renameKeys(fc.params_override) as Record<string, unknown>,
        );
      }

      let actual: Record<string, unknown>;
      let trace: Array<Record<string, unknown>>;
      if (fc.kind === "full-plan") {
        const result = orchestrateInMemory(
          chainRules,
          params,
          (renamedInput.user ?? {}) as Record<string, unknown>,
          "2026-01-01",
        );
        actual = { user: result.user ?? {}, calc: result.calc ?? {}, plan: result.plan ?? {} };
        trace = result.trace as unknown as Array<Record<string, unknown>>;
      } else {
        const rule = chainRules.find((r) => r.rule_id === fc.rule_id);
        if (!rule) {
          mismatch.push(`${fc.rule_id}: 规则不在链上`);
          continue;
        }
        const ctx: Record<string, unknown> = {
          user: (renamedInput.user as Record<string, unknown>) ?? {},
          params,
          calc: (renamedInput.calc as Record<string, unknown>) ?? {},
          plan: (renamedInput.plan as Record<string, unknown>) ?? {},
        };
        const result = executeSingleRuleInMemory(rule, ctx);
        actual = {
          user: result.ctx.user ?? {},
          calc: result.ctx.calc ?? {},
          plan: result.ctx.plan ?? {},
        };
        trace = result.trace as unknown as Array<Record<string, unknown>>;
      }

      const actualStr = JSON.stringify(actual);
      const frozenStr = JSON.stringify(fc.actual);
      const traceStr = JSON.stringify(
        renameKeys(
          (trace as Array<Record<string, unknown>>).map((e) => {
            const { timestamp, ...rest } = e;
            void timestamp;
            return rest;
          }),
        ),
      );
      const frozenTraceStr = JSON.stringify(
        renameKeys(
          (fc.trace as Array<Record<string, unknown>>).map((e) => {
            const { timestamp, ...rest } = e;
            void timestamp;
            return rest;
          }),
        ),
      );

      if (actualStr !== frozenStr) {
        mismatch.push(
          `${fc.kind}:${fc.rule_id ?? ""}:${fc.name} — plan/calc/user漂移`,
        );
        continue;
      }
      if (traceStr !== frozenTraceStr) {
        // trace差异必须能被参数改名映射完全解释。
        mismatch.push(`${fc.kind}:${fc.rule_id ?? ""}:${fc.name} — trace存在改名以外差异`);
        continue;
      }
      if (
        JSON.stringify(
          renameKeys(
            (trace as Array<Record<string, unknown>>).map((e) => {
              const { timestamp, ...rest } = e;
              void timestamp;
              return rest;
            }),
          ),
        ) === frozenTraceStr
      ) {
        byteIdentical++;
      } else {
        traceRenameOnly++;
      }
    }

    expect(mismatch, mismatch.join("\n")).toEqual([]);
    // 全部44例中：byteIdentical + traceRenameOnly === 44（对账完整性）。
    expect(byteIdentical + traceRenameOnly).toBe(44);
    // traceRenameOnly > 0 证明对账确实逐字节执行过（而非空转相等）。
    expect(byteIdentical).toBeGreaterThan(0);
  });
});
