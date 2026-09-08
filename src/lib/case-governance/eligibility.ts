/**
 * CLG-FR-007 资格门禁：总分>=70、来源可解析、转录>=100字符、核心字段完整
 * （出生年/性别/明确就业状态/退休年龄或日期）、快照重放无未解释差异、
 * 无占位符或身份泄漏（CLG-NFR-004）。
 */
import type {
  EligibilityCheck,
  ScoreBreakdown,
  ShowcaseCandidateRecord,
} from "./types";

const PLACEHOLDER_PATTERNS = [
  /\[\s*X\s*\]/i,
  /待定/,
  /\bTBD\b/i,
  /\.{3,}/,
];
const IDENTITY_CARD_PATTERN = /\d{17}[\dXx]/;
const PHONE_PATTERN = /\b1[3-9]\d{9}\b/;

export function checkEligibility(
  record: ShowcaseCandidateRecord,
  score: ScoreBreakdown,
): EligibilityCheck {
  const reasons: string[] = [];
  let eligible = true;

  if (score.total < 70) {
    eligible = false;
    reasons.push(`总分${score.total}低于70分门槛`);
  }
  if (!record.sourceCaseUid || record.sourceCaseUid.length === 0) {
    eligible = false;
    reasons.push("来源案例无法解析（sourceCaseUid为空）");
  }
  if (record.transcriptLength < 100) {
    eligible = false;
    reasons.push(`转录长度${record.transcriptLength}字符不足100`);
  }
  if (!record.gender || record.gender.length === 0) {
    eligible = false;
    reasons.push("缺失性别");
  }
  if (typeof record.birthYear !== "number" || record.birthYear <= 0) {
    eligible = false;
    reasons.push("缺失出生年份");
  }
  if (!["employed", "flexible", "unemployed"].includes(record.employmentStatus)) {
    eligible = false;
    reasons.push(`就业状态「${record.employmentStatus || "未知"}」非明确三值`);
  }
  const expected = record.expected ?? {};
  const hasRetireInfo =
    (typeof expected.retire_age === "string" && expected.retire_age.trim().length > 0) ||
    (typeof expected.retire_date === "string" && expected.retire_date.trim().length > 0);
  if (!hasRetireInfo) {
    eligible = false;
    reasons.push("缺失退休年龄且缺失退休日期");
  }
  if (record.replay === null) {
    eligible = false;
    reasons.push("未执行候选快照重放");
  } else if (!record.replay.match) {
    eligible = false;
    reasons.push(`快照重放存在未解释差异（${record.replay.differences.join("; ")}）`);
  }

  const leakReason = findPrivacyLeak(record);
  if (leakReason) {
    eligible = false;
    reasons.push(leakReason);
  }

  return { eligible, reasons };
}

function findPrivacyLeak(record: ShowcaseCandidateRecord): string | null {
  const text = `${record.publicText ?? ""}\n${record.caseText ?? ""}`;
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(text)) {
      return `公开文本含占位符（${pattern.source}）`;
    }
  }
  if (IDENTITY_CARD_PATTERN.test(text)) {
    return "公开文本含18位身份证号";
  }
  if (PHONE_PATTERN.test(text)) {
    return "公开文本含手机号";
  }
  for (const token of record.identityTokens ?? []) {
    if (token && token.length > 0 && text.includes(token)) {
      return `公开文本泄漏身份标识（creator/videoId）`;
    }
  }
  return null;
}
