/**
 * 地区树领域模型（POL-FR-001/002，步骤03.1）——纯函数。
 *
 * 不变量：禁止循环、孤儿（父不存在）和非法层级跳跃（子层级必须恰好比父深一级）；
 * 物化路径（/CN/310000/）必须与父子关系一致。
 */

export const JURISDICTION_LEVELS = [
  "national",
  "province",
  "city",
  "district",
] as const;

export type JurisdictionLevel = (typeof JURISDICTION_LEVELS)[number];

export interface JurisdictionNode {
  code: string;
  name: string;
  level: JurisdictionLevel;
  parentCode: string | null;
  path: string;
  enabled?: boolean;
}

export type TreeViolation =
  | { kind: "orphan"; code: string; detail: string }
  | { kind: "cycle"; code: string; detail: string }
  | { kind: "level-jump"; code: string; detail: string }
  | { kind: "path-mismatch"; code: string; detail: string }
  | { kind: "duplicate"; code: string; detail: string };

const LEVEL_DEPTH: Record<JurisdictionLevel, number> = {
  national: 0,
  province: 1,
  city: 2,
  district: 3,
};

export function buildTreeIndex(rows: JurisdictionNode[]): Map<string, JurisdictionNode> {
  const index = new Map<string, JurisdictionNode>();
  for (const row of rows) {
    if (index.has(row.code)) {
      // 重复 code 在校验时报告；索引保留首个以继续检查其他项。
      continue;
    }
    index.set(row.code, row);
  }
  return index;
}

export function validateJurisdictionTree(rows: JurisdictionNode[]): TreeViolation[] {
  const violations: TreeViolation[] = [];
  const index = buildTreeIndex(rows);
  for (const row of rows) {
    if (index.get(row.code) !== row) {
      violations.push({ kind: "duplicate", code: row.code, detail: "重复的地区代码" });
      continue;
    }
    if (row.parentCode === null) {
      if (row.level !== "national") {
        violations.push({
          kind: "orphan",
          code: row.code,
          detail: `非国家级地区缺少父级 (${row.level})`,
        });
      }
      continue;
    }
    const parent = index.get(row.parentCode);
    if (!parent) {
      violations.push({
        kind: "orphan",
        code: row.code,
        detail: `父地区 ${row.parentCode} 不存在`,
      });
      continue;
    }
    if (LEVEL_DEPTH[row.level] !== LEVEL_DEPTH[parent.level] + 1) {
      violations.push({
        kind: "level-jump",
        code: row.code,
        detail: `${row.level} 不能直接挂在 ${parent.level} 之下`,
      });
    }
    // 环检测：沿父链向上，若回到自身或链长超过层级数则成环。
    const seen = new Set<string>([row.code]);
    let cursor: JurisdictionNode | undefined = parent;
    while (cursor && cursor.parentCode) {
      if (seen.has(cursor.code)) break;
      seen.add(cursor.code);
      cursor = index.get(cursor.parentCode);
    }
    if (cursor && seen.has(cursor.code) && cursor.code === row.code) {
      violations.push({ kind: "cycle", code: row.code, detail: "地区父链形成环" });
    }
    // 物化路径一致性：child.path = parent.path + child.code + "/"。
    const expectedPath = `${parent.path}${row.code}/`;
    if (row.path !== expectedPath) {
      violations.push({
        kind: "path-mismatch",
        code: row.code,
        detail: `期望 ${expectedPath}，实际 ${row.path}`,
      });
    }
  }
  return violations;
}

/** 自根到目标的继承链（含自身）；树非法或目标缺失时返回 null。 */
export function resolveChain(
  rows: JurisdictionNode[],
  code: string,
): JurisdictionNode[] | null {
  const index = buildTreeIndex(rows);
  const target = index.get(code);
  if (!target) return null;
  const chain: JurisdictionNode[] = [];
  let cursor: JurisdictionNode | undefined = target;
  const seen = new Set<string>();
  while (cursor) {
    if (seen.has(cursor.code)) return null; // 环
    seen.add(cursor.code);
    chain.unshift(cursor);
    cursor = cursor.parentCode ? index.get(cursor.parentCode) : undefined;
  }
  const violations = validateJurisdictionTree(rows);
  if (violations.length > 0) return null;
  return chain;
}
