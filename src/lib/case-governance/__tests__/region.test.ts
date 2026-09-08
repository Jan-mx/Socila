/**
 * 执行要求一.3 / CLG-FR-002、PRD §3：现有案例只能依据权威来源（上海转录/回归工作簿）
 * 标记为310000，不得从案例正文猜测广东440000或四川510000。
 *
 * Red：实现前模块 `src/lib/case-governance/region` 不存在。
 */
import { describe, it, expect } from "vitest";
import { assignRegionsFromAuthoritativeSources, SHANGHAI_JURISDICTION } from "../region";

describe("CLG-FR-002 地区归属：只允许权威来源", () => {
  it("权威来源存在的案例归属310000", () => {
    const regions = assignRegionsFromAuthoritativeSources({
      caseUids: new Set(["71c427049305", "54b3222e1978"]),
      regressionCaseUids: new Set(["71c427049305"]),
      showcaseSourceUids: new Set(["54b3222e1978"]),
      caseTextByUid: new Map(),
    });
    expect(regions.get("71c427049305")).toBe(SHANGHAI_JURISDICTION);
    expect(regions.get("54b3222e1978")).toBe(SHANGHAI_JURISDICTION);
  });

  it("不在任何权威来源的案例 → 不归属（保持null），绝不猜测", () => {
    const regions = assignRegionsFromAuthoritativeSources({
      caseUids: new Set(["unknown-uid-1"]),
      regressionCaseUids: new Set(),
      showcaseSourceUids: new Set(),
      caseTextByUid: new Map([["unknown-uid-1", "本案例提到广东省深圳市社保政策/补贴标准..."]]),
    });
    expect(regions.has("unknown-uid-1")).toBe(true);
    expect(regions.get("unknown-uid-1")).toBeNull();
  });

  it("正文提及广东/四川词汇也不得派生440000/510000归属", () => {
    // 正文含“广东”“四川”字样的案例仍不得被标记为440000/510000
    const text = "有网友问四川成都的灵活就业补贴，还有广东深圳的4050申请条件……";
    const regions = assignRegionsFromAuthoritativeSources({
      caseUids: new Set(["foo"]),
      regressionCaseUids: new Set(),
      showcaseSourceUids: new Set(),
      caseTextByUid: new Map([["foo", text]]),
    });
    expect([...regions.values()].every((v) => v === null || v === SHANGHAI_JURISDICTION)).toBe(true);
  });

  it("来源同时是回归与展示来源 → 仍310000", () => {
    const regions = assignRegionsFromAuthoritativeSources({
      caseUids: new Set(["uid"]),
      regressionCaseUids: new Set(["uid"]),
      showcaseSourceUids: new Set(["uid"]),
      caseTextByUid: new Map(),
    });
    expect(regions.get("uid")).toBe(SHANGHAI_JURISDICTION);
  });
});