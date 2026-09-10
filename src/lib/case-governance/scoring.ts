/**
 * RCL-FR-015/016、RCL-AC-006/009 案例质量评分：
 * - 输入完整40 / 覆盖义务30 / 断言重放30（修复旧实现"无可比断言仍判match"的P1缺陷）：
 *   断言重放分只有在**至少一个**声明断言被实际计算并比对通过后才可得；
 *   无可比较断言 → 该维度0分且原因明确（RCL-FR-016）；
 * - 返回总分与逐项分解（qualityBreakdown），供case/showcase真实落库（RCL-FR-015）；
 * - 纯函数：相同输入恒得相同分数（RCL-NFR-002）。
 */
import type { ReplayComparison } from "./replay";

export interface ScoreBreakdown {
  inputCompleteness: number;
  coverageObligations: number;
  snapshotReplay: number;
  total: number;
  reasons: string[];
}

export interface ScoreInput {
  input: Record<string, unknown>;
  coverageObligations: string[];
  replay: ReplayComparison | null;
  /** 断言数量（生成器声明；replay.comparableAssertions 为实际可比数）。 */
  declaredAssertions: number;
}

export function scoreCase(
  input: ScoreInput,
): ScoreBreakdown {
  const reasons: string[] = [];

  const inputCompleteness = scoreInputCompleteness(input.input, reasons);
  const coverageObligations = scoreCoverage(input.coverageObligations, reasons);
  const snapshotReplay = scoreSnapshotReplay(input, reasons);
  const total = inputCompleteness + coverageObligations + snapshotReplay;

  return { inputCompleteness, coverageObligations, snapshotReplay, total, reasons };
}

function scoreInputCompleteness(
  input: Record<string, unknown>,
  reasons: string[],
): number {
  let score = 0;
  const basic = (input.basic ?? {}) as Record<string, unknown>;
  const status = (input.status ?? {}) as Record<string, unknown>;
  const social = (input.social ?? {}) as Record<string, unknown>;

  if (typeof basic.gender === "string" && basic.gender.length > 0) {
    score += 10;
    reasons.push("输入-性别：明确（+10）");
  } else {
    reasons.push("输入-性别：缺失（-10）");
  }
  if (typeof basic.birth_year === "number" && basic.birth_year > 0) {
    score += 10;
    reasons.push("输入-出生年份：明确（+10）");
  } else {
    reasons.push("输入-出生年份：缺失（-10）");
  }
  if (["employed", "flexible", "unemployed"].includes(String(status.employment_status))) {
    score += 10;
    reasons.push(`输入-就业状态：${String(status.employment_status)}（+10）`);
  } else {
    reasons.push("输入-就业状态：缺失（-10）");
  }
  const hasContribution =
    typeof social.pension_contrib_months === "number" ||
    typeof social.pension_contrib_years === "number";
  if (hasContribution) {
    score += 10;
    reasons.push("输入-养老缴费信息：明确（+10）");
  } else {
    reasons.push("输入-养老缴费信息：缺失（-10）");
  }
  return score;
}

function scoreCoverage(
  obligations: string[],
  reasons: string[],
): number {
  if (obligations.length === 0) {
    reasons.push("覆盖义务：缺失（-30）");
    return 0;
  }
  const score = Math.min(30, obligations.length * 10);
  reasons.push(`覆盖义务：${obligations.length}条（+${score}）`);
  return score;
}

/**
 * 断言重放分（RCL-FR-016）：至少一个断言实际计算并比对通过 → 30分；
 * 无可比较断言 → 0分（不得分）；有可比断言但任一失败 → 0分。
 */
function scoreSnapshotReplay(
  input: ScoreInput,
  reasons: string[],
): number {
  const replay = input.replay;
  if (!replay) {
    reasons.push("快照重放：未执行（-30）");
    return 0;
  }
  if (replay.comparableAssertions === 0) {
    reasons.push(`快照重放：无可比较断言（声明${input.declaredAssertions}条均不可比）（-30）`);
    return 0;
  }
  if (replay.match) {
    reasons.push(`快照重放：${replay.comparableAssertions}条断言一致（+30）`);
    return 30;
  }
  reasons.push(`快照重放：断言差异 ${replay.differences.join("; ")}（-30）`);
  return 0;
}
