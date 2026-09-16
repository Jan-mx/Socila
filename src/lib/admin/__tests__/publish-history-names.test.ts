/**
 * APR-FR-016 / APR-NFR-005 / AC-011：发布历史名称真实性（纯函数）。
 *
 * 历史名称只允许通过 entityType + jurisdiction_code + entity_id + entity_version
 * 精确解析；身份缺失或对应版本实体不存在时必须返回null（"名称不可用"），
 * 严禁用当前版本名称或他区名称冒充历史名称。
 */
import { describe, expect, it } from "vitest";
import {
  buildNameIndex,
  entityNameKey,
  resolveHistoryDisplayNames,
  type EntityNameRow,
  type PublishNameRecord,
} from "../publish-history-names";

function row(
  entityType: string,
  jurisdictionCode: string,
  entityId: string,
  version: number,
  name: string,
): EntityNameRow {
  return { entityType, jurisdictionCode, entityId, version, name };
}

function record(over: Partial<PublishNameRecord> & { entityType: string; entityId: string }): PublishNameRecord {
  return {
    jurisdictionCode: "CN",
    entityVersion: 1,
    ...over,
  };
}

describe("resolveHistoryDisplayNames（APR-FR-016）", () => {
  const index = buildNameIndex([
    row("rule", "CN", "R-010", 1, "解析出生年份v1"),
    row("rule", "CN", "R-010", 2, "解析出生年份v2"),
    row("rule", "310000", "R-SAME", 1, "上海同号规则"),
    row("rule", "440000", "R-SAME", 1, "广东同号规则"),
    row("param", "CN", "P-X", 1, "国家参数"),
    row("rule_set", "CN", "RS-CN-PLAN-V1", 1, "国家规划规则集"),
  ]);

  it("三类实体按精确身份命中对应版本名称", () => {
    const out = resolveHistoryDisplayNames(
      [
        record({ entityType: "rule", entityId: "R-010", entityVersion: 1 }),
        record({ entityType: "param", entityId: "P-X" }),
        record({ entityType: "rule_set", entityId: "RS-CN-PLAN-V1" }),
      ],
      index,
    );
    expect(out.map((r) => r.displayName)).toEqual([
      "解析出生年份v1",
      "国家参数",
      "国家规划规则集",
    ]);
  });

  it("历史v1记录显示v1当时名称，不用v2当前名称冒充（AC-011反例）", () => {
    const out = resolveHistoryDisplayNames(
      [record({ entityType: "rule", entityId: "R-010", entityVersion: 1 })],
      index,
    );
    expect(out[0].displayName).toBe("解析出生年份v1");
    expect(out[0].displayName).not.toBe("解析出生年份v2");
  });

  it("对应版本实体不存在时displayName为null，不猜测", () => {
    const out = resolveHistoryDisplayNames(
      [record({ entityType: "rule", entityId: "R-GONE", entityVersion: 7 })],
      index,
    );
    expect(out[0].displayName).toBeNull();
  });

  it("旧记录缺少地区或版本身份时displayName为null（FR-016不得猜测）", () => {
    const out = resolveHistoryDisplayNames(
      [
        record({ entityType: "rule", entityId: "R-010", jurisdictionCode: null }),
        record({ entityType: "rule", entityId: "R-010", entityVersion: null }),
      ],
      index,
    );
    expect(out[0].displayName).toBeNull();
    expect(out[1].displayName).toBeNull();
  });

  it("同编号跨地区不混淆", () => {
    const out = resolveHistoryDisplayNames(
      [
        record({ entityType: "rule", entityId: "R-SAME", jurisdictionCode: "310000" }),
        record({ entityType: "rule", entityId: "R-SAME", jurisdictionCode: "440000" }),
      ],
      index,
    );
    expect(out[0].displayName).toBe("上海同号规则");
    expect(out[1].displayName).toBe("广东同号规则");
  });

  it("空输入返回空数组", () => {
    expect(resolveHistoryDisplayNames([], index)).toEqual([]);
  });

  it("entityNameKey精确绑定四元身份", () => {
    expect(entityNameKey("rule", "CN", "R-010", 1)).toBe(
      entityNameKey("rule", "CN", "R-010", 1),
    );
    expect(entityNameKey("rule", "CN", "R-010", 1)).not.toBe(
      entityNameKey("rule", "CN", "R-010", 2),
    );
    expect(entityNameKey("rule", "CN", "R-010", 1)).not.toBe(
      entityNameKey("param", "CN", "R-010", 1),
    );
  });
});
