/**
 * CLG-FR-006 质量评分（输入完整40 / 预期完整30 / 来源证据20 / 快照重放10）。
 * - 每个维度按固定权重拆分，缺失项逐项扣分并输出原因；
 * - 相同输入产生相同分数（CLG-NFR-002 确定性）；
 * - 评分明细必须包含逐项原因，禁止只有总分（任务要求二.3）。
 *
 * Red：实现前模块 `src/lib/case-governance/scoring` 不存在，全部用例应失败。
 */
import { describe, it, expect } from "vitest";
import {
  scoreShowcaseCandidate,
  type ShowcaseCandidateRecord,
} from "../scoring";

function fullRecord(overrides: Partial<ShowcaseCandidateRecord> = {}): ShowcaseCandidateRecord {
  return {
    caseUid: "71c427049305-01",
    sourceCaseUid: "71c427049305",
    gender: "female",
    birthYear: 1974,
    employmentStatus: "flexible",
    input: {
      basic: { gender: "female", birth_year: 1974 },
      social: { pension_contrib_months: 180 },
      status: { employment_status: "flexible" },
    },
    expected: {
      retire_age: "37岁",
      retire_date: "2036-03",
      min_contrib_years: 15,
      subsidy_4050: true,
    },
    transcriptLength: 200,
    sourceFile: "independent_cases_with_full_transcripts_v5.xlsx",
    caseText: "那我们现在最后再来复习一下，然后女性举例子",
    publicText: "我是女的，1974年出生，灵活就业……",
    replay: { match: true, differences: [] },
    identityTokens: [],
    ...overrides,
  };
}

describe("CLG-FR-006 质量评分：输入完整（满分40）", () => {
  it("四类输入字段齐全得40分", () => {
    const s = scoreShowcaseCandidate(fullRecord());
    expect(s.inputCompleteness).toBe(40);
  });

  it("缺失性别扣10分", () => {
    const s = scoreShowcaseCandidate(
      fullRecord({ gender: "", input: { basic: { birth_year: 1974 }, social: { pension_contrib_months: 180 }, status: { employment_status: "flexible" } } }),
    );
    expect(s.inputCompleteness).toBe(30);
    expect(s.reasons.some((r) => r.includes("性别"))).toBe(true);
  });

  it("缺失出生年份扣10分", () => {
    const s = scoreShowcaseCandidate(fullRecord({ birthYear: 0 }));
    expect(s.inputCompleteness).toBe(30);
    expect(s.reasons.some((r) => r.includes("出生年"))).toBe(true);
  });

  it("就业状态非明确三值（employed/flexible/unemployed）扣10分", () => {
    const s = scoreShowcaseCandidate(fullRecord({ employmentStatus: "unknown" }));
    expect(s.inputCompleteness).toBe(30);
    expect(s.reasons.some((r) => r.includes("就业状态"))).toBe(true);
  });

  it("缺失养老缴费信息扣10分", () => {
    const s = scoreShowcaseCandidate(
      fullRecord({ input: { basic: { gender: "female", birth_year: 1974 }, status: { employment_status: "flexible" } } }),
    );
    expect(s.inputCompleteness).toBe(30);
    expect(s.reasons.some((r) => r.includes("缴费"))).toBe(true);
  });
});

describe("CLG-FR-006 质量评分：预期完整（满分30）", () => {
  it("退休年龄/退休日期/最低缴费年限/补贴姿态齐全得30分", () => {
    const s = scoreShowcaseCandidate(fullRecord());
    expect(s.expectedCompleteness).toBe(30);
  });

  it("缺失退休年龄扣8分", () => {
    const s = scoreShowcaseCandidate(fullRecord({ expected: { retire_date: "2036-03", min_contrib_years: 15, subsidy_4050: true } }));
    expect(s.expectedCompleteness).toBe(22);
  });

  it("缺失退休日期扣8分", () => {
    const s = scoreShowcaseCandidate(fullRecord({ expected: { retire_age: "37岁", min_contrib_years: 15, subsidy_4050: true } }));
    expect(s.expectedCompleteness).toBe(22);
  });

  it("缺失最低缴费年限扣7分", () => {
    const s = scoreShowcaseCandidate(fullRecord({ expected: { retire_age: "37岁", retire_date: "2036-03", subsidy_4050: true } }));
    expect(s.expectedCompleteness).toBe(23);
  });

  it("三项补贴姿态全部未知扣7分", () => {
    const s = scoreShowcaseCandidate(fullRecord({ expected: { retire_age: "37岁", retire_date: "2036-03", min_contrib_years: 15 } }));
    expect(s.expectedCompleteness).toBe(23);
  });
});

describe("CLG-FR-006 质量评分：来源证据（满分20）", () => {
  it("来源文件存在+来源案例可解析+转录>=100字符得20分", () => {
    const s = scoreShowcaseCandidate(fullRecord());
    expect(s.sourceEvidence).toBe(20);
  });

  it("来源文件缺失扣6分", () => {
    const s = scoreShowcaseCandidate(fullRecord({ sourceFile: null }));
    expect(s.sourceEvidence).toBe(14);
  });

  it("来源案例UID为空扣8分", () => {
    const s = scoreShowcaseCandidate(fullRecord({ sourceCaseUid: "" }));
    expect(s.sourceEvidence).toBe(12);
  });

  it("转录长度不足100字符扣6分", () => {
    const s = scoreShowcaseCandidate(fullRecord({ transcriptLength: 50 }));
    expect(s.sourceEvidence).toBe(14);
  });
});

describe("CLG-FR-006 质量评分：快照重放（满分10）", () => {
  it("重放一致得10分", () => {
    const s = scoreShowcaseCandidate(fullRecord());
    expect(s.snapshotReplay).toBe(10);
  });

  it("重放存在未解释差异得0分并记录差异原因", () => {
    const s = scoreShowcaseCandidate(
      fullRecord({ replay: { match: false, differences: ["retire_age: 期望37岁, 实际39岁"] } }),
    );
    expect(s.snapshotReplay).toBe(0);
    expect(s.reasons.some((r) => r.includes("快照重放"))).toBe(true);
  });
});

describe("CLG-FR-006 总分与逐项原因", () => {
  it("完整记录总分100", () => {
    const s = scoreShowcaseCandidate(fullRecord());
    expect(s.total).toBe(100);
  });

  it("分数必须等于四维之和", () => {
    const record = fullRecord({
      input: { basic: { gender: "female" } },
      transcriptLength: 30,
      replay: { match: false, differences: ["x"] },
    });
    const s = scoreShowcaseCandidate(record);
    expect(s.total).toBe(s.inputCompleteness + s.expectedCompleteness + s.sourceEvidence + s.snapshotReplay);
  });

  it("输出至少一条逐项原因（禁止只有总分）", () => {
    const s = scoreShowcaseCandidate(fullRecord());
    expect(Array.isArray(s.reasons)).toBe(true);
    expect(s.reasons.length).toBeGreaterThan(0);
  });

  it("相同输入两次评分结果完全一致（CLG-NFR-002）", () => {
    const a = scoreShowcaseCandidate(fullRecord());
    const b = scoreShowcaseCandidate(fullRecord());
    expect(a).toEqual(b);
  });
});