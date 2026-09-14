import { describe, expect, it } from "vitest";

import { collectWarningTexts } from "./ToolResultCard";

/**
 * UAT第二轮崩溃回归（2026-09-14）：外部工具返回的warnings不可信——
 * 顶层output.warnings实际同时含string与{warning_id,text}对象，
 * calc.warnings为对象数组；旧实现对对象直接调用trim()触发
 * "e.trim is not a function"页面崩溃。collectWarningTexts必须把
 * 顶层warnings与calc.warnings整体视为unknown边界并归一化。
 */
describe("collectWarningTexts（外部工具warnings边界归一化）", () => {
  it("生产崩溃场景：混合string与结构化warning归一化、去重并保持顺序", () => {
    const result = {
      warnings: [
        "  第一条警告  ",
        { warning_id: "w2", text: "第二条警告" },
        { text: "第一条警告" },
        null,
        42,
        { warning_id: "missing-text" },
      ],
      calc: {
        warnings: [
          { warning_id: "w3", text: "第三条警告" },
          { text: "   " },
        ],
      },
    };

    expect(collectWarningTexts(result)).toEqual([
      "第一条警告",
      "第二条警告",
      "第三条警告",
    ]);
  });

  it("合并顺序：顶层warnings在前、calc.warnings在后", () => {
    const result = {
      warnings: [{ text: "顶层警告" }],
      calc: { warnings: [{ text: "计算警告" }] },
    };

    expect(collectWarningTexts(result)).toEqual(["顶层警告", "计算警告"]);
  });

  it("非法项全部忽略：null/undefined/数字/布尔/数组/缺text对象/text非字符串", () => {
    const result = {
      warnings: [null, undefined, 0, false, ["数组"], {}, { text: 42 }, { text: null }],
      calc: { warnings: [{ text: "唯一有效警告" }] },
    };

    expect(collectWarningTexts(result)).toEqual(["唯一有效警告"]);
  });

  it("按规范化文本去重并保留首次出现顺序", () => {
    const result = {
      warnings: ["重复警告", " 重复警告 ", { text: "重复警告" }],
      calc: { warnings: [{ text: "重复警告" }, { text: "末条警告" }] },
    };

    expect(collectWarningTexts(result)).toEqual(["重复警告", "末条警告"]);
  });

  it("最多返回4条", () => {
    const result = { warnings: ["一", "二", "三", "四", "五"] };

    expect(collectWarningTexts(result)).toEqual(["一", "二", "三", "四"]);
  });

  it("result非对象或warnings非数组时返回空数组，不抛错", () => {
    expect(collectWarningTexts(null)).toEqual([]);
    expect(collectWarningTexts(undefined)).toEqual([]);
    expect(collectWarningTexts("文本")).toEqual([]);
    expect(collectWarningTexts(42)).toEqual([]);
    expect(collectWarningTexts(["数组"])).toEqual([]);
    expect(collectWarningTexts({ warnings: "不是数组" })).toEqual([]);
    expect(
      collectWarningTexts({ warnings: [{ text: "有效" }], calc: { warnings: "坏值" } }),
    ).toEqual(["有效"]);
  });

  it("不修改传入对象", () => {
    const result = {
      warnings: ["  警告  ", { text: "结构化" }],
      calc: { warnings: [{ text: "计算" }] },
    };
    const snapshot = JSON.parse(JSON.stringify(result));

    collectWarningTexts(result);

    expect(result).toEqual(snapshot);
  });
});
