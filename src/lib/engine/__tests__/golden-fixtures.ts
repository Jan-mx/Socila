/**
 * 步骤01.2 黄金结果夹具（FND-FR-003）。
 *
 * golden.test.ts 断言"DSL 示例的 expected 字段级匹配"；本夹具在其之上固化
 * "完整实际输出"（user/calc/plan + trace），用于证明重复执行零漂移（见
 * golden-snapshot.test.ts）。动态时间一律显式传入 FIXED_AS_OF_DATE，
 * trace 的 Date.now() 时间戳在快照中剔除——这是仅有的两个引擎时间源。
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { RuleDefinition, TraceEntry } from "@/types/engine";
import { discoverRegionDsl } from "@/lib/dsl/region-manifest";
import { runTestSuite, type TestCase } from "../test-runner";

/**
 * 上海地区资产经地区Manifest发现（SDL-FR-004）：黄金回归与生产Seed共用同一
 * 发现器，不硬编码地区目录。
 */
const shanghaiRegion = (() => {
  const region = discoverRegionDsl().find(
    (r) => r.manifest.region_slug === "shanghai",
  );
  if (!region) throw new Error("shanghai region manifest not found");
  return region;
})();

export const DSL_DIR = shanghaiRegion.regionDir;

/** 快照基准日期：显式传给编排器，消除 orchestrateInMemory 缺省取当天的不确定性。 */
export const FIXED_AS_OF_DATE = "2026-01-01";

export function loadRules(): RuleDefinition[] {
  const dir = path.join(DSL_DIR, "rules");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map(
      (f) =>
        JSON.parse(readFileSync(path.join(dir, f), "utf8")) as RuleDefinition,
    );
}

export function loadBaseParams(): Record<string, unknown> {
  const pack = JSON.parse(
    readFileSync(shanghaiRegion.paramsPath, "utf8"),
  ) as {
    params: Array<{ param_id: string; value: unknown }>;
    tables: Array<{ param_id: string; rows: unknown[] }>;
  };
  // 与 DB seed + loadEffectiveEngine 等价的扁平化：标量取 value、表取 rows。
  const base: Record<string, unknown> = {};
  for (const p of pack.params) base[p.param_id] = p.value;
  for (const t of pack.tables) base[t.param_id] = t.rows;
  return base;
}

export function loadGoldenCases(): TestCase[] {
  const seed = JSON.parse(
    readFileSync(shanghaiRegion.testsPath, "utf8"),
  ) as { tests: TestCase[] };
  return seed.tests;
}

export type SnapshotTraceEntry = Omit<TraceEntry, "timestamp">;

export interface GoldenSnapshotCase {
  name: string;
  rule_id: string | null;
  user: Record<string, unknown>;
  calc: Record<string, unknown>;
  plan: Record<string, unknown>;
  trace: SnapshotTraceEntry[];
}

/** 用全新从磁盘加载的规则/参数跑完整语料，产出确定性快照（每次调用全新对象）。 */
export function buildGoldenSnapshot(): GoldenSnapshotCase[] {
  const suite = runTestSuite(
    loadGoldenCases(),
    loadRules(),
    loadBaseParams(),
    FIXED_AS_OF_DATE,
  );
  return suite.results.map((r) => ({
    name: r.name,
    rule_id: r.rule_id,
    user: r.actual.user as Record<string, unknown>,
    calc: r.actual.calc as Record<string, unknown>,
    plan: r.actual.plan as Record<string, unknown>,
    trace: r.trace.map((entry) => {
      const snapshotEntry = { ...entry } as Partial<TraceEntry>;
      delete snapshotEntry.timestamp;
      return snapshotEntry as SnapshotTraceEntry;
    }),
  }));
}

/** 键序稳定的序列化：对象键排序后输出，数组顺序保持（执行顺序有意义）。 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}
