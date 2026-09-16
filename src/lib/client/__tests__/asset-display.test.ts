/**
 * APR-FR-004/014/015/017 + APR-AC-009：管理端展示纯辅助函数。
 *
 * - 名称为主、编号为辅；无法解析显示"名称不可用"；
 *   迁移回退名称（name===编号）正常读取并标记"名称待补充"；
 * - 发布阶段内按规则集→规则→参数分组，分类数量之和必须等于阶段总数。
 */
import { describe, expect, it } from "vitest";
import {
  NAME_PENDING_LABEL,
  NAME_UNAVAILABLE_LABEL,
  assetDisplayName,
  groupPipelineEntities,
  type PipelineGroupedEntities,
} from "../asset-display";

describe("assetDisplayName（主次信息与真实状态标记）", () => {
  it("正式名称为主展示", () => {
    const d = assetDisplayName("国家规划主规则集", "RS-CN-PLAN-V1");
    expect(d.primary).toBe("国家规划主规则集");
    expect(d.unavailable).toBe(false);
    expect(d.pending).toBe(false);
  });

  it("名称缺失时使用'名称不可用'标记（APR-FR-004/016）", () => {
    const d = assetDisplayName(null, "R-010");
    expect(d.primary).toBe(NAME_UNAVAILABLE_LABEL);
    expect(d.unavailable).toBe(true);
    expect(d.code).toBe("R-010");
  });

  it("迁移回退名称（等于编号）标记'名称待补充'（APR-FR-017失败模式）", () => {
    const d = assetDisplayName("P-OLD-PARAM", "P-OLD-PARAM");
    expect(d.primary).toBe("P-OLD-PARAM");
    expect(d.pending).toBe(true);
    expect(d.unavailable).toBe(false);
  });

  it("空白名称按缺失处理", () => {
    const d = assetDisplayName("   ", "R-010");
    expect(d.unavailable).toBe(true);
  });
});

interface EntityLike {
  entityType: string;
  entityId: string;
}

describe("groupPipelineEntities（APR-FR-014/AC-009）", () => {
  const entities: EntityLike[] = [
    { entityType: "rule", entityId: "R-1" },
    { entityType: "rule_set", entityId: "RS-1" },
    { entityType: "param", entityId: "P-1" },
    { entityType: "rule", entityId: "R-2" },
    { entityType: "param", entityId: "P-2" },
    { entityType: "param", entityId: "P-3" },
  ];

  it("分组顺序固定为规则集→规则→参数", () => {
    const groups = groupPipelineEntities(entities);
    expect(groups.map((g) => g.group)).toEqual(["rule_set", "rule", "param"]);
  });

  it("分类数量之和等于阶段总数", () => {
    const groups = groupPipelineEntities(entities);
    const total = groups.reduce((sum, g) => sum + g.items.length, 0);
    expect(total).toBe(entities.length);
    expect(groups.map((g) => g.items.length)).toEqual([1, 2, 3]);
  });

  it("空分类也输出（简洁空状态由页面渲染）", () => {
    const groups = groupPipelineEntities([{ entityType: "rule", entityId: "R-1" }]);
    expect(groups).toHaveLength(3);
    const emptyRuleSet = groups.find(
      (g) => g.group === "rule_set",
    ) as PipelineGroupedEntities<EntityLike>[number];
    expect(emptyRuleSet.items).toEqual([]);
  });

  it("未知entityType不参与分组但计入总数核对提示", () => {
    const groups = groupPipelineEntities([
      { entityType: "rule", entityId: "R-1" },
      { entityType: "weird", entityId: "X" } as unknown as EntityLike,
    ]);
    const known = groups.reduce((s, g) => s + g.items.length, 0);
    expect(known).toBe(1);
  });

  it("labels常量", () => {
    expect(NAME_UNAVAILABLE_LABEL).toBe("名称不可用");
    expect(NAME_PENDING_LABEL).toBe("名称待补充");
  });
});
