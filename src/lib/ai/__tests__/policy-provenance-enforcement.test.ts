import { describe, expect, it } from "vitest";
import type { ModelMessage } from "ai";

import {
  SAFE_NO_POLICY_SOURCE_RESPONSE,
  evaluatePolicyProvenance,
  formatServerDate,
  getPolicySearchStep,
  requiresPolicyProvenance,
  requiresPolicyOutputProvenance,
} from "../agent";
import { buildContextPrompt } from "../prompts";

const hit = {
  chunkId: "c1",
  documentVersionId: "11111111-1111-4111-8111-111111111111",
  text: "失业保险金标准为2340元",
  parentText: null,
  path: "/document/paragraph",
  score: 0.9,
  documentTitle: "上海市人力资源和社会保障局关于调整本市失业保险金支付标准的通知",
  authority: "上海市人力资源和社会保障局",
  sourceName: "上海市人力资源和社会保障局关于调整本市失业保险金支付标准的通知",
  officialUrl: "https://rsj.sh.gov.cn/t1.html",
  contentSha256: "a".repeat(64),
  mime: "text/html",
  originalDownloadPath: "/api/rag/originals/11111111-1111-4111-8111-111111111111",
};

describe("服务端当前日期上下文", () => {
  it("由服务端时钟确定格式并明确注入提示词", () => {
    expect(formatServerDate(new Date("2026-09-13T03:00:00.000Z"))).toBe("2026-09-13");
    const prompt = buildContextPrompt([], undefined, "2026-09-13");
    expect(prompt).toContain("当前服务器日期：2026-09-13");
    expect(prompt).toContain("不得猜测");
  });
});

