/**
 * CLG-FR-013/014/015 治理manifest：
 * - audit输出确定性manifest：sourceCounts/retainedCounts/deletedCounts/manifestHash；
 * - KEEP = 回归 ∪ 展示来源（PRD §6.2）；固定目标452/36/528（CLG-AC-010）；
 * - manifestHash = SHA-256(算法版本+核心对象canonical)，重复生成一致（CLG-NFR-002）。
 */
import { canonicalJson, sha256hex } from "./hashes";
import {
  computeRetainedCaseSet,
  normalizeCaseUid,
  resolveSourceCaseUids,
} from "./source-chain";
import type { GovernanceManifest, GovernanceManifestInput } from "./types";

export const FIXED_TARGET = { cases: 452, showcaseCases: 36, tests: 528 } as const;

export const ARCHIVE_BATCH_STATUSES = [
  "prepared",
  "restore_verified",
  "applied",
  "rolled_back",
] as const;

export function computeManifestHash(content: unknown): string {
  return sha256hex(canonicalJson(content));
}

export function buildGovernanceManifest(
  input: GovernanceManifestInput,
): GovernanceManifest {
  const caseUidSet = new Set(input.caseUids);
  const sourceMap = resolveSourceCaseUids(input.showcaseRows, caseUidSet);
  const showcaseSourceUids = new Set(sourceMap.values());
  const retained = computeRetainedCaseSet(
    input.regressionCaseUids,
    showcaseSourceUids,
  );

  const retainedCaseUids = input.caseUids.filter((uid) => retained.has(uid));
  const deletedCaseUids = input.caseUids.filter((uid) => !retained.has(uid));
  const curated = new Set(input.curatedShowcaseUids ?? []);
  const deletedShowcaseUids = input.showcaseRows
    .map((r) => r.caseUid)
    .filter((uid) => !curated.has(uid));

  const core = {
    algorithmVersion: input.algorithmVersion,
    retainedCaseUids: [...retainedCaseUids].sort(),
    deletedCaseUids: [...deletedCaseUids].sort(),
    curatedShowcaseUids: [...curated].sort(),
    showcaseRows: input.showcaseRows
      .map((r) => ({ caseUid: r.caseUid, sourceCaseUid: normalizeCaseUid(r.sourceCaseUid || r.caseUid) }))
      .sort((a, b) => a.caseUid.localeCompare(b.caseUid)),
    testCount: input.testCount,
  };
  const manifestHash = computeManifestHash(core);

  return {
    algorithmVersion: input.algorithmVersion,
    sourceCounts: {
      cases: input.caseUids.length,
      regressionCases: input.regressionCaseUids.size,
      showcaseCases: input.showcaseRows.length,
      showcaseSourceCases: showcaseSourceUids.size,
      tests: input.testCount,
      regressionTests: input.regressionTestCount,
      exampleTests: input.exampleTestCount,
    },
    retainedCaseUids,
    deletedCaseUids,
    deletedShowcaseUids,
    retainedCounts: {
      cases: retainedCaseUids.length,
      showcaseCases: curated.size,
      tests: input.testCount,
    },
    deletedCounts: {
      cases: deletedCaseUids.length,
      showcaseCases: deletedShowcaseUids.length,
    },
    manifestHash,
    createdAt: new Date().toISOString(),
  };
}

export function assertFixedTargetCounts(
  cases: number,
  showcaseCases: number,
  tests: number,
): void {
  if (
    cases !== FIXED_TARGET.cases ||
    showcaseCases !== FIXED_TARGET.showcaseCases ||
    tests !== FIXED_TARGET.tests
  ) {
    throw new Error(
      `目标计数偏离固定基线：当前${cases}/${showcaseCases}/${tests}，期望${FIXED_TARGET.cases}/${FIXED_TARGET.showcaseCases}/${FIXED_TARGET.tests}；范围变化必须停止（CLG-NFR-005）`,
    );
  }
}
