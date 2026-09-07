/**
 * CLG-FR-003/004 展示案例来源链与452保留集合：
 * - normalizeCaseUid：去除末尾两位序号（与excel-import既有归一化一致）；
 * - resolveSourceCaseUids：展示候选全部解析到唯一来源案例，缺失/歧义报错；
 * - computeRetainedCaseSet：KEEP = 回归案例 ∪ 展示来源（PRD §6.2）。
 */
import { normalizeSourceCaseUid } from "@/lib/import/excel-import";

export function normalizeCaseUid(value: string): string {
  return normalizeSourceCaseUid(value);
}

export function resolveSourceCaseUids(
  showcaseRows: Array<{ caseUid: string; sourceCaseUid: string }>,
  knownCaseUids: Set<string>,
): Map<string, string> {
  const resolved = new Map<string, string>();
  for (const row of showcaseRows) {
    const source = normalizeCaseUid(row.sourceCaseUid || row.caseUid);
    if (!knownCaseUids.has(source)) {
      throw new Error(
        `展示案例 ${row.caseUid} 的来源案例 ${source} 不在案例集合中，无法唯一映射`,
      );
    }
    resolved.set(row.caseUid, source);
  }
  return resolved;
}

export function computeRetainedCaseSet(
  regressionCaseUids: Set<string>,
  showcaseSourceUids: Set<string>,
): Set<string> {
  const kept = new Set<string>();
  for (const uid of regressionCaseUids) kept.add(uid);
  for (const uid of showcaseSourceUids) kept.add(uid);
  return kept;
}
