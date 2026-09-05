/**
 * NRP-FR-007 显式overlay操作的DSL装载校验（纯函数，可单元测试）。
 *
 * 地区DSL资产中的每个实体（规则/参数/规则集）必须显式声明操作与目标业务键：
 * - operation 必须是 baseline/add/replace/restrict/exempt 之一（缺省按 add，
 *   但CN地区缺省视为错误——CN实体必须显式 baseline）；
 * - CN 实体只能 baseline，地区实体不能 baseline（PRD §7不变量）；
 * - replace/restrict/exempt 必须携带非空 target_business_key；
 * - baseline/add 不得携带 target_business_key。
 */
import type { OverlayOperation } from "@/server/modules/policy/domain/overlay";

export const DSL_OPERATIONS: readonly OverlayOperation[] = [
  "baseline",
  "add",
  "replace",
  "restrict",
  "exempt",
] as const;

/** 需要目标业务键的操作。 */
const TARGET_REQUIRED: readonly string[] = ["replace", "restrict", "exempt"];

/** 国家级行政区划代码（与领域层 NATIONAL_JURISDICTION 同值）。 */
export const DSL_NATIONAL_JURISDICTION = "CN";

export interface OverlayOperationFields {
  operation: OverlayOperation;
  targetBusinessKey: string | null;
}

/**
 * 校验并归一化单个实体的操作字段。
 * @param entityKind 实体种类（用于错误消息，如 "rule"/"param"/"rule_set"）。
 * @param entityId 业务键（用于错误消息）。
 * @param rawOperation DSL中的 operation 字段（可缺省）。
 * @param rawTargetKey DSL中的 target_business_key 字段（可缺省）。
 * @param jurisdictionCode 所属地区（"CN" 或行政区划代码）。
 */
export function parseOverlayOperation(
  entityKind: string,
  entityId: string,
  rawOperation: unknown,
  rawTargetKey: unknown,
  jurisdictionCode: string,
): OverlayOperationFields {
  const where = `${entityKind} ${entityId}（jurisdiction=${jurisdictionCode}）`;

  if (rawOperation !== undefined && rawOperation !== null) {
    if (
      typeof rawOperation !== "string" ||
      !DSL_OPERATIONS.includes(rawOperation as OverlayOperation)
    ) {
      throw new Error(
        `${where}: operation 必须是 ${DSL_OPERATIONS.join("/")} 之一（实际: ${String(rawOperation)}）`,
      );
    }
  }
  const isNational = jurisdictionCode === DSL_NATIONAL_JURISDICTION;
  // CN地区必须显式声明baseline；地区实体缺省add。
  if (rawOperation === undefined || rawOperation === null) {
    if (isNational) {
      throw new Error(
        `${where}: 国家（CN）实体必须显式声明 operation: "baseline"`,
      );
    }
    return { operation: "add", targetBusinessKey: null };
  }
  const operation = rawOperation as OverlayOperation;

  if (isNational && operation !== "baseline") {
    throw new Error(`${where}: 国家（CN）实体只能使用 baseline 操作`);
  }
  if (!isNational && operation === "baseline") {
    throw new Error(`${where}: 地区实体不能使用 baseline 操作`);
  }

  if (rawTargetKey !== undefined && rawTargetKey !== null) {
    if (typeof rawTargetKey !== "string" || rawTargetKey.length === 0) {
      throw new Error(`${where}: target_business_key 必须为非空字符串`);
    }
  }
  const targetKey =
    rawTargetKey === undefined || rawTargetKey === null ? null : rawTargetKey;

  if (TARGET_REQUIRED.includes(operation) && targetKey === null) {
    throw new Error(
      `${where}: ${operation} 操作必须携带 target_business_key（NRP-FR-007）`,
    );
  }
  if (!TARGET_REQUIRED.includes(operation) && targetKey !== null) {
    throw new Error(
      `${where}: ${operation} 操作不得携带 target_business_key`,
    );
  }

  return { operation, targetBusinessKey: targetKey };
}
