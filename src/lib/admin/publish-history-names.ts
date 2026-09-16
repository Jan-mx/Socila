/**
 * APR-FR-016 / APR-NFR-005 / AC-011：发布历史名称解析（纯函数）。
 *
 * 历史名称只允许通过 entity_type + jurisdiction_code + entity_id + entity_version
 * 四元精确身份解析；身份缺失或对应版本实体不存在时返回 null（页面显示
 * "名称不可用"），严禁以当前版本名称或他区名称冒充历史名称。
 * 名称行由调用方按实体类型批量查询构建索引（禁止逐记录查询，APR-NFR-002）。
 */

export interface EntityNameRow {
  entityType: string;
  jurisdictionCode: string;
  entityId: string;
  version: number;
  name: string;
}

export interface PublishNameRecord {
  entityType: string;
  entityId: string;
  /** 历史记录可能缺少地区身份（0013之前的发布行）。 */
  jurisdictionCode: string | null;
  /** 历史记录可能缺少版本。 */
  entityVersion: number | null;
}

export function entityNameKey(
  entityType: string,
  jurisdictionCode: string,
  entityId: string,
  version: number,
): string {
  return `${entityType}|${jurisdictionCode}|${entityId}|${version}`;
}

/** 批量构建名称索引；同键重复行保留名称非回退优先无法区分时取首行（确定性）。 */
export function buildNameIndex(rows: EntityNameRow[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const row of rows) {
    const key = entityNameKey(
      row.entityType,
      row.jurisdictionCode,
      row.entityId,
      row.version,
    );
    if (!index.has(key)) {
      index.set(key, row.name);
    }
  }
  return index;
}

/**
 * 为发布历史批量解析displayName：null表示无法精确解析（UI显示"名称不可用"）。
 * 输出保持输入顺序与全部原始字段（编号/版本不被名称覆盖，PRD §9）。
 */
export function resolveHistoryDisplayNames<T extends PublishNameRecord>(
  records: T[],
  index: Map<string, string>,
): (T & { displayName: string | null })[] {
  return records.map((record) => {
    const { entityType, entityId, jurisdictionCode, entityVersion } = record;
    if (
      !jurisdictionCode ||
      entityVersion === null ||
      entityVersion === undefined ||
      !Number.isInteger(entityVersion)
    ) {
      // 缺少精确身份：不得跨地区或跨版本猜测。
      return { ...record, displayName: null };
    }
    const name = index.get(
      entityNameKey(entityType, jurisdictionCode, entityId, entityVersion),
    );
    return { ...record, displayName: name ?? null };
  });
}
