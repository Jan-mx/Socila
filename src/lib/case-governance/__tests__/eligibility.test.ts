/**
 * CLG-FR-007 资格门禁：
 * 总分>=70、来源可解析、转录>=100字符、核心字段完整（出生年/性别/明确就业状态、
 * 退休年龄或日期）、快照重放无未解释差异、无占位符或身份泄漏。
 *
 * Red：实现前模块 `src/lib/case-governance/eligibility` 不存在，全部用例应失败。
 */
import { describe, it, expect } from "vitest";
import { checkEligibility } from "../eligibility";
import type { ScoreBreakdown, ShowcaseCandidateRecord } from "../types";

function fullScore(): ScoreBreakdown {
  return {
    inputCompleteness: 40,
    expectedCompleteness: 30,
    sourceEvidence: 20,
    snapshotReplay: 10,
    total: 100,
    reasons: [],
  };
}

function fullRecord(overrides: Partial<ShowcaseCandidateRecord> = {}): ShowcaseCandidateRecord {
  return {
    caseUid: "71c427049305-01",
    sourceCaseUid: "71c427049305",
    gender: "female",
    birthYear: 1974,
    employmentStatus: "flexible",
    input: { basic: { gender: "female", birth_year: 1974 }, status: { employment_status: "flexible" } },
    expected: { retire_age: "37岁" },
    transcriptLength: 200,
    sourceFile: "independent_cases_with_full_transcripts_v5.xlsx",
    caseText: "真实案例转录文本",
    publicText: "我是1974年出生的女性，目前灵活就业，想了解退休规划。",
    replay: { match: true, differences: [] },
    identityTokens: ["视频作者A", "vid_12345"],
    ...overrides,
  };
}

describe("CLG-FR-007 资格门禁：通过条件", () => {
  it("总分100且全部条件满足 → 入选", () => {
    const result = checkEligibility(fullRecord(), fullScore());
    expect(result.eligible).toBe(true);
  });

  it("总分正好70且其余条件满足 → 入选", () => {
    const score = fullScore();
    score.total = 70;
    score.inputCompleteness = 10;
    const result = checkEligibility(fullRecord(), score);
    expect(result.eligible).toBe(true);
  });
});

describe("CLG-FR-007 资格门禁：拒绝条件", () => {
  it("总分低于70 → 拒绝", () => {
    const score = fullScore();
    score.total = 69;
    const result = checkEligibility(fullRecord(), score);
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("70"))).toBe(true);
  });

  it("来源无法解析（sourceCaseUid为空）→ 拒绝", () => {
    const result = checkEligibility(fullRecord({ sourceCaseUid: "" }), fullScore());
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("来源"))).toBe(true);
  });

  it("转录长度不足100字符 → 拒绝", () => {
    const result = checkEligibility(fullRecord({ transcriptLength: 99 }), fullScore());
    expect(result.eligible).toBe(false);
  });

  it("缺出生年份 → 拒绝", () => {
    const result = checkEligibility(fullRecord({ birthYear: 0 }), fullScore());
    expect(result.eligible).toBe(false);
  });

  it("缺性别 → 拒绝", () => {
    const result = checkEligibility(fullRecord({ gender: "", input: { status: { employment_status: "flexible" } } }), fullScore());
    expect(result.eligible).toBe(false);
  });

  it("就业状态非明确三值 → 拒绝（CLG-FR-007：明确就业状态）", () => {
    const result = checkEligibility(fullRecord({ employmentStatus: "unknown" }), fullScore());
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("就业状态"))).toBe(true);
  });

  it("缺退休年龄且缺退休日期 → 拒绝", () => {
    const result = checkEligibility(
      fullRecord({ expected: {} }),
      fullScore(),
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("退休"))).toBe(true);
  });

  it("快照重放存在未解释差异 → 拒绝", () => {
    const result = checkEligibility(
      fullRecord({ replay: { match: false, differences: ["retire_age 不一致"] } }),
      fullScore(),
    );
    expect(result.eligible).toBe(false);
  });

  it("公开文本含占位符[X] → 拒绝", () => {
    const result = checkEligibility(fullRecord({ publicText: "推荐退休节点：[X]年" }), fullScore());
    expect(result.eligible).toBe(false);
  });

  it("公开文本含「待定」→ 拒绝", () => {
    const result = checkEligibility(fullRecord({ publicText: "养老缺口：待定" }), fullScore());
    expect(result.eligible).toBe(false);
  });

  it("公开文本含「TBD」→ 拒绝", () => {
    const result = checkEligibility(fullRecord({ publicText: "金额 TBD" }), fullScore());
    expect(result.eligible).toBe(false);
  });

  it("公开文本泄漏creator身份 → 拒绝（CLG-NFR-004）", () => {
    const result = checkEligibility(
      fullRecord({ publicText: "我听了视频作者A的讲解", identityTokens: ["视频作者A", "vid_12345"] }),
      fullScore(),
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons.some((r) => r.includes("身份"))).toBe(true);
  });

  it("公开文本泄漏videoId → 拒绝", () => {
    const result = checkEligibility(
      fullRecord({ publicText: "详见 vid_12345 视频", identityTokens: ["视频作者A", "vid_12345"] }),
      fullScore(),
    );
    expect(result.eligible).toBe(false);
  });

  it("公开文本含18位身份证号 → 拒绝", () => {
    const result = checkEligibility(
      fullRecord({ publicText: "证件号310101198001011234登记" }),
      fullScore(),
    );
    expect(result.eligible).toBe(false);
  });
});

describe("CLG-FR-007 确定性与原因输出", () => {
  it("相同输入两次判定完全一致（CLG-NFR-002）", () => {
    const a = checkEligibility(fullRecord(), fullScore());
    const b = checkEligibility(fullRecord(), fullScore());
    expect(a).toEqual(b);
  });

  it("拒绝时输出具体原因", () => {
    const result = checkEligibility(fullRecord({ transcriptLength: 0, expected: {} }), fullScore());
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});