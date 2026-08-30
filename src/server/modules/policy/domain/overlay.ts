/**
 * overlay 合并器（POL-FR-003～007 / PRD §7，步骤03.3）——纯函数。
 *
 * 输入：某个继承链上全部"指定日期有效"的政策实体（baseline 或 overlay 操作）。
 * 行为：按继承链顺序（国家→…→目标地区）应用 add/replace/restrict/exempt，
 * 输出带 provenance 的有效候选集；发现 add 已存在键 / 操作指向未知键 /
 * 同级同键重叠时产出 MergeConflict（由调用方转为 PolicyConflict 并停止快照）。
 *
 * 输入不可变：合并过程不修改传入实体。
 */

export type OverlayOperation = "add" | "replace" | "restrict" | "exempt";
export type EntityRole = "baseline" | OverlayOperation;

export interface MergeInputEntity {
  businessKey: string;
  jurisdictionCode: string;
  /** 来源包（baseline 包或 overlay 包）。 */
  packId: string;
  version: number;
  payload: unknown;
  role: EntityRole;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

export interface EntityProvenanceEntry {
  jurisdictionCode: string;
  packId: string;
  version: number;
  operation: "baseline" | OverlayOperation;
}

export interface EffectiveEntity {
  businessKey: string;
  payload: unknown;
  /** restrict 的附加约束（若有），供引擎/草案解释。 */
  restrictions: unknown[];
  exempted: boolean;
  provenance: EntityProvenanceEntry[];
}

export type MergeConflictKind =
  | "duplicate-add"
  | "unknown-key"
  | "same-level-overlap";

export interface MergeConflict {
  kind: MergeConflictKind;
  businessKey: string;
  detail: string;
  members: EntityProvenanceEntry[];
}

export interface MergeResult {
  entities: EffectiveEntity[];
  conflicts: MergeConflict[];
}

function isEffective(
  e: MergeInputEntity,
  asOfDate: string,
): boolean {
  return e.effectiveFrom <= asOfDate && (!e.effectiveTo || asOfDate <= e.effectiveTo);
}

export function mergePolicyContext(
  entities: MergeInputEntity[],
  chain: string[],
  asOfDate: string,
): MergeResult {
  const effective = entities.filter((e) => isEffective(e, asOfDate));
  const byLevel = new Map<string, MergeInputEntity[]>();
  for (const code of chain) {
    byLevel.set(
      code,
      effective.filter((e) => e.jurisdictionCode === code),
    );
  }

  const result = new Map<string, EffectiveEntity>();
  const conflicts: MergeConflict[] = [];

  const provenanceOf = (e: MergeInputEntity): EntityProvenanceEntry => ({
    jurisdictionCode: e.jurisdictionCode,
    packId: e.packId,
    version: e.version,
    operation: e.role,
  });

  for (const code of chain) {
    const levelEntities = byLevel.get(code) ?? [];

    // 同级分组：同地区、同业务键。同包多版本 = 版本更替（最新生效版本胜出，
    // 与 legacy getEffectiveRules 去重一致）；跨包同键 = 同级冲突（POL-FR-008）。
    const groups = new Map<string, MergeInputEntity[]>();
    for (const e of levelEntities) {
      const list = groups.get(e.businessKey) ?? [];
      list.push(e);
      groups.set(e.businessKey, list);
    }
    for (const [businessKey, list] of groups) {
      const packIds = new Set(list.map((e) => e.packId));
      if (packIds.size > 1) {
        conflicts.push({
          kind: "same-level-overlap",
          businessKey,
          detail: `地区 ${code} 下业务键 ${businessKey} 来自 ${packIds.size} 个不同包且有效期重叠`,
          members: list.map(provenanceOf),
        });
        continue; // 冲突实体不进入结果——快照将被阻止。
      }
      const winner = [...list].sort((a, b) =>
        a.effectiveFrom === b.effectiveFrom
          ? (b.version ?? 0) - (a.version ?? 0)
          : b.effectiveFrom.localeCompare(a.effectiveFrom),
      )[0];
      applyEntity(winner);
    }
  }

  return { entities: [...result.values()], conflicts };

  function applyEntity(e: MergeInputEntity): void {
    const existing = result.get(e.businessKey);
    switch (e.role) {
        case "baseline": {
          if (existing) {
            conflicts.push({
              kind: "duplicate-add",
              businessKey: e.businessKey,
              detail: `baseline 重复定义业务键 ${e.businessKey}`,
              members: [existing.provenance[0], provenanceOf(e)],
            });
            break;
          }
          result.set(e.businessKey, {
            businessKey: e.businessKey,
            payload: e.payload,
            restrictions: [],
            exempted: false,
            provenance: [provenanceOf(e)],
          });
          break;
        }
        case "add": {
          if (existing) {
            conflicts.push({
              kind: "duplicate-add",
              businessKey: e.businessKey,
              detail: `add 指向已存在的业务键 ${e.businessKey}`,
              members: [existing.provenance[0], provenanceOf(e)],
            });
            break;
          }
          result.set(e.businessKey, {
            businessKey: e.businessKey,
            payload: e.payload,
            restrictions: [],
            exempted: false,
            provenance: [provenanceOf(e)],
          });
          break;
        }
        case "replace": {
          if (!existing) {
            conflicts.push({
              kind: "unknown-key",
              businessKey: e.businessKey,
              detail: `replace 指向未知业务键 ${e.businessKey}`,
              members: [provenanceOf(e)],
            });
            break;
          }
          existing.payload = e.payload;
          existing.provenance.push(provenanceOf(e));
          break;
        }
        case "restrict": {
          if (!existing) {
            conflicts.push({
              kind: "unknown-key",
              businessKey: e.businessKey,
              detail: `restrict 指向未知业务键 ${e.businessKey}`,
              members: [provenanceOf(e)],
            });
            break;
          }
          existing.restrictions.push(e.payload);
          existing.provenance.push(provenanceOf(e));
          break;
        }
        case "exempt": {
          if (!existing) {
            conflicts.push({
              kind: "unknown-key",
              businessKey: e.businessKey,
              detail: `exempt 指向未知业务键 ${e.businessKey}`,
              members: [provenanceOf(e)],
            });
            break;
          }
          existing.exempted = true;
          existing.provenance.push(provenanceOf(e));
          break;
        }
      }
  }
}
