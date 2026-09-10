/**
 * RCL-FR-018/AC-011（第三轮复审P0修复）：42条DSL example确定性加载。
 *
 * 从CN19、上海9、广东10、四川4的地区DSL tests文件（规则Manifest发现，
 * SDL-FR-004）确定性加载精确42条目标example，供plan-replacement计算
 * 保留/更新/新增/删除集合与每条目标example的规范化内容hash。任何数量的
 * 28/49等不得自动成为合法目标（assertRclCounts显式要求42）。
 */
import { readFileSync } from "node:fs";
import { discoverRegionDsl } from "@/lib/dsl/region-manifest";
import { testRowContentHash } from "./hashes";
import { exampleDbRowHash } from "./row-projections";
import type { ExampleSyncSets } from "./manifest";

export interface DslExampleTarget {
  /** 数据库tests.name（seed命名：`${rule_id}: ${example_name}`）。 */
  name: string;
  jurisdictionCode: string;
  ruleId: string;
  input: Record<string, unknown>;
  paramsOverride: unknown;
  expected: Record<string, unknown>;
  /** 规范化内容hash（与apply事务内重算同规则，RCL-FR-002）。 */
  contentHash: string;
}

interface RegionTestsFile {
  tests: Array<{
    rule_id: string;
    example_name: string;
    input: Record<string, unknown>;
    params_override?: unknown;
    expected: Record<string, unknown>;
  }>;
}

/** 确定性加载全部地区DSL的example目标（文件顺序稳定）。 */
export function loadDslExampleTargets(
  regionsRoot?: string,
): DslExampleTarget[] {
  const regions = discoverRegionDsl(regionsRoot ? { regionsRoot } : undefined);
  const targets: DslExampleTarget[] = [];
  // 按地区manifest顺序（文件系统目录顺序）加载；每个tests文件内顺序即文件顺序。
  for (const region of regions) {
    const file = JSON.parse(readFileSync(region.testsPath, "utf-8")) as RegionTestsFile;
    const jurisdictionCode = region.manifest.jurisdiction_code;
    for (const t of file.tests) {
      const name = `${t.rule_id}: ${t.example_name}`;
      targets.push({
        name,
        jurisdictionCode,
        ruleId: t.rule_id,
        input: t.input,
        paramsOverride: t.params_override ?? null,
        expected: t.expected,
        contentHash: exampleDbRowHash({
          name,
          jurisdictionCode,
          ruleId: t.rule_id,
          input: t.input,
          paramsOverride: t.params_override ?? null,
          expected: t.expected,
          source: "example",
        }),
      });
    }
  }
  return targets;
}

/**
 * 由库中既有example完整行与DSL目标集合计算同步集合（RCL-FR-018/AC-011）：
 * - retained：与DSL目标内容一致的既有example（保持不动）；
 * - updated：既有example与DSL目标内容不一致（apply事务内更新为目标内容）；
 * - added：DSL目标在库中缺失（apply事务内插入）；
 * - deleted：库中既有但不在DSL目标集合（apply事务内删除）。
 * 每条记录的contentHash均为64位非空SHA-256。
 */
export function buildExampleSync(
  dbExampleRows: Array<Record<string, unknown>>,
  targets: DslExampleTarget[],
): ExampleSyncSets {
  const dbRows = dbExampleRows.map((r) => ({
    rowId: Number((r as { id: number }).id),
    name: String((r as { name: string }).name),
    jurisdictionCode: String((r as { jurisdiction_code: string | null }).jurisdiction_code ?? ""),
    contentHash: testRowContentHash(r),
  }));
  const dbKeyed = new Map(dbRows.map((r) => [`${r.jurisdictionCode}|${r.name}`, r]));
  const targetKeyed = new Map(targets.map((t) => [`${t.jurisdictionCode}|${t.name}`, t]));

  const retained: ExampleSyncSets["retained"] = [];
  const updated: ExampleSyncSets["updated"] = [];
  const added: ExampleSyncSets["added"] = [];
  const deleted: ExampleSyncSets["deleted"] = [];

  for (const t of targets) {
    const key = `${t.jurisdictionCode}|${t.name}`;
    const db = dbKeyed.get(key);
    if (!db) {
      added.push({
        name: t.name,
        jurisdictionCode: t.jurisdictionCode,
        ruleId: t.ruleId,
        input: t.input,
        paramsOverride: t.paramsOverride,
        expected: t.expected,
        contentHash: t.contentHash,
      });
    } else if (db.contentHash === t.contentHash) {
      retained.push({ rowId: db.rowId, name: db.name, jurisdictionCode: db.jurisdictionCode, contentHash: db.contentHash });
    } else {
      updated.push({
        rowId: db.rowId,
        name: db.name,
        jurisdictionCode: db.jurisdictionCode,
        contentHash: db.contentHash,
        targetHash: t.contentHash,
        ruleId: t.ruleId,
        input: t.input,
        paramsOverride: t.paramsOverride,
        expected: t.expected,
      });
    }
  }
  for (const db of dbRows) {
    const key = `${db.jurisdictionCode}|${db.name}`;
    if (!targetKeyed.has(key)) {
      deleted.push({ rowId: db.rowId, name: db.name, jurisdictionCode: db.jurisdictionCode, contentHash: db.contentHash });
    }
  }

  return { retained, updated, added, deleted };
}