describe("政策事实服务端来源门禁", () => {
  it("识别政策事实问题，但不拦截普通寒暄", () => {
    expect(
      requiresPolicyProvenance([
        { role: "user", content: "上海失业保险金标准是多少？" },
      ] as ModelMessage[]),
    ).toBe(true);
    expect(
      requiresPolicyProvenance([{ role: "user", content: "你好" }] as ModelMessage[]),
    ).toBe(false);
    expect(
      requiresPolicyProvenance([
        { role: "user", content: "我的社保缴费年限是20年" },
      ] as ModelMessage[]),
    ).toBe(false);
    expect(
      requiresPolicyProvenance([
        { role: "user", content: "上海失业保险金标准是多少？" },
        { role: "assistant", content: "第一年每月2340元。" },
        { role: "user", content: "你能上传文件吗？" },
      ] as ModelMessage[]),
    ).toBe(false);
  });

  it("结合近期对话识别省略式政策追问", () => {
    const messages = [
      { role: "user", content: "上海失业保险金标准是多少？" },
      { role: "assistant", content: "第一年每月2340元。" },
      { role: "user", content: "那第二年呢？" },
    ] as ModelMessage[];
    expect(requiresPolicyProvenance(messages)).toBe(true);
    expect(getPolicySearchStep(messages, "310000", 0)).toEqual({
      activeTools: ["searchPolicy"],
      toolChoice: { type: "tool", toolName: "searchPolicy" },
    });
    expect(getPolicySearchStep(messages, "310000", 1)).toBeUndefined();

    expect(
      requiresPolicyProvenance([
        { role: "user", content: "上海失业保险金标准是多少？" },
        { role: "assistant", content: "第一年每月2340元。" },
        { role: "user", content: "那你叫什么名字呢？" },
      ] as ModelMessage[]),
    ).toBe(false);
  });

  it("模型跳过searchPolicy时替换为无来源安全答复", () => {
    expect(evaluatePolicyProvenance("上海失业金是9999元", []).text).toBe(
      SAFE_NO_POLICY_SOURCE_RESPONSE,
    );
  });

  it("即使用户只寒暄，模型主动输出政策数字也必须进入来源门禁", () => {
    expect(requiresPolicyOutputProvenance("你好，我是社保规划助手。")).toBe(false);
    expect(requiresPolicyOutputProvenance("男性法定退休年龄是60岁。")).toBe(true);
    expect(requiresPolicyOutputProvenance("政策来源：https://example.com/fake")).toBe(true);
  });

  it("画像收集问题不是政策事实输出", () => {
    expect(
      requiresPolicyOutputProvenance("请告诉我您的年龄和社保缴费年限。"),
    ).toBe(false);
    expect(requiresPolicyOutputProvenance("您的医保缴费年限是多少？")).toBe(false);
    expect(
      requiresPolicyOutputProvenance("已记录：您的年龄是40岁，社保缴费年限是20年。"),
    ).toBe(false);
  });

  it("混合输出只豁免纯画像收集段，政策断言仍须来源", () => {
    expect(
      requiresPolicyOutputProvenance(
        "请告诉我您的年龄。社保领取条件是达到法定退休年龄。",
      ),
    ).toBe(true);
    expect(
      requiresPolicyOutputProvenance(
        "请告诉我您的年龄，失业金可以领取24个月。",
      ),
    ).toBe(true);
  });

  it("真实searchPolicy命中且回复只使用同一命中的官网与归档双链时放行", () => {
    const answer = `标准为2340元。官网原文：${hit.officialUrl}；归档原件：${hit.originalDownloadPath}`;
    expect(
      evaluatePolicyProvenance(answer, [
        { success: true, hits: [hit], noReliableHits: false },
      ]),
    ).toEqual({ accepted: true, text: answer });

    const markdownAnswer =
      `标准为2340元。[官网原文](${hit.officialUrl})；` +
      `[归档原件](${hit.originalDownloadPath})`;
    expect(
      evaluatePolicyProvenance(markdownAnswer, [
        { success: true, hits: [hit], noReliableHits: false },
      ]),
    ).toEqual({ accepted: true, text: markdownAnswer });
  });

  it("模型编造官网或归档URL时整段替换，不泄漏政策事实", () => {
    const invented =
      "上海失业金是9999元。官网原文：https://example.com/fake；归档原件：/api/rag/originals/22222222-2222-4222-8222-222222222222";
    expect(
      evaluatePolicyProvenance(invented, [
        { success: true, hits: [hit], noReliableHits: false },
      ]),
    ).toEqual({ accepted: false, text: SAFE_NO_POLICY_SOURCE_RESPONSE });
  });

  it("完整解析Markdown/纯文本目标，拒绝批准URL的路径或查询后缀", () => {
    const outputs = [{ success: true, hits: [hit], noReliableHits: false }];
    for (const answer of [
      `标准为2340元。[官网](${hit.officialUrl}/fabricated)；[归档](${hit.originalDownloadPath})`,
      `标准为2340元。官网：${hit.officialUrl}?fake=true；归档：${hit.originalDownloadPath}`,
      `标准为2340元。[官网](${hit.officialUrl})；[归档](${hit.originalDownloadPath}/fabricated)`,
      `标准为2340元。官网：${hit.officialUrl}；归档：${hit.originalDownloadPath}?fake=true`,
      `标准为2340元。官网：${hit.officialUrl}；归档：${hit.originalDownloadPath}；更多：//evil.example/fake`,
      `标准为2340元。[官网](${hit.officialUrl})；[归档](${hit.originalDownloadPath})；[镜像](//evil.example/fake)`,
    ]) {
      expect(evaluatePolicyProvenance(answer, outputs)).toEqual({
        accepted: false,
        text: SAFE_NO_POLICY_SOURCE_RESPONSE,
      });
    }
  });

  it("解析Markdown引用式链接定义并拒绝所有非批准href", () => {
    const outputs = [{ success: true, hits: [hit], noReliableHits: false }];
    for (const destination of ["/fabricated", "../fabricated", "#fabricated"]) {
      const answer =
        `标准为2340元。[官网](${hit.officialUrl})；[归档](${hit.originalDownloadPath})；` +
        `[更多][x]\n\n[x]: ${destination}`;
      expect(evaluatePolicyProvenance(answer, outputs)).toEqual({
        accepted: false,
        text: SAFE_NO_POLICY_SOURCE_RESPONSE,
      });
    }

    const approvedReferenceAnswer =
      "标准为2340元。[官网][official]；[归档][archive]\n\n" +
      `[official]: ${hit.officialUrl}\n` +
      `[archive]: ${hit.originalDownloadPath}`;
    expect(evaluatePolicyProvenance(approvedReferenceAnswer, outputs)).toEqual({
      accepted: true,
      text: approvedReferenceAnswer,
    });
  });

  it("命中缺标题/机关或无可靠命中时拒绝模型政策事实", () => {
    for (const output of [
      { success: true, hits: [{ ...hit, authority: "" }], noReliableHits: false },
      { success: true, hits: [], noReliableHits: true },
      { success: false, hits: [], noReliableHits: true, error: "unavailable" },
    ]) {
      expect(evaluatePolicyProvenance("模型事实", [output]).text).toBe(
        SAFE_NO_POLICY_SOURCE_RESPONSE,
      );
    }
  });
});
