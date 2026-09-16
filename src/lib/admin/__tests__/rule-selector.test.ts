/**
 * APR-FR-009/AC-007：规则集成员选择器过滤（纯函数）。
 * 支持名称与编号搜索；排除已加入成员与不可解析候选；
 * 名称与编号同时命中时按稳定实体身份去重；保存值仍为规则编号。
 */
import { describe, expect, it } from "vitest";
import {
  filterSelectableRules,
  type SelectableRuleCandidate,
} from "../rule-selector";

function cand(over: Partial<SelectableRuleCandidate> & { ruleId: string }): SelectableRuleCandidate {
  return {
    name: `规则${over.ruleId}`,
    jurisdictionCode: "CN",
    version: 1,
    status: "published",
    ...over,
  };
}

const POOL: SelectableRuleCandidate[] = [
  cand({ ruleId: "R-010", name: "解析出生年份" }),
  cand({ ruleId: "R-012", name: "性别归一化" }),
  cand({ ruleId: "R-500", name: "4050补贴资格", jurisdictionCode: "310000" }),
  cand({ ruleId: "R-500", name: "4050补贴资格", jurisdictionCode: "310000", version: 2 }),
];

describe("filterSelectableRules（APR-FR-009）", () => {
  it("空查询返回全部候选（已去重）", () => {
    const out = filterSelectableRules(POOL, [], "");
    expect(out.map((c) => c.ruleId)).toEqual(["R-010", "R-012", "R-500"]);
  });

  it("中文名称搜索命中", () => {
    const out = filterSelectableRules(POOL, [], "出生年份");
    expect(out).toHaveLength(1);
    expect(out[0].ruleId).toBe("R-010");
  });

  it("编号搜索命中且大小写不敏感", () => {
    const out = filterSelectableRules(POOL, [], "r-50");
    expect(out.map((c) => c.ruleId)).toEqual(["R-500"]);
  });

  it("名称与编号同时命中同一编号时按稳定身份去重（失败模式表）", () => {
    const pool = [
      cand({ ruleId: "R-500", name: "R-500补贴资格" }),
    ];
    const out = filterSelectableRules(pool, [], "R-500");
    expect(out).toHaveLength(1);
  });

  it("排除已加入成员", () => {
    const out = filterSelectableRules(POOL, ["R-010"], "");
    expect(out.map((c) => c.ruleId)).not.toContain("R-010");
  });

  it("多版本同编号只返回最新版本候选", () => {
    const out = filterSelectableRules(POOL, [], "4050");
    expect(out).toHaveLength(1);
    expect(out[0].version).toBe(2);
  });

  it("无命中返回空数组", () => {
    expect(filterSelectableRules(POOL, [], "不存在的关键词")).toEqual([]);
  });

  it("输出顺序按规则编号稳定排序", () => {
    const pool = [cand({ ruleId: "R-9" }), cand({ ruleId: "R-10" }), cand({ ruleId: "R-2" })];
    const out = filterSelectableRules(pool, [], "R-");
    expect(out.map((c) => c.ruleId)).toEqual(["R-10", "R-2", "R-9"]);
  });
});
