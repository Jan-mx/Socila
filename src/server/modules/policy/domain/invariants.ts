/**
 * 政策版本领域不变量（POL-FR-003～006 / PRD §6.2，步骤03.2）——纯函数。
 *
 * - 有效期：effectiveFrom <= effectiveTo；空 effectiveTo 表示持续有效。
 * - 同一地区、业务键、状态下不允许未解决的有效期重叠。
 * - published 实体不可原地更新，只能 retire 并新增版本（由仓储层强制）。
 */

export interface VersionedEntity {
  jurisdictionCode: string | null;
  businessKey: string | null;
  status: string;
  effectiveFrom: string; // ISO 日期
  effectiveTo?: string | null;
  version?: number | string;
}

export type IntervalViolation =
  | { kind: "inverted-interval"; key: string; detail: string };

export function validateInterval(
  entity: VersionedEntity,
): IntervalViolation | null {
  const key = entity.businessKey ?? "?";
  if (
    entity.effectiveTo &&
    entity.effectiveFrom > entity.effectiveTo
  ) {
    return {
      kind: "inverted-interval",
      key,
      detail: `effectiveFrom(${entity.effectiveFrom}) > effectiveTo(${entity.effectiveTo})`,
    };
  }
  return null;
}

/** 两个同键同状态实体的有效期是否重叠（半开区间：[from, to]；空 to = 无穷）。 */
export function intervalsOverlap(
  a: Pick<VersionedEntity, "effectiveFrom" | "effectiveTo">,
  b: Pick<VersionedEntity, "effectiveFrom" | "effectiveTo">,
): boolean {
  const aEnd = a.effectiveTo ?? "9999-12-31";
  const bEnd = b.effectiveTo ?? "9999-12-31";
  return a.effectiveFrom <= bEnd && b.effectiveFrom <= aEnd;
}

export type OverlapConflict = {
  jurisdictionCode: string;
  businessKey: string;
  status: string;
  members: Array<{ version?: number | string; effectiveFrom: string; effectiveTo?: string | null }>;
};

/**
 * 同级冲突检测（POL-FR-008 的领域核心）：
 * 相同 (jurisdictionCode, businessKey, status) 且有效期重叠的版本对。
 */
export function detectOverlappingVersions(
  entities: VersionedEntity[],
): OverlapConflict[] {
  const groups = new Map<string, VersionedEntity[]>();
  for (const e of entities) {
    const key = `${e.jurisdictionCode ?? "?"}|${e.businessKey ?? "?"}|${e.status}`;
    const list = groups.get(key) ?? [];
    list.push(e);
    groups.set(key, list);
  }

  const conflicts: OverlapConflict[] = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const [jurisdictionCode, businessKey, status] = key.split("|");
    const overlapping: VersionedEntity[] = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (intervalsOverlap(list[i], list[j])) {
          if (!overlapping.includes(list[i])) overlapping.push(list[i]);
          if (!overlapping.includes(list[j])) overlapping.push(list[j]);
        }
      }
    }
    if (overlapping.length > 1) {
      conflicts.push({
        jurisdictionCode,
        businessKey,
        status,
        members: overlapping.map((m) => ({
          version: m.version,
          effectiveFrom: m.effectiveFrom,
          effectiveTo: m.effectiveTo ?? null,
        })),
      });
    }
  }
  return conflicts;
}
