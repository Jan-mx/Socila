/**
 * APR-FR-012（单元）：参数引用反查索引与地区链过滤。
 */
import { describe, expect, it } from "vitest";
import {
  buildParamReferenceIndex,
  filterRefsForJurisdiction,
  type RuleReferenceRow,
} from "../param-references";

function row(over: Partial<RuleReferenceRow> & { ruleId: string }): RuleReferenceRow {
  return {
    name: `规则${over.ruleId}`,
    jurisdictionCode: "CN",
    version: 1,
    parameterRefs: [],
    ...over,
  };
}

describe("buildParamReferenceIndex（APR-FR-012）", () => {
  const rules: RuleReferenceRow[] = [
    row({
      ruleId: "R-510-4050-AMOUNT",
      jurisdictionCode: "310000",
      parameterRefs: [
        { param_id: "P-SH-4050-SUBSIDY-RATE", purpose: "补贴比例" },
        "P-SH-CONTRIB-BASE-LOWER",
      ],
    }),
    row({
      ruleId: "R-510-4050-AMOUNT",
      jurisdictionCode: "310000",
      version: 2,
      parameterRefs: [{ param_id: "P-SH-4050-SUBSIDY-RATE" }],
    }),
    row({ ruleId: "R-020", parameterRefs: "not-an-array" }),
  ];

  it("对象/字符串两种parameter_refs形状均可反查", () => {
    const idx = buildParamReferenceIndex(rules);
    const byRule = idx.get("P-SH-4050-SUBSIDY-RATE");
    expect(byRule?.map((r) => r.ruleId)).toEqual(["R-510-4050-AMOUNT"]);
    expect(idx.get("P-SH-CONTRIB-BASE-LOWER")?.[0].ruleId).toBe(
      "R-510-4050-AMOUNT",
    );
  });

  it("同ruleId多版本去重保留最新版本；非法形状忽略", () => {
    const idx = buildParamReferenceIndex(rules);
    const refs = idx.get("P-SH-4050-SUBSIDY-RATE");
    expect(refs).toHaveLength(1);
    expect(refs?.[0].version).toBe(2);
    expect(idx.has("not-an-array")).toBe(false);
  });
});

describe("buildParamReferenceIndex（修复轮I5：跨地区同编号去重身份）", () => {
  const sameIdAcrossRegions: RuleReferenceRow[] = [
    row({ ruleId: "R-COMMON", jurisdictionCode: "CN", version: 3, parameterRefs: ["P-X"] }),
    row({ ruleId: "R-COMMON", jurisdictionCode: "310000", version: 1, parameterRefs: ["P-X"] }),
    row({ ruleId: "R-COMMON", jurisdictionCode: "440000", version: 1, parameterRefs: ["P-X"] }),
  ];

  it("CN与上海存在相同ruleId时三条地区身份都保留（不按ruleId互相覆盖）", () => {
    const refs = buildParamReferenceIndex(sameIdAcrossRegions).get("P-X");
    expect(refs?.map((r) => `${r.jurisdictionCode}@v${r.version}`)).toEqual([
      "310000@v1",
      "440000@v1",
      "CN@v3",
    ]);
  });

  it("同地区同ruleId多版本只保留本地区最新（版本比较不跨地区串用）", () => {
    const refs = buildParamReferenceIndex([
      row({ ruleId: "R-COMMON", jurisdictionCode: "CN", version: 2, parameterRefs: ["P-X"] }),
      row({ ruleId: "R-COMMON", jurisdictionCode: "CN", version: 5, parameterRefs: ["P-X"] }),
      row({ ruleId: "R-COMMON", jurisdictionCode: "310000", version: 1, parameterRefs: ["P-X"] }),
      // 干扰项：CN v1先出现不得覆盖CN v5（版本更大的同地区行胜出）。
      row({ ruleId: "R-COMMON", jurisdictionCode: "CN", version: 1, parameterRefs: ["P-X"] }),
    ]).get("P-X");
    expect(refs).toHaveLength(2);
    expect(refs?.find((r) => r.jurisdictionCode === "CN")?.version).toBe(5);
    expect(refs?.find((r) => r.jurisdictionCode === "310000")?.version).toBe(1);
  });

  it("输入顺序变化不改变输出（确定性排序）", () => {
    const forward = buildParamReferenceIndex(sameIdAcrossRegions).get("P-X");
    const backward = buildParamReferenceIndex(
      [...sameIdAcrossRegions].reverse(),
    ).get("P-X");
    expect(backward).toEqual(forward);
  });

  it("过滤组合：CN参数只剩CN、上海参数含CN与上海、广东不混入上海", () => {
    const refs = buildParamReferenceIndex(sameIdAcrossRegions).get("P-X")!;
    expect(
      filterRefsForJurisdiction(refs, "CN").map((r) => r.jurisdictionCode),
    ).toEqual(["CN"]);
    expect(
      filterRefsForJurisdiction(refs, "310000").map((r) => r.jurisdictionCode),
    ).toEqual(["310000", "CN"]);
    expect(
      filterRefsForJurisdiction(refs, "440000").map((r) => r.jurisdictionCode),
    ).toEqual(["440000", "CN"]);
  });
});

describe("filterRefsForJurisdiction（地区链过滤）", () => {
  const refs = [
    { ruleId: "R-220", name: "国家医保年限", jurisdictionCode: "CN", version: 1 },
    { ruleId: "R-500", name: "上海规则", jurisdictionCode: "310000", version: 1 },
    { ruleId: "R-GD", name: "广东规则", jurisdictionCode: "440000", version: 1 },
  ];

  it("地区参数行只显示CN与本地区引用（CN垫底继承链）", () => {
    const sh = filterRefsForJurisdiction(refs, "310000");
    expect(sh.map((r) => r.ruleId).sort()).toEqual(["R-220", "R-500"]);
  });

  it("CN参数行只显示CN规则引用", () => {
    const cn = filterRefsForJurisdiction(refs, "CN");
    expect(cn.map((r) => r.ruleId)).toEqual(["R-220"]);
  });

  it("地区缺失（历史行）不过滤，引用项自含地区标注", () => {
    expect(filterRefsForJurisdiction(refs, null).length).toBe(refs.length);
  });
});
