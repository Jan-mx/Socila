/**
 * APR-FR-004/014/015/017 + APR-AC-009：管理端展示纯辅助（名称为主、分类分组）。
 *
 * 中文名称只用于显示；编号/地区/版本继续作为业务身份与操作参数。
 * - 名称无法解析 → "名称不可用"（错误状态不依赖颜色，纯文本标记）；
 * - 迁移回退名称（name===编号）→ 正常读取并标记"名称待补充"；
 * - 发布阶段内分组顺序固定：规则集 → 规则 → 参数；分类数量之和=阶段总数。
 */
import { isFallbackName } from "@/lib/dsl/display-names";

export const NAME_UNAVAILABLE_LABEL = "名称不可用";
export const NAME_PENDING_LABEL = "名称待补充";

export type PipelineGroup = "rule_set" | "rule" | "param";

export interface AssetDisplay {
  /** 主标题：正式名称或标记文案（渲染为文本节点，React自动转义）。 */
  primary: string;
  /** 辅助编号（稳定业务身份，始终保留）。 */
  code: string;
  /** 名称缺失/不可用。 */
  unavailable: boolean;
  /** 迁移回退名称，待人工补充。 */
  pending: boolean;
}

/** 资产名称主展示计算（列表/卡片/历史共用）。 */
export function assetDisplayName(
  name: string | null | undefined,
  entityId: string,
): AssetDisplay {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (trimmed.length === 0) {
    return {
      primary: NAME_UNAVAILABLE_LABEL,
      code: entityId,
      unavailable: true,
      pending: false,
    };
  }
  return {
    primary: trimmed,
    code: entityId,
    unavailable: false,
    pending: isFallbackName(trimmed, entityId),
  };
}

export interface PipelineEntityLike {
  entityType: string;
}

export type PipelineGroupedEntities<T extends PipelineEntityLike> = Array<{
  group: PipelineGroup;
  items: T[];
}>;

/** 阶段内固定顺序分组；空分组也输出（页面渲染简洁空状态）。 */
export function groupPipelineEntities<T extends PipelineEntityLike>(
  entities: T[],
): PipelineGroupedEntities<T> {
  const groups: PipelineGroupedEntities<T> = [
    { group: "rule_set", items: [] },
    { group: "rule", items: [] },
    { group: "param", items: [] },
  ];
  for (const entity of entities) {
    const target = groups.find((g) => g.group === entity.entityType);
    if (target) target.items.push(entity);
  }
  return groups;
}
