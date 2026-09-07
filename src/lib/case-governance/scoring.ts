/**
 * CLG-FR-006 质量评分：输入完整40 / 预期完整30 / 来源证据20 / 快照重放10。
 * - 每个维度按固定权重拆分，缺失项逐项扣分并输出原因（禁止只有总分）；
 * - 纯函数：相同输入恒得相同分数（CLG-NFR-002）。
 */
import type { ReplayComparison, ScoreBreakdown, ShowcaseCandidateRecord } from "./types";

export type { ShowcaseCandidateRecord, ScoreBreakdown, ReplayComparison } from "./types";

const EMPLOYMENT_STATUSES = new Set(["employed", "flexible", "unemployed"]);

export function scoreShowcaseCandidate(
  record: ShowcaseCandidateRecord,
): ScoreBreakdown {
  const reasons: string[] = [];

  const inputCompleteness = scoreInputCompleteness(record, reasons);
  const expectedCompleteness = scoreExpectedCompleteness(record, reasons);
  const sourceEvidence = scoreSourceEvidence(record, reasons);
  const snapshotReplay = scoreSnapshotReplay(record.replay, reasons);

  const total = inputCompleteness + expectedCompleteness + sourceEvidence + snapshotReplay;
  return {
    inputCompleteness,
    expectedCompleteness,
    sourceEvidence,
    snapshotReplay,
    total,
    reasons,
  };
}

/** 输入完整：性别10 / 出生年10 / 明确就业状态10 / 养老缴费信息10。 */
function scoreInputCompleteness(record: ShowcaseCandidateRecord, reasons: string[]): number {
  let score = 0;
  if (record.gender && record.gender.length > 0) {
    score += 10;
    reasons.push("输入-性别：明确（+10）");
  } else {
    reasons.push("输入-性别：缺失（-10）");
  }
  if (typeof record.birthYear === "number" && record.birthYear > 0) {
    score += 10;
    reasons.push("输入-出生年份：明确（+10）");
  } else {
    reasons.push("输入-出生年份：缺失（-10）");
  }
  if (EMPLOYMENT_STATUSES.has(record.employmentStatus)) {
    score += 10;
    reasons.push(`输入-就业状态：${record.employmentStatus}（+10）`);
  } else {
    reasons.push("输入-就业状态：非明确三值（employed/flexible/unemployed）（-10）");
  }
  const social = (record.input?.social ?? {}) as Record<string, unknown>;
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

/** 预期完整：退休年龄8 / 退休日期8 / 最低缴费年限7 / 补贴姿态7。 */
function scoreExpectedCompleteness(record: ShowcaseCandidateRecord, reasons: string[]): number {
  let score = 0;
  const expected = record.expected ?? {};
  if (hasText(expected.retire_age)) {
    score += 8;
    reasons.push("预期-退休年龄：明确（+8）");
  } else {
    reasons.push("预期-退休年龄：缺失（-8）");
  }
  if (hasText(expected.retire_date)) {
    score += 8;
    reasons.push("预期-退休日期：明确（+8）");
  } else {
    reasons.push("预期-退休日期：缺失（-8）");
  }
  if (typeof expected.min_contrib_years === "number") {
    score += 7;
    reasons.push("预期-最低缴费年限：明确（+7）");
  } else {
    reasons.push("预期-最低缴费年限：缺失（-7）");
  }
  const subsidyKnown =
    typeof expected.subsidy_4050 === "boolean" ||
    typeof expected.subsidy_daling === "boolean" ||
    typeof expected.subsidy_gangwei === "boolean";
  if (subsidyKnown) {
    score += 7;
    reasons.push("预期-补贴姿态：明确（+7）");
  } else {
    reasons.push("预期-补贴姿态：未知（-7）");
  }
  return score;
}

/** 来源证据：来源文件6 / 来源案例可解析8 / 转录>=100字符6。 */
function scoreSourceEvidence(record: ShowcaseCandidateRecord, reasons: string[]): number {
  let score = 0;
  if (record.sourceFile) {
    score += 6;
    reasons.push(`来源-来源文件：${record.sourceFile}（+6）`);
  } else {
    reasons.push("来源-来源文件：缺失（-6）");
  }
  if (record.sourceCaseUid && record.sourceCaseUid.length > 0) {
    score += 8;
    reasons.push(`来源-来源案例UID：${record.sourceCaseUid}（+8）`);
  } else {
    reasons.push("来源-来源案例UID：无法解析（-8）");
  }
  if (record.transcriptLength >= 100) {
    score += 6;
    reasons.push(`来源-转录长度：${record.transcriptLength}字符（+6）`);
  } else {
    reasons.push(`来源-转录长度：${record.transcriptLength}字符不足100（-6）`);
  }
  return score;
}

/** 快照重放：一致10，未执行重放0，存在未解释差异0。 */
function scoreSnapshotReplay(replay: ReplayComparison | null, reasons: string[]): number {
  if (replay === null) {
    reasons.push("快照重放：未执行（-10）");
    return 0;
  }
  if (replay.match) {
    reasons.push("快照重放：与expected一致（+10）");
    return 10;
  }
  reasons.push(`快照重放：存在未解释差异（${replay.differences.join("; ")}）（-10）`);
  return 0;
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
