/**
 * overlay 合并器（POL-FR-003～007 / NRP-FR-006/007/011 / PRD §7）——纯函数。
 *
 * 输入：某个继承链上全部"指定日期有效"的政策实体。每个实体显式携带
 * `operation`（baseline/add/replace/restrict/exempt）与 `targetBusinessKey`，
 * 不得按地区代码推断（NRP-FR-007）。
 *
 * PRD §7不变量（本函数强制）：
 * - `CN`实体只能使用`baseline`，地区实体不能使用`baseline`；
 * - `replace/restrict/exempt`必须解析到继承链上唯一上级业务键
 *   （目标缺失→missing-target；目标未知→unknown-key；目标同级→same-level-target）；
 * - `add`不得覆盖已经存在的有效业务键（duplicate-add）；
 * - 同级同键跨包重叠→same-level-overlap。
 *
 * 发现冲突时产出 MergeConflict（由调用方转为 PolicyConflict 并停止快照）。
 * 输入不可变：合并过程不修改传入实体。
 */

/** 国家级行政区划代码（PRD §7：baseline 操作专属）。 */
export const NATIONAL_JURISDICTION = "CN";

export type OverlayOperation =
  | "baseline"
  | "add"
  | "replace"
  | "restrict"
  | "exempt";

export interface MergeInputEntity {
  businessKey: string;
  jurisdictionCode: string;
  /** 来源包（baseline 包或 overlay 包）。 */
  packId: string;
  version: number;
  payload: unknown;
  /** 显式overlay操作（NRP-FR-007）：不得由jurisdiction_code推断。 */
  operation: OverlayOperation;
  /** replace/restrict/exempt 的目标业务键；baseline/add 必须为 null。 */
  targetBusinessKey: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
}

export interface EntityProvenanceEntry {
  jurisdictionCode: string;
  packId: string;
  version: number;
  operation: OverlayOperation;
  /** replace/restrict/exempt 指向的目标键（NRP-AC-005：随provenance保存）。 */
  targetBusinessKey: string | null;
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
  | "same-level-overlap"
  | "missing-target"
  | "same-level-target"
  | "invalid-target"
  | "regional-baseline"
  | "national-not-baseline";

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

function isEffective(e: MergeInputEntity, asOfDate: string): boolean {
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
    operation: e.operation,
    targetBusinessKey: e.targetBusinessKey,
  });

  for (const code of chain) {
    const levelEntities = byLevel.get(code) ?? [];
    const levelIndex = chain.indexOf(code);

    // 同级分组：同地区、同业务键。同包多版本 = 版本更替（最新生效版本胜出，
    // 与 legacy getEffectiveRules 去重一致）；跨包同键 = 同级冲突（POL-FR-008）。
    const groups = new Map<string, MergeInputEntity[]>();
    for (const e of levelEntities) {
      const list = groups.get(e.businessKey) ?? [];
      list.push(e);
      groups.set(e.businessKey, list);
    }

    // 本级胜出实体的业务键集合：replace/restrict/exempt 不得指向同级键
    // （PRD：必须解析到"唯一上级"业务键）。
    const sameLevelWinnerKeys = new Set(groups.keys());

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
      applyEntity(winner, levelIndex, sameLevelWinnerKeys);
    }
  }

  return { entities: [...result.values()], conflicts };

  function applyEntity(
    e: MergeInputEntity,
    levelIndex: number,
    sameLevelWinnerKeys: Set<string>,
  ): void {
    // PRD §7：CN实体只能使用baseline，地区实体不能使用baseline。
    if (e.jurisdictionCode === NATIONAL_JURISDICTION && e.operation !== "baseline") {
      conflicts.push({
        kind: "national-not-baseline",
        businessKey: e.businessKey,
        detail: `国家实体 ${e.businessKey} 的操作必须是 baseline（实际: ${e.operation}）`,
        members: [provenanceOf(e)],
      });
      return;
    }
    if (e.jurisdictionCode !== NATIONAL_JURISDICTION && e.operation === "baseline") {
      conflicts.push({
        kind: "regional-baseline",
        businessKey: e.businessKey,
        detail: `地区 ${e.jurisdictionCode} 实体 ${e.businessKey} 不得使用 baseline 操作`,
        members: [provenanceOf(e)],
      });
      return;
    }

    switch (e.operation) {
      case "baseline": {
        if (result.has(e.businessKey)) {
          conflicts.push({
            kind: "duplicate-add",
            businessKey: e.businessKey,
            detail: `baseline 重复定义业务键 ${e.businessKey}`,
            members: [result.get(e.businessKey)!.provenance[0], provenanceOf(e)],
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
        if (e.targetBusinessKey !== null) {
          conflicts.push({
            kind: "invalid-target",
            businessKey: e.businessKey,
            detail: `add 不得携带目标业务键（${e.businessKey} → ${e.targetBusinessKey}）`,
            members: [provenanceOf(e)],
          });
          break;
        }
        if (result.has(e.businessKey)) {
          conflicts.push({
            kind: "duplicate-add",
            businessKey: e.businessKey,
            detail: `add 指向已存在的业务键 ${e.businessKey}`,
            members: [result.get(e.businessKey)!.provenance[0], provenanceOf(e)],
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
      case "replace":
      case "restrict":
      case "exempt": {
        const target = e.targetBusinessKey;
        if (target === null || target.length === 0) {
          conflicts.push({
            kind: "missing-target",
            businessKey: e.businessKey,
            detail: `${e.operation} 实体 ${e.businessKey} 缺少目标业务键`,
            members: [provenanceOf(e)],
          });
          break;
        }
        // 自身键与目标键相同的"同键版本替换"是合法形态（上位键的版本更替）；
        // 仅当目标解析到"其他"同级实体时才违反"唯一上级"要求。
        if (target !== e.businessKey && sameLevelWinnerKeys.has(target)) {
          conflicts.push({
            kind: "same-level-target",
            businessKey: e.businessKey,
            detail: `${e.operation} 实体 ${e.businessKey} 的目标键 ${target} 位于同一地区层级，必须指向唯一上级`,
            members: [provenanceOf(e)],
          });
          break;
        }
        const existing = result.get(target);
        if (!existing) {
          conflicts.push({
            kind: "unknown-key",
            businessKey: e.businessKey,
            detail: `${e.operation} 指向未知业务键 ${target}`,
            members: [provenanceOf(e)],
          });
          break;
        }
        const targetOrigin = existing.provenance[0]?.jurisdictionCode ?? "";
        if (chain.indexOf(targetOrigin) >= levelIndex) {
          conflicts.push({
            kind: "same-level-target",
            businessKey: e.businessKey,
            detail: `${e.operation} 实体 ${e.businessKey} 的目标键 ${target} 来自同级或下级（${targetOrigin}），必须指向唯一上级`,
            members: [provenanceOf(e)],
          });
          break;
        }
        if (e.operation === "replace") {
          existing.payload = e.payload;
        } else if (e.operation === "restrict") {
          existing.restrictions.push(e.payload);
        } else {
          existing.exempted = true;
        }
        existing.provenance.push(provenanceOf(e));
        break;
      }
    }
  }
}
