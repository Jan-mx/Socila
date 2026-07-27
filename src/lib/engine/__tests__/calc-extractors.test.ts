import { describe, it, expect } from "vitest";
import {
  extractNeedsAgent,
  extractQuestions,
  extractWarnings,
  extractCaveats,
} from "../calc-extractors";

/**
 * 回归测试：此前 ai/tools.ts 误从 trace.actions 读取问题/警告，导致
 * needs_agent 恒 false、questions/warnings 恒空。这里锁定"从 calc 抽取"的正确行为。
 */

describe("calc-extractors · extractNeedsAgent", () => {
  it("calc.agent_questions 非空 → 需要追问", () => {
    expect(
      extractNeedsAgent({ agent_questions: [{ question_id: "Q1" }] }),
    ).toBe(true);
  });

  it("calc.needs_agent === true 也视为需要追问", () => {
    expect(extractNeedsAgent({ needs_agent: true })).toBe(true);
  });

  it("无问题且无标记 → 不需要追问", () => {
    expect(extractNeedsAgent({ agent_questions: [] })).toBe(false);
    expect(extractNeedsAgent({})).toBe(false);
  });

  it("空 calc 安全返回 false", () => {
    expect(
      extractNeedsAgent(undefined as unknown as Record<string, unknown>),
    ).toBe(false);
  });
});

describe("calc-extractors · extractQuestions", () => {
  it("从 calc.agent_questions 映射出标准问题结构", () => {
    const questions = extractQuestions({
      agent_questions: [
        {
          question_id: "Q-GENDER",
          field: "basic.gender",
          text: "请问您的性别？",
          options: [
            { value: "male", label: "男" },
            { value: "female", label: "女" },
          ],
        },
      ],
    });
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      question_id: "Q-GENDER",
      field: "basic.gender",
      label: "请问您的性别？",
    });
    expect(questions[0].options).toHaveLength(2);
  });

  it("label 回退顺序 label → question → text", () => {
    expect(extractQuestions({ agent_questions: [{ label: "L" }] })[0].label).toBe(
      "L",
    );
    expect(
      extractQuestions({ agent_questions: [{ question: "Q" }] })[0].label,
    ).toBe("Q");
    expect(extractQuestions({ agent_questions: [{ text: "T" }] })[0].label).toBe(
      "T",
    );
  });

  it("无 agent_questions 返回空数组", () => {
    expect(extractQuestions({})).toEqual([]);
  });

  it("不读 trace 字段（旧 bug 回归）：只有 trace.actions 时返回空", () => {
    const calcLike = {
      // 模拟旧代码误以为问题在这里
      trace: [{ actions: [{ type: "emit_question", value: { question_id: "X" } }] }],
    };
    expect(extractQuestions(calcLike)).toEqual([]);
    expect(extractNeedsAgent(calcLike)).toBe(false);
  });
});

describe("calc-extractors · extractWarnings", () => {
  it("对象形态取 text 字段", () => {
    expect(
      extractWarnings({ warnings: [{ warning_id: "W1", text: "注意缴费年限" }] }),
    ).toEqual(["注意缴费年限"]);
  });

  it("字符串形态原样保留", () => {
    expect(extractWarnings({ warnings: ["纯文本警告"] })).toEqual(["纯文本警告"]);
  });

  it("无 warnings 返回空数组", () => {
    expect(extractWarnings({})).toEqual([]);
  });
});

describe("calc-extractors · extractCaveats", () => {
  it("透传 calc.caveats", () => {
    const caveats = extractCaveats({
      caveats: [{ caveat_id: "C1", text: "估算", confidence: "medium" }],
    });
    expect(caveats).toHaveLength(1);
    expect(caveats[0].confidence).toBe("medium");
  });

  it("无 caveats 返回空数组", () => {
    expect(extractCaveats({})).toEqual([]);
  });
});
